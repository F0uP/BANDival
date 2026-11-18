package app.bandival.android.data

import android.webkit.CookieManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLDecoder
import java.util.concurrent.TimeUnit

/**
 * One cookie store for native requests and embedded web screens: OkHttp reads and writes the
 * WebView CookieManager, so logging in natively also logs in the web views (and vice versa).
 */
class SharedCookieJar : CookieJar {
    private val manager: CookieManager get() = CookieManager.getInstance()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { manager.setCookie(url.toString(), it.toString()) }
        manager.flush()
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val header = manager.getCookie(url.toString()) ?: return emptyList()
        return header.split(";").mapNotNull { Cookie.parse(url, it.trim()) }
    }

    fun value(url: String, name: String): String? =
        manager.getCookie(url)
            ?.split(";")
            ?.map { it.trim() }
            ?.firstOrNull { it.startsWith("$name=") }
            ?.substringAfter("=")
            ?.let { URLDecoder.decode(it, "UTF-8") }

    fun clear() {
        manager.removeAllCookies(null)
        manager.flush()
    }
}

class ApiException(val status: Int, message: String) : IOException(message)

val AppJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
    encodeDefaults = true
}

/** Thin JSON client for the Bandival REST API (session cookie + CSRF double-submit). */
class ApiClient(private val baseUrl: () -> String?, val cookies: SharedCookieJar) {
    val http: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookies)
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(5, TimeUnit.MINUTES)
        .build()

    /** Emits when the server answers 401 – the UI goes back to the login screen. */
    val sessionExpired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val sessionEvents: SharedFlow<Unit> get() = sessionExpired

    fun base(): String = baseUrl() ?: throw ApiException(0, "Kein Server eingerichtet.")

    fun absolute(path: String): String = if (path.startsWith("http")) path else base() + path

    private suspend fun csrfToken(force: Boolean = false): String {
        val base = base()
        if (!force) cookies.value(base, CSRF_COOKIE)?.let { return it }
        execute(Request.Builder().url("$base/api/auth/csrf").get().build(), allowRetry = false)
        return cookies.value(base, CSRF_COOKIE) ?: throw ApiException(0, "Sicherheits-Token fehlt.")
    }

    private suspend fun execute(request: Request, allowRetry: Boolean): String = withContext(Dispatchers.IO) {
        val response = try {
            http.newCall(request).execute()
        } catch (error: IOException) {
            throw ApiException(0, "Keine Verbindung zum Server. Bist du offline?")
        }
        response.use {
            val text = it.body?.string().orEmpty()
            if (it.isSuccessful) return@withContext text
            val message = runCatching { AppJson.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.content }.getOrNull()
                ?: "Anfrage fehlgeschlagen (${it.code})."
            if (it.code == 401 && !request.url.encodedPath.startsWith("/api/auth/")) sessionExpired.tryEmit(Unit)
            if (it.code == 403 && allowRetry && message.contains("CSRF")) throw CsrfRetry()
            throw ApiException(it.code, message)
        }
    }

    private class CsrfRetry : IOException()

    suspend fun request(method: String, path: String, body: RequestBody? = null): String {
        val url = absolute(path)
        val unsafe = method != "GET" && method != "HEAD"
        suspend fun build(force: Boolean): Request = Request.Builder().url(url).apply {
            header("Accept", "application/json")
            if (unsafe) header("x-csrf-token", csrfToken(force))
            method(method, body ?: if (unsafe) EMPTY_JSON else null)
        }.build()
        return try {
            execute(build(false), allowRetry = unsafe)
        } catch (retry: CsrfRetry) {
            execute(build(true), allowRetry = false)
        }
    }

    suspend fun get(path: String): String = request("GET", path)
    suspend fun send(method: String, path: String, json: JsonElement? = null): String =
        request(method, path, (json ?: JsonObject(emptyMap())).toString().toRequestBody(JSON_TYPE))

    companion object {
        const val CSRF_COOKIE = "bandival_csrf"
        val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
        private val EMPTY_JSON = "{}".toRequestBody("application/json; charset=utf-8".toMediaType())
    }
}
