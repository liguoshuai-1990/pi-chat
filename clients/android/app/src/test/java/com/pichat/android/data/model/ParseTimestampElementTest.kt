package com.pichat.android.data.model

import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class ParseTimestampElementTest {

    @Test
    fun `null returns null`() {
        assertNull(parseTimestampElement(null))
    }

    @Test
    fun `Long epoch millis returns same value`() {
        val ts = 1725200000000L
        assertEquals(ts, parseTimestampElement(JsonPrimitive(ts)))
    }

    @Test
    fun `numeric string returns parsed Long`() {
        val ts = 1725200000000L
        assertEquals(ts, parseTimestampElement(JsonPrimitive(ts.toString())))
    }

    @Test
    fun `ISO 8601 string returns epoch millis`() {
        val iso = "2026-08-23T07:00:42.062Z"
        val expected = Instant.parse(iso).toEpochMilli()
        assertEquals(expected, parseTimestampElement(JsonPrimitive(iso)))
    }

    @Test
    fun `empty string returns null`() {
        assertNull(parseTimestampElement(JsonPrimitive("")))
    }

    @Test
    fun `non-numeric non-ISO string returns null`() {
        assertNull(parseTimestampElement(JsonPrimitive("not-a-timestamp")))
    }

    @Test
    fun `zero returns zero`() {
        assertEquals(0L, parseTimestampElement(JsonPrimitive(0L)))
    }

    @Test
    fun `negative Long returns same value`() {
        assertEquals(-1L, parseTimestampElement(JsonPrimitive(-1L)))
    }
}
