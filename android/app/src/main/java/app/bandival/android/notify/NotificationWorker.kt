package app.bandival.android.notify

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.bandival.android.BandivalApp
import app.bandival.android.MainActivity
import app.bandival.android.R
import app.bandival.android.data.AppJson
import app.bandival.android.data.NotificationsResponse
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.TimeUnit

/**
 * Polls unread in-app notifications every 15 minutes and shows them as Android notifications.
 * (Instant delivery without Google services: ntfy – configurable in the settings.)
 */
class NotificationWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    @SuppressLint("MissingPermission") // checked in canNotify()
    override suspend fun doWork(): Result {
        val app = BandivalApp.from(applicationContext)
        if (app.serverUrl == null) return Result.success()
        val prefs = applicationContext.getSharedPreferences("bandival", Context.MODE_PRIVATE)
        val seen = prefs.getStringSet(KEY_SEEN, emptySet()).orEmpty()
        val response = runCatching {
            AppJson.decodeFromString(NotificationsResponse.serializer(), app.repository.api.get("/api/notifications?unreadOnly=true&limit=20"))
        }.getOrElse { return Result.success() }

        val fresh = response.notifications.filter { it.id !in seen }
        if (fresh.isNotEmpty() && canNotify()) {
            val manager = NotificationManagerCompat.from(applicationContext)
            fresh.take(5).forEach { notification ->
                val target = notification.payload?.let { payload ->
                    payload["url"]?.jsonPrimitive?.content
                        ?: payload["songId"]?.jsonPrimitive?.content?.let { "/app/songs/$it" }
                        ?: payload["setlistId"]?.jsonPrimitive?.content?.let { "/app/setlists/$it" }
                } ?: "/app"
                val intent = Intent(applicationContext, MainActivity::class.java)
                    .putExtra(MainActivity.EXTRA_TARGET, target)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                val pending = PendingIntent.getActivity(applicationContext, notification.id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
                val built = NotificationCompat.Builder(applicationContext, BandivalApp.CHANNEL_BAND)
                    .setSmallIcon(R.drawable.ic_launcher_monochrome)
                    .setContentTitle(notification.title)
                    .setContentText(notification.body)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(notification.body))
                    .setAutoCancel(true)
                    .setContentIntent(pending)
                    .build()
                runCatching { manager.notify(notification.id.hashCode(), built) }
            }
        }
        prefs.edit().putStringSet(KEY_SEEN, (seen + response.notifications.map { it.id }).toList().takeLast(300).toSet()).apply()
        return Result.success()
    }

    private fun canNotify(): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    companion object {
        private const val KEY_SEEN = "seen_notifications"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<NotificationWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("bandival-notifications", ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
