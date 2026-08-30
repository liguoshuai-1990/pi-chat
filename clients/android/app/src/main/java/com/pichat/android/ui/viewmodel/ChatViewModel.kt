package com.pichat.android.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.data.repository.ChatRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ChatViewModel(
    private val repository: ChatRepository = ChatRepository("http://10.0.2.2:3000")
) : ViewModel() {

    val messages: StateFlow<List<ChatMessage>> = repository.messages
    val sessions: StateFlow<List<SessionInfo>> = repository.sessions
    val isStreaming: StateFlow<Boolean> = repository.isStreaming
    val connectionState: StateFlow<ConnectionState> = repository.connectionState

    private val _currentSessionTitle = MutableStateFlow("New Chat")
    val currentSessionTitle: StateFlow<String> = _currentSessionTitle.asStateFlow()

    init {
        repository.connect()
    }

    fun sendMessage(text: String, images: List<ImageAttachment> = emptyList()) {
        if (text.isBlank() && images.isEmpty()) return
        repository.sendPrompt(text, images)
    }

    fun sendSteer(text: String) {
        if (text.isBlank()) return
        repository.sendSteer(text)
    }

    fun abort() {
        repository.abort()
    }

    fun switchSession(session: SessionInfo) {
        _currentSessionTitle.value = session.sessionName ?: session.firstUser ?: "Chat"
        repository.switchSession(session.file)
    }

    fun newSession() {
        _currentSessionTitle.value = "New Chat"
        repository.newSession()
    }

    override fun onCleared() {
        super.onCleared()
        repository.disconnect()
    }
}
