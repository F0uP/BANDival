package app.bandival.android.live

import android.content.Context
import android.os.SystemClock
import app.bandival.android.data.ApiClient
import app.bandival.android.data.LiveMetronomeState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.random.Random

/** A click that another device is leading, converted to this phone's clock. */
data class RemoteClick(
    val source: Source,
    val leaderName: String,
    val key: String,
    val bpm: Double,
    val beatsPerBar: Int,
    val beatUnit: Int,
    val countInBars: Int,
    val gridStartLocalMs: Long,
    val sameSetlist: Boolean,
    val songIndex: Int?,
    val songId: String?,
    val message: String?,
    /** Estimated accuracy in ms. */
    val accuracyMs: Int?,
) {
    enum class Source(val label: String) { Wifi("WLAN"), Bluetooth("Bluetooth"), Server("Server") }
}

/**
 * Zero-config stage link. Whoever starts the click becomes the leader; every other phone in live mode
 * follows automatically – via Bluetooth LE broadcast (always, no pairing), via UDP when the phones share
 * a Wi-Fi (more precise), and via the Bandival server when it is reachable (for web clients).
 */
class StageLink(context: Context, private val api: ApiClient, private val setlistId: String, deviceName: String) {
    private val session = Random.nextInt(1, 65536)
    private val beacon = StageBeacon(context)
    private val estimator = BeaconGridEstimator()
    private val wifi = LocalSync(context, session, deviceName)
    private var server: LiveSync? = null
    private val setlistHash = StageBeacon.setlistHash(setlistId)
    private var scope: CoroutineScope? = null
    private var serverJob: Job? = null

    private var generation = 0
    @Volatile private var leading: Payload? = null
    private data class Payload(val config: MetronomeConfig, val gridStart: Long, val songIndex: Int, val songId: String?, val running: Boolean)

    private val _remote = MutableStateFlow<RemoteClick?>(null)
    val remote: StateFlow<RemoteClick?> = _remote
    private val _isLeading = MutableStateFlow(false)
    val isLeading: StateFlow<Boolean> = _isLeading
    val radioError: StateFlow<String?> get() = beacon.error

    private var bleRemote: RemoteClick? = null
    private var bleSeenAt = 0L
    private var wifiRemote: RemoteClick? = null
    private var wifiSeenAt = 0L
    private var serverRemote: RemoteClick? = null
    private var serverSeenAt = 0L
    /** Highest generation seen from another leader – a newer click start takes over the stage. */
    private var lastRemoteGeneration: Int? = null

    fun start(serverAvailable: Boolean) {
        if (scope != null) return
        val created = CoroutineScope(Dispatchers.Default + SupervisorJob())
        scope = created
        beacon.startListening { payload, nanos -> onBeacon(payload, nanos) }
        wifi.onRemote = { remote -> onWifi(remote) }
        wifi.start()
        if (serverAvailable) {
            val sync = LiveSync(api, setlistId) { state, offset ->
                if (_isLeading.value || state == null) {
                    serverRemote = null
                } else {
                    val metronome = state.metronome
                    serverRemote = if (metronome?.running == true) RemoteClick(
                        RemoteClick.Source.Server, state.leaderName, "server:${state.leaderId}", metronome.bpm, metronome.beatsPerBar, metronome.beatUnit,
                        metronome.countInBars, (metronome.gridStartEpochMs - offset).toLong(), true, state.index, state.songId, state.message, null,
                    ) else null
                    serverSeenAt = System.currentTimeMillis()
                }
                choose()
            }
            sync.connect()
            server = sync
        }
        // Expire stale sources (leader walked away or stopped without us hearing it).
        created.launch {
            while (isActive) {
                delay(1000)
                choose()
            }
        }
    }

    private fun elapsedToWall(): Double = System.currentTimeMillis() - SystemClock.elapsedRealtime().toDouble()

    private fun isNewer(candidate: Int, reference: Int): Boolean {
        val diff = (candidate - reference + 65536) % 65536
        return diff in 1..32767
    }

    private fun onBeacon(payload: StageBeacon.Payload, receivedNanos: Long) {
        if (payload.session == session) return
        if (!payload.running) {
            if (bleRemote?.key?.startsWith("${payload.session}:") == true) bleRemote = null
            choose()
            return
        }
        // Someone started a newer click while we lead → hand over.
        if (_isLeading.value && isNewer(payload.generation, generation)) stopLeadingInternal()
        val grid = estimator.add(payload, receivedNanos, elapsedToWall()) ?: return
        bleRemote = RemoteClick(
            RemoteClick.Source.Bluetooth, "Bühnen-Funk", "${payload.session}:${payload.generation}", payload.bpm, payload.beatsPerBar, payload.beatUnit,
            if (payload.beatsPerBar > 0) payload.countInBeats / payload.beatsPerBar else 0, grid.toLong(), payload.setlistHash == setlistHash,
            payload.songIndex, null, null, if (estimator.sampleCount >= 20) 5 else 15,
        )
        bleSeenAt = System.currentTimeMillis()
        lastRemoteGeneration = payload.generation
        choose()
    }

