package app.bandival.android.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Forward10
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Replay10
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.TextDecrease
import androidx.compose.material.icons.outlined.TextIncrease
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.bandival.android.data.SongDetail
import app.bandival.android.data.SongPartsResponse
import app.bandival.android.data.SongResponse
import app.bandival.android.data.SongsResponse
import app.bandival.android.data.asBpm
import app.bandival.android.music.transposeRoot
import app.bandival.android.ui.AppScope
import app.bandival.android.ui.components.ChordSheetView
import app.bandival.android.ui.components.EmptyState
import app.bandival.android.ui.components.LyricsView
import app.bandival.android.ui.components.Pill
import app.bandival.android.ui.components.ResourceView
import app.bandival.android.ui.components.SONG_STATUS_LABEL
import app.bandival.android.ui.components.SectionCard
import app.bandival.android.ui.components.formatDay
import app.bandival.android.ui.components.formatDuration
import app.bandival.android.ui.rememberResource
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongsScreen(scope: AppScope) {
    val bandId by scope.repository.bandId.collectAsState()
    var refresh by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    val songs = rememberResource(scope.repository, bandId?.let { "/api/songs?bandId=$it" }, SongsResponse.serializer(), refresh)

    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Songs") }, actions = {
            androidx.compose.material3.TextButton(onClick = { scope.openWeb("/app/songs?new=1") }) { Text("Neu") }
        })
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Suchen") },
            leadingIcon = { Icon(Icons.Outlined.Search, null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        )
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = status == null, onClick = { status = null }, label = { Text("Alle") })
            SONG_STATUS_LABEL.forEach { (value, label) ->
                FilterChip(selected = status == value, onClick = { status = if (status == value) null else value }, label = { Text(label) })
            }
        }
        ResourceView(songs, onRetry = { refresh += 1 }) { data ->
            val filtered = data.songs.filter {
                (status == null || it.workflowStatus == status) &&
                    (query.isBlank() || it.title.contains(query, ignoreCase = true) || it.album?.title?.contains(query, ignoreCase = true) == true)
            }
            PullToRefreshBox(isRefreshing = songs.loading, onRefresh = { refresh += 1 }) {
                if (filtered.isEmpty()) {
                    EmptyState(Icons.Outlined.LibraryMusic, if (data.songs.isEmpty()) "Noch keine Songs" else "Nichts gefunden")
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
                        items(filtered, key = { it.id }) { song ->
                            Row(
                                Modifier.fillMaxWidth().clickable { scope.openSong(song.id) }.padding(horizontal = 16.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(song.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        listOfNotNull(song.keySignature, song.tempoBpm.asBpm()?.let { "$it BPM" }, song.durationSeconds?.let { formatDuration(it) }, song.album?.title).joinToString(" · "),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (song.audioVersions.isNotEmpty()) {
                                    val audio = song.audioVersions.first()
                                    IconButton(onClick = { scope.player.play(scope.repository.api.absolute(audio.fileUrl), song.title, audio.fileName) }) {
                                        Icon(Icons.Outlined.PlayArrow, "Abspielen")
                                    }
                                }
                                Pill(SONG_STATUS_LABEL[song.workflowStatus] ?: song.workflowStatus)
                            }
                            HorizontalDivider(Modifier.padding(start = 16.dp), color = MaterialTheme.colorScheme.outline)
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongDetailScreen(scope: AppScope, songId: String) {
    var refresh by remember { mutableIntStateOf(0) }
    val song = rememberResource(scope.repository, "/api/songs/$songId", SongResponse.serializer(), refresh)
    val parts = rememberResource(scope.repository, "/api/songs/$songId/parts", SongPartsResponse.serializer(), refresh)
    var tab by remember { mutableIntStateOf(0) }
    var transpose by remember { mutableIntStateOf(0) }
    var fontSize by remember { mutableIntStateOf(17) }
    val guest = scope.repository.currentBand?.isGuest == true

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(song.data?.song?.title ?: "Song", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = { scope.back() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück") } },
                actions = {
                    if (!guest) IconButton(onClick = { scope.openWeb("/app/songs/$songId") }) { Icon(Icons.Outlined.Edit, "Im Web bearbeiten") }
                },
            )
        },
        bottomBar = { MiniPlayer(scope) },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            ResourceView(song, onRetry = { refresh += 1 }) { data ->
                val detail = data.song
                val partList = parts.data?.parts.orEmpty()
                val tabs = listOf("Lead Sheet") + partList.map { it.instrument } + listOf("Aufnahmen", "Noten", "Infos")
                Column(Modifier.fillMaxSize()) {
                    SongMeta(detail, transpose)
                    PrimaryScrollableTabRow(selectedTabIndex = tab.coerceAtMost(tabs.lastIndex), edgePadding = 16.dp) {
                        tabs.forEachIndexed { index, label -> Tab(selected = tab == index, onClick = { tab = index }, text = { Text(label) }) }
                    }
                    val current = tabs.getOrNull(tab) ?: "Lead Sheet"
                    when {
                        tab == 0 || tab in 1..partList.size -> {
                            val part = partList.getOrNull(tab - 1)
                            SheetControls(transpose, { transpose = it }, fontSize, { fontSize = it })
                            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp)) {
                                val chords = part?.content ?: detail.chordProText.orEmpty()
                                val lyrics = detail.lyricsRevisions.firstOrNull()?.lyricsMarkdown.orEmpty()
                                when {
                                    part != null && part.kind == "tab" -> Text(part.content, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, fontSize = (fontSize - 3).coerceAtLeast(10).let { androidx.compose.ui.unit.TextUnit(it.toFloat(), androidx.compose.ui.unit.TextUnitType.Sp) }, softWrap = false, modifier = Modifier.horizontalScroll(rememberScrollState()))
                                    chords.isNotBlank() -> ChordSheetView(chords, transpose, fontSize)
                                    lyrics.isNotBlank() -> LyricsView(lyrics, fontSize)
                                    else -> EmptyState(Icons.Outlined.LibraryMusic, "Noch kein Lead Sheet", "Lead Sheets bearbeitest du im Web.")
                                }
                                Spacer(Modifier.height(80.dp))
                            }
                        }
                        current == "Aufnahmen" -> RecordingsTab(scope, detail)
                        current == "Noten" -> NotationTab(scope, detail)
                        else -> InfoTab(detail)
                    }
                }
            }
        }
    }
}

@Composable
private fun SongMeta(detail: SongDetail, transpose: Int) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Pill(SONG_STATUS_LABEL[detail.workflowStatus] ?: detail.workflowStatus)
        detail.keySignature?.let { Pill(transposeRoot(it, transpose) + if (transpose != 0) " (${if (transpose > 0) "+" else ""}$transpose)" else "") }
        detail.tempoBpm.asBpm()?.let { Pill("$it BPM") }
        detail.timeSignature?.let { Pill(it) }
        detail.durationSeconds?.let { Pill(formatDuration(it)) }
    }
}

