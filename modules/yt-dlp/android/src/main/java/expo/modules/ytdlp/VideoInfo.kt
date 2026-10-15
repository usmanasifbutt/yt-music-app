package expo.modules.ytdlp

import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * yt-dlp's full info (-J) for recently looked-up videos, kept in memory only. Playing a song
 * looks it up once; switching to video, showing download sizes and downloading it reuse the
 * result instead of asking YouTube again. YouTube's stream links last a few hours; entries
 * are dropped well before that.
 */
internal object VideoInfoCache {
  private const val TTL_MS = 60 * 60 * 1000L
  private const val MAX_ENTRIES = 30

  private val entries = ConcurrentHashMap<String, Pair<Long, String>>()

  fun get(id: String): String? {
    val (at, json) = entries[id] ?: return null
    if (System.currentTimeMillis() - at > TTL_MS) {
      entries.remove(id)
      return null
    }
    return json
  }

  fun put(id: String, json: String) {
    if (entries.size >= MAX_ENTRIES) {
      entries.entries.minByOrNull { it.value.first }?.let { entries.remove(it.key) }
    }
    entries[id] = System.currentTimeMillis() to json
  }

  fun remove(id: String) {
    entries.remove(id)
  }
}

internal object VideoInfo {
  /**
   * Removes anything cookie-related yt-dlp may attach to formats, so a signed-in session can
   * never reach JavaScript or the player (see YouTubeAccount).
   */
  fun withoutCookies(json: String): String {
    val info = JSONObject(json)
    fun clean(obj: JSONObject) {
      obj.remove("cookies")
      obj.optJSONObject("http_headers")?.remove("Cookie")
    }
    clean(info)
    for (list in listOf("formats", "requested_formats")) {
      val formats = info.optJSONArray(list) ?: continue
      for (i in 0 until formats.length()) formats.optJSONObject(i)?.let(::clean)
    }
    return info.toString()
  }

  private fun JSONArray.objects() = (0 until length()).mapNotNull { optJSONObject(it) }

  private fun JSONObject.codec(name: String) = optString(name, "none").ifEmpty { "none" }

  private fun JSONObject.isProgressive() = optString("protocol").startsWith("http")

  private fun JSONObject.headers(): Map<String, String> {
    val headers = mutableMapOf<String, String>()
    optJSONObject("http_headers")?.let { h ->
      for (name in h.keys()) if (!name.equals("Cookie", ignoreCase = true)) headers[name] = h.optString(name)
    }
    return headers
  }

  /**
   * The best stream for playing `kind`, or null if the video has none:
   * - audio: an audio-only stream, preferring m4a (plays everywhere) and a plain download link.
   * - video: YouTube's HLS master playlist, which lists every quality and the audio, so the
   *   player adapts to the connection and has sound. YouTube no longer offers single files
   *   with both picture and sound, so that's only a fallback.
   */
  fun pickStream(json: String, kind: String): Map<String, Any?>? {
    val info = JSONObject(json)
    val formats = info.optJSONArray("formats")?.objects().orEmpty().filter { it.optString("url").isNotEmpty() }
    val duration = info.optDouble("duration").takeUnless { it.isNaN() }

    if (kind == "video") {
      val hls = formats.filter { it.optString("protocol").startsWith("m3u8") && it.optString("manifest_url").isNotEmpty() }
      val master = hls.firstOrNull { it.codec("vcodec") != "none" } ?: hls.firstOrNull()
      if (master != null) {
        return mapOf(
          "url" to master.getString("manifest_url"),
          "headers" to master.headers(),
          "hls" to true,
          "height" to hls.maxOfOrNull { it.optInt("height", 0) },
          "duration" to duration,
          // Picture qualities the playlist offers, for the quality menu.
          "qualities" to hls.map { it.optInt("height", 0) }.filter { it > 0 }.distinct().sorted(),
        )
      }
      val muxed = formats.filter { it.codec("vcodec") != "none" && it.codec("acodec") != "none" }
      val pick = muxed.filter { it.optInt("height", 0) in 1..720 }.ifEmpty { muxed }.maxByOrNull { it.optInt("height", 0) }
        ?: return null
      return mapOf(
        "url" to pick.getString("url"),
        "headers" to pick.headers(),
        "hls" to pick.optString("protocol").startsWith("m3u8"),
        "height" to pick.optInt("height", 0),
        "duration" to duration,
        "qualities" to emptyList<Int>(),
      )
    }

    val audio = formats.filter { it.codec("vcodec") == "none" && it.codec("acodec") != "none" }
    val pick = audio.maxWithOrNull(
      compareBy<JSONObject> { if (it.isProgressive()) 1 else 0 }
        .thenBy { if (it.optString("ext") == "m4a") 1 else 0 }
        .thenBy { it.optDouble("abr", it.optDouble("tbr", 0.0)) }
    ) ?: return null
    return mapOf(
      "url" to pick.getString("url"),
      "headers" to pick.headers(),
      "hls" to pick.optString("protocol").startsWith("m3u8"),
      "height" to 0,
      "duration" to duration,
      "qualities" to emptyList<Int>(),
    )
  }

  private val RESOLUTION = Regex("""RESOLUTION=\d+x(\d+)""")

  /**
   * A copy of an HLS master playlist offering only one picture quality (the highest at or
   * below `maxHeight`) plus the audio, so the player can't switch to another. Returns the
   * quality kept and the playlist, or null if it lists no picture qualities.
   */
  fun limitQuality(master: String, maxHeight: Int): Pair<Int, String>? {
    val lines = master.lines()
    val heights = lines.filter { it.startsWith("#EXT-X-STREAM-INF") }
      .mapNotNull { RESOLUTION.find(it)?.groupValues?.get(1)?.toIntOrNull() }
    val target = heights.filter { it <= maxHeight }.maxOrNull() ?: heights.minOrNull() ?: return null
    val out = mutableListOf<String>()
    var skipUri = false
    for (line in lines) {
      if (skipUri) {
        skipUri = false
        if (!line.startsWith("#")) continue
      }
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        val h = RESOLUTION.find(line)?.groupValues?.get(1)?.toIntOrNull()
        if (h != null && h != target) {
          skipUri = true
          continue
        }
      }
      out += line
    }
    return target to out.joinToString("\n")
  }
}
