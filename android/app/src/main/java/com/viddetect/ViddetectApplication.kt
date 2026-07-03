package com.viddetect

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class ViddetectApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Viddetect Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Server running notification"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "viddetect_server"
    }
}
