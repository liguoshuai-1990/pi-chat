package com.pichat.android.data.network

import com.pichat.android.data.model.ServerConfig
import com.pichat.android.data.model.SessionsResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request

class ApiService(
    private val baseUrl: String,
    private val token: String? = null
) {
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
            var url = "$baseUrl/api/sessions?cwd=$cwd"
            if (!token.isNullOrEmpty()) url += "&token=$token"

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
}
