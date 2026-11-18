package app.bandival.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.webkit.CookieManager
import app.bandival.android.data.ApiClient
import app.bandival.android.data.Repository
import app.bandival.android.data.ResponseCache
import app.bandival.android.data.ServerConfig
import app.bandival.android.data.SharedCookieJar
import app.bandival.android.notify.NotificationWorker

class BandivalApp : Application() {
    lateinit var repository: Repository
        private set

    @Volatile
    var serverUrl: String? = null

    override fun onCreate() {
        super.onCreate()
        // Initialise the WebView cookie store on the main thread – it is shared with OkHttp.
        CookieManager.getInstance().setAcceptCookie(true)
        serverUrl = ServerConfig.get(this)
        val api = ApiClient({ serverUrl }, SharedCookieJar())
        repository = Repository(this, api, ResponseCache(this))
        createNotificationChannels()
        NotificationWorker.schedule(this)
    }

    fun changeServer(url: String?) {
        serverUrl = url
        if (url == null) ServerConfig.clear(this) else ServerConfig.save(this, url)
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_BAND, "Band-Neuigkeiten", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Termine, Erinnerungen, Songs und Setlists deiner Band"
            },
        )
    }

    companion object {
        const val CHANNEL_BAND = "band"
        fun from(context: Context): BandivalApp = context.applicationContext as BandivalApp
    }
}
