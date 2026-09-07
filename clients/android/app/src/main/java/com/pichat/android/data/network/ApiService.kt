package com.pichat.android.data.network

import com.pichat.android.data.model.ServerConfig
import com.pichat.android.data.model.SessionDetailResponse
import com.pichat.android.data.model.SessionEntry
import com.pichat.android.data.model.SessionInfo
import com.pichat.android.data.model.SessionsResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class ApiService(
    baseUrl: String,
    private val token: String? = null
) {
    private val baseUrl: String = baseUrl.removeSuffix("/")
    // PE-5: Use shared client instance to avoid connection pool/thread pool leaks
    private val client = Companion.sharedClient
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    fun close() {
        // PE-5: Don't shut down the shared client — it's reused across instances
    }

    companion object {
        // PE-5: Single shared OkHttpClient to avoid per-instance thread/connection pool leaks
        private val sharedClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .pingInterval(25, TimeUnit.SECONDS)
            .build()
    }

    suspend fun getConfig(): Result<ServerConfig> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/config"
            val request = Request.Builder()
                .url(url)
                .apply { if (!token.isNullOrEmpty()) header("Authorization", "Bearer $token") }
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.failure(Exception("HTTP ${response.code}"))
                val body = response.body?.string() ?: ""
                val config = json.decodeFromString<ServerConfig>(body)
                Result.success(config)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSessions(cwd: String = ""): Result<SessionsResponse> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/sessions?cwd=${java.net.URLEncoder.encode(cwd, "UTF-8")}"
            val request = Request.Builder()
                .url(url)
                .apply { if (!token.isNullOrEmpty()) header("Authorization", "Bearer $token") }
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.failure(Exception("HTTP ${response.code}"))
                val body = response.body?.string() ?: ""
                try {
                    val sessions = json.decodeFromString<SessionsResponse>(body)
                    Result.success(sessions)
                } catch (e: Exception) {
                    // Fallback: parse sessions individually, skipping any that fail
                    val fallback = parseSessionsLenient(body)
                    if (fallback != null) {
                        Result.success(fallback)
                    } else {
                        Result.failure(e)
                    }
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseSessionsLenient(body: String): SessionsResponse? {
        try {
            val element = json.parseToJsonElement(body)
            val obj = element.jsonObject
            val cwd = obj["cwd"]?.jsonPrimitive?.contentOrNull ?: ""
            val sessionsArr = obj["sessions"]?.jsonArray ?: return null
            val sessions = mutableListOf<SessionInfo>()
            for (item in sessionsArr) {
                try {
                    val s = json.decodeFromJsonElement<SessionInfo>(item)
                    sessions.add(s)
                } catch (_: Exception) {
                    // Skip this session — one bad entry should not break the whole list
                }
            }
            return SessionsResponse(cwd = cwd, sessions = sessions)
        } catch (_: Exception) {
            return null
        }
    }

    suspend fun getSession(file: String): Result<SessionDetailResponse> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/session?file=${java.net.URLEncoder.encode(file, "UTF-8")}"
            val request = Request.Builder()
                .url(url)
                .apply { if (!token.isNullOrEmpty()) header("Authorization", "Bearer $token") }
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.failure(Exception("HTTP ${response.code}"))
                val body = response.body?.string() ?: ""
                try {
                    val sessionDetail = json.decodeFromString<SessionDetailResponse>(body)
                    Result.success(sessionDetail)
                } catch (e: Exception) {
                    val fallback = parseSessionDetailLenient(body)
                    if (fallback != null) {
                        Result.success(fallback)
                    } else {
                        Result.failure(e)
                    }
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun parseSessionDetailLenient(body: String): SessionDetailResponse? {
        try {
            val element = json.parseToJsonElement(body)
            val obj = element.jsonObject
            val sessionName = obj["sessionName"]?.jsonPrimitive?.contentOrNull
            val firstUser = obj["firstUser"]?.jsonPrimitive?.contentOrNull
            val entriesArr = obj["entries"]?.jsonArray ?: return null
            val entries = mutableListOf<SessionEntry>()
            for (item in entriesArr) {
                try {
                    val entry = json.decodeFromJsonElement<SessionEntry>(item)
                    entries.add(entry)
                } catch (_: Exception) {
                    // Skip malformed entry to protect whole chat transcript
                }
            }
            return SessionDetailResponse(
                entries = entries,
                sessionName = sessionName,
                firstUser = firstUser
            )
        } catch (_: Exception) {
            return null
        }
    }

    suspend fun deleteSession(file: String): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/session?file=${java.net.URLEncoder.encode(file, "UTF-8")}"
            val request = Request.Builder()
                .url(url)
                .delete()
                .apply { if (!token.isNullOrEmpty()) header("Authorization", "Bearer $token") }
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.failure(Exception("HTTP ${response.code}"))
                Result.success(true)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
