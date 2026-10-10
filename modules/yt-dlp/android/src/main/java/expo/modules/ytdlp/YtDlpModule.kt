package expo.modules.ytdlp

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

class YtDlpException(message: String, cause: Throwable? = null) :
  CodedException("ERR_YTDLP", message, cause)

private const val PUBLIC_FOLDER = "YT Music Offline"

class YtDlpModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw YtDlpException("React context is not available")

  @Volatile
  private var initialized = false

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
      withContext(Dispatchers.IO) { ensureInit() }
    }

    AsyncFunction("version") Coroutine { ->
      withContext(Dispatchers.IO) {
        ensureInit()
        YoutubeDL.getInstance().version(context)
      }
    }

    // Updates the bundled yt-dlp; returns "DONE" or "ALREADY_UP_TO_DATE".
    AsyncFunction("update") Coroutine { ->
      withContext(Dispatchers.IO) {
        ensureInit()
        try {
          YoutubeDL.getInstance().updateYoutubeDL(context)?.name ?: "UNKNOWN"
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
        run(request)
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
          addOption("--no-mtime")
          addOption("--no-part")
          addOption("--embed-metadata")
          addOption("--write-thumbnail")
          addOption("--convert-thumbnails", "jpg")
          addOption("-o", "${work.absolutePath}/%(id)s.%(ext)s")
          addOption("-o", "thumbnail:${thumbs.absolutePath}/%(id)s.%(ext)s")
        }
        try {
          YoutubeDL.getInstance().execute(request, processId = key, callback = { progress, eta, _ ->
            sendEvent("onProgress", mapOf("id" to key, "progress" to progress.toDouble(), "eta" to eta))
          })
          val media = work.listFiles { f -> f.name.startsWith("$id.") }.orEmpty().maxByOrNull { it.length() }
            ?: throw YtDlpException("Download finished but no media file was found")
          val thumb = File(thumbs, "$id.jpg")
          mapOf(
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
          work.deleteRecursively()
        }
      }
    }

    Function("cancel") { key: String ->
      YoutubeDL.getInstance().destroyProcessById(key)
    }

    // Writes (or overwrites) Music/YT Music Offline/<name>.m3u so other players see the
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
    // "Music/YT Music Offline/Song - Artist.m4a"; null when unknown (private files).
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
