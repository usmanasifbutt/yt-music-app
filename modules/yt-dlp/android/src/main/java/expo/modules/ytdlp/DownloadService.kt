package expo.modules.ytdlp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * Foreground service that keeps the app process alive while downloads run, so they continue
 * when the app is in the background. The downloads themselves run in YtDlpModule; this only
 * holds the process and shows progress in a notification.
 */
class DownloadService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = DownloadNotifier.build(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(DownloadNotifier.ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(DownloadNotifier.ID, notification)
    }
    return START_NOT_STICKY
  }

  // Android 15 limits dataSync services to 6h/day; stop gracefully if we hit it.
  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelf()
  }
}

object DownloadNotifier {
  const val ID = 4201
  private const val CHANNEL = "downloads"
  private const val STOP_DELAY_MS = 3000L
  private const val MIN_UPDATE_INTERVAL_MS = 1000L

  private data class Item(val name: String, var progress: Float)

  private val active = LinkedHashMap<String, Item>()
  private val handler = Handler(Looper.getMainLooper())
  private var running = false
  private var lastUpdate = 0L
  private var appContext: Context? = null

  // Stopping is delayed so the next queued download (started from JS right after one
  // finishes) reuses the running service; starting a new one from the background is
  // not allowed on Android 12+.
  private val stopRunnable = Runnable {
    synchronized(this) {
      if (active.isEmpty() && running) {
        appContext?.let { it.stopService(Intent(it, DownloadService::class.java)) }
        running = false
      }
    }
  }

  @Synchronized
  fun started(context: Context, key: String, name: String) {
    appContext = context.applicationContext
    active[key] = Item(name, 0f)
    handler.removeCallbacks(stopRunnable)
    if (!running) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, DownloadService::class.java))
        running = true
      } catch (e: Exception) {
        // Not allowed right now (e.g. app in background); downloads still run while the process lives.
      }
    } else {
      notifyNow(context)
    }
  }

  @Synchronized
  fun progress(context: Context, key: String, progress: Float) {
    active[key]?.progress = progress
    val now = SystemClock.elapsedRealtime()
    if (now - lastUpdate >= MIN_UPDATE_INTERVAL_MS) notifyNow(context)
  }

  @Synchronized
  fun finished(context: Context, key: String) {
    active.remove(key)
    if (active.isEmpty()) handler.postDelayed(stopRunnable, STOP_DELAY_MS) else notifyNow(context)
  }

  private fun notifyNow(context: Context) {
    if (!running) return
    lastUpdate = SystemClock.elapsedRealtime()
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.notify(ID, build(context))
  }

  @Synchronized
  fun build(context: Context): Notification {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Progress of audio and video downloads"
          setShowBadge(false)
        }
      )
    }
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val contentIntent = launch?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val first = active.values.firstOrNull()
    val title = when (active.size) {
      0 -> "Finishing downloads…"
      1 -> "Downloading"
      else -> "Downloading ${active.size} items"
    }
    return NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(title)
      .setContentText(first?.name ?: "")
      .setProgress(100, first?.progress?.toInt()?.coerceIn(0, 100) ?: 0, first == null)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_PROGRESS)
      .setContentIntent(contentIntent)
      .build()
  }
}
