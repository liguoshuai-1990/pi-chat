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
    val images: List<ImageAttachment> = emptyList(),
    val status: MessageStatus = MessageStatus.DONE,
    val timestamp: Long = System.currentTimeMillis()
)
