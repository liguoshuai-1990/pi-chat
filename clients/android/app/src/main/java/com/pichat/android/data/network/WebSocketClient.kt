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
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
    private val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
) {

    private val json = Json { ignoreUnknownKeys = true }

    private var webSocket: WebSocket? = null

    private val _incomingMessages = MutableSharedFlow<GenericServerMessage>(extraBufferCapacity = 64)
    val incomingMessages: SharedFlow<GenericServerMessage> = _incomingMessages.asSharedFlow()

    private val _connectionState = MutableSharedFlow<ConnectionState>(replay = 1)
    val connectionState: SharedFlow<ConnectionState> = _connectionState.asSharedFlow()

    private var heartbeatJob: Job? = null
    private var isManualClose = false
    private var reconnectAttempts = 0

    fun connect(cwd: String = "", sessionPath: String? = null) {
        // Close any existing connection to prevent resource leaks when reconnecting
        webSocket?.let { ws ->
            try { ws.close(1000, "Reconnecting") } catch (_: Exception) {}
        }
        webSocket = null
        stopHeartbeat()

        isManualClose = false
        _connectionState.tryEmit(ConnectionState.CONNECTING)

        val base = if (serverUrl.startsWith("http://")) {
            serverUrl.replace("http://", "ws://")
        } else if (serverUrl.startsWith("https://")) {
            serverUrl.replace("https://", "wss://")
        } else serverUrl

        val cleanBase = base.removeSuffix("/")
        val pathBase = if (cleanBase.endsWith("/ws")) cleanBase else "$cleanBase/ws"
        val wsUrlBuilder = StringBuilder("$pathBase?")
        if (cwd.isNotEmpty()) wsUrlBuilder.append("cwd=").append(java.net.URLEncoder.encode(cwd, "UTF-8")).append("&")
        if (!sessionPath.isNullOrEmpty()) wsUrlBuilder.append("session=").append(java.net.URLEncoder.encode(sessionPath, "UTF-8")).append("&")
        if (!token.isNullOrEmpty()) wsUrlBuilder.append("token=").append(java.net.URLEncoder.encode(token, "UTF-8")).append("&")

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
                reconnectAttempts = 0
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

    fun sendRaw(jsonString: String): Boolean {
        return webSocket?.send(jsonString) ?: false
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
            val baseDelay = (1000L * (1L shl minOf(reconnectAttempts, 5)))
            val jitter = (0..1000).random().toLong()
            val delayMs = minOf(30000L, baseDelay + jitter)
            reconnectAttempts++
            delay(delayMs)
            if (!isManualClose) {
                connect(cwd, sessionPath)
            }
        }
    }

    fun disconnect() {
        isManualClose = true
        reconnectAttempts = 0
        stopHeartbeat()
        webSocket?.close(1000, "User disconnected")
        webSocket = null
        _connectionState.tryEmit(ConnectionState.DISCONNECTED)
    }

    fun shutdown() {
        disconnect()
        okHttpClient.dispatcher.executorService.shutdown()
        okHttpClient.connectionPool.evictAll()
    }
}
