package com.pichat.android.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.time.Instant

@Serializable
data class SessionInfo(
    val file: String = "",
    val name: String = "",
    val id: String? = null,
    val sessionName: String? = null,
    val timestamp: Long? = null,
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
    val content: JsonElement? = null,
    val model: String? = null,
    val timestamp: JsonElement? = null,
    val toolCallId: JsonElement? = null,
    val toolName: String? = null,
    val stopReason: String? = null,
    val errorMessage: String? = null,
    val isError: Boolean? = null,
    val isSteer: Boolean? = null,
    val customType: String? = null
) {
    val parsedTimestamp: Long?
        get() = parseTimestampElement(timestamp)

    val toolCallIdString: String?
        get() = when (val tc = toolCallId) {
            is JsonPrimitive -> tc.content
            else -> null
        }
}

@Serializable
data class SessionEntry(
    val type: String = "",
    val id: JsonElement? = null,
    val parentId: JsonElement? = null,
    val timestamp: JsonElement? = null,
    val isSteer: Boolean? = null,
    val customType: String? = null,
    val message: SessionEntryMessage? = null
) {
    val idString: String?
        get() = when (val i = id) {
            is JsonPrimitive -> i.content
            else -> null
        }

    val parentIdString: String?
        get() = when (val p = parentId) {
            is JsonPrimitive -> p.content
            else -> null
        }

    val parsedTimestamp: Long?
        get() = parseTimestampElement(timestamp)
}

@Serializable
data class SessionDetailResponse(
    val entries: List<SessionEntry> = emptyList(),
    val sessionName: String? = null,
    val firstUser: String? = null,
    val model: ModelSetting? = null
)

/**
 * 宽松解析时间戳，安全支持：
 * 1. Long 数字（如 1725200000000）
 * 2. 数字字符串（如 "1725200000000"）
 * 3. ISO 8601 字符串（如 "2026-08-23T07:00:42.062Z"）
 */
fun parseTimestampElement(elem: JsonElement?): Long? {
    if (elem == null) return null
    if (elem is JsonPrimitive) {
        val longVal = elem.longOrNull
        if (longVal != null) return longVal
        val str = elem.content
        if (str.isEmpty()) return null
        val parsedNum = str.toLongOrNull()
        if (parsedNum != null) return parsedNum
        try {
            return Instant.parse(str).toEpochMilli()
        } catch (_: Exception) {}
    }
    return null
}
