package net.nimay.chatompomp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * A small notification when OMP finishes an answer in a conversation the user is
 * not looking at. Kept dependency-free (platform Notification.Builder).
 */
object Notifications {
    private const val CHANNEL = "omp-answers"
    private const val CHANNEL_RUN = "omp-routine"
    private const val RUNNING_ID = 4001

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL) != null) return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "OMP-svar", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    /**
     * A routine may open another app, which hides the in-app STOP overlay. This
     * notification keeps a STOPP action reachable while the phone is driven.
     */
    fun routineRunning(context: Context, body: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            if (manager.getNotificationChannel(CHANNEL_RUN) == null) {
                manager.createNotificationChannel(
                    NotificationChannel(CHANNEL_RUN, "OMP-rutiner", NotificationManager.IMPORTANCE_LOW),
                )
            }
        }
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val open = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            context, 10, open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_STOP_ROUTINE, true)
        }
        val stopPending = PendingIntent.getActivity(
            context, 11, stop,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(context, CHANNEL_RUN)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("OMP styrer telefonen")
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPending)
            .addAction(Notification.Action.Builder(null, "STOPP", stopPending).build())
            .build()
        runCatching { manager.notify(RUNNING_ID, notification) }
    }

    fun routineFinished(context: Context) {
        context.getSystemService(NotificationManager::class.java)?.cancel(RUNNING_ID)
    }

    fun answer(context: Context, title: String, body: String) {
        ensureChannel(context)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title.ifBlank { "OMP" })
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        runCatching { manager.notify(title.hashCode(), notification) }
    }

    const val EXTRA_STOP_ROUTINE = "stop_routine"
}
