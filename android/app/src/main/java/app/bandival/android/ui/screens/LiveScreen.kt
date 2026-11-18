package app.bandival.android.ui.screens

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.VolumeOff
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Bluetooth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.QueueMusic
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Sensors
import androidx.compose.material.icons.outlined.Timer
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Vibration
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import app.bandival.android.KeyBus
import app.bandival.android.data.RehearsalNotesResponse
import app.bandival.android.data.SetlistItem
import app.bandival.android.data.SetlistResponse
import app.bandival.android.data.SongPartsResponse
import app.bandival.android.data.SongResponse
import app.bandival.android.data.asBpm
import app.bandival.android.live.Beat
import app.bandival.android.live.HapticSettings
import app.bandival.android.live.Metronome
import app.bandival.android.live.MetronomeConfig
import app.bandival.android.live.PhoneHaptics
import app.bandival.android.live.PulseBle
import app.bandival.android.live.StageLink
import app.bandival.android.music.meterFor
import app.bandival.android.music.transposeRoot
import app.bandival.android.ui.AppScope
import app.bandival.android.ui.components.ChordSheetView
import app.bandival.android.ui.components.LyricsView
import app.bandival.android.ui.components.formatDuration
import app.bandival.android.ui.components.formatTotal
import app.bandival.android.ui.rememberResource
import app.bandival.android.ui.theme.BandivalTheme
import app.bandival.android.ui.theme.Success
import app.bandival.android.ui.theme.Warning
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs

private class LivePrefs(context: Context) {
    private val prefs = context.getSharedPreferences("bandival.live", Context.MODE_PRIVATE)
    fun bool(key: String, default: Boolean) = prefs.getBoolean(key, default)
    fun int(key: String, default: Int) = prefs.getInt(key, default)
    fun set(key: String, value: Boolean) = prefs.edit().putBoolean(key, value).apply()
    fun set(key: String, value: Int) = prefs.edit().putInt(key, value).apply()
}

private fun clock(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    return if (total >= 3600) "%d:%02d:%02d".format(total / 3600, (total % 3600) / 60, total % 60) else "%d:%02d".format(total / 60, total % 60)
}

private fun headphonesConnected(context: Context): Boolean {
    val audio = context.getSystemService(AudioManager::class.java) ?: return false
    val types = mutableSetOf(
        AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_LINE_ANALOG,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) types += AudioDeviceInfo.TYPE_BLE_HEADSET
    return audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { it.type in types }
}

