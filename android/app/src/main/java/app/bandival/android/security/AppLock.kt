package app.bandival.android.security

import android.content.Context
import android.os.Build
import android.os.SystemClock
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Optional app lock: fingerprint, face or device PIN when Bandival is opened.
 * The session itself stays signed in (sliding 30 days) – the lock only protects the open app.
 */
object AppLock {
    private const val PREFS = "bandival"
    private const val KEY_ENABLED = "app_lock_enabled"
    /** Short switches to another app (e.g. a tuner) do not lock again. */
    private const val GRACE_MS = 2 * 60 * 1000L

    private val _locked = MutableStateFlow(false)
    val locked: StateFlow<Boolean> = _locked
    private var backgroundedAt = 0L
    private var prompting = false

    private fun authenticators(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BIOMETRIC_STRONG or DEVICE_CREDENTIAL else BIOMETRIC_WEAK or DEVICE_CREDENTIAL

    fun isEnabled(context: Context): Boolean = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putBoolean(KEY_ENABLED, enabled) }
        if (!enabled) _locked.value = false
    }

    fun isAvailable(context: Context): Boolean =
        BiometricManager.from(context).canAuthenticate(authenticators()) == BiometricManager.BIOMETRIC_SUCCESS

    fun onStart(context: Context) {
        if (!isEnabled(context)) return
        val away = SystemClock.elapsedRealtime() - backgroundedAt
        if (backgroundedAt == 0L || away > GRACE_MS) _locked.value = true
    }

    fun onStop() {
        backgroundedAt = SystemClock.elapsedRealtime()
    }

    /** Shows the system prompt; unlocks on success. */
    fun prompt(activity: FragmentActivity, title: String = "Bandival entsperren", onResult: (Boolean) -> Unit = {}) {
        if (prompting) return
        prompting = true
        val prompt = BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                prompting = false
                _locked.value = false
                onResult(true)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                prompting = false
                onResult(false)
            }
        })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle("Fingerabdruck, Gesicht oder Geräte-PIN")
            .setAllowedAuthenticators(authenticators())
            .build()
        prompt.authenticate(info)
    }
}
