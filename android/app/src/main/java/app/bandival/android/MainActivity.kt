package app.bandival.android

import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.fragment.app.FragmentActivity
import app.bandival.android.security.AppLock
import app.bandival.android.ui.screens.LockScreen
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.bandival.android.ui.AppRoot
import app.bandival.android.ui.theme.BandivalTheme
import kotlinx.coroutines.flow.MutableStateFlow

/** Routes hardware keys (Bluetooth page turners, keyboards, volume keys in live mode) to the active screen. */
object KeyBus {
    @Volatile var handler: ((KeyEvent) -> Boolean)? = null
}

class MainActivity : FragmentActivity() {
    /** Deep link target from notifications, e.g. "/app/songs/<id>". */
    val pendingTarget = MutableStateFlow<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        pendingTarget.value = intent?.getStringExtra(EXTRA_TARGET)
        setContent {
            BandivalTheme {
                val locked by AppLock.locked.collectAsState()
                Box {
                    AppRoot(activity = this@MainActivity)
                    if (locked) LockScreen(onUnlock = { AppLock.prompt(this@MainActivity) })
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        AppLock.onStart(this)
    }

    override fun onStop() {
        AppLock.onStop()
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_TARGET)?.let { pendingTarget.value = it }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (KeyBus.handler?.invoke(event) == true) return true
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        const val EXTRA_TARGET = "target"
    }
}
