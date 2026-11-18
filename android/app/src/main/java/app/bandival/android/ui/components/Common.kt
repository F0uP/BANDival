package app.bandival.android.ui.components

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.bandival.android.data.Resource
import app.bandival.android.ui.theme.Danger
import app.bandival.android.ui.theme.Success
import app.bandival.android.ui.theme.Warning
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun SectionCard(modifier: Modifier = Modifier, padding: PaddingValues = PaddingValues(16.dp), content: @Composable () -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Box(Modifier.padding(padding)) { content() }
    }
}

@Composable
fun Pill(text: String, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.surfaceVariant, contentColor: Color = MaterialTheme.colorScheme.onSurface) {
    Surface(color = color, contentColor = contentColor, shape = RoundedCornerShape(8.dp), modifier = modifier) {
        Text(text, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
    }
}

@Composable
fun StatusDot(color: Color, modifier: Modifier = Modifier) {
    Box(modifier.size(8.dp).clip(CircleShape).background(color))
}

@Composable
fun EmptyState(icon: ImageVector, title: String, description: String? = null, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = 48.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(Modifier.size(56.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        if (description != null) Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        if (action != null) {
            Spacer(Modifier.height(8.dp))
            action()
        }
    }
}

/** Renders a Resource: spinner on first load, offline banner when showing cached data, error otherwise. */
@Composable
fun <T> ResourceView(resource: Resource<T>, onRetry: () -> Unit, content: @Composable (T) -> Unit) {
    val data = resource.data
    Column(Modifier.fillMaxSize()) {
        if (resource.error != null && data != null) OfflineBanner(resource.error)
        when {
            data != null -> content(data)
            resource.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            else -> EmptyState(Icons.Outlined.CloudOff, "Konnte nicht laden", resource.error) {
                androidx.compose.material3.OutlinedButton(onClick = onRetry) { Text("Erneut versuchen") }
            }
        }
    }
}

@Composable
fun OfflineBanner(message: String) {
    Row(
        Modifier.fillMaxWidth().background(Warning.copy(alpha = 0.15f)).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Outlined.CloudOff, null, tint = Warning, modifier = Modifier.size(16.dp))
        Text("Offline – gespeicherter Stand. ($message)", style = MaterialTheme.typography.bodySmall)
    }
}

/* ---------- Formatting ---------- */

private val GERMAN = Locale.GERMANY
private val dayFormat = DateTimeFormatter.ofPattern("EEE, d. MMM", GERMAN)
private val timeFormat = DateTimeFormatter.ofPattern("HH:mm", GERMAN)
private val monthFormat = DateTimeFormatter.ofPattern("MMMM yyyy", GERMAN)

fun parseInstant(value: String) = runCatching { OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()) }.getOrNull()
fun formatDay(value: String): String = parseInstant(value)?.format(dayFormat) ?: value
fun formatTime(value: String): String = parseInstant(value)?.format(timeFormat) ?: ""
fun formatMonth(value: String): String = parseInstant(value)?.format(monthFormat)?.replaceFirstChar { it.uppercase() } ?: ""

fun formatDuration(seconds: Int?): String {
    if (seconds == null || seconds <= 0) return "–"
    return "%d:%02d".format(seconds / 60, seconds % 60)
}

fun formatTotal(seconds: Int): String {
    val hours = seconds / 3600
    val minutes = (seconds % 3600) / 60
    return if (hours > 0) "$hours h $minutes min" else "$minutes min"
}

val EVENT_KIND_LABEL = mapOf("rehearsal" to "Probe", "gig" to "Gig", "meeting" to "Meeting", "other" to "Termin")
val SONG_STATUS_LABEL = mapOf("draft" to "Entwurf", "review" to "In Arbeit", "approved" to "Bühnenreif", "archived" to "Archiv")

fun statusColor(status: String?): Color = when (status) {
    "available" -> Success
    "maybe" -> Warning
    "unavailable" -> Danger
    else -> Color.Gray
}

@Composable
fun Label(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(GERMAN), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}
