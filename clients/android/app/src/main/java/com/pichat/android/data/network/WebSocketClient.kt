package com.pichat.android.data.network

import com.pichat.android.data.protocol.GenericServerMessage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import okhttp3.*
import java.util.concurrent.TimeUnit

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
}

class WebSocketClient(
    private val serverUrl: String,
    private val token: String? = null,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
) {
    private val okHttpClient = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }

    private var webSocket: WebSocket? = null

    private val _incomingMessages = MutableSharedFlow<GenericServerMessage>(extraBufferCapacity = 64)
    val incomingMessages: SharedFlow<GenericServerMessage> = _incomingMessages.asSharedFlow()

    private val _connectionState = MutableSharedFlow<ConnectionState>(replay = 1)
    val connectionState: SharedFlow<ConnectionState> = _connectionState.asSharedFlow()

    private var heartbeatJob: Job? = null
    private var isManualClose = false

    fun connect(cwd: String = "", sessionPath: String? = null) {
        isManualClose = false
        _connectionState.tryEmit(ConnectionState.CONNECTING)

        val base = if (serverUrl.startsWith("http://")) {
            serverUrl.replace("http://", "ws://")
        } else if (serverUrl.startsWith("https://")) {
            serverUrl.replace("https://", "wss://")
        } else serverUrl

        val cleanBase = base.removeSuffix("/")
        val wsUrlBuilder = StringBuilder("$cleanBase/ws?")
        if (cwd.isNotEmpty()) wsUrlBuilder.append("cwd=").append(cwd).append("&")
        if (!sessionPath.isNullOrEmpty()) wsUrlBuilder.append("session=").append(sessionPath).append("&")
        if (!token.isNullOrEmpty()) wsUrlBuilder.append("token=").append(token).append("&")

        val request = Request.Builder()
            .url(wsUrlBuilder.toString().removeSuffix("&").removeSuffix("?"))
            .apply {
                if (!token.isNullOrEmpty()) {
                    header("Authorization", "Bearer $token")
                }
            }
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _connectionState.tryEmit(ConnectionState.CONNECTED)
                startHeartbeat()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val msg = json.decodeFromString<GenericServerMessage>(text)
                    _incomingMessages.tryEmit(msg)
                } catch (e: Exception) {
                    // Ignore parse error
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                stopHeartbeat()
                _connectionState.tryEmit(ConnectionState.DISCONNECTED)
                if (!isManualClose) {
                    scheduleReconnect(cwd, sessionPath)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                stopHeartbeat()
                _connectionState.tryEmit(ConnectionState.ERROR)
                if (!isManualClose) {
                    scheduleReconnect(cwd, sessionPath)
                }
            }
        })
    }

    fun sendRaw(jsonString: String) {
        webSocket?.send(jsonString)
    }

    private fun startHeartbeat() {
        stopHeartbeat()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(30000)
                sendRaw("""{"type":"ping"}""")
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private fun scheduleReconnect(cwd: String, sessionPath: String?) {
        scope.launch {
            delay(3000)
            if (!isManualClose) {
                connect(cwd, sessionPath)
            }
        }
    }

    fun disconnect() {
        isManualClose = true
        stopHeartbeat()
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        _connectionState.tryEmit(ConnectionState.DISCONNECTED)
    }
}
