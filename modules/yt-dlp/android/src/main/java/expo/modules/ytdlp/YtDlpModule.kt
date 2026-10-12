package expo.modules.ytdlp

import android.app.Activity
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class YtDlpException(message: String, cause: Throwable? = null) :
  CodedException("ERR_YTDLP", message, cause)

private const val PUBLIC_FOLDER = "YT Music"
private const val WRITE_REQUEST_CODE = 4202
private const val IMPORT_COOKIES_REQUEST_CODE = 4203
private const val MAX_PLAYLIST_BYTES = 2_000_000

class YtDlpModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw YtDlpException("React context is not available")

  @Volatile
  private var initialized = false

  private var pendingWriteRequest: Promise? = null
  private var pendingImport: Promise? = null

  /** The cookies file just imported, so the app can offer to delete the original. */
  @Volatile
  private var importedCookiesUri: Uri? = null

  /** Media files in Music/YT Music or Movies/YT Music (needs read permission for files from older installs). */
  private fun scanMedia(isVideo: Boolean): List<Map<String, Any?>> {
    val collection = if (isVideo) {
      MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    } else {
      MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
    }
    val top = if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.RELATIVE_PATH,
      MediaStore.MediaColumns.TITLE,
      MediaStore.MediaColumns.ARTIST,
      MediaStore.MediaColumns.DURATION,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_ADDED,
    )
    val items = mutableListOf<Map<String, Any?>>()
    context.contentResolver.query(
      collection, projection, "${MediaStore.MediaColumns.RELATIVE_PATH} = ?", arrayOf("$top/$PUBLIC_FOLDER/"), null
    )?.use { c ->
      while (c.moveToNext()) {
        val id = c.getLong(0)
        items += mapOf(
          "uri" to ContentUris.withAppendedId(collection, id).toString(),
          "path" to c.getString(2).trimEnd('/') + "/" + c.getString(1),
          "title" to c.getString(3),
          "artist" to c.getString(4),
          "durationMs" to if (c.isNull(5)) null else c.getLong(5).toDouble(),
          "size" to if (c.isNull(6)) null else c.getLong(6).toDouble(),
          "addedAt" to c.getLong(7).toDouble() * 1000,
          "kind" to if (isVideo) "video" else "audio",
        )
      }
    }
    return items
  }

  /** .m3u files in Music/YT Music, with their text. */
  private fun scanPlaylists(): List<Map<String, Any?>> {
    val collection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL)
    val projection = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.RELATIVE_PATH,
      MediaStore.MediaColumns.SIZE,
    )
    val selection = "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?"
    val items = mutableListOf<Map<String, Any?>>()
    context.contentResolver.query(
      collection, projection, selection, arrayOf("${Environment.DIRECTORY_MUSIC}/$PUBLIC_FOLDER/", "%.m3u"), null
    )?.use { c ->
      while (c.moveToNext()) {
        if (!c.isNull(3) && c.getLong(3) > MAX_PLAYLIST_BYTES) continue
        val uri = ContentUris.withAppendedId(collection, c.getLong(0))
        val text = try {
          context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
        } catch (e: Exception) {
          null
        } ?: continue
        items += mapOf(
          "uri" to uri.toString(),
          "name" to c.getString(1),
          "dir" to c.getString(2).trimEnd('/'),
          "content" to text,
        )
      }
    }
    return items
  }

  // First init unpacks python + ffmpeg (a few seconds), so do it lazily off the UI thread.
  private fun ensureInit() {
    if (initialized) return
    synchronized(this) {
      if (initialized) return
      try {
        YoutubeDL.getInstance().init(context)
        FFmpeg.getInstance().init(context)
        initialized = true
      } catch (e: Exception) {
        throw YtDlpException("Failed to initialize yt-dlp: ${e.message}", e)
      }
    }
  }

  /**
   * Signed in: pass a private copy of the session. Returns the copy to finish afterwards.
   * (youtubedl-android already passes its bundled QuickJS, which signed-in YouTube clients need.)
   */
  private fun addAccount(request: YoutubeDLRequest, key: String): File? {
    val cookies = YouTubeAccount.startRun(context, key) ?: return null
    request.addOption("--cookies", cookies.absolutePath)
    return cookies
  }

  private fun run(request: YoutubeDLRequest): String {
    try {
      return YoutubeDL.getInstance().execute(request).out
    } catch (e: Exception) {
      throw YtDlpException(cleanError(e, "yt-dlp failed"), e)
    }
  }

  // yt-dlp's stderr is mostly warnings/progress; keep only the ERROR lines when present.
  private fun cleanError(e: Exception, fallback: String): String {
    val msg = e.message ?: return fallback
    val errors = msg.lines().filter { it.contains("ERROR") }
    return (if (errors.isNotEmpty()) errors.joinToString("\n") else msg.takeLast(600)).trim()
  }

  private fun formatSelector(kind: String, height: Int): String =
    if (kind == "video") {
      // Prefer H.264 so older phones can decode it; fall back to any mp4, then anything.
      "bestvideo[height<=$height][vcodec^=avc1]+bestaudio[ext=m4a]/" +
        "bestvideo[height<=$height][ext=mp4]+bestaudio[ext=m4a]/" +
        "best[height<=$height][ext=mp4]/best[height<=$height]/best"
    } else {
      "bestaudio[ext=m4a]/bestaudio"
    }

  private fun mimeFor(file: File, isVideo: Boolean): String = when (file.extension.lowercase()) {
    "m4a" -> "audio/mp4"
    "mp4" -> "video/mp4"
    "webm" -> if (isVideo) "video/webm" else "audio/webm"
    "opus", "ogg" -> "audio/ogg"
    "mkv" -> "video/x-matroska"
    else -> if (isVideo) "video/*" else "audio/*"
  }

  private fun safeName(name: String): String =
    name.replace(Regex("""[\\/:*?"<>|\p{Cntrl}]"""), "_").trim().take(120).ifEmpty { "track" }

  /**
   * Copies a finished download into the shared Music/ or Movies/ folder so file managers
   * and other players can see it. Returns the URI the app should use to play/delete it.
   */
  private fun publish(src: File, isVideo: Boolean, baseName: String): String {
    val mime = mimeFor(src, isVideo)
    val fileName = "${safeName(baseName)}.${src.extension}"
    val subdir = if (isVideo) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = context.contentResolver
      val collection = if (isVideo) {
        MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      } else {
        MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
      }
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
        put(MediaStore.MediaColumns.MIME_TYPE, mime)
        put(MediaStore.MediaColumns.RELATIVE_PATH, "$subdir/$PUBLIC_FOLDER")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val uri = resolver.insert(collection, values)
        ?: throw YtDlpException("Could not create a file in $subdir/$PUBLIC_FOLDER")
      try {
        resolver.openOutputStream(uri)!!.use { out -> src.inputStream().use { it.copyTo(out) } }
        // Clearing IS_PENDING makes the scanner read the embedded title/artist tags.
        resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      } catch (e: Exception) {
        resolver.delete(uri, null, null)
        throw YtDlpException("Saving to $subdir failed: ${e.message}", e)
      }
      return uri.toString()
    }

    // Android 9 and older: app-specific external dir needs no permission and is still
    // reachable from file managers (Android/data/<package>/files/Music/...).
    val dir = File(context.getExternalFilesDir(subdir), PUBLIC_FOLDER).apply { mkdirs() }
    var dest = File(dir, fileName)
    var n = 1
    while (dest.exists()) dest = File(dir, "${safeName(baseName)} (${n++}).${src.extension}")
    src.copyTo(dest)
    MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf(mime), null)
    return "file://${dest.absolutePath}"
  }

  override fun definition() = ModuleDefinition {
    Name("YtDlp")

    Events("onProgress")

    AsyncFunction("init") Coroutine { ->
      withContext(Dispatchers.IO) {
        ensureInit()
        YouTubeAccount.removeLeftoverRuns(context)
      }
    }

    AsyncFunction("version") Coroutine { ->
      withContext(Dispatchers.IO) {
        ensureInit()
        YoutubeDL.getInstance().version(context)
      }
    }

    // Updates the bundled yt-dlp; returns "DONE" or "ALREADY_UP_TO_DATE".
    // Nightly, as yt-dlp recommends: YouTube fixes land there weeks before a stable release
    // (e.g. signed-in downloads broke on stable 2026.08.19 and were fixed in nightly).
    AsyncFunction("update") Coroutine { ->
      withContext(Dispatchers.IO) {
        ensureInit()
        try {
          YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel.NIGHTLY)?.name ?: "UNKNOWN"
        } catch (e: Exception) {
          throw YtDlpException("Update failed: ${cleanError(e, "unknown error")}", e)
        }
      }
    }

    // Returns yt-dlp's raw JSON (-J). `query` is either search text or a YouTube URL.
    AsyncFunction("search") Coroutine { query: String, limit: Int ->
      withContext(Dispatchers.IO) {
        ensureInit()
        val isUrl = query.startsWith("http://") || query.startsWith("https://")
        val request = YoutubeDLRequest(if (isUrl) query else "ytsearch$limit:$query").apply {
          addOption("--flat-playlist")
          addOption("-J")
          addOption("--playlist-end", limit)
        }
        run(request)
      }
    }

    // Full format list for one video (-J), used to show size estimates before downloading.
    AsyncFunction("formats") Coroutine { id: String ->
      withContext(Dispatchers.IO) {
        ensureInit()
        val request = YoutubeDLRequest("https://www.youtube.com/watch?v=$id").apply {
          addOption("-J")
          addOption("--no-playlist")
        }
        val cookies = addAccount(request, "formats-$id")
        var ok = false
        try {
          run(request).also { ok = true }
        } finally {
          cookies?.let { YouTubeAccount.finishRun(context, it, ok) }
        }
      }
    }

    // Downloads audio (original stream) or video (<= height, merged to mp4), embeds tags,
    // then publishes it to Music/ or Movies/. Emits onProgress { id: key, progress, eta }.
    AsyncFunction("download") Coroutine { key: String, id: String, kind: String, height: Int, baseName: String ->
      withContext(Dispatchers.IO) {
        ensureInit()
        val isVideo = kind == "video"
        val work = File(context.cacheDir, "ytdl/${safeName(key)}").apply {
          deleteRecursively()
          mkdirs()
        }
        val thumbs = File(context.filesDir, "thumbs").apply { mkdirs() }
        val request = YoutubeDLRequest("https://www.youtube.com/watch?v=$id").apply {
          addOption("-f", formatSelector(kind, height))
          if (isVideo) addOption("--merge-output-format", "mp4")
          addOption("--no-playlist")
          // Fewer, slower requests make YouTube's "confirm you're not a bot" check less likely.
          addOption("--sleep-requests", "1")
          addOption("--no-mtime")
          addOption("--no-part")
          addOption("--embed-metadata")
          addOption("--write-thumbnail")
          addOption("--convert-thumbnails", "jpg")
          addOption("-o", "${work.absolutePath}/%(id)s.%(ext)s")
          addOption("-o", "thumbnail:${thumbs.absolutePath}/%(id)s.%(ext)s")
        }
        val cookies = addAccount(request, key)
        var ok = false
        DownloadNotifier.started(context, key, baseName)
        try {
          YoutubeDL.getInstance().execute(request, processId = key, callback = { progress, eta, _ ->
            sendEvent("onProgress", mapOf("id" to key, "progress" to progress.toDouble(), "eta" to eta))
            DownloadNotifier.progress(context, key, progress)
          })
          val media = work.listFiles { f -> f.name.startsWith("$id.") }.orEmpty().maxByOrNull { it.length() }
            ?: throw YtDlpException("Download finished but no media file was found")
          val thumb = File(thumbs, "$id.jpg")
          ok = true
          mapOf(
            "size" to media.length().toDouble(),
            "uri" to publish(media, isVideo, baseName),
            "thumbnailPath" to if (thumb.exists()) "file://${thumb.absolutePath}" else null
          )
        } catch (e: YoutubeDL.CanceledException) {
          throw YtDlpException("Canceled", e)
        } catch (e: YtDlpException) {
          throw e
        } catch (e: Exception) {
          throw YtDlpException(cleanError(e, "Download failed"), e)
        } finally {
          cookies?.let { YouTubeAccount.finishRun(context, it, ok) }
          work.deleteRecursively()
          DownloadNotifier.finished(context, key)
        }
      }
    }

    Function("cancel") { key: String ->
      YoutubeDL.getInstance().destroyProcessById(key)
    }

    // Writes (or overwrites) Music/YT Music/<name>.m3u so other players see the
    // playlist. Returns the file's URI; pass it back as existingUri on later updates.
    AsyncFunction("writePlaylistFile") Coroutine { existingUri: String?, name: String, content: String ->
      withContext(Dispatchers.IO) {
        val bytes = content.toByteArray(Charsets.UTF_8)
        val fileName = "${safeName(name)}.m3u"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val resolver = context.contentResolver
          existingUri?.takeIf { it.startsWith("content://") }?.let { uriString ->
            try {
              val uri = Uri.parse(uriString)
              // Renaming the playlist renames its file.
              resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.DISPLAY_NAME, fileName) }, null, null)
              resolver.openOutputStream(uri, "wt")!!.use { it.write(bytes) }
              return@withContext uriString
            } catch (e: Exception) {
              // Gone or no longer owned by us (e.g. after reinstall): create a new one below.
            }
          }
          val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, "audio/x-mpegurl")
            put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_MUSIC}/$PUBLIC_FOLDER")
          }
          val uri = resolver.insert(MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
            ?: throw YtDlpException("Could not create playlist file")
          resolver.openOutputStream(uri, "wt")!!.use { it.write(bytes) }
          uri.toString()
        } else {
          existingUri?.let { File(Uri.parse(it).path ?: it).delete() }
          val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_MUSIC), PUBLIC_FOLDER).apply { mkdirs() }
          val dest = File(dir, fileName).apply { writeBytes(bytes) }
          MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf("audio/x-mpegurl"), null)
          "file://${dest.absolutePath}"
        }
      }
    }

    // Storage path of each media URI relative to shared storage root, e.g.
    // "Music/YT Music/Song - Artist.m4a"; null when unknown (private files).
    AsyncFunction("mediaPaths") Coroutine { uris: List<String> ->
      withContext(Dispatchers.IO) {
        uris.map { uriString ->
          try {
            if (uriString.startsWith("content://") && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              val projection = arrayOf(MediaStore.MediaColumns.RELATIVE_PATH, MediaStore.MediaColumns.DISPLAY_NAME)
              context.contentResolver.query(Uri.parse(uriString), projection, null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0).trimEnd('/') + "/" + c.getString(1) else null
              }
            } else {
              val path = Uri.parse(uriString).path ?: return@map null
              val root = context.getExternalFilesDir(null)?.absolutePath ?: return@map null
              if (path.startsWith(root)) path.removePrefix("$root/") else null
            }
          } catch (e: Exception) {
            null
          }
        }
      }
    }

    // Lists media and .m3u playlists in the app's shared folders, including files left by an
    // earlier install. Empty before Android 10, where downloads lived in app storage.
    AsyncFunction("scanFolders") Coroutine { ->
      withContext(Dispatchers.IO) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
          mapOf("media" to emptyList<Any>(), "playlists" to emptyList<Any>())
        } else {
          try {
            mapOf(
              "media" to scanMedia(isVideo = false) + scanMedia(isVideo = true),
              "playlists" to scanPlaylists(),
            )
          } catch (e: Exception) {
            throw YtDlpException("Could not read the music folders: ${e.message}", e)
          }
        }
      }
    }

    // After a reinstall the app no longer owns its old files. This shows Android's
    // "Allow YT Music to modify N items?" dialog (Android 11+) so they can be updated and
    // deleted again. Resolves true if the user allowed it.
    AsyncFunction("requestWriteAccess") { uris: List<String>, promise: Promise ->
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || uris.isEmpty() || activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      try {
        val request = MediaStore.createWriteRequest(context.contentResolver, uris.map(Uri::parse))
        pendingWriteRequest?.resolve(false)
        pendingWriteRequest = promise
        activity.startIntentSenderForResult(request.intentSender, WRITE_REQUEST_CODE, null, 0, 0, 0)
      } catch (e: Exception) {
        pendingWriteRequest = null
        promise.resolve(false)
      }
    }.runOnQueue(Queues.MAIN)

    // --- YouTube sign-in (see YouTubeAccount for the security rules) ---

    AsyncFunction("isSignedIn") Coroutine { ->
      withContext(Dispatchers.IO) { YouTubeAccount.isSignedIn(context) }
    }

    // Called by the sign-in screen once it reaches YouTube. True if a signed-in session was saved.
    AsyncFunction("captureSignIn") {
      YouTubeAccount.captureFromWebView(context)
    }.runOnQueue(Queues.MAIN)

    // Wipes the sign-in screen's cookies and storage (e.g. when it closes without signing in).
    AsyncFunction("clearSignInWebView") {
      YouTubeAccount.clearWebView()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("signOut") {
      YouTubeAccount.signOut(context)
    }.runOnQueue(Queues.MAIN)

    // Lets the user pick a cookies.txt exported from a browser. Resolves true when imported,
    // false if they backed out; rejects with a readable message for a wrong file.
    AsyncFunction("importCookies") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(YtDlpException("The app isn't ready yet, try again"))
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain", "text/*", "application/octet-stream"))
      }
      pendingImport?.resolve(false)
      pendingImport = promise
      importedCookiesUri = null
      activity.startActivityForResult(intent, IMPORT_COOKIES_REQUEST_CODE)
    }.runOnQueue(Queues.MAIN)

    // Deletes the cookies file the user just imported from (it holds the session in plain text).
    AsyncFunction("deleteImportedCookiesFile") Coroutine { ->
      withContext(Dispatchers.IO) {
        val uri = importedCookiesUri ?: return@withContext false
        importedCookiesUri = null
        try {
          DocumentsContract.deleteDocument(context.contentResolver, uri)
        } catch (e: Exception) {
          false
        }
      }
    }

    OnActivityResult { _, payload ->
      when (payload.requestCode) {
        WRITE_REQUEST_CODE -> {
          pendingWriteRequest?.resolve(payload.resultCode == Activity.RESULT_OK)
          pendingWriteRequest = null
        }
        IMPORT_COOKIES_REQUEST_CODE -> {
          val promise = pendingImport ?: return@OnActivityResult
          pendingImport = null
          val uri = payload.data?.data
          if (payload.resultCode != Activity.RESULT_OK || uri == null) {
            promise.resolve(false)
            return@OnActivityResult
          }
          appContext.backgroundCoroutineScope.launch {
            try {
              val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
                YouTubeAccount.readLimited(input)
              } ?: throw YtDlpException("Could not read that file")
              YouTubeAccount.import(context, bytes)
              importedCookiesUri = uri
              promise.resolve(true)
            } catch (e: YtDlpException) {
              promise.reject(e)
            } catch (e: Exception) {
              promise.reject(YtDlpException("Could not read that file"))
            }
          }
        }
      }
    }

    // Deletes a published file. Returns false if Android refused (e.g. the app was
    // reinstalled and no longer owns the file); the user can delete it from Files.
    AsyncFunction("deleteMedia") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        if (uri.startsWith("content://")) {
          try {
            context.contentResolver.delete(Uri.parse(uri), null, null) > 0
          } catch (e: SecurityException) {
            false
          }
        } else {
          val f = File(Uri.parse(uri).path ?: uri)
          !f.exists() || f.delete()
        }
      }
    }

    AsyncFunction("exists") Coroutine { uri: String ->
      withContext(Dispatchers.IO) {
        if (uri.startsWith("content://")) {
          try {
            context.contentResolver.query(Uri.parse(uri), arrayOf(MediaStore.MediaColumns._ID), null, null, null)
              ?.use { it.count > 0 } ?: false
          } catch (e: Exception) {
            false
          }
        } else {
          File(Uri.parse(uri).path ?: uri).exists()
        }
      }
    }
  }
}
