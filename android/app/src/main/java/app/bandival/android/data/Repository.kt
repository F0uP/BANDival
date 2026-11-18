package app.bandival.android.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.serializer
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.security.MessageDigest

/** Loading state with offline fallback: cached data is shown first, then refreshed from the network. */
data class Resource<T>(
    val data: T? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val fromCache: Boolean = false,
)

/** Last API responses on disk – makes setlists, songs and lead sheets available offline (e.g. at a gig). */
class ResponseCache(context: Context) {
    private val dir = File(context.cacheDir, "api").apply { mkdirs() }

    private fun file(key: String): File {
        val digest = MessageDigest.getInstance("SHA-1").digest(key.toByteArray())
        return File(dir, digest.joinToString("") { "%02x".format(it) } + ".json")
    }

    fun read(key: String): String? = file(key).takeIf { it.exists() }?.readText()
    fun write(key: String, value: String) = runCatching { file(key).writeText(value) }
    fun clear() = dir.listFiles()?.forEach { it.delete() }
}

class Repository(private val context: Context, val api: ApiClient, private val cache: ResponseCache) {
    private val prefs = context.getSharedPreferences("bandival", Context.MODE_PRIVATE)

    private val _me = MutableStateFlow<Me?>(null)
    val me: StateFlow<Me?> = _me

    private val _bandId = MutableStateFlow(prefs.getString(KEY_BAND, null))
    val bandId: StateFlow<String?> = _bandId

    val currentBand: BandSummary?
        get() = _me.value?.bands?.firstOrNull { it.id == _bandId.value } ?: _me.value?.bands?.firstOrNull()

    fun selectBand(id: String) {
        _bandId.value = id
        prefs.edit().putString(KEY_BAND, id).apply()
    }

    /** Generic cached GET as a flow. */
    fun <T> load(path: String, serializer: KSerializer<T>): Flow<Resource<T>> = flow<Resource<T>> {
        val key = (api.absolute(path))
        val cached = cache.read(key)?.let { text -> runCatching { AppJson.decodeFromString(serializer, text) }.getOrNull() }
        if (cached != null) emit(Resource(cached, loading = true, fromCache = true)) else emit(Resource(loading = true))
        try {
            val text = api.get(path)
            val value = AppJson.decodeFromString(serializer, text)
            cache.write(key, text)
            emit(Resource(value, loading = false))
        } catch (error: Exception) {
            emit(Resource(cached, loading = false, error = error.message ?: "Fehler", fromCache = cached != null))
        }
    }.flowOn(Dispatchers.IO)

    inline fun <reified T> load(path: String): Flow<Resource<T>> = load(path, serializer())

    suspend inline fun <reified T> getJson(path: String): T = AppJson.decodeFromString(serializer<T>(), api.get(path))

    /** Loads a GET resource into the offline cache (e.g. all songs of a setlist before a gig). */
    suspend fun prefetch(path: String): Boolean = runCatching {
        val text = api.get(path)
        cache.write(api.absolute(path), text)
        true
    }.getOrDefault(false)

    /* ---------- Session ---------- */

    suspend fun instanceConfig(): InstanceConfig = getJson("/api/auth/config")

    suspend fun refreshMe(): Me? {
        return try {
            val me = getJson<MeResponse>("/api/auth/me").user
            _me.value = me
            if (me.bands.none { it.id == _bandId.value }) {
                (me.defaultBandId ?: me.bands.firstOrNull()?.id)?.let { selectBand(it) }
            }
            me
        } catch (error: ApiException) {
            if (error.status == 401) {
                _me.value = null
                null
            } else {
                throw error
            }
        }
    }

    suspend fun login(email: String, password: String): LoginResponse {
        val text = api.send("POST", "/api/auth/login", buildJsonObject {
            put("email", email.trim())
            put("password", password)
        })
        return AppJson.decodeFromString(LoginResponse.serializer(), text)
    }

    suspend fun loginTwoFactor(challenge: String, code: String) {
        api.send("POST", "/api/auth/login/2fa", buildJsonObject {
            put("challenge", challenge)
            put("code", code.trim())
        })
    }

    /* ---------- Passkeys (WebAuthn via Credential Manager) ---------- */

    private fun challengeAndOptions(text: String): Pair<String, String> {
        val body = AppJson.parseToJsonElement(text).jsonObject
        val challengeId = body["challengeId"]?.jsonPrimitive?.content ?: throw IllegalStateException("Ungültige Antwort vom Server.")
        val options = body["options"] ?: throw IllegalStateException("Ungültige Antwort vom Server.")
        return challengeId to options.toString()
    }

    suspend fun passkeyLoginOptions(): Pair<String, String> =
        challengeAndOptions(api.send("POST", "/api/auth/passkey", buildJsonObject { put("step", "options") }))

    suspend fun passkeyLoginVerify(challengeId: String, responseJson: String) {
        api.send("POST", "/api/auth/passkey", buildJsonObject {
            put("step", "verify")
            put("challengeId", challengeId)
            put("response", AppJson.parseToJsonElement(responseJson))
        })
    }

    suspend fun passkeyAddOptions(): Pair<String, String> =
        challengeAndOptions(api.send("POST", "/api/account/passkeys", buildJsonObject { put("step", "options") }))

    suspend fun passkeyAddVerify(challengeId: String, responseJson: String, name: String) {
        api.send("POST", "/api/account/passkeys", buildJsonObject {
            put("step", "verify")
            put("challengeId", challengeId)
            put("response", AppJson.parseToJsonElement(responseJson))
            put("name", name)
        })
    }

    suspend fun forgotPassword(email: String) {
        api.send("POST", "/api/auth/password/forgot", buildJsonObject { put("email", email.trim()) })
    }

    suspend fun logout() {
        runCatching { api.send("POST", "/api/auth/logout") }
        api.cookies.clear()
        cache.clear()
        _me.value = null
    }

    /* ---------- Actions ---------- */

    suspend fun rsvp(eventId: String, status: String?) {
        api.send("PUT", "/api/events/$eventId/availability", buildJsonObject {
            if (status == null) put("status", JsonNull) else put("status", status)
        })
    }

    suspend fun markAllNotificationsRead() {
        api.send("PATCH", "/api/notifications", buildJsonObject { put("markAllRead", true) })
    }

    suspend fun uploadIdea(bandId: String, title: String, notes: String, file: File?, durationSeconds: Int) {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
            addFormDataPart("bandId", bandId)
            addFormDataPart("title", title)
            addFormDataPart("notes", notes)
            if (durationSeconds > 0) addFormDataPart("durationSeconds", durationSeconds.toString())
            if (file != null) addFormDataPart("file", file.name, file.asRequestBody("audio/mp4".toMediaType()))
        }.build()
        api.request("POST", "/api/ideas", body)
    }

    suspend fun convertIdea(ideaId: String): String =
        AppJson.decodeFromString(ConvertResponse.serializer(), api.send("POST", "/api/ideas/$ideaId/convert")).songId

    suspend fun deleteIdea(ideaId: String) {
        api.send("DELETE", "/api/ideas/$ideaId")
    }

    companion object {
        private const val KEY_BAND = "band_id"
    }
}
