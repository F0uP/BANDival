package app.bandival.android.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

/** Prisma decimals arrive as strings ("120.00"), numbers or null. */
fun JsonElement?.asBpm(): Int? = (this as? JsonPrimitive)?.content?.toDoubleOrNull()?.takeIf { it > 0 }?.roundToInt()

@Serializable data class MeResponse(val user: Me)

@Serializable data class Me(
    val userId: String,
    val email: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val emailVerified: Boolean = true,
    val twoFactorEnabled: Boolean = false,
    val ntfyTopicUrl: String? = null,
    val defaultBandId: String? = null,
    val bands: List<BandSummary> = emptyList(),
)

@Serializable data class BandSummary(
    val id: String,
    val name: String,
    val timezone: String = "Europe/Berlin",
    val role: String = "member",
    val instrument: String? = null,
) {
    val isGuest: Boolean get() = role == "guest"
}

@Serializable data class LoginResponse(val twoFactorRequired: Boolean = false, val challenge: String? = null)
@Serializable data class InstanceConfig(val registrationMode: String = "open", val mailConfigured: Boolean = false)

@Serializable data class IdName(val id: String, val name: String)
@Serializable data class IdTitle(val id: String, val title: String)
@Serializable data class AudioRef(val id: String, val fileUrl: String, val fileName: String)

@Serializable data class SongsResponse(val songs: List<SongListItem> = emptyList())

@Serializable data class SongListItem(
    val id: String,
    val title: String,
    val workflowStatus: String = "draft",
    val keySignature: String? = null,
    val tempoBpm: JsonElement? = null,
    val durationSeconds: Int? = null,
    val timeSignature: String? = null,
    val album: IdTitle? = null,
    val audioVersions: List<AudioRef> = emptyList(),
    val updatedAt: String? = null,
)

@Serializable data class SongResponse(val song: SongDetail)

@Serializable data class SongDetail(
    val id: String,
    val title: String,
    val workflowStatus: String = "draft",
    val keySignature: String? = null,
    val tempoBpm: JsonElement? = null,
    val durationSeconds: Int? = null,
    val timeSignature: String? = null,
    val notes: String? = null,
    val chordProText: String? = null,
    val spotifyUrl: String? = null,
    val audioVersions: List<AudioVersion> = emptyList(),
    val attachments: List<Attachment> = emptyList(),
    val lyricsRevisions: List<LyricsRevision> = emptyList(),
    val setlistItems: List<SetlistRef> = emptyList(),
)

@Serializable data class AudioVersion(
    val id: String,
    val versionNumber: Int = 1,
    val fileUrl: String,
    val fileName: String,
    val mimeType: String? = null,
    val durationSeconds: Int? = null,
    val uploadedAt: String? = null,
    val isCurrent: Boolean = false,
)

@Serializable data class Attachment(val id: String, val fileName: String, val fileUrl: String, val kind: String = "other", val mimeType: String? = null)
@Serializable data class LyricsRevision(val id: String, val lyricsMarkdown: String = "")
@Serializable data class SetlistRef(val setlist: IdName)

@Serializable data class SongPartsResponse(val parts: List<SongPart> = emptyList())
@Serializable data class SongPart(val id: String, val instrument: String, val kind: String = "chordpro", val content: String = "")

@Serializable data class SetlistsResponse(val setlists: List<Setlist> = emptyList())
@Serializable data class SetlistResponse(val setlist: Setlist)

@Serializable data class Setlist(
    val id: String,
    val name: String,
    val description: String? = null,
    val totalSeconds: Int = 0,
    val items: List<SetlistItem> = emptyList(),
    val events: List<EventRef> = emptyList(),
    val updatedAt: String? = null,
)

@Serializable data class SetlistItem(
    val id: String,
    val position: Int = 0,
    val transitionNotes: String? = null,
    val customKeySignature: String? = null,
    val customDurationSeconds: Int? = null,
    val song: SetlistSong,
) {
    val durationSeconds: Int get() = customDurationSeconds ?: song.durationSeconds ?: 0
    val key: String? get() = customKeySignature ?: song.keySignature
}

@Serializable data class SetlistSong(
    val id: String,
    val title: String,
    val keySignature: String? = null,
    val tempoBpm: JsonElement? = null,
    val durationSeconds: Int? = null,
    val timeSignature: String? = null,
)

@Serializable data class EventRef(val id: String, val title: String, val startsAt: String, val kind: String = "other", val venueLabel: String? = null)

@Serializable data class RehearsalNotesResponse(val notes: List<RehearsalNote> = emptyList())
@Serializable data class RehearsalNote(val songId: String, val note: String)

@Serializable data class EventsResponse(val events: List<BandEvent> = emptyList())

@Serializable data class BandEvent(
    val id: String,
    val bandId: String,
    val title: String,
    val kind: String = "other",
    val startsAt: String,
    val endsAt: String? = null,
    val venueLabel: String? = null,
    val notes: String? = null,
    val status: String = "planned",
    val setlistId: String? = null,
    val setlist: IdName? = null,
    val availability: EventAvailability = EventAvailability(),
)

@Serializable data class EventAvailability(val mine: ResolvedAvailability = ResolvedAvailability(), val summary: AvailabilitySummary = AvailabilitySummary())
@Serializable data class ResolvedAvailability(val status: String? = null, val source: String? = null)
@Serializable data class AvailabilitySummary(val available: Int = 0, val maybe: Int = 0, val unavailable: Int = 0, val unknown: Int = 0, val total: Int = 0)

@Serializable data class NotificationsResponse(val notifications: List<AppNotification> = emptyList(), val unreadCount: Int = 0)

@Serializable data class AppNotification(
    val id: String,
    val type: String = "",
    val title: String,
    val body: String = "",
    val payload: JsonObject? = null,
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable data class IdeasResponse(val ideas: List<Idea> = emptyList())

@Serializable data class Idea(
    val id: String,
    val title: String,
    val notes: String? = null,
    val fileUrl: String? = null,
    val durationSeconds: Int? = null,
    val songId: String? = null,
    val createdAt: String,
    val createdBy: Person? = null,
    val song: IdTitle? = null,
)

@Serializable data class Person(val id: String, val displayName: String = "", val avatarUrl: String? = null)

@Serializable data class MembersResponse(val members: List<Member> = emptyList())
@Serializable data class Member(val id: String, val userId: String, val role: String = "member", val instrumentPrimary: String? = null, val user: Person)

@Serializable data class ConvertResponse(val songId: String)

/* ---------- Live sync ---------- */

@Serializable data class LiveMetronomeState(
    val running: Boolean,
    val bpm: Double,
    val beatsPerBar: Int = 4,
    val beatUnit: Int = 4,
    val countInBars: Int = 0,
    val gridStartEpochMs: Double = 0.0,
)

@Serializable data class LiveState(
    val index: Int = 0,
    val songId: String? = null,
    val leaderId: String = "",
    val leaderName: String = "",
    val metronome: LiveMetronomeState? = null,
    val message: String? = null,
    val updatedAt: Long = 0,
)

@Serializable data class LiveHello(val serverTime: Long, val state: LiveState? = null)
@Serializable data class LivePing(val serverTime: Long)
@Serializable data class LivePresence(val userId: String, val displayName: String)
