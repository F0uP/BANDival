package app.bandival.android.data

import android.content.Context
import android.net.Uri
import androidx.core.content.edit
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Stores and validates the URL of the user's self-hosted Bandival server. */
object ServerConfig {
    private const val PREFS = "bandival"
    private const val KEY_URL = "server_url"

    fun get(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_URL, null)

    fun save(context: Context, url: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString(KEY_URL, url) }
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { remove(KEY_URL) }
    }

    /** Accepts "bandival.example.com", "https://host:3000/" etc. and returns "https://host:3000". */
    fun normalize(input: String): String? {
        var value = input.trim().trimEnd('/')
        if (value.isEmpty()) return null
        if (!value.startsWith("http://", ignoreCase = true) && !value.startsWith("https://", ignoreCase = true)) {
            value = "https://$value"
        }
        val uri = Uri.parse(value)
        if (uri.host.isNullOrBlank()) return null
        val port = if (uri.port > 0) ":${uri.port}" else ""
        return "${uri.scheme?.lowercase()}://${uri.host}$port"
    }

    sealed interface CheckResult {
        data class Ok(val version: String) : CheckResult
        data class Error(val message: String) : CheckResult
    }

    /** Calls /api/health on a background thread (blocking). */
    fun check(baseUrl: String): CheckResult {
        return try {
            val connection = (URL("$baseUrl/api/health").openConnection() as HttpURLConnection).apply {
                connectTimeout = 8000
                readTimeout = 8000
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
            }
            try {
                val code = connection.responseCode
                val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                    ?.bufferedReader()?.use { it.readText() }.orEmpty()
                val json = runCatching { JSONObject(body) }.getOrNull()
                val app = json?.optString("app")
                val version = json?.optString("version", "?") ?: "?"
                when {
                    app != "bandival" -> CheckResult.Error("Unter dieser Adresse läuft kein Bandival-Server.")
                    code !in 200..299 -> CheckResult.Error("Der Server ist erreichbar, aber die Datenbank antwortet nicht.")
                    else -> CheckResult.Ok(version)
                }
            } finally {
                connection.disconnect()
            }
        } catch (error: javax.net.ssl.SSLException) {
            CheckResult.Error("Sichere Verbindung fehlgeschlagen (Zertifikat?). Für lokale Server http:// verwenden.")
        } catch (error: java.net.UnknownHostException) {
            CheckResult.Error("Server nicht gefunden. Bitte Adresse prüfen.")
        } catch (error: Exception) {
            CheckResult.Error("Keine Verbindung: ${error.localizedMessage ?: error.javaClass.simpleName}")
        }
    }
}
