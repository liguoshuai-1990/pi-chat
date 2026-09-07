package com.pichat.android.data.protocol

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class GenericServerMessageTest {

    // --- messageText ---

    @Test
    fun `messageText from JsonPrimitive returns content`() {
        val msg = GenericServerMessage(type = "error", message = JsonPrimitive("Something went wrong"))
        assertEquals("Something went wrong", msg.messageText)
    }

    @Test
    fun `messageText from JsonObject with errorMessage returns errorMessage`() {
        val msg = GenericServerMessage(
            type = "error",
            message = buildJsonObject { put("errorMessage", "Detail error") }
        )
        assertEquals("Detail error", msg.messageText)
    }

    @Test
    fun `messageText from JsonObject with text returns text`() {
        val msg = GenericServerMessage(
            type = "info",
            message = buildJsonObject { put("text", "Hello world") }
        )
        assertEquals("Hello world", msg.messageText)
    }

    @Test
    fun `messageText from JsonObject with message returns message`() {
        val msg = GenericServerMessage(
            type = "info",
            message = buildJsonObject { put("message", "Nested msg") }
        )
        assertEquals("Nested msg", msg.messageText)
    }

    @Test
    fun `messageText null when message is null`() {
        val msg = GenericServerMessage(type = "ping")
        assertNull(msg.messageText)
    }

    // --- errorText ---

    @Test
    fun `errorText from JsonPrimitive returns content`() {
        val msg = GenericServerMessage(type = "error", error = JsonPrimitive("Disk full"))
        assertEquals("Disk full", msg.errorText)
    }

    @Test
    fun `errorText from JsonObject with message returns message`() {
        val msg = GenericServerMessage(
            type = "error",
            error = buildJsonObject { put("message", "OOM") }
        )
        assertEquals("OOM", msg.errorText)
    }

    @Test
    fun `errorText from JsonObject with errorMessage returns errorMessage`() {
        val msg = GenericServerMessage(
            type = "error",
            error = buildJsonObject { put("errorMessage", "Timeout") }
        )
        assertEquals("Timeout", msg.errorText)
    }

    @Test
    fun `errorText falls back to messageText when error is null`() {
        val msg = GenericServerMessage(type = "error", message = JsonPrimitive("Fallback msg"))
        assertEquals("Fallback msg", msg.errorText)
    }

    // --- toolCallIdString ---

    @Test
    fun `toolCallIdString from JsonPrimitive returns content`() {
        val msg = GenericServerMessage(type = "tool_call", toolCallId = JsonPrimitive("call_123"))
        assertEquals("call_123", msg.toolCallIdString)
    }

    @Test
    fun `toolCallIdString falls back to assistantMessageEvent idString`() {
        val event = AssistantMessageEvent(id = JsonPrimitive("call_456"))
        val msg = GenericServerMessage(type = "tool_call", assistantMessageEvent = event)
        assertEquals("call_456", msg.toolCallIdString)
    }

    @Test
    fun `toolCallIdString null when both toolCallId and event are null`() {
        val msg = GenericServerMessage(type = "tool_call")
        assertNull(msg.toolCallIdString)
    }

    // --- codeString ---

    @Test
    fun `codeString from JsonPrimitive returns content`() {
        val msg = GenericServerMessage(type = "response", code = JsonPrimitive("200"))
        assertEquals("200", msg.codeString)
    }

    @Test
    fun `codeString null when code is null`() {
        val msg = GenericServerMessage(type = "response")
        assertNull(msg.codeString)
    }

    // --- idString ---

    @Test
    fun `idString from JsonPrimitive returns content`() {
        val msg = GenericServerMessage(type = "msg", id = JsonPrimitive("msg_001"))
        assertEquals("msg_001", msg.idString)
    }

    @Test
    fun `idString null when id is null`() {
        val msg = GenericServerMessage(type = "msg")
        assertNull(msg.idString)
    }

    // --- parsedTimestamp ---

    @Test
    fun `parsedTimestamp from Long`() {
        val ts = 1725200000000L
        val msg = GenericServerMessage(type = "msg", timestamp = JsonPrimitive(ts))
        assertEquals(ts, msg.parsedTimestamp)
    }

    @Test
    fun `parsedTimestamp from ISO 8601 string`() {
        val iso = "2026-08-23T07:00:42.062Z"
        val expected = Instant.parse(iso).toEpochMilli()
        val msg = GenericServerMessage(type = "msg", timestamp = JsonPrimitive(iso))
        assertEquals(expected, msg.parsedTimestamp)
    }

    @Test
    fun `parsedTimestamp null when timestamp is null`() {
        val msg = GenericServerMessage(type = "msg")
        assertNull(msg.parsedTimestamp)
    }

    // --- AssistantMessageEvent.idString ---

    @Test
    fun `AssistantMessageEvent idString from JsonPrimitive`() {
        val event = AssistantMessageEvent(id = JsonPrimitive("evt_789"))
        assertEquals("evt_789", event.idString)
    }

    @Test
    fun `AssistantMessageEvent idString null when id is null`() {
        val event = AssistantMessageEvent()
        assertNull(event.idString)
    }
}
