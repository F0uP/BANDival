package app.bandival.android.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.bandival.android.data.Repository
import app.bandival.android.data.Resource
import kotlinx.coroutines.flow.flowOf
import kotlinx.serialization.KSerializer

/** Collects a cached API resource; change [refresh] to reload. */
@Composable
fun <T> rememberResource(repository: Repository, path: String?, serializer: KSerializer<T>, refresh: Int = 0): Resource<T> {
    val flow = remember(path, refresh) {
        if (path == null) flowOf(Resource(loading = false)) else repository.load(path, serializer)
    }
    val state by flow.collectAsStateWithLifecycle(initialValue = Resource())
    return state
}
