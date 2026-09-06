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
data class ModelInfo(
    val id: String,
    val name: String? = null,
    val provider: String? = null,
    val reasoning: Boolean = false,
    val supportsImages: Boolean = false,
    val inputModalities: List<String> = emptyList(),
    val contextWindow: Long? = null,
    val isDefault: Boolean = false
)

@Serializable
data class ModelSetting(
    val provider: String? = null,
    val id: String? = null,
    val thinkingLevel: String? = null,
    val source: String? = null
)

@Serializable
data class SessionEntryMessage(
    val role: String? = null,
    val content: kotlinx.serialization.json.JsonElement? = null,
    val model: String? = null,
    val timestamp: Long? = null,
    val toolCallId: String? = null,
    val toolName: String? = null
)

@Serializable
data class SessionEntry(
    val type: String,
    val id: String? = null,
    val parentId: String? = null,
    val message: SessionEntryMessage? = null
)

@Serializable
data class SessionDetailResponse(
    val entries: List<SessionEntry> = emptyList(),
    val sessionName: String? = null
)