@Composable
fun SheetControls(transpose: Int, onTranspose: (Int) -> Unit, fontSize: Int, onFontSize: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onTranspose(transpose - 1) }) { Icon(Icons.Outlined.Remove, "Halbton tiefer") }
        Text(if (transpose == 0) "Original" else "${if (transpose > 0) "+" else ""}$transpose", style = MaterialTheme.typography.labelLarge)
        IconButton(onClick = { onTranspose(transpose + 1) }) { Icon(Icons.Outlined.Add, "Halbton höher") }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = { onFontSize((fontSize - 2).coerceAtLeast(12)) }) { Icon(Icons.Outlined.TextDecrease, "Schrift kleiner") }
        IconButton(onClick = { onFontSize((fontSize + 2).coerceAtMost(40)) }) { Icon(Icons.Outlined.TextIncrease, "Schrift größer") }
    }
}

@Composable
private fun RecordingsTab(scope: AppScope, detail: SongDetail) {
    val now by scope.player.now.collectAsState()
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (detail.audioVersions.isEmpty()) item { EmptyState(Icons.Outlined.LibraryMusic, "Keine Aufnahmen", "Aufnahmen lädst du im Web oder über die Ideen-Inbox hoch.") }
        items(detail.audioVersions, key = { it.id }) { audio ->
            val url = scope.repository.api.absolute(audio.fileUrl)
            val active = now?.url == url
            SectionCard(padding = PaddingValues(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(44.dp).clickable { scope.player.play(url, detail.title, "V${audio.versionNumber} · ${audio.fileName}") }) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(if (active && now?.playing == true) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, null)
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Text(audio.fileName, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                        Text("Version ${audio.versionNumber}${audio.uploadedAt?.let { " · " + formatDay(it) } ?: ""}${audio.durationSeconds?.let { " · " + formatDuration(it) } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (audio.isCurrent) Pill("Aktuell", color = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer)
                }
            }
        }
        item {
            androidx.compose.material3.OutlinedButton(onClick = { scope.openWeb("/app/songs/${detail.id}?tab=files") }, modifier = Modifier.fillMaxWidth()) {
                Text("Übungsmixer, Stems & Feedback (Web)")
            }
        }
    }
}

