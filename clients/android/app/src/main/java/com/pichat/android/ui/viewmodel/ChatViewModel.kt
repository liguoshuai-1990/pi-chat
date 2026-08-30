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
    initialServerUrl: String = "http://10.0.2.2:3000",
    initialToken: String? = null
) : ViewModel() {

    private var repository: ChatRepository = ChatRepository(initialServerUrl, initialToken)

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _sessions = MutableStateFlow<List<SessionInfo>>(emptyList())
    val sessions: StateFlow<List<SessionInfo>> = _sessions.asStateFlow()

    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming.asStateFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _currentSessionTitle = MutableStateFlow("New Chat")
    val currentSessionTitle: StateFlow<String> = _currentSessionTitle.asStateFlow()

    init {
        bindRepository(repository)
        repository.connect()
    }

    private fun bindRepository(repo: ChatRepository) {
        viewModelScope.launch {
            repo.messages.collect { _messages.value = it }
        }
        viewModelScope.launch {
            repo.sessions.collect { _sessions.value = it }
        }
        viewModelScope.launch {
            repo.isStreaming.collect { _isStreaming.value = it }
        }
        viewModelScope.launch {
            repo.connectionState.collect { _connectionState.value = it }
        }
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

    fun reconnect(newServerUrl: String, newToken: String? = null, newCwd: String = "") {
        repository.disconnect()
        repository = ChatRepository(newServerUrl, newToken)
        bindRepository(repository)
        repository.connect(newCwd)
    }

    override fun onCleared() {
        super.onCleared()
        repository.disconnect()
    }
}
