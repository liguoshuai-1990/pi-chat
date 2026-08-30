package com.pichat.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pichat.android.ui.screen.ChatScreen
import com.pichat.android.ui.theme.PiChatTheme
import com.pichat.android.ui.viewmodel.ChatViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PiChatTheme {
                val chatViewModel: ChatViewModel = viewModel()
                ChatScreen(viewModel = chatViewModel)
            }
        }
    }
}