@Composable
private fun NotationTab(scope: AppScope, detail: SongDetail) {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Noten mit Tabulatur, Akkordsymbolen und Wiedergabe öffnest du im eingebetteten Noteneditor.", style = MaterialTheme.typography.bodyMedium)
        androidx.compose.material3.Button(onClick = { scope.openWeb("/app/songs/${detail.id}?tab=scores") }, modifier = Modifier.fillMaxWidth()) { Text("Noten öffnen") }
        val pdfs = detail.attachments.filter { it.kind == "score_pdf" || it.mimeType == "application/pdf" || it.kind == "lead_sheet" }
        pdfs.forEach { file ->
            androidx.compose.material3.OutlinedButton(onClick = { scope.openWeb(file.fileUrl) }, modifier = Modifier.fillMaxWidth()) { Text(file.fileName, maxLines = 1) }
        }
    }
}

@Composable
private fun InfoTab(detail: SongDetail) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!detail.notes.isNullOrBlank()) SectionCard { Text(detail.notes) }
        if (detail.setlistItems.isNotEmpty()) {
            Text("In Setlists", style = MaterialTheme.typography.titleSmall)
            detail.setlistItems.forEach { Text("• ${it.setlist.name}") }
        }
    }
}

/** Compact player above the bottom navigation (background playback via Media3). */
@Composable
fun MiniPlayer(scope: AppScope) {
    val now by scope.player.now.collectAsState()
    LaunchedEffect(now?.playing) {
        while (now?.playing == true) {
            scope.player.publish()
            delay(500)
        }
    }
    val playing = now ?: return
    Surface(color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 2.dp) {
        Column {
            LinearProgressIndicator(
                progress = { if (playing.durationMs > 0) playing.positionMs.toFloat() / playing.durationMs else 0f },
                modifier = Modifier.fillMaxWidth().height(2.dp),
            )
            Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).padding(start = 8.dp)) {
                    Text(playing.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                    Text("${formatDuration((playing.positionMs / 1000).toInt())} / ${formatDuration((playing.durationMs / 1000).toInt())}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { scope.player.seekBy(-10_000) }) { Icon(Icons.Outlined.Replay10, "10 s zurück") }
                Box(Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary).clickable { scope.player.toggle() }, contentAlignment = Alignment.Center) {
                    Icon(if (playing.playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow, "Wiedergabe", tint = MaterialTheme.colorScheme.onPrimary)
                }
                IconButton(onClick = { scope.player.seekBy(10_000) }) { Icon(Icons.Outlined.Forward10, "10 s vor") }
                androidx.compose.material3.TextButton(onClick = {
                    val next = when (playing.speed) { 1f -> 0.75f; 0.75f -> 0.5f; else -> 1f }
                    scope.player.setSpeed(next)
                    scope.player.publish()
                }) { Text("${(playing.speed * 100).toInt()} %") }
                IconButton(onClick = { scope.player.stop() }) { Icon(Icons.Outlined.Close, "Schließen") }
                Spacer(Modifier.width(4.dp))
            }
        }
    }
}
