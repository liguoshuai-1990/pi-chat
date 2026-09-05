package com.pichat.android.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.ModelInfo
import com.pichat.android.data.model.ServerConfig
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.data.repository.ChatRepository
import com.pichat.android.data.repository.SettingsStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
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

    private val _currentSessionFile = MutableStateFlow<String?>(null)
    val currentSessionFile: StateFlow<String?> = _currentSessionFile.asStateFlow()

    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming.asStateFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _currentSessionTitle = MutableStateFlow("新对话")
    val currentSessionTitle: StateFlow<String> = _currentSessionTitle.asStateFlow()

    private val _serverUrl = MutableStateFlow(settings.getServerUrl())
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _currentModel = MutableStateFlow<ModelInfo?>(null)
    val currentModel: StateFlow<ModelInfo?> = _currentModel.asStateFlow()

    private val _availableModels = MutableStateFlow<List<ModelInfo>>(emptyList())
    val availableModels: StateFlow<List<ModelInfo>> = _availableModels.asStateFlow()

    private val _thinkingLevel = MutableStateFlow("medium")
    val thinkingLevel: StateFlow<String> = _thinkingLevel.asStateFlow()

    private val _currentCwd = MutableStateFlow("~")
    val currentCwd: StateFlow<String> = _currentCwd.asStateFlow()

    private val _serverConfig = MutableStateFlow<ServerConfig?>(null)
    val serverConfig: StateFlow<ServerConfig?> = _serverConfig.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var collectorJobs: List<Job> = emptyList()

    init {
        bindRepository(repository)
        repository.connect(cwd = settings.getCwd())
    }

    private fun bindRepository(repo: ChatRepository) {
        // Cancel previous collector jobs to prevent unbounded accumulation on reconnect
        collectorJobs.forEach { it.cancel() }
        collectorJobs = listOf(
            viewModelScope.launch { repo.messages.collect { _messages.value = it } },
            viewModelScope.launch { repo.sessions.collect { _sessions.value = it } },
            viewModelScope.launch { repo.currentSessionFile.collect { _currentSessionFile.value = it } },
            viewModelScope.launch { repo.isStreaming.collect { _isStreaming.value = it } },
            viewModelScope.launch { repo.connectionState.collect { _connectionState.value = it } },
            viewModelScope.launch { repo.currentModel.collect { _currentModel.value = it } },
            viewModelScope.launch { repo.availableModels.collect { _availableModels.value = it } },
            viewModelScope.launch { repo.thinkingLevel.collect { _thinkingLevel.value = it } },
            viewModelScope.launch { repo.currentCwd.collect { _currentCwd.value = it } },
            viewModelScope.launch { repo.serverConfig.collect { _serverConfig.value = it } },
            viewModelScope.launch { repo.error.collect { _error.value = it } }
        )
    }

    fun sendMessage(text: String, images: List<ImageAttachment> = emptyList()) {
        if (text.isBlank() && images.isEmpty()) return
        if (_messages.value.isEmpty()) {
            val titleText = text.ifEmpty { if (images.isNotEmpty()) "📷 ${images.size} 张图片" else "" }
            _currentSessionTitle.value = if (titleText.length > 20) titleText.take(20) + "…" else titleText
        }
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
        _currentSessionTitle.value = session.sessionName ?: session.firstUser ?: session.name ?: "对话"
        repository.switchSession(session.file)
    }

    /**
     * 重新加载当前会话的历史消息（下拉刷新调用）。
     * 如果没有当前会话（新对话/无会话），则不做任何操作。
     */
    fun refreshCurrentSession() {
        val sessionFile = _currentSessionFile.value
        if (sessionFile != null) {
            repository.loadSessionHistory(sessionFile)
        }
    }

    fun deleteSession(file: String) {
        repository.deleteSession(file)
    }

    fun newSession() {
        _currentSessionTitle.value = "新对话"
        repository.newSession()
    }

    fun setModel(provider: String, modelId: String) {
        repository.setModel(provider, modelId)
    }

    fun setThinkingLevel(level: String) {
        repository.setThinkingLevel(level)
    }

    fun changeCwd(newCwd: String) {
        settings.save(settings.getServerUrl(), settings.getAuthToken(), newCwd)
        repository.changeCwd(newCwd)
    }

    fun refreshModels() {
        repository.fetchAvailableModels()
    }

    fun clearError() {
        _error.value = null
    }

    fun reconnect() {
        repository.disconnect()
        repository.close()
        repository = ChatRepository(settings.getServerUrl(), settings.getAuthToken())
        bindRepository(repository)
        repository.connect(cwd = settings.getCwd())
    }

    fun reconnect(newServerUrl: String, newToken: String?, newCwd: String = "") {
        settings.save(newServerUrl, newToken, newCwd)
        _serverUrl.value = settings.getServerUrl()
        repository.disconnect()
        repository.close()
        repository = ChatRepository(settings.getServerUrl(), settings.getAuthToken())
        bindRepository(repository)
        repository.connect(newCwd)
    }

    fun exportChatMarkdown(): String {
        val msgs = _messages.value
        if (msgs.isEmpty()) return ""

        val sb = java.lang.StringBuilder()
        sb.append("# pi-chat 对话记录\n\n")
        sb.append("- **会话**: ${_currentSessionTitle.value}\n")
        val modelName = _currentModel.value?.name ?: _currentModel.value?.id ?: "pi"
        sb.append("- **模型**: $modelName\n")
        sb.append("- **工作目录**: ${_currentCwd.value}\n")
        sb.append("- **导出时间**: ${java.time.LocalDateTime.now()}\n\n")
        sb.append("---\n\n")

        for (msg in msgs) {
            when (msg.role) {
                com.pichat.android.data.model.MessageRole.USER -> {
                    sb.append("### 👤 User\n\n")
                    sb.append(msg.content).append("\n\n")
                    if (msg.images.isNotEmpty()) {
                        sb.append("*(含 ${msg.images.size} 张图片附件)*\n\n")
                    }
                }
                com.pichat.android.data.model.MessageRole.ASSISTANT -> {
                    sb.append("### 🤖 pi\n\n")
                    if (msg.thinkingContent.isNotEmpty()) {
                        sb.append("> **🧠 思考过程**\n>\n")
                        msg.thinkingContent.lines().forEach { line ->
                            sb.append("> ").append(line).append("\n")
                        }
                        sb.append("\n")
                    }
                    if (msg.toolCalls.isNotEmpty()) {
                        for (tc in msg.toolCalls) {
                            sb.append("```tool:").append(tc.name).append("\n")
                            if (tc.args.isNotEmpty()) sb.append(tc.args).append("\n")
                            if (tc.output.isNotEmpty()) {
                                sb.append("--- 输出 ---\n").append(tc.output).append("\n")
                            }
                            sb.append("```\n\n")
                        }
                    }
                    if (msg.content.isNotEmpty()) {
                        sb.append(msg.content).append("\n\n")
                    }
                }
                else -> {}
            }
        }
        return sb.toString().trim()
    }

    override fun onCleared() {
        super.onCleared()
        repository.close()
    }
}
