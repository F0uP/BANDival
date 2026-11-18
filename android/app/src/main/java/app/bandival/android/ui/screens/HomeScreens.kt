package app.bandival.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material.icons.outlined.QueueMusic
import androidx.compose.material.icons.outlined.RemoveCircleOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.bandival.android.data.BandEvent
import app.bandival.android.data.EventsResponse
import app.bandival.android.data.Me
import app.bandival.android.data.NotificationsResponse
import app.bandival.android.data.SetlistsResponse
import app.bandival.android.data.SongsResponse
import app.bandival.android.ui.AppScope
import app.bandival.android.ui.Tab
import app.bandival.android.ui.components.EVENT_KIND_LABEL
import app.bandival.android.ui.components.EmptyState
import app.bandival.android.ui.components.Label
import app.bandival.android.ui.components.Pill
import app.bandival.android.ui.components.ResourceView
import app.bandival.android.ui.components.SONG_STATUS_LABEL
import app.bandival.android.ui.components.SectionCard
import app.bandival.android.ui.components.StatusDot
import app.bandival.android.ui.components.formatDay
import app.bandival.android.ui.components.formatMonth
import app.bandival.android.ui.components.formatTime
import app.bandival.android.ui.components.statusColor
import app.bandival.android.ui.rememberResource
import app.bandival.android.ui.theme.Danger
import app.bandival.android.ui.theme.Success
import app.bandival.android.ui.theme.Warning
import kotlinx.coroutines.launch
import java.time.LocalTime

private fun greeting(): String = when (LocalTime.now().hour) {
    in 0..4 -> "Gute Nacht"
    in 5..10 -> "Guten Morgen"
    in 11..16 -> "Hallo"
    else -> "Guten Abend"
}

@Composable
fun RsvpRow(event: BandEvent, onChange: (String?) -> Unit) {
    val mine = event.availability.mine.status
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        listOf(
            Triple("available", "Dabei", Success),
            Triple("maybe", "Vielleicht", Warning),
            Triple("unavailable", "Kann nicht", Danger),
        ).forEach { (value, label, color) ->
            FilterChip(
                selected = mine == value,
                onClick = { onChange(if (mine == value) null else value) },
                label = { Text(label) },
                leadingIcon = {
                    Icon(
                        when (value) {
                            "available" -> Icons.Outlined.CheckCircle
                            "maybe" -> Icons.Outlined.HelpOutline
                            else -> Icons.Outlined.RemoveCircleOutline
                        },
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                },
                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = color.copy(alpha = 0.18f), selectedLabelColor = color, selectedLeadingIconColor = color),
            )
        }
    }
}

