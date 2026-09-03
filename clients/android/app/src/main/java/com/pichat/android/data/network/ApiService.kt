package com.pichat.android.data.network

import com.pichat.android.data.model.ServerConfig
import com.pichat.android.data.model.SessionDetailResponse
import com.pichat.android.data.model.SessionsResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

class ApiService(
    baseUrl: String,
    private val token: String? = null
) {
    private val baseUrl: String = baseUrl.removeSuffix("/")
    private val client = OkHttpClient()
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun getConfig(): Result<ServerConfig> = withContext(Dispatchers.IO) {
        try {
            val url = "$baseUrl/api/config".let { if (!token.isNullOrEmpty()) "$it?token=$token" else it }
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
            var url = "$baseUrl/api/sessions?cwd=${java.net.URLEncoder.encode(cwd, "UTF-8")}"
            if (!token.isNullOrEmpty()) url += "&token=${java.net.URLEncoder.encode(token, "UTF-8")}"

            val request = Request.Builder()
                .url(url)
                .apply { if (!token.isNullOrEmpty()) header("Authorization", "Bearer $token") }
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.failure(Exception("HTTP ${response.code}"))
                val body = response.body?.string() ?: ""
                val sessions = json.decodeFromString<SessionsResponse>(body)
                Result.success(sessions)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getSession(file: String): Result<SessionDetailResponse> = withContext(Dispatchers.IO) {
        try {
            var url = "$baseUrl/api/session?file=${java.net.URLEncoder.encode(file, "UTF-8")}"
            if (!token.isNullOrEmpty()) url += "&token=${java.net.URLEncoder.encode(token, "UTF-8")}"

            val request = Request.Builder()
                .url(url)
                .apply { if (!token.isNullOrEmpty()) header("Authorization", "Bearer $token") }
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext Result.failure(Exception("HTTP ${response.code}"))
                val body = response.body?.string() ?: ""
                val sessionDetail = json.decodeFromString<SessionDetailResponse>(body)
                Result.success(sessionDetail)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
