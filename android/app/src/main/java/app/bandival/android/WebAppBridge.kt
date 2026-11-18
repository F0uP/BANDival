package app.bandival.android

import android.webkit.JavascriptInterface

/**
 * Exposed to the web app as `window.BandivalAndroid`.
 * All methods are called on a WebView background thread and must hop to the UI thread.
 */
class WebAppBridge(private val host: Host) {

    interface Host {
        fun keepScreenOn(on: Boolean)
        fun applyDarkMode(dark: Boolean)
        fun openServerSetup()
        fun appVersion(): String
        fun vibrate(durationMs: Long, amplitude: Int)
        fun hasVibrator(): Boolean
    }

    @JavascriptInterface
    fun setKeepScreenOn(on: Boolean) = host.keepScreenOn(on)

    @JavascriptInterface
    fun setDarkMode(dark: Boolean) = host.applyDarkMode(dark)

    @JavascriptInterface
    fun changeServer() = host.openServerSetup()

    @JavascriptInterface
    fun getAppVersion(): String = host.appVersion()

    /** Haptic metronome on the phone (Bandival Pulse "phone" output). The WebView has no Vibration API. */
    @JavascriptInterface
    fun vibrate(durationMs: Int) = host.vibrate(durationMs.coerceIn(5, 400).toLong(), -1)

    @JavascriptInterface
    fun vibrateWithStrength(durationMs: Int, strength: Int) = host.vibrate(durationMs.coerceIn(5, 400).toLong(), strength.coerceIn(1, 255))

    @JavascriptInterface
    fun hasVibrator(): Boolean = host.hasVibrator()
}
