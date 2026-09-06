package com.pichat.android.data.protocol

import com.pichat.android.data.model.ImageAttachment
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Serializable
sealed class ClientMessage {
    abstract val type: String
}

@Serializable
data class PromptMessage(
    override val type: String = "prompt",
    val message: String,
    val images: List<ImageAttachment> = emptyList()
) : ClientMessage()

@Serializable
data class SteerMessage(
    override val type: String = "steer",
    val message: String
) : ClientMessage()

@Serializable
data class AbortMessage(
    override val type: String = "abort"
) : ClientMessage()

@Serializable
data class AuthMessage(
    override val type: String = "auth",
    val token: String
) : ClientMessage()

@Serializable
data class PingMessage(
    override val type: String = "ping",
    val timestamp: Long = System.currentTimeMillis()
) : ClientMessage()

@Serializable
data class NewSessionMessage(
    override val type: String = "new_session"
) : ClientMessage()

@Serializable
data class SwitchSessionMessage(
    override val type: String = "switch_session",
    val sessionPath: String
) : ClientMessage()

@Serializable
data class SetModelMessage(
    override val type: String = "set_model",
    val provider: String,
    val modelId: String
) : ClientMessage()

@Serializable
data class SetThinkingLevelMessage(
    override val type: String = "set_thinking_level",
    val level: String
) : ClientMessage()

@Serializable
data class AssistantMessageEvent(
    val type: String? = null,
    val delta: String? = null,
    val content: JsonElement? = null,
    val toolCall: JsonElement? = null,
    val id: JsonElement? = null,
    val toolName: String? = null
) {
    val idString: String?
        get() = when (val i = id) {
            is JsonPrimitive -> i.content
            else -> null
        }
}

@Serializable
data class GenericServerMessage(
    val type: String,
    val assistantMessageEvent: AssistantMessageEvent? = null,
    val delta: String? = null,
    val content: JsonElement? = null,
    val message: JsonElement? = null,
    val isThinking: Boolean? = null,
    val isSteer: Boolean? = null,
    val status: String? = null,
    val id: JsonElement? = null,
    val success: Boolean? = null,
    val code: JsonElement? = null,
    val count: Int? = null,
    val streaming: Boolean? = null,
    val state: String? = null,
    val overflowed: Boolean? = null,
    val data: JsonElement? = null,
    val error: JsonElement? = null,
    val command: String? = null,
    val toolCallId: JsonElement? = null,
    val toolName: String? = null,
    val args: JsonElement? = null,
    val result: JsonElement? = null,
    val partialResult: JsonElement? = null,
    val isError: Boolean? = null,
    val sessionFile: String? = null,
    val sessionPath: String? = null,
    val model: JsonElement? = null
) {
    val messageText: String?
        get() = when (val m = message) {
            is JsonPrimitive -> m.content
            is JsonObject -> (m["errorMessage"] as? JsonPrimitive)?.content
                ?: (m["text"] as? JsonPrimitive)?.content
                ?: (m["message"] as? JsonPrimitive)?.content
            else -> null
        }

    val errorText: String?
        get() = when (val e = error) {
            is JsonPrimitive -> e.content
            is JsonObject -> (e["message"] as? JsonPrimitive)?.content
                ?: (e["errorMessage"] as? JsonPrimitive)?.content
            else -> messageText
        }

    val toolCallIdString: String?
        get() = when (val tc = toolCallId) {
            is JsonPrimitive -> tc.content
            else -> assistantMessageEvent?.idString
        }

    val messageObject: JsonObject?
        get() = message as? JsonObject

    val codeString: String?
        get() = when (val c = code) {
            is JsonPrimitive -> c.content
            else -> null
        }

    val idString: String?
        get() = when (val i = id) {
            is JsonPrimitive -> i.content
            else -> null
        }
}
