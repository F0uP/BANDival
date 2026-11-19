package app.bandival.android.ui

import android.Manifest
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LibraryMusic
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.automirrored.outlined.QueueMusic
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.bandival.android.BandivalApp
import app.bandival.android.MainActivity
import app.bandival.android.audio.PlayerConnection
import app.bandival.android.data.Repository
import app.bandival.android.ui.screens.CalendarScreen
import app.bandival.android.ui.screens.HomeScreen
import app.bandival.android.ui.screens.IdeasScreen
import app.bandival.android.ui.screens.LiveScreen
import app.bandival.android.ui.screens.LoginScreen
import app.bandival.android.ui.screens.MiniPlayer
import app.bandival.android.ui.screens.MoreScreen
import app.bandival.android.ui.screens.NotificationsScreen
import app.bandival.android.ui.screens.SetlistDetailScreen
import app.bandival.android.ui.screens.SetlistsScreen
import app.bandival.android.ui.screens.SetupScreen
import app.bandival.android.ui.screens.SongDetailScreen
import app.bandival.android.ui.screens.SongsScreen
import app.bandival.android.ui.screens.WebScreen
import kotlinx.coroutines.launch

enum class Tab(val label: String, val icon: ImageVector) {
    Home("Übersicht", Icons.Outlined.Home),
    Songs("Songs", Icons.Outlined.LibraryMusic),
    Setlists("Setlists", Icons.AutoMirrored.Outlined.QueueMusic),
    Calendar("Kalender", Icons.Outlined.CalendarMonth),
    More("Mehr", Icons.Outlined.Menu),
}

/** Everything screens need – passed explicitly instead of a DI framework. */
class AppScope(val repository: Repository, val player: PlayerConnection, val nav: NavHostController, val app: BandivalApp) {
    fun openSong(id: String) = nav.navigate("song/$id")
    fun openSetlist(id: String) = nav.navigate("setlist/$id")
    fun openLive(setlistId: String) = nav.navigate("live/$setlistId")
    fun openWeb(path: String) = nav.navigate("web?path=${Uri.encode(path)}")
    fun back() = nav.popBackStack()

    /** Maps web paths (notifications, links) to native screens where possible. */
    fun openPath(path: String) {
        val song = Regex("^/app/songs/([0-9a-f-]{36})$").find(path.substringBefore('?'))
        val setlist = Regex("^/app/setlists/([0-9a-f-]{36})$").find(path.substringBefore('?'))
        when {
            song != null -> openSong(song.groupValues[1])
            setlist != null -> openSetlist(setlist.groupValues[1])
            path == "/app" || path.isBlank() -> Unit
            path.startsWith("/app/calendar") -> Unit
            else -> openWeb(path)
        }
    }
}

@Composable
fun AppRoot(activity: MainActivity) {
    val context = LocalContext.current
    val app = remember { BandivalApp.from(context) }
    val repository = app.repository
    val nav = rememberNavController()
    val player = remember { PlayerConnection(context) }
    val scope = remember { AppScope(repository, player, nav, app) }
    val coroutines = rememberCoroutineScope()
    var start by remember { mutableStateOf<String?>(null) }

    DisposableEffect(Unit) { onDispose { player.release() } }

    LaunchedEffect(Unit) {
        start = when {
            app.serverUrl == null -> "setup"
            else -> runCatching { repository.refreshMe() }.fold(
                onSuccess = { me -> if (me != null) "main" else "login" },
                // Offline with a previous session: open the app with cached data.
                onFailure = { "main" },
            )
        }
    }

    LaunchedEffect(Unit) {
        repository.api.sessionEvents.collect {
            nav.navigate("login") { popUpTo(0) }
        }
    }

    val target by activity.pendingTarget.collectAsState()
    LaunchedEffect(target, start) {
        val path = target ?: return@LaunchedEffect
        if (start == "main") {
            scope.openPath(path)
            activity.pendingTarget.value = null
        }
    }

    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    val startDestination = start
    if (startDestination == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    NavHost(navController = nav, startDestination = startDestination) {
        composable("setup") {
            SetupScreen(app) { nav.navigate("login") { popUpTo(0) } }
        }
        composable("login") {
            LoginScreen(app, onLoggedIn = {
                coroutines.launch {
                    runCatching { repository.refreshMe() }
                    nav.navigate("main") { popUpTo(0) }
                }
            }, onChangeServer = { nav.navigate("setup") })
        }
        composable("main") {
            LaunchedEffect(Unit) {
                if (Build.VERSION.SDK_INT >= 33) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            MainTabs(scope)
        }
        composable("song/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            SongDetailScreen(scope, entry.arguments?.getString("id").orEmpty())
        }
        composable("setlist/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            SetlistDetailScreen(scope, entry.arguments?.getString("id").orEmpty())
        }
        composable("live/{id}", arguments = listOf(navArgument("id") { type = NavType.StringType })) { entry ->
            LiveScreen(scope, entry.arguments?.getString("id").orEmpty())
        }
        composable("web?path={path}", arguments = listOf(navArgument("path") { type = NavType.StringType; defaultValue = "/app" })) { entry ->
            WebScreen(scope, entry.arguments?.getString("path") ?: "/app")
        }
        composable("ideas") { IdeasScreen(scope) }
        composable("notifications") { NotificationsScreen(scope) }
    }
}

@Composable
private fun MainTabs(scope: AppScope) {
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    val me by scope.repository.me.collectAsState()
    val guest = scope.repository.currentBand?.isGuest == true
    val tabs = if (guest) listOf(Tab.Setlists, Tab.More) else Tab.entries
    if (tab !in tabs) tab = tabs.first()

    Scaffold(
        bottomBar = {
            androidx.compose.foundation.layout.Column {
                MiniPlayer(scope)
                NavigationBar {
                    tabs.forEach { item ->
                        NavigationBarItem(
                            selected = tab == item,
                            onClick = { tab = item },
                            icon = { Icon(item.icon, contentDescription = null) },
                            label = { Text(item.label) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (tab) {
                Tab.Home -> HomeScreen(scope, me) { tab = it }
                Tab.Songs -> SongsScreen(scope)
                Tab.Setlists -> SetlistsScreen(scope)
                Tab.Calendar -> CalendarScreen(scope)
                Tab.More -> MoreScreen(scope)
            }
        }
    }
}
