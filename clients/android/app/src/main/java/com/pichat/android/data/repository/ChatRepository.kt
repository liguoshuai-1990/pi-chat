package com.pichat.android.data.repository

import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.MessageRole
import com.pichat.android.data.model.MessageStatus
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.model.ToolCall
import com.pichat.android.data.model.ToolCallState
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
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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

    private var currentCwd: String = ""

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
        currentCwd = cwd
        wsClient.connect(cwd, sessionPath)
        loadSessions()
    }

    fun disconnect() {
        wsClient.disconnect()
    }

    fun loadSessions() {
        val cwd = currentCwd
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
        loadSessions()
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
        // Refresh the session list immediately so a newly created session
        // shows up in the sidebar without waiting for a reconnect.
        loadSessions()
    }

    private fun handleServerMessage(msg: GenericServerMessage) {
        // Pi allocates a session file (nested under data.sessionFile) once the
        // first prompt of a new conversation is persisted. React to it right away
        // so the sidebar list updates immediately.
        if (extractSessionFile(msg) != null) {
            loadSessions()
        }

        when (msg.type) {
            "agent_start" -> {
                _isStreaming.value = true
                val list = _messages.value.toMutableList()
                if (list.isEmpty() || list.last().role != MessageRole.ASSISTANT || list.last().status != MessageStatus.STREAMING) {
                    list.add(ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING))
                    _messages.value = list
                }
                loadSessions()
            }
            "agent_stream", "message_update" -> {
                val ev = msg.assistantMessageEvent
                val delta = ev?.delta ?: msg.delta ?: ""
                val isThinking = ev?.type == "thinking_delta" || msg.isThinking == true
                if (delta.isNotEmpty()) {
                    updateLastAssistantMessage(delta, isThinking)
                }
            }
            "tool_execution_start" -> {
                val id = msg.toolCallId ?: ""
                val name = msg.toolName ?: ""
                if (id.isNotEmpty()) {
                    startToolCall(id, name, jsonToString(msg.args))
                }
            }
            "tool_execution_update" -> {
                val id = msg.toolCallId ?: ""
                if (id.isNotEmpty()) {
                    updateToolCallOutput(id, extractResultText(msg.partialResult))
                }
            }
            "tool_execution_end" -> {
                val id = msg.toolCallId ?: ""
                if (id.isNotEmpty()) {
                    finishToolCall(id, extractResultText(msg.result), msg.isError == true)
                }
            }
            "agent_end", "agent_settled" -> {
                _isStreaming.value = false
                markLastMessageDone()
                // Session titles may change after the agent settles.
                loadSessions()
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

    private fun extractSessionFile(msg: GenericServerMessage): String? {
        val data = msg.data as? JsonObject ?: return null
        for (key in listOf("sessionFile", "sessionPath")) {
            val v = data[key]
            if (v is JsonPrimitive && v.isString && v.content.isNotEmpty()) return v.content
        }
        return null
    }

    private fun jsonToString(elem: JsonElement?): String {
        return when (elem) {
            null -> ""
            is JsonPrimitive -> elem.content
            else -> elem.toString()
        }
    }

    private fun extractResultText(elem: JsonElement?): String {
        if (elem == null) return ""
        if (elem is JsonObject) {
            val content = elem["content"]
            if (content != null) return extractJsonText(content)
            val text = elem["text"]
            if (text != null) return extractJsonText(text)
        }
        return extractJsonText(elem)
    }

    private fun indexOfLastAssistantMessage(): Int {
        return _messages.value.indexOfLast { it.role == MessageRole.ASSISTANT }
    }

    private fun startToolCall(id: String, name: String, args: String) {
        val list = _messages.value.toMutableList()
        var idx = indexOfLastAssistantMessage()
        if (idx == -1) {
            list.add(ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING))
            idx = list.size - 1
        } else {
            val last = list[idx]
            if (last.status != MessageStatus.STREAMING) {
                list.add(ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING))
                idx = list.size - 1
            }
        }
        val message = list[idx]
        val toolCalls = message.toolCalls.toMutableList()
        val existing = toolCalls.indexOfFirst { it.id == id }
        if (existing == -1) {
            toolCalls.add(ToolCall(id = id, name = name, args = args))
        } else {
            toolCalls[existing] = toolCalls[existing].copy(name = name, args = args)
        }
        list[idx] = message.copy(toolCalls = toolCalls, status = MessageStatus.STREAMING)
        _messages.value = list
        _isStreaming.value = true
    }

    private fun updateToolCallOutput(id: String, output: String) {
        val list = _messages.value.toMutableList()
        val idx = indexOfLastAssistantMessage()
        if (idx == -1) return
        val message = list[idx]
        val toolCalls = message.toolCalls.toMutableList()
        val ti = toolCalls.indexOfFirst { it.id == id }
        if (ti != -1 && output.isNotEmpty()) {
            toolCalls[ti] = toolCalls[ti].copy(output = output)
            list[idx] = message.copy(toolCalls = toolCalls)
            _messages.value = list
        }
    }

    private fun finishToolCall(id: String, output: String, isError: Boolean) {
        val list = _messages.value.toMutableList()
        val idx = indexOfLastAssistantMessage()
        if (idx == -1) return
        val message = list[idx]
        val toolCalls = message.toolCalls.toMutableList()
        val ti = toolCalls.indexOfFirst { it.id == id }
        if (ti != -1) {
            val tc = toolCalls[ti]
            toolCalls[ti] = tc.copy(
                output = if (output.isNotEmpty()) output else tc.output,
                state = if (isError) ToolCallState.ERROR else ToolCallState.DONE,
                endedAt = System.currentTimeMillis()
            )
            list[idx] = message.copy(toolCalls = toolCalls)
            _messages.value = list
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
