package com.viddetect

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File

class NodeService : Service() {
    private var nodeThread: Thread? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "NodeService created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)

        if (nodeThread == null || !nodeThread!!.isAlive) {
            startNode()
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, ViddetectApplication.CHANNEL_ID)
            .setContentTitle("Viddetect")
            .setContentText("Server is running")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun startNode() {
        nodeThread = Thread {
            try {
                val dataDir = filesDir.absolutePath

                setupNodeProject(dataDir)
                setupBinaries(dataDir)

                Log.d(TAG, "Starting Node.js server...")
                Log.d(TAG, "Data dir: $dataDir")

                val args = arrayOf(
                    "node",
                    "--expose-gc",
                    File(dataDir, "nodejs-project/main.js").absolutePath
                )

                NodeEngine.startNodeWithArguments(args)

            } catch (e: Exception) {
                Log.e(TAG, "Node.js server error", e)
            }
        }
        nodeThread!!.name = "node-server"
        nodeThread!!.start()
    }

    private fun setupNodeProject(dataDir: String) {
        val destDir = File(dataDir, "nodejs-project")
        if (!destDir.exists()) {
            destDir.mkdirs()
            // Copy main.js from assets
            try {
                assets.list("nodejs-project")?.forEach { file ->
                    val srcStream = assets.open("nodejs-project/$file")
                    val dstFile = File(destDir, file)
                    dstFile.outputStream().use { output ->
                        srcStream.copyTo(output)
                    }
                    srcStream.close()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not copy nodejs-project from assets", e)
            }
        }
    }

    private fun setupBinaries(dataDir: String) {
        val ytDlpDst = File(dataDir, "yt-dlp")
        if (!ytDlpDst.exists()) {
            Log.d(TAG, "yt-dlp binary not found at ${ytDlpDst.absolutePath}")
        }
        val ffmpegDst = File(dataDir, "ffmpeg")
        if (!ffmpegDst.exists()) {
            Log.d(TAG, "ffmpeg binary not found at ${ffmpegDst.absolutePath}")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        nodeThread?.interrupt()
        Log.d(TAG, "NodeService destroyed")
    }

    companion object {
        private const val TAG = "ViddetectNode"
        private const val NOTIFICATION_ID = 1001
    }
}
