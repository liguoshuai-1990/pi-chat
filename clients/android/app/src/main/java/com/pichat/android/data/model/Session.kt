package com.pichat.android.data.model

import kotlinx.serialization.Serializable

@Serializable
data class SessionInfo(
    val file: String,
    val name: String,
    val id: String? = null,
    val sessionName: String? = null,
    val timestamp: String? = null,
    val firstUser: String? = null,
    val messageCount: Int = 0
)

@Serializable
data class SessionsResponse(
    val cwd: String,
    val sessions: List<SessionInfo>
)

@Serializable
data class ServerConfig(
    val home: String,
    val serverCwd: String,
    val version: String,
    val authRequired: Boolean = false,
    val defaultModel: ModelSetting? = null
)

@Serializable
data class ModelSetting(
    val provider: String? = null,
    val id: String? = null,
    val thinkingLevel: String? = null,
    val source: String? = null
)
