package net.nimay.chatompomp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val vm: AppViewModel by viewModels()
    private val notifications = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { }
    private var pendingLink by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            notifications.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        setContent {
            ChatOmpTheme(spec = vm.theme) {
            androidx.compose.runtime.CompositionLocalProvider(LocalLang provides vm.lang) {
                pendingLink?.let { link ->
                    AlertDialog(
                        onDismissRequest = { pendingLink = null },
                        title = { Text("Koble til OMP Desktop?") },
                        text = { Text("Bruk engangskoden hvis du åpnet koblingen fra din egen PC.") },
                        confirmButton = {
                            TextButton(onClick = {
                                pendingLink = null
                                lifecycleScope.launch {
                                    vm.pair(link).onFailure { vm.reportError(it.message ?: "Paring feilet.") }
                                }
                            }) { Text("Koble til") }
                        },
                        dismissButton = {
                            TextButton(onClick = { pendingLink = null }) { Text("Avbryt") }
                        },
                    )
                }
                if (vm.pairing == null) PairingScreen(vm) else MainApp(vm)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.getBooleanExtra(Notifications.EXTRA_STOP_ROUTINE, false) == true) {
            vm.stopRoutine()
            intent.removeExtra(Notifications.EXTRA_STOP_ROUTINE)
        }
        val data = intent?.data?.toString() ?: return
        if (data.startsWith("chatomp://pair/")) pendingLink = data
    }
}
