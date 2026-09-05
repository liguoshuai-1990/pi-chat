package com.pichat.android.data.repository

import com.pichat.android.data.model.ChatMessage
import com.pichat.android.data.model.ImageAttachment
import com.pichat.android.data.model.MessageRole
import com.pichat.android.data.model.MessageStatus
import com.pichat.android.data.model.ModelInfo
import com.pichat.android.data.model.ServerConfig
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.model.ToolCall
import com.pichat.android.data.model.ToolCallState
import com.pichat.android.data.network.ApiService
import com.pichat.android.data.network.ConnectionState
import com.pichat.android.data.network.WebSocketClient
import com.pichat.android.data.protocol.GenericServerMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

class ChatRepository(
    private val serverUrl: String,
    private val token: String? = null,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
) {
    private val wsClient = WebSocketClient(serverUrl, token, scope)
    private val apiService = ApiService(serverUrl, token)
    private val json = Json { ignoreUnknownKeys = true }

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

    private var activeCwd: String = ""

    // Watchdog: if streaming stays true for too long without agent_end, reset it
    private var streamingWatchdogJob: Job? = null
    private val STREAMING_WATCHDOG_MS = 5L * 60 * 1000 // 5 minutes

    init {
        scope.launch {
            wsClient.connectionState.collect { state ->
                _connectionState.value = state
                if (state == ConnectionState.CONNECTED) {
                    fetchConfig()
                    fetchState()
                    fetchAvailableModels()
                    loadSessions()
                }
            }
        }
        scope.launch {
            wsClient.incomingMessages.collect { msg ->
                handleServerMessage(msg)
            }
        }
    }

    fun close() {
        wsClient.shutdown()
        apiService.close()
        scope.cancel()
    }

    fun connect(cwd: String = "", sessionPath: String? = null) {
        activeCwd = cwd
        if (cwd.isNotEmpty()) {
            _currentCwd.value = cwd
        }
        _currentSessionFile.value = sessionPath
        wsClient.connect(cwd, sessionPath)
        loadSessions()
    }

    fun disconnect() {
        wsClient.disconnect()
    }

    fun fetchConfig() {
        scope.launch {
            val result = apiService.getConfig()
            result.onSuccess { cfg ->
                _serverConfig.value = cfg
                if (_currentModel.value == null && cfg.defaultModel != null) {
                    val def = cfg.defaultModel
                    if (!def.id.isNullOrEmpty()) {
                        _currentModel.value = ModelInfo(
                            id = def.id,
                            name = def.id,
                            provider = def.provider,
                            isDefault = true
                        )
                    }
                    if (!def.thinkingLevel.isNullOrEmpty()) {
                        _thinkingLevel.value = def.thinkingLevel
                    }
                }
            }.onFailure { e ->
                _error.value = "Failed to load server config: ${e.message}"
            }
        }
    }

    fun fetchState() {
        wsClient.sendRaw("""{"type":"get_state"}""")
    }

    fun fetchAvailableModels() {
        wsClient.sendRaw("""{"type":"get_available_models"}""")
    }

    fun setModel(provider: String, modelId: String) {
        val payload = buildJsonObject {
            put("type", "set_model")
            put("provider", provider)
            put("modelId", modelId)
        }
        wsClient.sendRaw(payload.toString())
        val found = _availableModels.value.find { it.id == modelId && (it.provider == null || it.provider == provider) }
        if (found != null) {
            _currentModel.value = found
        } else {
            _currentModel.value = ModelInfo(id = modelId, name = modelId, provider = provider)
        }
    }

    fun setThinkingLevel(level: String) {
        _thinkingLevel.value = level
        val payload = buildJsonObject {
            put("type", "set_thinking_level")
            put("level", level)
        }
        wsClient.sendRaw(payload.toString())
    }

    fun changeCwd(newCwd: String) {
        activeCwd = newCwd
        _currentCwd.value = newCwd.ifEmpty { "~" }
        _messages.value = emptyList()
        wsClient.updateCwd(newCwd)
        wsClient.updateSession(null)
        disconnect()
        connect(cwd = newCwd)
    }

    fun loadSessions() {
        val cwd = activeCwd
        scope.launch {
            val result = apiService.getSessions(cwd)
            result.onSuccess { res ->
                _sessions.value = res.sessions
            }.onFailure { e ->
                _error.value = "Failed to load sessions: ${e.message}"
            }
        }
    }

    private fun startStreamingWatchdog() {
        cancelStreamingWatchdog()
        streamingWatchdogJob = scope.launch {
            kotlinx.coroutines.delay(STREAMING_WATCHDOG_MS)
            if (_isStreaming.value) {
                _isStreaming.value = false
                markLastMessageDone()
                _error.value = "Streaming timed out after ${STREAMING_WATCHDOG_MS / 1000}s"
            }
        }
    }

    private fun cancelStreamingWatchdog() {
        streamingWatchdogJob?.cancel()
        streamingWatchdogJob = null
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
            status = MessageStatus.STREAMING,
            turnStartedAt = System.currentTimeMillis()
        )

        _messages.value = _messages.value + userMsg + assistantMsg
        _isStreaming.value = true
        startStreamingWatchdog()

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
        if (!wsClient.sendRaw(payload.toString())) {
            // WebSocket send failed — mark user message as ERROR and remove assistant placeholder
            _isStreaming.value = false
            cancelStreamingWatchdog()
            val list = _messages.value.toMutableList()
            if (list.isNotEmpty() && list.last().role == MessageRole.ASSISTANT && list.last().status == MessageStatus.STREAMING) {
                list.removeAt(list.size - 1)
            }
            if (list.isNotEmpty() && list.last().role == MessageRole.USER) {
                val last = list[list.size - 1]
                list[list.size - 1] = last.copy(status = MessageStatus.ERROR)
            }
            _messages.value = list
            _error.value = "Failed to send message: WebSocket not connected"
        }
    }

    fun sendSteer(text: String): Boolean {
        val payload = buildJsonObject {
            put("type", "steer")
            put("message", text)
        }
        val sent = wsClient.sendRaw(payload.toString())
        if (!sent) {
            _error.value = "Failed to send steer: WebSocket not connected"
        }
        return sent
    }

    fun abort() {
        val payload = buildJsonObject {
            put("type", "abort")
        }
        if (wsClient.sendRaw(payload.toString())) {
            _isStreaming.value = false
            cancelStreamingWatchdog()
        }
    }

    fun switchSession(sessionPath: String) {
        wsClient.updateSession(sessionPath)
        val payload = buildJsonObject {
            put("type", "switch_session")
            put("sessionPath", sessionPath)
        }
        if (!wsClient.sendRaw(payload.toString())) {
            _error.value = "Failed to switch session: WebSocket not connected"
            return
        }
        _currentSessionFile.value = sessionPath
        _messages.value = emptyList()
        loadSessionHistory(sessionPath)
        loadSessions()
    }

    fun deleteSession(file: String) {
        scope.launch {
            val result = apiService.deleteSession(file)
            result.onSuccess {
                if (_currentSessionFile.value == file) {
                    newSession()
                } else {
                    loadSessions()
                }
            }.onFailure { e ->
                _error.value = "Failed to delete session: ${e.message}"
            }
        }
    }

    fun loadSessionHistory(sessionPath: String) {
        scope.launch {
            val result = apiService.getSession(sessionPath)
            result.onSuccess { detail ->
                val toolResults = mutableMapOf<String, Pair<String, Long?>>()
                for (entry in detail.entries) {
                    if (entry.type != "message") continue
                    val m = entry.message ?: continue
                    if (m.role == "toolResult" && m.toolCallId != null) {
                        val outText = extractResultText(m.content)
                        val resTs = m.timestamp
                        toolResults[m.toolCallId] = Pair(outText, resTs)
                    }
                }

                val reconstructed = mutableListOf<ChatMessage>()
                var lastUserTs: Long? = null

                for (entry in detail.entries) {
                    if (entry.type != "message") continue
                    val m = entry.message ?: continue
                    val msgTs = m.timestamp ?: System.currentTimeMillis()
                    if (m.role == "user") {
                        lastUserTs = msgTs
                        val text = extractJsonText(m.content)
                        if (text.isNotEmpty()) {
                            reconstructed.add(
                                ChatMessage(
                                    role = MessageRole.USER,
                                    content = text,
                                    status = MessageStatus.DONE,
                                    timestamp = msgTs
                                )
                            )
                        }
                    } else if (m.role == "assistant") {
                        var turnDuration: Long? = null
                        if (lastUserTs != null && msgTs >= lastUserTs) {
                            val diff = msgTs - lastUserTs
                            if (diff in 1..900000) {
                                turnDuration = diff
                            }
                        }
                        var textContent = ""
                        var thinkingContent = ""
                        val toolCallsList = mutableListOf<ToolCall>()

                        if (m.content is JsonArray) {
                            for (item in m.content) {
                                if (item is JsonObject) {
                                    val type = item["type"]?.let { (it as? JsonPrimitive)?.content }
                                    when (type) {
                                        "text" -> {
                                            val t = item["text"]?.let { (it as? JsonPrimitive)?.content } ?: ""
                                            textContent += t
                                        }
                                        "thinking" -> {
                                            val th = item["thinking"]?.let { (it as? JsonPrimitive)?.content } ?: ""
                                            thinkingContent += th
                                        }
                                        "toolCall" -> {
                                            val tcId = item["id"]?.let { (it as? JsonPrimitive)?.content } ?: ""
                                            val tcName = item["name"]?.let { (it as? JsonPrimitive)?.content } ?: ""
                                            val tcArgs = jsonToString(item["arguments"])
                                            val (tcOutput, tcResTs) = toolResults[tcId] ?: Pair("", null)
                                            val tcDuration = if (tcResTs != null && tcResTs >= msgTs) tcResTs - msgTs else null
                                            toolCallsList.add(
                                                ToolCall(
                                                    id = tcId,
                                                    name = tcName,
                                                    args = tcArgs,
                                                    output = tcOutput,
                                                    state = ToolCallState.DONE,
                                                    startedAt = msgTs,
                                                    endedAt = tcResTs,
                                                    durationMs = tcDuration
                                                )
                                            )
                                        }
                                    }
                                } else if (item is JsonPrimitive) {
                                    textContent += item.content
                                }
                            }
                        } else if (m.content is JsonPrimitive) {
                            textContent = m.content.content
                        }

                        if (textContent.isNotEmpty() || thinkingContent.isNotEmpty() || toolCallsList.isNotEmpty()) {
                            reconstructed.add(
                                ChatMessage(
                                    role = MessageRole.ASSISTANT,
                                    content = textContent,
                                    thinkingContent = thinkingContent,
                                    toolCalls = toolCallsList,
                                    status = MessageStatus.DONE,
                                    timestamp = msgTs,
                                    turnDurationMs = turnDuration
                                )
                            )
                        }
                    }
                }
                _messages.value = reconstructed
            }.onFailure { e ->
                _error.value = "Failed to load session history: ${e.message}"
            }
        }
    }

    private fun extractJsonText(elem: JsonElement?): String {
        if (elem == null) return ""
        if (elem is JsonPrimitive) {
            return elem.content
        }
        if (elem is JsonArray) {
            val sb = StringBuilder()
            for (item in elem) {
                if (item is JsonObject) {
                    val type = item["type"]?.let { if (it is JsonPrimitive) it.content else "" }
                    if (type == "text") {
                        val text = item["text"]?.let { if (it is JsonPrimitive) it.content else "" } ?: ""
                        sb.append(text)
                    }
                } else if (item is JsonPrimitive) {
                    sb.append(item.content)
                }
            }
            return sb.toString()
        }
        return ""
    }

    fun newSession() {
        _currentSessionFile.value = null
        wsClient.updateSession(null)
        _messages.value = emptyList()
        _isStreaming.value = false
        cancelStreamingWatchdog()
        val payload = buildJsonObject {
            put("type", "new_session")
        }
        val sent = wsClient.sendRaw(payload.toString())
        if (!sent) {
            connect(cwd = activeCwd, sessionPath = null)
        } else {
            fetchState()
            fetchAvailableModels()
        }
        loadSessions()
    }

    private fun parseModelInfo(obj: JsonObject?): ModelInfo? {
        if (obj == null) return null
        val id = (obj["id"] as? JsonPrimitive)?.content ?: return null
        val name = (obj["name"] as? JsonPrimitive)?.content ?: id
        val provider = (obj["provider"] as? JsonPrimitive)?.content
        val reasoning = (obj["reasoning"] as? JsonPrimitive)?.booleanOrNull ?: false
        val supportsImages = (obj["supportsImages"] as? JsonPrimitive)?.booleanOrNull ?: false
        val contextWindow = (obj["contextWindow"] as? JsonPrimitive)?.longOrNull
        val modalities = mutableListOf<String>()
        (obj["inputModalities"] as? JsonArray)?.forEach {
            (it as? JsonPrimitive)?.content?.let { m -> modalities.add(m) }
        }
        return ModelInfo(
            id = id,
            name = name,
            provider = provider,
            reasoning = reasoning,
            supportsImages = supportsImages || modalities.contains("image"),
            inputModalities = modalities,
            contextWindow = contextWindow
        )
    }

    private fun handleServerMessage(msg: GenericServerMessage) {
        if (extractSessionFile(msg) != null) {
            loadSessions()
        }

        when (msg.type) {
            "response" -> {
                when (msg.command) {
                    "get_state" -> {
                        val dataObj = msg.data as? JsonObject
                        if (dataObj != null) {
                            val modelObj = dataObj["model"] as? JsonObject
                            val parsedModel = parseModelInfo(modelObj)
                            if (parsedModel != null) {
                                _currentModel.value = parsedModel
                            }
                            val th = (dataObj["thinkingLevel"] as? JsonPrimitive)?.content
                            if (!th.isNullOrEmpty()) {
                                _thinkingLevel.value = th
                            }
                            val cwd = (dataObj["cwd"] as? JsonPrimitive)?.content
                            if (!cwd.isNullOrEmpty()) {
                                _currentCwd.value = cwd
                            }
                            val sf = (dataObj["sessionFile"] as? JsonPrimitive)?.content
                                ?: (dataObj["sessionPath"] as? JsonPrimitive)?.content
                            if (!sf.isNullOrEmpty()) {
                                _currentSessionFile.value = sf
                            }
                        }
                    }
                    "get_available_models" -> {
                        val dataObj = msg.data as? JsonObject
                        val modelsArr = dataObj?.get("models") as? JsonArray
                        if (modelsArr != null) {
                            val list = mutableListOf<ModelInfo>()
                            for (item in modelsArr) {
                                val m = parseModelInfo(item as? JsonObject)
                                if (m != null) list.add(m)
                            }
                            _availableModels.value = list
                        }
                    }
                    "set_model" -> {
                        if (msg.success == true) {
                            val modelObj = msg.data as? JsonObject
                            val parsedModel = parseModelInfo(modelObj)
                            if (parsedModel != null) {
                                _currentModel.value = parsedModel
                            }
                        } else {
                            _error.value = "切换模型失败: ${msg.error ?: "未知错误"}"
                        }
                    }
                    "set_thinking_level" -> {
                        if (msg.success == false) {
                            _error.value = "设置思考深度失败: ${msg.error ?: "未知错误"}"
                        }
                    }
                    "cycle_thinking_level" -> {
                        val dataObj = msg.data as? JsonObject
                        val level = (dataObj?.get("level") as? JsonPrimitive)?.content
                            ?: (dataObj?.get("thinkingLevel") as? JsonPrimitive)?.content
                        if (!level.isNullOrEmpty()) {
                            _thinkingLevel.value = level
                        }
                    }
                    "new_session" -> {
                        if (msg.success == true) {
                            _currentSessionFile.value = null
                            _messages.value = emptyList()
                            _isStreaming.value = false
                            cancelStreamingWatchdog()
                            fetchState()
                            fetchAvailableModels()
                            _currentModel.value?.let { setModel(it.provider ?: "", it.id) }
                            setThinkingLevel(_thinkingLevel.value)
                        } else {
                            _error.value = "新建会话失败: ${msg.error ?: "未知错误"}"
                        }
                    }
                    "prompt" -> {
                        if (msg.success == false) {
                            _isStreaming.value = false
                            cancelStreamingWatchdog()
                            val errMsg = msg.error ?: "生成失败（模型返回错误）"
                            val list = _messages.value.toMutableList()
                            val idx = indexOfLastAssistantMessage()
                            if (idx != -1) {
                                val last = list[idx]
                                if (last.content.isEmpty()) {
                                    list[idx] = last.copy(content = "⚠️ $errMsg", status = MessageStatus.ERROR)
                                } else {
                                    list[idx] = last.copy(status = MessageStatus.ERROR)
                                }
                                _messages.value = list
                            }
                            _error.value = errMsg
                        }
                    }
                    "switch_session" -> {
                        if (msg.success == true) {
                            fetchState()
                        } else {
                            _error.value = "切换会话失败: ${msg.error ?: "未知错误"}"
                        }
                    }
                }
            }
            "model_select" -> {
                val dataObj = msg.data as? JsonObject
                val modelObj = (dataObj?.get("model") as? JsonObject) ?: dataObj
                val m = parseModelInfo(modelObj)
                if (m != null) {
                    _currentModel.value = m
                }
            }
            "agent_start", "message_start" -> {
                _isStreaming.value = true
                startStreamingWatchdog()
                val list = _messages.value.toMutableList()
                if (list.isEmpty() || list.last().role != MessageRole.ASSISTANT || list.last().status != MessageStatus.STREAMING) {
                    list.add(ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING, turnStartedAt = System.currentTimeMillis()))
                    _messages.value = list
                }
                loadSessions()
            }
            "message_end" -> {
                val msgObj = msg.messageObject
                val stopReason = (msgObj?.get("stopReason") as? JsonPrimitive)?.content
                if (stopReason == "error") {
                    val errMsg = (msgObj?.get("errorMessage") as? JsonPrimitive)?.content
                        ?: "生成失败（模型返回错误）。可能是当前模型不可用，请切换模型后重试。"
                    val list = _messages.value.toMutableList()
                    val idx = indexOfLastAssistantMessage()
                    if (idx != -1) {
                        val last = list[idx]
                        if (last.content.isEmpty()) {
                            list[idx] = last.copy(content = "⚠️ $errMsg", status = MessageStatus.ERROR)
                            _messages.value = list
                        }
                    }
                    _error.value = errMsg
                }
            }
            "agent_stream", "message_update" -> {
                val ev = msg.assistantMessageEvent
                val evType = ev?.type ?: if (msg.isThinking == true) "thinking_delta" else "text_delta"
                when (evType) {
                    "thinking_start" -> {
                        startThinking()
                    }
                    "thinking_delta" -> {
                        val delta = ev?.delta ?: msg.delta ?: ""
                        if (delta.isNotEmpty()) {
                            updateLastAssistantMessage(delta, isThinking = true)
                        }
                    }
                    "thinking_end" -> {
                        finishThinking()
                    }
                    "text_start" -> {
                        finishThinking()
                    }
                    "text_delta" -> {
                        val delta = ev?.delta ?: msg.delta ?: ""
                        if (delta.isNotEmpty()) {
                            updateLastAssistantMessage(delta, isThinking = false)
                        }
                    }
                    "text_end" -> {
                        finishThinking()
                        val contentStr = extractJsonText(ev?.content)
                        if (contentStr.isNotEmpty()) {
                            setAssistantFinalText(contentStr)
                        }
                    }
                    "toolcall_start", "toolcall_delta", "toolcall_end" -> {
                        finishThinking()
                        val tc = ev?.toolCall as? JsonObject
                        val id = (tc?.get("id") as? JsonPrimitive)?.content ?: msg.toolCallId ?: ""
                        val name = (tc?.get("name") as? JsonPrimitive)?.content ?: msg.toolName ?: ""
                        val argsElem = tc?.get("arguments") ?: msg.args
                        val args = jsonToString(argsElem)
                        if (id.isNotEmpty()) {
                            startToolCall(id, name, args)
                        }
                    }
                    else -> {
                        // Do not append unhandled tool/system delta payloads to message content
                    }
                }
            }
            "tool_execution_start" -> {
                finishThinking()
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
            "agent_end", "agent_settled", "error", "pi_exit" -> {
                _isStreaming.value = false
                cancelStreamingWatchdog()
                markLastMessageDone()
                loadSessions()
                if (msg.type == "agent_settled") {
                    fetchState()
                }
                if (msg.type == "error" || msg.type == "pi_exit") {
                    val errMsg = msg.error ?: msg.messageText ?: if (msg.type == "pi_exit") "Agent 进程退出 (code=${msg.codeString ?: "unknown"})" else "Agent 错误"
                    val list = _messages.value.toMutableList()
                    val idx = indexOfLastAssistantMessage()
                    if (idx != -1) {
                        val last = list[idx]
                        if (last.status == MessageStatus.STREAMING) {
                            if (last.content.isEmpty()) {
                                list[idx] = last.copy(content = "⚠️ $errMsg", status = MessageStatus.ERROR)
                            } else {
                                list[idx] = last.copy(status = MessageStatus.ERROR)
                            }
                            _messages.value = list
                        }
                    }
                    _error.value = errMsg
                }
            }
            "remote_user_prompt" -> {
                val text = msg.messageText ?: ""
                val isSteer = msg.isSteer == true
                if (!isSteer && text.isNotEmpty()) {
                    val lastUser = _messages.value.findLast { it.role == MessageRole.USER }
                    if (lastUser?.content != text) {
                        val userMsg = ChatMessage(
                            role = MessageRole.USER,
                            content = text,
                            status = MessageStatus.DONE
                        )
                        val assistantMsg = ChatMessage(
                            role = MessageRole.ASSISTANT,
                            content = "",
                            status = MessageStatus.STREAMING,
                            turnStartedAt = System.currentTimeMillis()
                        )
                        _messages.value = _messages.value + userMsg + assistantMsg
                        _isStreaming.value = true
                        startStreamingWatchdog()
                    }
                }
            }
        }
    }

    private fun extractSessionFile(msg: GenericServerMessage): String? {
        val data = msg.data as? JsonObject ?: return null
        for (key in listOf("sessionFile", "sessionPath")) {
            val v = data[key]
            if (v is JsonPrimitive && v.isString && v.content.isNotEmpty()) {
                val f = v.content
                _currentSessionFile.value = f
                return f
            }
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

    private fun startThinking() {
        val list = _messages.value.toMutableList()
        var idx = indexOfLastAssistantMessage()
        val now = System.currentTimeMillis()
        if (idx == -1) {
            list.add(
                ChatMessage(
                    role = MessageRole.ASSISTANT,
                    content = "",
                    thinkingContent = "",
                    isThinking = true,
                    thinkingStartedAt = now,
                    status = MessageStatus.STREAMING,
                    turnStartedAt = now
                )
            )
        } else {
            val last = list[idx]
            list[idx] = last.copy(
                isThinking = true,
                thinkingStartedAt = last.thinkingStartedAt ?: now,
                status = MessageStatus.STREAMING
            )
        }
        _messages.value = list
        _isStreaming.value = true
    }

    private fun finishThinking() {
        val list = _messages.value.toMutableList()
        val idx = indexOfLastAssistantMessage()
        if (idx == -1) return
        val last = list[idx]
        if (last.isThinking) {
            val now = System.currentTimeMillis()
            val startTs = last.thinkingStartedAt ?: now
            val duration = Math.max(0L, now - startTs)
            list[idx] = last.copy(
                isThinking = false,
                thinkingEndedAt = now,
                thinkingDurationMs = duration
            )
            _messages.value = list
        }
    }

    private fun setAssistantFinalText(text: String) {
        val list = _messages.value.toMutableList()
        val idx = indexOfLastAssistantMessage()
        if (idx == -1) return
        val last = list[idx]
        list[idx] = last.copy(
            content = text,
            isThinking = false,
            status = MessageStatus.STREAMING
        )
        _messages.value = list
    }

    private fun startToolCall(id: String, name: String, args: String) {
        val list = _messages.value.toMutableList()
        var idx = indexOfLastAssistantMessage()
        if (idx == -1) {
            list.add(ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING, turnStartedAt = System.currentTimeMillis()))
            idx = list.size - 1
        } else {
            val last = list[idx]
            if (last.status != MessageStatus.STREAMING) {
                list.add(ChatMessage(role = MessageRole.ASSISTANT, content = "", status = MessageStatus.STREAMING, turnStartedAt = System.currentTimeMillis()))
                idx = list.size - 1
            }
        }
        val message = list[idx]
        val toolCalls = message.toolCalls.toMutableList()
        val existing = toolCalls.indexOfFirst { it.id == id }
        val now = System.currentTimeMillis()
        if (existing == -1) {
            toolCalls.add(ToolCall(id = id, name = name, args = args, startedAt = now))
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
        val tcIdx = toolCalls.indexOfFirst { it.id == id }
        if (tcIdx == -1) return
        toolCalls[tcIdx] = toolCalls[tcIdx].copy(output = output)
        list[idx] = message.copy(toolCalls = toolCalls)
        _messages.value = list
    }

    private fun finishToolCall(id: String, result: String, isError: Boolean) {
        val list = _messages.value.toMutableList()
        val idx = indexOfLastAssistantMessage()
        if (idx == -1) return
        val message = list[idx]
        val toolCalls = message.toolCalls.toMutableList()
        val tcIdx = toolCalls.indexOfFirst { it.id == id }
        if (tcIdx == -1) return
        val now = System.currentTimeMillis()
        val tc = toolCalls[tcIdx]
        val duration = if (tc.startedAt > 0) now - tc.startedAt else null
        toolCalls[tcIdx] = tc.copy(
            output = result,
            state = if (isError) ToolCallState.ERROR else ToolCallState.DONE,
            endedAt = now,
            durationMs = duration
        )
        list[idx] = message.copy(toolCalls = toolCalls)
        _messages.value = list
    }

    private fun updateLastAssistantMessage(delta: String, isThinking: Boolean) {
        val list = _messages.value.toMutableList()
        var idx = indexOfLastAssistantMessage()
        val now = System.currentTimeMillis()
        if (idx == -1) {
            list.add(
                ChatMessage(
                    role = MessageRole.ASSISTANT,
                    content = if (isThinking) "" else delta,
                    thinkingContent = if (isThinking) delta else "",
                    isThinking = isThinking,
                    thinkingStartedAt = if (isThinking) now else null,
                    status = MessageStatus.STREAMING,
                    turnStartedAt = now
                )
            )
        } else {
            val last = list[idx]
            if (isThinking) {
                val startTs = last.thinkingStartedAt ?: now
                list[idx] = last.copy(
                    thinkingContent = last.thinkingContent + delta,
                    isThinking = true,
                    thinkingStartedAt = startTs,
                    status = MessageStatus.STREAMING
                )
            } else {
                val endTs = if (last.isThinking) now else last.thinkingEndedAt
                val thinkingDuration = if (last.isThinking && last.thinkingStartedAt != null) {
                    now - last.thinkingStartedAt
                } else {
                    last.thinkingDurationMs
                }
                list[idx] = last.copy(
                    content = last.content + delta,
                    isThinking = false,
                    thinkingEndedAt = endTs,
                    thinkingDurationMs = thinkingDuration,
                    status = MessageStatus.STREAMING
                )
            }
        }
        _messages.value = list
    }

    private fun markLastMessageDone() {
        val list = _messages.value.toMutableList()
        val idx = indexOfLastAssistantMessage()
        if (idx != -1) {
            val now = System.currentTimeMillis()
            val last = list[idx]
            val thinkingDuration = if (last.isThinking && last.thinkingStartedAt != null) {
                now - last.thinkingStartedAt
            } else {
                last.thinkingDurationMs
            }
            val turnDuration = if (last.turnStartedAt != null && now >= last.turnStartedAt) {
                now - last.turnStartedAt
            } else {
                last.turnDurationMs
            }
            val updatedToolCalls = last.toolCalls.map {
                if (it.state == ToolCallState.RUNNING) {
                    val dur = if (it.startedAt > 0) now - it.startedAt else null
                    it.copy(state = ToolCallState.DONE, endedAt = now, durationMs = it.durationMs ?: dur)
                } else it
            }
            list[idx] = last.copy(
                status = MessageStatus.DONE,
                isThinking = false,
                thinkingDurationMs = thinkingDuration,
                turnDurationMs = turnDuration,
                toolCalls = updatedToolCalls
            )
            _messages.value = list
        }
    }
}
