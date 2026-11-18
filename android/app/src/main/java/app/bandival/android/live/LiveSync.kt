package app.bandival.android.live

import app.bandival.android.data.ApiClient
import app.bandival.android.data.AppJson
import app.bandival.android.data.LiveHello
import app.bandival.android.data.LiveMetronomeState
import app.bandival.android.data.LivePing
import app.bandival.android.data.LivePresence
import app.bandival.android.data.LiveState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.TimeUnit

/** Live stage sync over Server-Sent Events – same protocol as the web live mode. */
class LiveSync(private val api: ApiClient, private val setlistId: String, private val onState: (LiveState?, Long) -> Unit) {
    private var source: EventSource? = null
    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected
    private val _presence = MutableStateFlow<List<LivePresence>>(emptyList())
    val presence: StateFlow<List<LivePresence>> = _presence
    private val _remote = MutableStateFlow<LiveState?>(null)
    val remote: StateFlow<LiveState?> = _remote

    /** serverTime - localTime */
    @Volatile var clockOffsetMs: Long = 0
        private set

    fun connect() {
        disconnect()
        val client = api.http.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build()
        val request = Request.Builder().url(api.absolute("/api/live/$setlistId")).header("Accept", "text/event-stream").build()
        source = EventSources.createFactory(client).newEventSource(request, object : EventSourceListener() {
            override fun onOpen(eventSource: EventSource, response: Response) {
                _connected.value = true
            }

            override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                runCatching {
                    when (type) {
                        "hello" -> {
                            val hello = AppJson.decodeFromString(LiveHello.serializer(), data)
                            clockOffsetMs = hello.serverTime - System.currentTimeMillis()
                            _remote.value = hello.state
                            onState(hello.state, clockOffsetMs)
                        }
                        "ping" -> clockOffsetMs = AppJson.decodeFromString(LivePing.serializer(), data).serverTime - System.currentTimeMillis()
                        "presence" -> _presence.value = AppJson.decodeFromString(ListSerializer(LivePresence.serializer()), data)
                        "state" -> {
                            val state = if (data == "null") null else AppJson.decodeFromString(LiveState.serializer(), data)
                            _remote.value = state
                            onState(state, clockOffsetMs)
                        }
                    }
                }
            }

            override fun onClosed(eventSource: EventSource) {
                _connected.value = false
            }

            override fun onFailure(eventSource: EventSource, t: Throwable?, response: Response?) {
                _connected.value = false
            }
        })
    }

    fun disconnect() {
        source?.cancel()
        source = null
        _connected.value = false
    }

    suspend fun publish(index: Int, songId: String?, metronome: LiveMetronomeState?, includeMetronome: Boolean, message: String? = null, end: Boolean = false) {
        runCatching {
            api.send("POST", "/api/live/$setlistId", buildJsonObject {
                put("index", index)
                if (songId == null) put("songId", JsonNull) else put("songId", songId)
                if (includeMetronome) {
                    if (metronome == null) {
                        put("metronome", JsonNull)
                    } else {
                        put("metronome", AppJson.encodeToJsonElement(LiveMetronomeState.serializer(), metronome.copy(gridStartEpochMs = metronome.gridStartEpochMs + clockOffsetMs)))
                    }
                }
                if (message != null) put("message", message)
                if (end) put("end", true)
            })
        }
    }
}