    private fun onWifi(remote: LocalSync.Remote) {
        val packet = remote.packet
        val metronome = packet.metronome
        if (metronome == null || !metronome.running) {
            if (wifiRemote?.key?.startsWith("${packet.session}:") == true) wifiRemote = null
            choose()
            return
        }
        if (_isLeading.value && isNewer(packet.generation, generation)) stopLeadingInternal()
        val grid = remote.gridStartLocalMs ?: return // wait for the first clock sync
        wifiRemote = RemoteClick(
            RemoteClick.Source.Wifi, packet.leader ?: "Leader", "${packet.session}:${packet.generation}", metronome.bpm, metronome.beatsPerBar, metronome.beatUnit,
            metronome.countInBars, grid.toLong(), packet.setlistId == setlistId, packet.index, packet.songId, packet.message, remote.bestRttMs?.let { (it / 2).toInt().coerceAtLeast(1) },
        )
        wifiSeenAt = System.currentTimeMillis()
        choose()
    }

    @Synchronized
    private fun choose() {
        val now = System.currentTimeMillis()
        if (_isLeading.value) {
            _remote.value = null
            return
        }
        val wifiFresh = wifiRemote?.takeIf { now - wifiSeenAt < 3000 }
        val bleFresh = bleRemote?.takeIf { now - bleSeenAt < 3000 }
        val serverFresh = serverRemote?.takeIf { now - serverSeenAt < 60_000 }
        // Prefer Wi-Fi (precise clock sync); Bluetooth and Wi-Fi carry the same leader keys.
        _remote.value = when {
            wifiFresh != null && (bleFresh == null || bleFresh.key == wifiFresh.key) -> wifiFresh.copy(leaderName = wifiFresh.leaderName)
            bleFresh != null -> bleFresh.copy(leaderName = wifiRemote?.takeIf { it.key == bleFresh.key }?.leaderName ?: bleFresh.leaderName)
            else -> serverFresh
        }
    }

    /** This phone starts the click → it leads; all others follow. */
    fun lead(config: MetronomeConfig, gridStart: Long, songIndex: Int, songId: String?) {
        generation = ((System.currentTimeMillis() / 1000) and 0xffff).toInt().let { candidate ->
            val last = lastRemoteGeneration
            if (last != null && !isNewer(candidate, last)) (last + 1) and 0xffff else candidate
        }
        leading = Payload(config, gridStart, songIndex, songId, true)
        _isLeading.value = true
        estimator.reset()
        choose()
        beacon.broadcast(payloadFor(0))
        wifi.lead(setlistId, generation, songIndex, songId, liveState(), null)
        scope?.launch { server?.publish(songIndex, songId, liveState(), includeMetronome = true) }
    }

    private fun liveState(): LiveMetronomeState? = leading?.takeIf { it.running }?.let {
        LiveMetronomeState(true, it.config.bpm, it.config.beatsPerBar, it.config.beatUnit, it.config.countInBars, it.gridStart.toDouble())
    }

    private fun payloadFor(beatIndex: Long): StageBeacon.Payload {
        val current = leading!!
        return StageBeacon.Payload(
            session, generation, current.running, current.config.bpm, current.config.beatsPerBar, current.config.beatUnit,
            (beatIndex and 0xffff).toInt(), setlistHash, current.songIndex, current.config.countInBars * current.config.beatsPerBar,
        )
    }

    /** Called by the leader on every audible beat – updates the broadcast exactly on the beat. */
    fun onLeaderBeat(beat: Beat) {
        if (leading?.running != true) return
        beacon.broadcast(payloadFor(beat.index))
    }

    /** The leader moved to another song (followers in the same setlist follow). */
    fun leaderSong(songIndex: Int, songId: String?) {
        val current = leading ?: return
        leading = current.copy(songIndex = songIndex, songId = songId)
        wifi.lead(setlistId, generation, songIndex, songId, liveState(), null)
        scope?.launch { server?.publish(songIndex, songId, liveState(), includeMetronome = true) }
    }

    fun announce(message: String, songIndex: Int, songId: String?) {
        if (leading != null) wifi.lead(setlistId, generation, songIndex, songId, liveState(), message)
        scope?.launch { server?.publish(songIndex, songId, liveState(), includeMetronome = false, message = message) }
    }

    fun stopLeading() = stopLeadingInternal()

    private fun stopLeadingInternal() {
        val current = leading ?: return
        leading = current.copy(running = false)
        // Tell everybody for a moment that the click stopped, then go quiet.
        beacon.broadcast(payloadFor(0))
        wifi.stopLeading(setlistId, generation)
        scope?.launch {
            server?.publish(current.songIndex, current.songId, null, includeMetronome = true)
            delay(2000)
            if (leading?.running == false) {
                beacon.stopBroadcast()
                leading = null
            }
        }
        _isLeading.value = false
    }

    fun close() {
        serverJob?.cancel()
        beacon.close()
        wifi.stop()
        server?.disconnect()
        server = null
        scope?.cancel()
        scope = null
    }
}
