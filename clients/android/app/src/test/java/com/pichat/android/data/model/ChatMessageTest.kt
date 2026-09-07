package com.pichat.android.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMessageTest {

    @Test
    fun `default id is auto-generated UUID`() {
        val msg = ChatMessage(role = MessageRole.USER, content = "test")
        assertNotNull(msg.id)
        assertTrue(msg.id.isNotEmpty())
    }

    @Test
    fun `default status is DONE`() {
        val msg = ChatMessage(role = MessageRole.ASSISTANT, content = "hello")
        assertEquals(MessageStatus.DONE, msg.status)
    }

    @Test
    fun `default toolCalls is empty list`() {
        val msg = ChatMessage(role = MessageRole.ASSISTANT, content = "hi")
        assertTrue(msg.toolCalls.isEmpty())
    }

    @Test
    fun `default images is empty list`() {
        val msg = ChatMessage(role = MessageRole.USER, content = "hi")
        assertTrue(msg.images.isEmpty())
    }

    @Test
    fun `default isSteer is false`() {
        val msg = ChatMessage(role = MessageRole.USER, content = "hi")
        assertFalse(msg.isSteer)
    }

    @Test
    fun `default isThinking is false`() {
        val msg = ChatMessage(role = MessageRole.ASSISTANT, content = "hi")
        assertFalse(msg.isThinking)
    }

    @Test
    fun `two messages with same fields but auto-generated ids are not equal`() {
        val msg1 = ChatMessage(role = MessageRole.USER, content = "test")
        val msg2 = ChatMessage(role = MessageRole.USER, content = "test")
        assertNotEquals(msg1, msg2) // different UUIDs
    }

    @Test
    fun `two messages with explicit same id and fields are equal`() {
        val id = "fixed-id-123"
        val ts = 1000L
        val msg1 = ChatMessage(id = id, role = MessageRole.USER, content = "test", timestamp = ts)
        val msg2 = ChatMessage(id = id, role = MessageRole.USER, content = "test", timestamp = ts)
        assertEquals(msg1, msg2)
    }

    @Test
    fun `copy with different content creates new instance`() {
        val msg = ChatMessage(role = MessageRole.ASSISTANT, content = "original")
        val copied = msg.copy(content = "modified")
        assertEquals("modified", copied.content)
        assertEquals(msg.id, copied.id)
        assertEquals(msg.role, copied.role)
    }

    @Test
    fun `MessageRole enum has exactly four values`() {
        assertEquals(4, MessageRole.values().size)
        assertEquals(MessageRole.USER, MessageRole.valueOf("USER"))
        assertEquals(MessageRole.ASSISTANT, MessageRole.valueOf("ASSISTANT"))
        assertEquals(MessageRole.SYSTEM, MessageRole.valueOf("SYSTEM"))
        assertEquals(MessageRole.TOOL, MessageRole.valueOf("TOOL"))
    }

    @Test
    fun `MessageStatus enum has exactly four values`() {
        assertEquals(4, MessageStatus.values().size)
        assertEquals(MessageStatus.SENDING, MessageStatus.valueOf("SENDING"))
        assertEquals(MessageStatus.STREAMING, MessageStatus.valueOf("STREAMING"))
        assertEquals(MessageStatus.DONE, MessageStatus.valueOf("DONE"))
        assertEquals(MessageStatus.ERROR, MessageStatus.valueOf("ERROR"))
    }

    @Test
    fun `ToolCallState enum has exactly three values`() {
        assertEquals(3, ToolCallState.values().size)
        assertEquals(ToolCallState.RUNNING, ToolCallState.valueOf("RUNNING"))
        assertEquals(ToolCallState.DONE, ToolCallState.valueOf("DONE"))
        assertEquals(ToolCallState.ERROR, ToolCallState.valueOf("ERROR"))
    }
}

class ToolCallTest {

    @Test
    fun `default state is RUNNING`() {
        val tc = ToolCall(id = "tc1", name = "read_file")
        assertEquals(ToolCallState.RUNNING, tc.state)
    }

    @Test
    fun `default args and output are empty strings`() {
        val tc = ToolCall(id = "tc1", name = "write_file")
        assertEquals("", tc.args)
        assertEquals("", tc.output)
    }

    @Test
    fun `default endedAt and durationMs are null`() {
        val tc = ToolCall(id = "tc1", name = "bash")
        assertNull(tc.endedAt)
        assertNull(tc.durationMs)
    }

    @Test
    fun `ToolCall with all fields specified`() {
        val tc = ToolCall(
            id = "call_001",
            name = "read_file",
            args = "{\"path\":\"/tmp\"}",
            output = "file content",
            state = ToolCallState.DONE,
            startedAt = 1000L,
            endedAt = 2000L,
            durationMs = 1000L
        )
        assertEquals("call_001", tc.id)
        assertEquals("read_file", tc.name)
        assertEquals("{\"path\":\"/tmp\"}", tc.args)
        assertEquals("file content", tc.output)
        assertEquals(ToolCallState.DONE, tc.state)
        assertEquals(1000L, tc.startedAt)
        assertEquals(2000L, tc.endedAt)
        assertEquals(1000L, tc.durationMs)
    }

    @Test
    fun `two ToolCalls with same fields are equal`() {
        val tc1 = ToolCall(id = "tc1", name = "bash", args = "ls", startedAt = 100L)
        val tc2 = ToolCall(id = "tc1", name = "bash", args = "ls", startedAt = 100L)
        assertEquals(tc1, tc2)
    }
}

class ImageAttachmentTest {

    @Test
    fun `default type is image`() {
        val img = ImageAttachment(data = "base64")
        assertEquals("image", img.type)
    }

    @Test
    fun `default mimeType is image png`() {
        val img = ImageAttachment(data = "base64")
        assertEquals("image/png", img.mimeType)
    }

    @Test
    fun `custom mimeType preserved`() {
        val img = ImageAttachment(data = "base64", mimeType = "image/jpeg")
        assertEquals("image/jpeg", img.mimeType)
    }
}
