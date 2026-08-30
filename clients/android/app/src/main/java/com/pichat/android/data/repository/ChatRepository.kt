package com.pichat.android.data.repository

import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.MessageRole
import com.pichat.android.data.model.MessageStatus
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.network.ApiService
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.data.network.WebSocketClient
import com.pichat.android.data.protocol.GenericServerMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

class ChatRepository(
    private val serverUrl: String,
    private val token: String? = null,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO)
) {
    private val wsClient = WebSocketClient(serverUrl, token, scope)
    private val apiService = ApiService(serverUrl, token)
    private val json = Json { ignoreUnknownKeys = true }

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private val _sessions = MutableStateFlow<List<SessionInfo>>(emptyList())
    val sessions: StateFlow<List<SessionInfo>> = _sessions.asStateFlow()

    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming.asStateFlow()

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    init {
        scope.launch {
            wsClient.connectionState.collect { _connectionState.value = it }
        }
        scope.launch {
            wsClient.incomingMessages.collect { msg ->
                handleServerMessage(msg)
            }
        }
    }

    fun connect(cwd: String = "", sessionPath: String? = null) {
        wsClient.connect(cwd, sessionPath)
        loadSessions(cwd)
    }

    fun disconnect() {
        wsClient.disconnect()
    }

    fun loadSessions(cwd: String = "") {
        scope.launch {
            val result = apiService.getSessions(cwd)
            result.onSuccess { res ->
                _sessions.value = res.sessions
            }
        }
    }

    fun sendPrompt(text: String, images: List<ImageAttachment> = emptyList()) {
        val userMsg = ChatMessage(
            role = MessageRole.USER,
            content = text,
            images = images,
            status = MessageStatus.DONE
        )
        val assistantMsg = ChatMessage(
            role = MessageRole.ASSISTANT,
            content = "",
            status = MessageStatus.STREAMING
        )

        _messages.value = _messages.value + userMsg + assistantMsg
        _isStreaming.value = true

        val payload = buildJsonObject {
            put("type", "prompt")
            put("message", text)
            if (images.isNotEmpty()) {
                putJsonArray("images") {
                    for (img in images) {
                        add(buildJsonObject {
                            put("type", img.type)
                            put("data", img.data)
                            put("mimeType", img.mimeType)
                        })
                    }
                }
            }
        }
        wsClient.sendRaw(payload.toString())
    }

    fun sendSteer(text: String) {
        val payload = buildJsonObject {
            put("type", "steer")
            put("message", text)
        }
        wsClient.sendRaw(payload.toString())
    }

    fun abort() {
        val payload = buildJsonObject {
            put("type", "abort")
        }
        wsClient.sendRaw(payload.toString())
        _isStreaming.value = false
    }

    fun switchSession(sessionPath: String) {
        _messages.value = emptyList()
        val payload = buildJsonObject {
            put("type", "switch_session")
            put("sessionPath", sessionPath)
        }
        wsClient.sendRaw(payload.toString())
        loadSessionHistory(sessionPath)
    }

    fun loadSessionHistory(sessionPath: String) {
        scope.launch {
            val result = apiService.getSession(sessionPath)
            result.onSuccess { detail ->
                val reconstructed = mutableListOf<ChatMessage>()
                for (entry in detail.entries) {
                    if (entry.type != "message") continue
                    val m = entry.message ?: continue
                    val role = when (m.role) {
                        "user" -> MessageRole.USER
                        "assistant" -> MessageRole.ASSISTANT
                        else -> continue
                    }
                    val text = extractJsonText(m.content)
                    if (text.isNotEmpty()) {
                        reconstructed.add(
                            ChatMessage(
                                role = role,
                                content = text,
                                status = MessageStatus.DONE,
                                timestamp = m.timestamp ?: System.currentTimeMillis()
                            )
                        )
                    }
                }
                _messages.value = reconstructed
            }
        }
    }

    private fun extractJsonText(elem: kotlinx.serialization.json.JsonElement?): String {
        if (elem == null) return ""
        if (elem is kotlinx.serialization.json.JsonPrimitive) {
            return elem.content
        }
        if (elem is kotlinx.serialization.json.JsonArray) {
            val sb = StringBuilder()
            for (item in elem) {
                if (item is kotlinx.serialization.json.JsonObject) {
                    val type = item["type"]?.let { if (it is kotlinx.serialization.json.JsonPrimitive) it.content else "" }
                    if (type == "text") {
                        val text = item["text"]?.let { if (it is kotlinx.serialization.json.JsonPrimitive) it.content else "" } ?: ""
                        sb.append(text)
                    }
                } else if (item is kotlinx.serialization.json.JsonPrimitive) {
                    sb.append(item.content)
                }
            }
            return sb.toString()
        }
        return ""
    }

    fun newSession() {
        _messages.value = emptyList()
        val payload = buildJsonObject {
            put("type", "new_session")
        }
        wsClient.sendRaw(payload.toString())
    }

    private fun handleServerMessage(msg: GenericServerMessage) {
        when (msg.type) {
            "agent_start" -> {
                _isStreaming.value = true
                val list = _messages.value.toMutableList()
                if (list.isEmpty() || list.last().role != MessageRole.ASSISTANT || list.last().status != MessageStatus.STREAMING) {
                    list.add(ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING))
                    _messages.value = list
                }
            }
            "agent_stream", "message_update" -> {
                val ev = msg.assistantMessageEvent
                val delta = ev?.delta ?: msg.delta ?: ""
                val isThinking = ev?.type == "thinking_delta" || msg.isThinking == true
                if (delta.isNotEmpty()) {
                    updateLastAssistantMessage(delta, isThinking)
                }
            }
            "agent_end", "agent_settled" -> {
                _isStreaming.value = false
                markLastMessageDone()
            }
            "remote_user_prompt" -> {
                val text = msg.message ?: ""
                val isSteer = msg.isSteer == true
                if (!isSteer && text.isNotEmpty()) {
                    val userMsg = ChatMessage(
                        role = MessageRole.USER,
                        content = text,
                        status = MessageStatus.DONE
                    )
                    val assistantMsg = ChatMessage(
                        role = MessageRole.ASSISTANT,
                        content = "",
                        status = MessageStatus.STREAMING
                    )
                    _messages.value = _messages.value + userMsg + assistantMsg
                    _isStreaming.value = true
                }
            }
        }
    }

    private fun updateLastAssistantMessage(delta: String, isThinking: Boolean) {
        val list = _messages.value.toMutableList()
        var lastIdx = list.indexOfLast { it.role == MessageRole.ASSISTANT && it.status == MessageStatus.STREAMING }
        if (lastIdx == -1) {
            val newAssistant = ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING)
            list.add(newAssistant)
            lastIdx = list.size - 1
        }

        val last = list[lastIdx]
        val updated = if (isThinking) {
            last.copy(
                thinkingContent = last.thinkingContent + delta,
                isThinking = true,
                status = MessageStatus.STREAMING
            )
        } else {
            last.copy(
                content = last.content + delta,
                isThinking = false,
                status = MessageStatus.STREAMING
            )
        }
        list[lastIdx] = updated
        _messages.value = list
    }

    private fun markLastMessageDone() {
        val list = _messages.value.toMutableList()
        if (list.isEmpty()) return
        val lastIdx = list.indexOfLast { it.role == MessageRole.ASSISTANT }
        if (lastIdx != -1) {
            list[lastIdx] = list[lastIdx].copy(status = MessageStatus.DONE, isThinking = false)
            _messages.value = list
        }
    }
}
