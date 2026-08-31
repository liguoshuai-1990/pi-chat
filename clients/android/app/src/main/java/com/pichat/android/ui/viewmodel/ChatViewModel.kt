package com.pichat.android.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.data.repository.ChatRepository
import com.pichat.android.data.repository.SettingsStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class ChatViewModel(application: Application) : AndroidViewModel(application) {

    private val settings = SettingsStore(application)

    private var repository: ChatRepository = ChatRepository(
        settings.getServerUrl(),
        settings.getAuthToken()
    )

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

    private val _serverUrl = MutableStateFlow(settings.getServerUrl())
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    init {
        bindRepository(repository)
        repository.connect(cwd = settings.getCwd())
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
        _currentSessionTitle.value = session.sessionName ?: session.firstUser ?: session.name ?: "Chat"
        repository.switchSession(session.file)
    }

    fun newSession() {
        _currentSessionTitle.value = "New Chat"
        repository.newSession()
    }

    fun reconnect() {
        repository.disconnect()
        repository = ChatRepository(settings.getServerUrl(), settings.getAuthToken())
        bindRepository(repository)
        repository.connect(cwd = settings.getCwd())
    }

    fun reconnect(newServerUrl: String, newToken: String?, newCwd: String = "") {
        settings.save(newServerUrl, newToken, newCwd)
        _serverUrl.value = settings.getServerUrl()
        repository.disconnect()
        repository = ChatRepository(settings.getServerUrl(), settings.getAuthToken())
        bindRepository(repository)
        repository.connect(newCwd)
    }

    override fun onCleared() {
        super.onCleared()
        repository.disconnect()
    }
}