private fun stagePermissions(): Array<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT)
} else {
    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveScreen(scope: AppScope, setlistId: String) = BandivalTheme(dark = true) {
    val context = LocalContext.current
    val prefs = remember { LivePrefs(context) }
    val repository = scope.repository
    val me by repository.me.collectAsState()
    val guest = repository.currentBand?.isGuest == true
    val setlist = rememberResource(repository, "/api/setlists/$setlistId", SetlistResponse.serializer())
    val notes = rememberResource(repository, if (guest) null else "/api/setlists/$setlistId/rehearsal", RehearsalNotesResponse.serializer())
    val items = setlist.data?.setlist?.items.orEmpty()
    val pager = rememberPagerState(pageCount = { items.size })
    val index = pager.currentPage.coerceIn(0, (items.size - 1).coerceAtLeast(0))
    val current = items.getOrNull(index)
    val next = items.getOrNull(index + 1)
    val coroutines = rememberCoroutineScope()

    val metronome = remember { Metronome() }
    val haptics = remember { PhoneHaptics(context) }
    val pulse = remember { PulseBle(context) }
    val link = remember { StageLink(context, repository.api, setlistId, me?.displayName ?: Build.MODEL) }
    val pulseState by pulse.state.collectAsState()
    val metronomeState by metronome.state.collectAsState()
    val measuredLatency by metronome.measuredLatencyMs.collectAsState()
    val remote by link.remote.collectAsState()
    val leading by link.isLeading.collectAsState()
    val radioError by link.radioError.collectAsState()

    var fontSize by remember { mutableIntStateOf(prefs.int("fontSize", 22)) }
    var sound by remember { mutableStateOf(prefs.bool("sound", true)) }
    var headphonesOnly by remember { mutableStateOf(prefs.bool("headphonesOnly", true)) }
    var vibrate by remember { mutableStateOf(prefs.bool("vibrate", true)) }
    var countIn by remember { mutableStateOf(prefs.bool("countIn", true)) }
    var autoStart by remember { mutableStateOf(prefs.bool("autoStart", false)) }
    var autoFollow by remember { mutableStateOf(prefs.bool("autoFollow", true)) }
    var followSongs by remember { mutableStateOf(prefs.bool("followSongs", true)) }
    var flashEnabled by remember { mutableStateOf(prefs.bool("flash", true)) }
    var volumeKeys by remember { mutableStateOf(prefs.bool("volumeKeys", false)) }
    var intensity by remember { mutableIntStateOf(prefs.int("intensity", 170)) }
    var outputDelay by remember { mutableIntStateOf(prefs.int("outputDelay", 0)) }
    val transposeBySong = remember { mutableStateMapOf<String, Int>() }
    val bpmBySong = remember { mutableStateMapOf<String, Int>() }
    var beat by remember { mutableStateOf<Beat?>(null) }
    var flash by remember { mutableStateOf(false) }
    var overviewOpen by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    var setStartedAt by remember { mutableStateOf<Long?>(null) }
    var songStartedAt by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var showChords by remember { mutableStateOf(true) }
    var partName by remember { mutableStateOf<String?>(null) }
    var announcement by remember { mutableStateOf("") }
    var followingKey by remember { mutableStateOf<String?>(null) }
    var ignoredKey by remember { mutableStateOf<String?>(null) }
    var offlineReady by remember { mutableIntStateOf(0) }
    var radioReady by remember { mutableStateOf(false) }
    val taps = remember { ArrayDeque<Long>() }

    val hapticSettings = HapticSettings(enabled = vibrate, intensity = intensity, accentIntensity = 255, pulseMs = 45)
    fun effectiveSound() = sound && (!headphonesOnly || headphonesConnected(context))

    LaunchedEffect(outputDelay) { metronome.outputDelayMs = outputDelay }

    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }

    // Stage link: Bluetooth broadcast + Wi-Fi + server – starts as soon as the radio permissions are granted.
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        link.start(serverAvailable = scope.app.serverUrl != null)
        radioReady = true
    }
    LaunchedEffect(Unit) {
        val missing = stagePermissions().filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) {
            link.start(serverAvailable = scope.app.serverUrl != null)
            radioReady = true
        } else {
            permissionLauncher.launch(missing.toTypedArray())
        }
    }

    DisposableEffect(Unit) {
        val window = (context as? Activity)?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            if (link.isLeading.value) link.stopLeading()
            metronome.stop()
            pulse.stop()
            pulse.disconnect()
            link.close()
            KeyBus.handler = null
        }
    }

    // Make the whole setlist available offline (lead sheets, parts, notes) while there is a connection.
    LaunchedEffect(items.size) {
        if (items.isEmpty()) return@LaunchedEffect
        var done = 0
        for (item in items) {
            val ok = repository.prefetch("/api/songs/${item.song.id}")
            repository.prefetch("/api/songs/${item.song.id}/parts")
            if (ok) done += 1
        }
        offlineReady = done
    }

    // Beats → flash, vibration, broadcast to followers
    LaunchedEffect(Unit) {
        metronome.beats.collect { event ->
            beat = event
            if (link.isLeading.value) link.onLeaderBeat(event)
            if (vibrate) haptics.pulse(event.accent, hapticSettings)
            flash = true
            delay(110)
            flash = false
        }
    }

    LaunchedEffect(index) {
        songStartedAt = System.currentTimeMillis()
        if (index > 0 && setStartedAt == null) setStartedAt = System.currentTimeMillis()
    }

    val currentSong = rememberResource(repository, current?.let { "/api/songs/${it.song.id}" }, SongResponse.serializer())
    val currentParts = rememberResource(repository, current?.let { "/api/songs/${it.song.id}/parts" }, SongPartsResponse.serializer())

    fun bpmFor(item: SetlistItem?): Int = item?.let { bpmBySong[it.song.id] ?: it.song.tempoBpm.asBpm() } ?: 0
    fun configFor(item: SetlistItem?): MetronomeConfig {
        val meter = meterFor(item?.song?.timeSignature)
        return MetronomeConfig(
            bpm = (bpmFor(item).takeIf { it > 0 } ?: 100).toDouble(),
            beatsPerBar = meter.beatsPerBar,
            beatUnit = meter.beatUnit,
            subdivision = meter.subdivision,
            countInBars = if (countIn) 1 else 0,
            sound = effectiveSound(),
        )
    }

    /** Starts the click on this phone and makes it the stage leader. */
    fun startLeading(item: SetlistItem?) {
        val config = configFor(item)
        metronome.start(config)
        followingKey = null
        link.lead(config, metronome.gridStartEpochMs, index, item?.song?.id)
        pulse.start(config, metronome.gridStartEpochMs, item?.song?.title, hapticSettings)
        if (setStartedAt == null) setStartedAt = System.currentTimeMillis()
    }

    fun stopClick() {
        if (leading) link.stopLeading()
        followingKey?.let { ignoredKey = it }
        followingKey = null
        metronome.stop()
        pulse.stop()
        beat = null
    }

    fun toggleClick() {
        if (metronome.isRunning) stopClick() else startLeading(current)
    }

    fun goTo(target: Int) {
        if (items.isEmpty()) return
        coroutines.launch { pager.animateScrollToPage(target.coerceIn(0, items.lastIndex)) }
    }

    // Page changes: the leader's metronome follows the song (auto-start) and followers get the new song.
    var lastPage by remember { mutableIntStateOf(-1) }
    LaunchedEffect(pager.currentPage, items.size) {
        if (items.isEmpty() || lastPage == pager.currentPage) return@LaunchedEffect
        val first = lastPage == -1
        lastPage = pager.currentPage
        if (first) return@LaunchedEffect
        val item = items.getOrNull(pager.currentPage)
        if (followingKey != null) return@LaunchedEffect // a follower only looks around; the click keeps running
        if (leading) {
            if (autoStart && bpmFor(item) > 0) startLeading(item) else link.leaderSong(pager.currentPage, item?.song?.id)
        } else if (autoStart && bpmFor(item) > 0 && metronome.isRunning.not()) {
            startLeading(item)
        } else if (metronome.isRunning) {
            stopClick()
        }
    }

    // Follow a click led by another device – fully automatic.
    LaunchedEffect(remote, autoFollow, leading) {
        val click = remote
        if (click == null || leading || !autoFollow) {
            if (followingKey != null && (click == null || !autoFollow)) {
                metronome.stop()
                pulse.stop()
                followingKey = null
                beat = null
            }
            return@LaunchedEffect
        }
        if (click.key == ignoredKey) return@LaunchedEffect
        val runningBpm = metronome.state.value?.bpm
        if (followingKey != click.key || runningBpm != click.bpm || !metronome.isRunning) {
            val config = MetronomeConfig(click.bpm, click.beatsPerBar, click.beatUnit, 1, click.countInBars, effectiveSound())
            metronome.start(config, click.gridStartLocalMs)
            pulse.start(config, maxOf(System.currentTimeMillis(), click.gridStartLocalMs), items.getOrNull(click.songIndex ?: -1)?.song?.title, hapticSettings)
            followingKey = click.key
        } else if (abs(metronome.gridStartEpochMs - click.gridStartLocalMs) > 3) {
            metronome.align(click.gridStartLocalMs)
        }
        val song = click.songId?.let { id -> items.indexOfFirst { it.song.id == id } }?.takeIf { it >= 0 } ?: click.songIndex
        if (followSongs && click.sameSetlist && song != null && song in items.indices && song != pager.currentPage) {
            pager.animateScrollToPage(song)
        }
    }

    fun changeBpm(value: Int) {
        val item = current ?: return
        val clamped = value.coerceIn(30, 300)
        bpmBySong[item.song.id] = clamped
        if (metronome.isRunning && followingKey == null) {
            // New tempo = new grid for everybody on stage.
            startLeading(item)
        }
    }

    fun tap() {
        val time = System.currentTimeMillis()
        while (taps.isNotEmpty() && time - taps.first() > 3000) taps.removeFirst()
        taps.addLast(time)
        if (taps.size >= 3) {
            val intervals = taps.zipWithNext { a, b -> b - a }
            changeBpm((60000.0 / intervals.average()).toInt())
        }
    }

    DisposableEffect(items.size, volumeKeys) {
        KeyBus.handler = handler@{ event ->
            if (event.action != KeyEvent.ACTION_DOWN) return@handler false
            when (event.keyCode) {
                KeyEvent.KEYCODE_PAGE_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_N -> { goTo(pager.currentPage + 1); true }
                KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_P -> { goTo(pager.currentPage - 1); true }
                KeyEvent.KEYCODE_VOLUME_DOWN -> if (volumeKeys) { goTo(pager.currentPage + 1); true } else false
                KeyEvent.KEYCODE_VOLUME_UP -> if (volumeKeys) { goTo(pager.currentPage - 1); true } else false
                KeyEvent.KEYCODE_M -> { toggleClick(); true }
                KeyEvent.KEYCODE_T -> { tap(); true }
                else -> false
            }
        }
        onDispose { KeyBus.handler = null }
    }

    val blePermissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        if (result.values.all { it }) pulse.scanAndConnect()
    }

    val totalSeconds = items.sumOf { it.durationSeconds }
    val remainingSeconds = items.drop(index).sumOf { it.durationSeconds }
    val songDurationMs = (current?.durationSeconds ?: 0) * 1000L
    val songElapsed = now - songStartedAt
    val runningConfig = metronomeState
    val beatsPerBar = runningConfig?.beatsPerBar ?: meterFor(current?.song?.timeSignature).beatsPerBar
    val bpm = runningConfig?.bpm?.toInt() ?: (bpmFor(current).takeIf { it > 0 } ?: 100)
    val running = runningConfig != null
    val flashColor = if (beat?.accent == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
    val stageStatus = when {
        leading -> "Du gibst den Takt vor – andere Handys laufen automatisch mit."
        followingKey != null && remote != null -> "Folgt ${remote!!.leaderName} · ${remote!!.source.label}${remote!!.accuracyMs?.let { " · ±$it ms" } ?: ""}"
        remote != null && !autoFollow -> "${remote!!.leaderName} gibt einen Click vor (Mitlaufen ist aus)"
        !radioReady -> "Bühnen-Funk startet …"
        radioError != null -> radioError!!
        else -> "Bühnen-Funk bereit – wer Start drückt, gibt den Takt vor."
    }

    Surface(color = MaterialTheme.colorScheme.background, modifier = Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().then(if (flashEnabled && running && flash) Modifier.border(BorderStroke(if (beat?.accent == true) 6.dp else 3.dp, flashColor)) else Modifier)) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { scope.back() }) { Icon(Icons.Outlined.Close, "Live-Modus verlassen") }
                    Column(Modifier.weight(1f).clickable { overviewOpen = true }) {
                        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(if (items.isNotEmpty()) "${index + 1}/${items.size}" else "", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
                            Text(current?.song?.title ?: setlist.data?.setlist?.name ?: "Lädt …", style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        val transpose = current?.let { transposeBySong[it.song.id] } ?: 0
                        Text(
                            listOfNotNull(
                                current?.key?.let { transposeRoot(it, transpose) + if (transpose != 0) " (${if (transpose > 0) "+" else ""}$transpose)" else "" },
                                bpmFor(current).takeIf { it > 0 }?.let { "$it BPM" },
                                current?.song?.timeSignature,
                                current?.durationSeconds?.takeIf { it > 0 }?.let { formatDuration(it) },
                            ).joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Column(horizontalAlignment = Alignment.End, modifier = Modifier.padding(horizontal = 6.dp)) {
                        Text(LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm")), style = MaterialTheme.typography.titleMedium)
                        Text(setStartedAt?.let { "Set ${clock(now - it)}" } ?: "Set –", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { overviewOpen = true }) { Icon(Icons.Outlined.QueueMusic, "Übersicht") }
                    IconButton(onClick = { settingsOpen = true }) { Icon(Icons.Outlined.Tune, "Einstellungen") }
                }
                LinearProgressIndicator(
                    progress = { if (songDurationMs > 0) (songElapsed.toFloat() / songDurationMs).coerceIn(0f, 1f) else 0f },
                    color = if (songDurationMs in 1..songElapsed) Warning else MaterialTheme.colorScheme.primary,
                    modifier = Modifier.fillMaxWidth().height(3.dp),
                )
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 2.dp)) {
                    Text("Song ${clock(songElapsed)}${if (songDurationMs > 0) " / ${clock(songDurationMs)}" else ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.weight(1f))
                    Text("Noch ${formatTotal(remainingSeconds)} · gesamt ${formatTotal(totalSeconds)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                // Click bar
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    FilledTonalButton(onClick = { toggleClick() }, contentPadding = PaddingValues(horizontal = 12.dp)) {
                        Icon(if (running) Icons.Outlined.Pause else Icons.Outlined.Timer, null)
                        Text(if (running) " Stopp" else " Start")
                    }
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        repeat(beatsPerBar) { position ->
                            val active = running && beat?.beat == position
                            Box(
                                Modifier.padding(horizontal = 3.dp).size(if (position == 0) 18.dp else 13.dp).clip(CircleShape).background(
                                    when {
                                        active && beat?.countIn == true -> Warning
                                        active && position == 0 -> MaterialTheme.colorScheme.primary
                                        active -> MaterialTheme.colorScheme.onSurface
                                        else -> MaterialTheme.colorScheme.outline
                                    },
                                ),
                            )
                        }
                    }
                    IconButton(onClick = { changeBpm(bpm - 1) }, enabled = followingKey == null) { Icon(Icons.Outlined.Remove, "Langsamer") }
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable(enabled = followingKey == null) { tap() }.width(52.dp)) {
                        Text("$bpm", fontSize = 20.sp, fontWeight = FontWeight.Bold)
                        Text("BPM · Tap", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { changeBpm(bpm + 1) }, enabled = followingKey == null) { Icon(Icons.Outlined.Add, "Schneller") }
                    IconButton(onClick = {
                        sound = !sound
                        prefs.set("sound", sound)
                        metronome.update(sound = effectiveSound())
                    }) { Icon(if (sound) Icons.AutoMirrored.Outlined.VolumeUp else Icons.AutoMirrored.Outlined.VolumeOff, "Klick hörbar") }
                    IconButton(onClick = {
                        vibrate = !vibrate
                        prefs.set("vibrate", vibrate)
                    }) { Icon(Icons.Outlined.Vibration, "Vibration", tint = if (vibrate) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Outlined.Sensors, null, Modifier.size(14.dp), tint = if (leading || followingKey != null) Success else MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(stageStatus, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (offlineReady > 0) Icon(Icons.Outlined.CloudDone, "Offline verfügbar", Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (!remote?.message.isNullOrBlank()) {
                    Text(
                        remote?.message.orEmpty(),
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp).background(MaterialTheme.colorScheme.primaryContainer).padding(horizontal = 16.dp, vertical = 6.dp),
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }

                HorizontalPager(state = pager, modifier = Modifier.weight(1f), key = { items[it].id }) { page ->
                    val item = items[page]
                    val isCurrent = page == index
                    val detail = if (isCurrent) currentSong.data?.song else null
                    val parts = if (isCurrent) currentParts.data?.parts.orEmpty() else emptyList()
                    val transpose = transposeBySong[item.song.id] ?: 0
                    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp)) {
                        val rehearsalNote = notes.data?.notes?.firstOrNull { it.songId == item.song.id }?.note
                        if (!rehearsalNote.isNullOrBlank() || !item.transitionNotes.isNullOrBlank()) {
                            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    if (!rehearsalNote.isNullOrBlank()) Text("Probe: $rehearsalNote", color = Warning)
                                    if (!item.transitionNotes.isNullOrBlank()) Text("Übergang: ${item.transitionNotes}", color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                        if (parts.isNotEmpty()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                                (listOf<String?>(null) + parts.map { it.instrument }).forEach { name ->
                                    FilterChip(selected = partName == name, onClick = { partName = name }, label = { Text(name ?: "Lead Sheet") })
                                }
                            }
                        }
                        val part = parts.firstOrNull { it.instrument == partName }
                        val chords = part?.content ?: detail?.chordProText.orEmpty()
                        val lyrics = detail?.lyricsRevisions?.firstOrNull()?.lyricsMarkdown.orEmpty()
                        when {
                            !isCurrent && detail == null -> Text(item.song.title, style = MaterialTheme.typography.headlineMedium)
                            part != null && part.kind == "tab" -> Text(part.content, fontFamily = FontFamily.Monospace, fontSize = (fontSize - 6).coerceAtLeast(10).sp)
                            chords.isNotBlank() -> ChordSheetView(chords, transpose, fontSize, showChords = showChords)
                            lyrics.isNotBlank() -> LyricsView(lyrics, fontSize)
                            currentSong.loading -> Text("Lädt …", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            else -> Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(item.song.title, style = MaterialTheme.typography.headlineMedium)
                                Text("Noch kein Lead Sheet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        val upNext = items.getOrNull(page + 1)
                        Spacer(Modifier.height(32.dp))
                        if (upNext != null) {
                            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth().clickable { goTo(page + 1) }) {
                                Column(Modifier.padding(16.dp)) {
                                    Text("ALS NÄCHSTES", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text(upNext.song.title, style = MaterialTheme.typography.headlineSmall)
                                    Text(listOfNotNull(upNext.key, bpmFor(upNext).takeIf { it > 0 }?.let { "$it BPM" }, upNext.durationSeconds.takeIf { it > 0 }?.let { formatDuration(it) }).joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (!upNext.transitionNotes.isNullOrBlank()) Text("→ ${upNext.transitionNotes}", color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        } else {
                            Text("Letzter Song – gleich geschafft! 🎉", modifier = Modifier.fillMaxWidth().padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(120.dp))
                    }
                }

                Row(Modifier.fillMaxWidth().padding(8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    FilledTonalButton(onClick = { goTo(index - 1) }, enabled = index > 0, modifier = Modifier.height(56.dp)) {
                        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowLeft, "Vorheriger Song")
                    }
                    Button(onClick = { goTo(index + 1) }, enabled = next != null, modifier = Modifier.weight(1f).height(56.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(if (next != null) "NÄCHSTER" else "ENDE", style = MaterialTheme.typography.labelSmall)
                            Text(next?.song?.title ?: "Set beendet", maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.SemiBold)
                        }
                        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, null)
                    }
                }
            }
        }
    }

    if (overviewOpen) {
        ModalBottomSheet(onDismissRequest = { overviewOpen = false }) {
            Column(Modifier.padding(horizontal = 16.dp)) {
                Text(setlist.data?.setlist?.name ?: "Setlist", style = MaterialTheme.typography.titleLarge)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${items.size} Songs · ${formatTotal(totalSeconds)}" + if (offlineReady > 0) " · offline gespeichert" else "",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { setStartedAt = if (setStartedAt == null) System.currentTimeMillis() else null }) {
                        Text(if (setStartedAt == null) "Set-Uhr starten" else "Set-Uhr zurücksetzen")
                    }
                }
            }
            LazyColumn(Modifier.height(320.dp)) {
                itemsIndexed(items, key = { _, item -> item.id }) { position, item ->
                    ListItem(
                        headlineContent = { Text(item.song.title, color = if (position < index) MaterialTheme.colorScheme.onSurfaceVariant else Color.Unspecified) },
                        supportingContent = {
                            Text(listOfNotNull(item.key, bpmFor(item).takeIf { it > 0 }?.toString(), item.durationSeconds.takeIf { it > 0 }?.let { formatDuration(it) }, item.transitionNotes?.let { "→ $it" }).joinToString(" · "))
                        },
                        leadingContent = {
                            if (position < index) Icon(Icons.Outlined.Check, null, tint = Success) else Text("${position + 1}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        },
                        modifier = Modifier.clickable {
                            goTo(position)
                            overviewOpen = false
                        }.then(if (position == index) Modifier.background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)) else Modifier),
                    )
                }
            }
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Ansage an alle", style = MaterialTheme.typography.titleMedium)
                Text("Erscheint auf den Handys im selben WLAN bzw. über den Server.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = announcement, onValueChange = { announcement = it.take(140) }, placeholder = { Text("z. B. Zugabe: Song 12") }, singleLine = true, modifier = Modifier.weight(1f))
                    Button(enabled = announcement.isNotBlank(), onClick = {
                        link.announce(announcement.trim(), index, current?.song?.id)
                        announcement = ""
                    }) { Text("Senden") }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    if (settingsOpen) {
        ModalBottomSheet(onDismissRequest = { settingsOpen = false }) {
            Column(Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Live-Einstellungen", style = MaterialTheme.typography.titleLarge)
                val transpose = current?.let { transposeBySong[it.song.id] } ?: 0
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Transponieren", Modifier.weight(1f))
                    IconButton(onClick = { current?.let { transposeBySong[it.song.id] = transpose - 1 } }) { Icon(Icons.Outlined.Remove, "Tiefer") }
                    Text(if (transpose == 0) "0" else "${if (transpose > 0) "+" else ""}$transpose")
                    IconButton(onClick = { current?.let { transposeBySong[it.song.id] = transpose + 1 } }) { Icon(Icons.Outlined.Add, "Höher") }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Schriftgröße $fontSize", Modifier.weight(1f))
                    IconButton(onClick = { fontSize = (fontSize - 2).coerceAtLeast(14); prefs.set("fontSize", fontSize) }) { Icon(Icons.Outlined.Remove, "Kleiner") }
                    IconButton(onClick = { fontSize = (fontSize + 2).coerceAtMost(48); prefs.set("fontSize", fontSize) }) { Icon(Icons.Outlined.Add, "Größer") }
                }
                SettingSwitch("Akkorde anzeigen", showChords) { showChords = it }

                Text("Click", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                SettingSwitch("Einzähler (1 Takt)", countIn) { countIn = it; prefs.set("countIn", it) }
                SettingSwitch("Bei Songwechsel im neuen Tempo starten", autoStart) { autoStart = it; prefs.set("autoStart", it) }
                SettingSwitch("Klick nur über Kopfhörer (nie aus dem Handy-Lautsprecher)", headphonesOnly) {
                    headphonesOnly = it
                    prefs.set("headphonesOnly", it)
                    metronome.update(sound = effectiveSound())
                }
                SettingSwitch("Vibration im Takt", vibrate) { vibrate = it; prefs.set("vibrate", it) }
                if (vibrate) {
                    Text("Vibrationsstärke", style = MaterialTheme.typography.bodySmall)
                    Slider(value = intensity.toFloat(), onValueChange = { intensity = it.toInt() }, onValueChangeFinished = { prefs.set("intensity", intensity) }, valueRange = 40f..255f)
                }
                SettingSwitch("Beat-Blitz am Bildschirmrand", flashEnabled) { flashEnabled = it; prefs.set("flash", it) }
                SettingSwitch("Lautstärketasten blättern (Seitenwender)", volumeKeys) { volumeKeys = it; prefs.set("volumeKeys", it) }

                Text("Bühnen-Funk", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                Text(
                    "Ohne WLAN, Internet oder Koppeln: Wer Start drückt, gibt den Takt vor – alle anderen Handys im Live-Modus laufen automatisch per Bluetooth mit. Sind die Handys im selben WLAN, wird es noch genauer.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SettingSwitch("Automatisch mitlaufen", autoFollow) {
                    autoFollow = it
                    prefs.set("autoFollow", it)
                    if (it) ignoredKey = null
                }
                SettingSwitch("Songwechsel mitmachen (gleiche Setlist)", followSongs) { followSongs = it; prefs.set("followSongs", it) }
                Text(
                    "Latenz-Ausgleich: ${outputDelay} ms" + (measuredLatency?.let { " · gemessene Audio-Latenz $it ms (wird automatisch ausgeglichen)" } ?: ""),
                    style = MaterialTheme.typography.bodySmall,
                )
                Text("Nur nötig für Bluetooth-Kopfhörer oder Funk-In-Ears mit zusätzlicher Verzögerung.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Slider(value = outputDelay.toFloat(), onValueChange = { outputDelay = it.toInt() }, onValueChangeFinished = { prefs.set("outputDelay", outputDelay) }, valueRange = 0f..300f)

                Text("Bandival Pulse (in Entwicklung)", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                Text("Ein kleines Gerät am Handgelenk oder Drum-Hocker, das im Takt vibriert. Es hört den Bühnen-Funk automatisch mit – oder wird hier direkt verbunden.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.Bluetooth, null, tint = if (pulseState.status == PulseBle.Status.Connected) Success else MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        when (pulseState.status) {
                            PulseBle.Status.Idle -> "Nicht verbunden"
                            PulseBle.Status.Scanning -> "Suche …"
                            PulseBle.Status.Connecting -> "Verbinde …"
                            PulseBle.Status.Connected -> "${pulseState.name ?: "Pulse"} verbunden${pulseState.battery?.let { " · Akku $it %" } ?: ""}"
                            PulseBle.Status.NotFound, PulseBle.Status.Error -> pulseState.error ?: "Fehler"
                        },
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (pulseState.status == PulseBle.Status.Connected) {
                        TextButton(onClick = { pulse.disconnect() }) { Text("Trennen") }
                    } else {
                        TextButton(enabled = pulse.supported && pulseState.status != PulseBle.Status.Scanning, onClick = {
                            blePermissions.launch(stagePermissions())
                        }) { Text("Verbinden") }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun SettingSwitch(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!value) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked = value, onCheckedChange = onChange)
    }
}
