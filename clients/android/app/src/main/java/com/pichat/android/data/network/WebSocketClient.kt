package com.pichat.android.data.network

import com.pichat.android.data.protocol.GenericServerMessage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.json.Json
import okhttp3.*
import java.util.concurrent.TimeUnit
import android.util.Log

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
        .connectTimeout(15, TimeUnit.SECONDS)
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
    private var reconnectJob: Job? = null
    private var isManualClose = false
    private var reconnectAttempts = 0

    // Monotonically increasing generation ID to invalidate callbacks from stale sockets
    private var currentGeneration = 0L

    private var activeCwd: String = ""
    private var activeSessionPath: String? = null

    fun updateSession(sessionPath: String?) {
        activeSessionPath = sessionPath
    }

    fun updateCwd(cwd: String) {
        activeCwd = cwd
    }

    fun connect(cwd: String = activeCwd, sessionPath: String? = activeSessionPath) {
        activeCwd = cwd
        activeSessionPath = sessionPath

        // Invalidate any callbacks from previous connections
        val generation = ++currentGeneration
        cancelReconnect()

        // Close existing connection gracefully without triggering stale reconnect
        val oldWs = webSocket
        webSocket = null
        stopHeartbeat()

        if (oldWs != null) {
            try { oldWs.close(1000, "Reconnecting") } catch (_: Exception) {}
        }

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
        if (activeCwd.isNotEmpty()) wsUrlBuilder.append("cwd=").append(java.net.URLEncoder.encode(activeCwd, "UTF-8")).append("&")
        if (!activeSessionPath.isNullOrEmpty()) wsUrlBuilder.append("session=").append(java.net.URLEncoder.encode(activeSessionPath, "UTF-8")).append("&")

        val request = Request.Builder()
            .url(wsUrlBuilder.toString().removeSuffix("&").removeSuffix("?"))
            .apply {
                if (!token.isNullOrEmpty()) {
                    header("Authorization", "Bearer $token")
                }
            }
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                if (generation != currentGeneration) {
                    try { ws.close(1000, "Stale generation") } catch (_: Exception) {}
                    return
                }
                reconnectAttempts = 0
                _connectionState.tryEmit(ConnectionState.CONNECTED)
                startHeartbeat(generation)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                if (generation != currentGeneration) return
                try {
                    val msg = json.decodeFromString<GenericServerMessage>(text)
                    if (!_incomingMessages.tryEmit(msg)) {
                        Log.w("WebSocketClient", "Incoming message buffer full, dropping message of type=${msg.type}")
                    }
                } catch (e: Exception) {
                    Log.w("WebSocketClient", "Failed to parse WebSocket message: ${e.message}")
                }
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                if (generation != currentGeneration) return
                stopHeartbeat()
                _connectionState.tryEmit(ConnectionState.DISCONNECTED)
                if (!isManualClose && code != 4401) {
                    scheduleReconnect()
                }
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                if (generation != currentGeneration) return
                stopHeartbeat()
                _connectionState.tryEmit(ConnectionState.ERROR)
                if (!isManualClose) {
                    scheduleReconnect()
                }
            }
        })
    }

    fun sendRaw(jsonString: String): Boolean {
        return try {
            webSocket?.send(jsonString) ?: false
        } catch (_: Exception) {
            false
        }
    }

    private fun startHeartbeat(generation: Long) {
        stopHeartbeat()
        heartbeatJob = scope.launch {
            while (isActive && generation == currentGeneration) {
                delay(30000)
                if (generation == currentGeneration && !isManualClose) {
                    sendRaw("""{"type":"ping"}""")
                }
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private fun cancelReconnect() {
        reconnectJob?.cancel()
        reconnectJob = null
    }

    private fun scheduleReconnect() {
        cancelReconnect()
        reconnectJob = scope.launch {
            val baseDelay = (1000L * (1L shl minOf(reconnectAttempts, 5)))
            val jitter = (0..1000).random().toLong()
            val delayMs = minOf(30000L, baseDelay + jitter)
            reconnectAttempts++
            delay(delayMs)
            if (!isManualClose && isActive) {
                connect(activeCwd, activeSessionPath)
            }
        }
    }

    fun disconnect() {
        isManualClose = true
        reconnectAttempts = 0
        currentGeneration++
        cancelReconnect()
        stopHeartbeat()
        try { webSocket?.close(1000, "User disconnected") } catch (_: Exception) {}
        webSocket = null
        _connectionState.tryEmit(ConnectionState.DISCONNECTED)
    }

    fun shutdown() {
        disconnect()
        okHttpClient.dispatcher.executorService.shutdown()
        okHttpClient.connectionPool.evictAll()
    }
}
