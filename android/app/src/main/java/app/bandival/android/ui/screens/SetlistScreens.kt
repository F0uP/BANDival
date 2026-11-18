package app.bandival.android.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material.icons.outlined.QueueMusic
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.bandival.android.data.SetlistResponse
import app.bandival.android.data.SetlistsResponse
import app.bandival.android.data.asBpm
import app.bandival.android.ui.AppScope
import app.bandival.android.ui.components.EmptyState
import app.bandival.android.ui.components.ResourceView
import app.bandival.android.ui.components.SectionCard
import app.bandival.android.ui.components.formatDay
import app.bandival.android.ui.components.formatDuration
import app.bandival.android.ui.components.formatTotal
import app.bandival.android.ui.rememberResource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetlistsScreen(scope: AppScope) {
    val bandId by scope.repository.bandId.collectAsState()
    var refresh by remember { mutableIntStateOf(0) }
    val setlists = rememberResource(scope.repository, bandId?.let { "/api/setlists?bandId=$it" }, SetlistsResponse.serializer(), refresh)
    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Setlists") })
        ResourceView(setlists, onRetry = { refresh += 1 }) { data ->
            PullToRefreshBox(isRefreshing = setlists.loading, onRefresh = { refresh += 1 }) {
                if (data.setlists.isEmpty()) {
                    EmptyState(Icons.Outlined.QueueMusic, "Noch keine Setlists", "Setlists stellst du im Web zusammen.")
                } else {
                    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(data.setlists, key = { it.id }) { setlist ->
                            SectionCard(Modifier.clickable { scope.openSetlist(setlist.id) }, padding = PaddingValues(14.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(setlist.name, style = MaterialTheme.typography.titleMedium)
                                        Text(
                                            "${setlist.items.size} Songs · ${formatTotal(setlist.totalSeconds)}" +
                                                (setlist.events.firstOrNull()?.let { " · ${formatDay(it.startsAt)}" } ?: ""),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                    FilledTonalButton(onClick = { scope.openLive(setlist.id) }) { Text("Live") }
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
fun SetlistDetailScreen(scope: AppScope, setlistId: String) {
    var refresh by remember { mutableIntStateOf(0) }
    val setlist = rememberResource(scope.repository, "/api/setlists/$setlistId", SetlistResponse.serializer(), refresh)
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(setlist.data?.setlist?.name ?: "Setlist", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = { scope.back() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück") } },
                actions = {
                    IconButton(onClick = { scope.openWeb("/api/setlists/$setlistId/pdf") }) { Icon(Icons.Outlined.PictureAsPdf, "PDF") }
                },
            )
        },
        bottomBar = {
            Button(onClick = { scope.openLive(setlistId) }, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Icon(Icons.Outlined.PlayCircle, null)
                Text("  Live-Modus starten")
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            ResourceView(setlist, onRetry = { refresh += 1 }) { data ->
                val detail = data.setlist
                LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                    item {
                        Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                            Text("${detail.items.size} Songs · ${formatTotal(detail.totalSeconds)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            detail.events.forEach { Text("${it.title} · ${formatDay(it.startsAt)}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium) }
                            if (!detail.description.isNullOrBlank()) Text(detail.description, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                    itemsIndexed(detail.items, key = { _, item -> item.id }) { index, item ->
                        Row(
                            Modifier.fillMaxWidth().clickable { scope.openSong(item.song.id) }.padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("${index + 1}", Modifier.width(28.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Column(Modifier.weight(1f)) {
                                Text(item.song.title, style = MaterialTheme.typography.titleMedium)
                                Text(listOfNotNull(item.key, item.song.tempoBpm.asBpm()?.let { "$it BPM" }, formatDuration(item.durationSeconds)).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (!item.transitionNotes.isNullOrBlank()) Text("→ ${item.transitionNotes}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                        HorizontalDivider(Modifier.padding(start = 44.dp), color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
        }
    }
}
