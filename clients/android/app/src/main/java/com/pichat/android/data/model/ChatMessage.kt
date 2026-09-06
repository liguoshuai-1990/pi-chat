package com.pichat.android.data.model

import kotlinx.serialization.Serializable

enum class MessageRole {
    USER,
    ASSISTANT,
    SYSTEM,
    TOOL
}

enum class MessageStatus {
    SENDING,
    STREAMING,
    DONE,
    ERROR
}

enum class ToolCallState {
    RUNNING,
    DONE,
    ERROR
}

data class ToolCall(
    val id: String,
    val name: String,
    val args: String = "",
    val output: String = "",
    val state: ToolCallState = ToolCallState.RUNNING,
    val startedAt: Long = System.currentTimeMillis(),
    val endedAt: Long? = null,
    val durationMs: Long? = null
)

@Serializable
data class ImageAttachment(
    val type: String = "image",
    val data: String, // Base64 data URL
    val mimeType: String = "image/png"
)

data class ChatMessage(
    val id: String = java.util.UUID.randomUUID().toString(),
    val role: MessageRole,
    val content: String = "",
    val thinkingContent: String = "",
    val isThinking: Boolean = false,
    val thinkingStartedAt: Long? = null,
    val thinkingEndedAt: Long? = null,
    val thinkingDurationMs: Long? = null,
    val turnStartedAt: Long? = null,
    val turnDurationMs: Long? = null,
    val images: List<ImageAttachment> = emptyList(),
    val toolCalls: List<ToolCall> = emptyList(),
    val status: MessageStatus = MessageStatus.DONE,
    val timestamp: Long = System.currentTimeMillis()
)
