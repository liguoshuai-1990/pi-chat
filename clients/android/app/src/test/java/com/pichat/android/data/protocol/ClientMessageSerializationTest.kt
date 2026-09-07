package com.pichat.android.data.protocol

import com.pichat.android.data.model.ImageAttachment
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ClientMessageSerializationTest {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    // --- PromptMessage ---

    @Test
    fun `PromptMessage serializes with correct type and message`() {
        val msg = PromptMessage(message = "hello")
        val str = json.encodeToString(PromptMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"prompt\""))
        assertTrue(str.contains("\"message\":\"hello\""))
    }

    @Test
    fun `PromptMessage serializes with images`() {
        val msg = PromptMessage(
            message = "describe this",
            images = listOf(ImageAttachment(data = "base64data", mimeType = "image/jpeg"))
        )
        val str = json.encodeToString(PromptMessage.serializer(), msg)
        assertTrue(str.contains("\"images\""))
        assertTrue(str.contains("base64data"))
        assertTrue(str.contains("image/jpeg"))
    }

    @Test
    fun `PromptMessage deserializes correctly`() {
        val str = """{"type":"prompt","message":"test input","images":[]}"""
        val msg = json.decodeFromString(PromptMessage.serializer(), str)
        assertEquals("prompt", msg.type)
        assertEquals("test input", msg.message)
        assertTrue(msg.images.isEmpty())
    }

    @Test
    fun `PromptMessage round-trip preserves all fields`() {
        val original = PromptMessage(message = "round trip", images = listOf(ImageAttachment(data = "abc")))
        val str = json.encodeToString(PromptMessage.serializer(), original)
        val decoded = json.decodeFromString(PromptMessage.serializer(), str)
        assertEquals(original.message, decoded.message)
        assertEquals(original.type, decoded.type)
        assertEquals(original.images.size, decoded.images.size)
        assertEquals(original.images[0].data, decoded.images[0].data)
    }

    // --- SteerMessage ---

    @Test
    fun `SteerMessage serializes with correct type`() {
        val msg = SteerMessage(message = "steer text")
        val str = json.encodeToString(SteerMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"steer\""))
        assertTrue(str.contains("\"message\":\"steer text\""))
    }

    @Test
    fun `SteerMessage deserializes correctly`() {
        val str = """{"type":"steer","message":"redirect"}"""
        val msg = json.decodeFromString(SteerMessage.serializer(), str)
        assertEquals("steer", msg.type)
        assertEquals("redirect", msg.message)
    }

    // --- AbortMessage ---

    @Test
    fun `AbortMessage serializes with correct type`() {
        val msg = AbortMessage()
        val str = json.encodeToString(AbortMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"abort\""))
    }

    @Test
    fun `AbortMessage deserializes correctly`() {
        val str = """{"type":"abort"}"""
        val msg = json.decodeFromString(AbortMessage.serializer(), str)
        assertEquals("abort", msg.type)
    }

    // --- AuthMessage ---

    @Test
    fun `AuthMessage serializes with token`() {
        val msg = AuthMessage(token = "secret-token")
        val str = json.encodeToString(AuthMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"auth\""))
        assertTrue(str.contains("\"token\":\"secret-token\""))
    }

    @Test
    fun `AuthMessage deserializes correctly`() {
        val str = """{"type":"auth","token":"abc123"}"""
        val msg = json.decodeFromString(AuthMessage.serializer(), str)
        assertEquals("auth", msg.type)
        assertEquals("abc123", msg.token)
    }

    // --- PingMessage ---

    @Test
    fun `PingMessage serializes with type ping`() {
        val msg = PingMessage(timestamp = 1000L)
        val str = json.encodeToString(PingMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"ping\""))
        assertTrue(str.contains("\"timestamp\":1000"))
    }

    @Test
    fun `PingMessage deserializes correctly`() {
        val str = """{"type":"ping","timestamp":12345}"""
        val msg = json.decodeFromString(PingMessage.serializer(), str)
        assertEquals("ping", msg.type)
        assertEquals(12345L, msg.timestamp)
    }

    // --- NewSessionMessage ---

    @Test
    fun `NewSessionMessage serializes and deserializes`() {
        val msg = NewSessionMessage()
        val str = json.encodeToString(NewSessionMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"new_session\""))
        val decoded = json.decodeFromString(NewSessionMessage.serializer(), str)
        assertEquals("new_session", decoded.type)
    }

    // --- SwitchSessionMessage ---

    @Test
    fun `SwitchSessionMessage serializes with sessionPath`() {
        val msg = SwitchSessionMessage(sessionPath = "/path/to/session")
        val str = json.encodeToString(SwitchSessionMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"switch_session\""))
        assertTrue(str.contains("/path/to/session"))
    }

    @Test
    fun `SwitchSessionMessage deserializes correctly`() {
        val str = """{"type":"switch_session","sessionPath":"/home/.pi/sess.json"}"""
        val msg = json.decodeFromString(SwitchSessionMessage.serializer(), str)
        assertEquals("switch_session", msg.type)
        assertEquals("/home/.pi/sess.json", msg.sessionPath)
    }

    // --- SetModelMessage ---

    @Test
    fun `SetModelMessage serializes with provider and modelId`() {
        val msg = SetModelMessage(provider = "openai", modelId = "gpt-4")
        val str = json.encodeToString(SetModelMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"set_model\""))
        assertTrue(str.contains("\"provider\":\"openai\""))
        assertTrue(str.contains("\"modelId\":\"gpt-4\""))
    }

    @Test
    fun `SetModelMessage deserializes correctly`() {
        val str = """{"type":"set_model","provider":"anthropic","modelId":"claude-3"}"""
        val msg = json.decodeFromString(SetModelMessage.serializer(), str)
        assertEquals("set_model", msg.type)
        assertEquals("anthropic", msg.provider)
        assertEquals("claude-3", msg.modelId)
    }

    // --- SetThinkingLevelMessage ---

    @Test
    fun `SetThinkingLevelMessage serializes and deserializes`() {
        val msg = SetThinkingLevelMessage(level = "high")
        val str = json.encodeToString(SetThinkingLevelMessage.serializer(), msg)
        assertTrue(str.contains("\"type\":\"set_thinking_level\""))
        assertTrue(str.contains("\"level\":\"high\""))
        val decoded = json.decodeFromString(SetThinkingLevelMessage.serializer(), str)
        assertEquals("high", decoded.level)
    }
}
