package expo.modules.ytdlp

import android.content.Context
import android.webkit.CookieManager
import android.webkit.WebStorage
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream

/**
 * The signed-in YouTube session, kept as a Netscape cookies.txt that yt-dlp reads with --cookies.
 *
 * Security rules (see README "YouTube sign-in"):
 * - Only youtube.com cookies are ever stored; google.com cookies (Gmail, Drive...) are dropped.
 * - The file lives in noBackupFilesDir: private to the app and excluded from cloud and adb backups.
 * - Cookie values never leave this class except as the file passed to yt-dlp: nothing is
 *   logged, returned to JavaScript or shown in errors.
 * - The sign-in WebView's own cookies and storage are wiped as soon as the session is captured,
 *   on sign-out, and whenever the sign-in screen closes.
 */
internal object YouTubeAccount {
  private const val FILE_NAME = "youtube-cookies.txt"
  private const val RUNS_DIR = "cookie-runs"
  private const val MAX_IMPORT_BYTES = 1_000_000

  /** yt-dlp treats the session as signed in when one of these is present. */
  private val SIGN_IN_COOKIES = setOf("SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID")

  private val lock = Any()

  private fun file(context: Context) = File(context.noBackupFilesDir, FILE_NAME)
  private fun runsDir(context: Context) = File(context.noBackupFilesDir, RUNS_DIR)

  fun isSignedIn(context: Context) = synchronized(lock) { file(context).exists() }

  private fun isYouTubeDomain(domain: String): Boolean {
    val d = domain.lowercase().removePrefix(".")
    return d == "youtube.com" || d.endsWith(".youtube.com")
  }

  /**
   * Keeps only the youtube.com lines of a Netscape cookies file. Returns null unless they
   * include a signed-in session.
   */
  private fun youTubeOnly(text: String): String? {
    val kept = mutableListOf<String>()
    val names = mutableSetOf<String>()
    for (raw in text.lineSequence()) {
      val line = raw.trimEnd('\r')
      // "#HttpOnly_" marks an HttpOnly cookie; any other "#" line is a comment.
      val body = if (line.startsWith("#HttpOnly_")) line.removePrefix("#HttpOnly_") else line
      if (body.isBlank() || body.startsWith("#")) continue
      val fields = body.split('\t')
      if (fields.size != 7 || !isYouTubeDomain(fields[0])) continue
      kept += line
      names += fields[5]
    }
    if (names.none { it in SIGN_IN_COOKIES }) return null
    return "# Netscape HTTP Cookie File\n" + kept.joinToString("\n") + "\n"
  }

  /** Writes via a temp file so a crash never leaves a half-written session. Caller holds the lock. */
  private fun write(context: Context, content: String) {
    val target = file(context)
    val tmp = File(target.parentFile, "$FILE_NAME.tmp")
    tmp.writeText(content)
    if (!tmp.renameTo(target)) {
      tmp.delete()
      throw YtDlpException("Could not save the YouTube sign-in")
    }
  }

  /** After signing in on the WebView: saves its youtube.com session, then wipes the WebView. */
  fun captureFromWebView(context: Context): Boolean {
    val header = CookieManager.getInstance().getCookie("https://www.youtube.com") ?: return false
    val expires = System.currentTimeMillis() / 1000 + 365L * 24 * 3600
    val lines = header.split(";").mapNotNull { part ->
      val eq = part.indexOf('=')
      if (eq <= 0) return@mapNotNull null
      val name = part.substring(0, eq).trim()
      val value = part.substring(eq + 1).trim()
      ".youtube.com\tTRUE\t/\tTRUE\t$expires\t$name\t$value"
    }
    val content = youTubeOnly(lines.joinToString("\n")) ?: return false
    synchronized(lock) { write(context, content) }
    clearWebView()
    return true
  }

  /** Reads a picked file, refusing anything too big to be a cookies file. */
  fun readLimited(input: InputStream): ByteArray {
    val out = ByteArrayOutputStream()
    val chunk = ByteArray(8192)
    while (true) {
      val n = input.read(chunk)
      if (n < 0) break
      if (out.size() + n > MAX_IMPORT_BYTES) throw YtDlpException("That file is too large to be a cookies file")
      out.write(chunk, 0, n)
    }
    return out.toByteArray()
  }

  /** Saves the youtube.com part of a cookies.txt exported from a browser. */
  fun import(context: Context, bytes: ByteArray) {
    val content = youTubeOnly(bytes.toString(Charsets.UTF_8))
      ?: throw YtDlpException(
        "No YouTube sign-in found in this file. Export cookies from youtube.com while signed in."
      )
    synchronized(lock) { write(context, content) }
  }

  fun signOut(context: Context) {
    synchronized(lock) {
      file(context).delete()
      runsDir(context).deleteRecursively()
    }
    clearWebView()
  }

  /** Must run on the main thread. */
  fun clearWebView() {
    CookieManager.getInstance().apply {
      removeAllCookies(null)
      flush()
    }
    WebStorage.getInstance().deleteAllData()
  }

  /**
   * A private copy of the session for one yt-dlp run (yt-dlp rewrites its cookies file on
   * exit, and parallel downloads must not write the same file). Null when signed out.
   */
  fun startRun(context: Context, key: String): File? = synchronized(lock) {
    val main = file(context)
    if (!main.exists()) return null
    val dir = runsDir(context).apply { mkdirs() }
    File(dir, "${key.replace(Regex("[^A-Za-z0-9_-]"), "_")}.txt").also { main.copyTo(it, overwrite = true) }
  }

  /** Keeps cookies YouTube refreshed during a successful run, unless the user signed out meanwhile. */
  fun finishRun(context: Context, run: File, succeeded: Boolean) {
    synchronized(lock) {
      try {
        if (succeeded && file(context).exists() && run.exists()) {
          youTubeOnly(run.readText())?.let { write(context, it) }
        }
      } finally {
        run.delete()
      }
    }
  }

  /** Copies left behind if the app was killed mid-download. Call when nothing is running. */
  fun removeLeftoverRuns(context: Context) {
    synchronized(lock) { runsDir(context).deleteRecursively() }
  }
}
