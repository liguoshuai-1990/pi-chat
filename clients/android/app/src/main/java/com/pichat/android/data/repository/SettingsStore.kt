package com.pichat.android.data.repository

import android.content.Context
import android.content.SharedPreferences

/**
 * Persists user-facing backend configuration (gateway URL + auth token) so the
 * mobile app can point at any Pi Gateway server, matching the web client's
 * ability to switch servers.
 */
class SettingsStore(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("pi_chat_settings", Context.MODE_PRIVATE)

    fun getServerUrl(): String =
        prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL)?.trim()?.takeIf { it.isNotEmpty() }
            ?: DEFAULT_SERVER_URL

    fun getAuthToken(): String? =
        prefs.getString(KEY_AUTH_TOKEN, null)?.trim()?.takeIf { it.isNotEmpty() }

    fun getCwd(): String =
        prefs.getString(KEY_CWD, "") ?: ""

    fun save(serverUrl: String, authToken: String?, cwd: String = "") {
        prefs.edit()
            .putString(KEY_SERVER_URL, serverUrl.trim())
            .putString(KEY_AUTH_TOKEN, authToken?.trim())
            .putString(KEY_CWD, cwd.trim())
            .apply()
    }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_CWD = "cwd"

        // Emulator-friendly loopback default; real devices should override via settings.
        const val DEFAULT_SERVER_URL = "http://10.0.2.2:3000"
    }
}