@Composable
fun EventCard(event: BandEvent, scope: AppScope, onRsvp: (String?) -> Unit) {
    SectionCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(EVENT_KIND_LABEL[event.kind] ?: "Termin")
                if (event.status == "cancelled") Pill("Abgesagt", color = Danger.copy(alpha = 0.15f), contentColor = Danger)
                if (event.status == "confirmed") Pill("Bestätigt", color = Success.copy(alpha = 0.15f), contentColor = Success)
                Spacer(Modifier.weight(1f))
                Text("${formatDay(event.startsAt)} · ${formatTime(event.startsAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(event.title, style = MaterialTheme.typography.titleMedium)
            if (event.venueLabel != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.Outlined.Place, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(event.venueLabel, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (event.setlist != null) {
                Row(
                    Modifier.clickable { scope.openSetlist(event.setlist.id) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(Icons.Outlined.QueueMusic, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                    Text(event.setlist.name, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
                }
            }
            val summary = event.availability.summary
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusDot(Success); Text("${summary.available}", style = MaterialTheme.typography.bodySmall)
                StatusDot(Warning); Text("${summary.maybe}", style = MaterialTheme.typography.bodySmall)
                StatusDot(Danger); Text("${summary.unavailable}", style = MaterialTheme.typography.bodySmall)
                StatusDot(Color.Gray); Text("${summary.unknown} offen", style = MaterialTheme.typography.bodySmall)
            }
            if (event.status != "cancelled") RsvpRow(event, onRsvp)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(scope: AppScope, me: Me?, openTab: (Tab) -> Unit) {
    val repository = scope.repository
    val bandId by repository.bandId.let { flow -> androidx.compose.runtime.produceState(flow.value) { flow.collect { value = it } } }
    var refresh by remember { mutableIntStateOf(0) }
    val events = rememberResource(repository, bandId?.let { "/api/events?bandId=$it&upcoming=1&limit=6" }, EventsResponse.serializer(), refresh)
    val songs = rememberResource(repository, bandId?.let { "/api/songs?bandId=$it" }, SongsResponse.serializer(), refresh)
    val setlists = rememberResource(repository, bandId?.let { "/api/setlists?bandId=$it" }, SetlistsResponse.serializer(), refresh)
    val coroutines = rememberCoroutineScope()

    PullToRefreshBox(isRefreshing = events.loading && events.data != null, onRefresh = { refresh += 1 }) {
        LazyColumn(Modifier.fillMaxSize().statusBarsPadding(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Column {
                    Text(repository.currentBand?.name ?: "", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${greeting()}, ${me?.displayName?.substringBefore(' ') ?: ""}", style = MaterialTheme.typography.headlineMedium)
                    val pending = events.data?.events?.count { it.status != "cancelled" && it.availability.mine.status == null } ?: 0
                    if (pending > 0) Text("Bei $pending ${if (pending == 1) "Termin" else "Terminen"} fehlt noch deine Zusage.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item { Label("Nächste Termine", Modifier.padding(top = 8.dp)) }
            val list = events.data?.events.orEmpty()
            if (list.isEmpty() && !events.loading) {
                item { EmptyState(Icons.Outlined.CalendarMonth, "Keine anstehenden Termine") }
            }
            items(list, key = { it.id }) { event ->
                EventCard(event, scope) { status ->
                    coroutines.launch {
                        runCatching { repository.rsvp(event.id, status) }
                        refresh += 1
                    }
                }
            }
            val inProgress = songs.data?.songs.orEmpty().filter { it.workflowStatus == "draft" || it.workflowStatus == "review" }.take(5)
            if (inProgress.isNotEmpty()) {
                item { Label("Songs in Arbeit", Modifier.padding(top = 8.dp)) }
                items(inProgress, key = { "song-" + it.id }) { song ->
                    SectionCard(Modifier.clickable { scope.openSong(song.id) }, padding = PaddingValues(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(song.title, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Pill(SONG_STATUS_LABEL[song.workflowStatus] ?: song.workflowStatus)
                        }
                    }
                }
            }
            val recent = setlists.data?.setlists.orEmpty().take(3)
            if (recent.isNotEmpty()) {
                item { Label("Setlists", Modifier.padding(top = 8.dp)) }
                items(recent, key = { "setlist-" + it.id }) { setlist ->
                    SectionCard(Modifier.clickable { scope.openSetlist(setlist.id) }, padding = PaddingValues(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(setlist.name, style = MaterialTheme.typography.titleMedium)
                                Text("${setlist.items.size} Songs", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            androidx.compose.material3.FilledTonalButton(onClick = { scope.openLive(setlist.id) }) { Text("Live") }
                        }
                    }
                }
                item {
                    androidx.compose.material3.TextButton(onClick = { openTab(Tab.Setlists) }) { Text("Alle Setlists") }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarScreen(scope: AppScope) {
    val repository = scope.repository
    val bandId by repository.bandId.let { flow -> androidx.compose.runtime.produceState(flow.value) { flow.collect { value = it } } }
    var refresh by remember { mutableIntStateOf(0) }
    val events = rememberResource(repository, bandId?.let { "/api/events?bandId=$it&upcoming=1&limit=60" }, EventsResponse.serializer(), refresh)
    val coroutines = rememberCoroutineScope()

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Kalender") },
            actions = {
                androidx.compose.material3.TextButton(onClick = { scope.openWeb("/app/calendar") }) { Text("Terminfinder") }
            },
        )
        ResourceView(events, onRetry = { refresh += 1 }) { data ->
            PullToRefreshBox(isRefreshing = events.loading, onRefresh = { refresh += 1 }) {
                if (data.events.isEmpty()) {
                    EmptyState(Icons.Outlined.CalendarMonth, "Keine anstehenden Termine", "Neue Termine legst du im Web-Kalender an.")
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        var lastMonth = ""
                        data.events.forEach { event ->
                            val month = formatMonth(event.startsAt)
                            if (month != lastMonth) {
                                lastMonth = month
                                item(key = "m-$month") { Label(month, Modifier.padding(top = 8.dp)) }
                            }
                            item(key = event.id) {
                                EventCard(event, scope) { status ->
                                    coroutines.launch {
                                        runCatching { repository.rsvp(event.id, status) }
                                        refresh += 1
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(scope: AppScope) {
    var refresh by remember { mutableIntStateOf(0) }
    val notifications = rememberResource(scope.repository, "/api/notifications?limit=60", NotificationsResponse.serializer(), refresh)
    val coroutines = rememberCoroutineScope()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Benachrichtigungen") },
                navigationIcon = { IconButton(onClick = { scope.back() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück") } },
                actions = {
                    IconButton(onClick = {
                        coroutines.launch {
                            runCatching { scope.repository.markAllNotificationsRead() }
                            refresh += 1
                        }
                    }) { Icon(Icons.Outlined.DoneAll, "Alle gelesen") }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            ResourceView(notifications, onRetry = { refresh += 1 }) { data ->
                if (data.notifications.isEmpty()) {
                    EmptyState(Icons.Outlined.Notifications, "Alles erledigt", "Keine Benachrichtigungen.")
                } else {
                    LazyColumn(contentPadding = PaddingValues(vertical = 8.dp)) {
                        items(data.notifications, key = { it.id }) { notification ->
                            val path = notification.payload?.let { payload ->
                                (payload["url"] as? kotlinx.serialization.json.JsonPrimitive)?.content
                                    ?: (payload["songId"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { "/app/songs/$it" }
                                    ?: (payload["setlistId"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.let { "/app/setlists/$it" }
                            }
                            Row(
                                Modifier.fillMaxWidth().clickable(enabled = path != null) { path?.let(scope::openPath) }.padding(horizontal = 16.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                StatusDot(if (notification.readAt == null) MaterialTheme.colorScheme.primary else Color.Transparent, Modifier.padding(top = 6.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(notification.title, fontWeight = if (notification.readAt == null) FontWeight.SemiBold else FontWeight.Normal)
                                    if (notification.body.isNotBlank()) Text(notification.body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("${formatDay(notification.createdAt)} · ${formatTime(notification.createdAt)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Spacer(Modifier.width(4.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
