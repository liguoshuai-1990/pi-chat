package com.pichat.android.data.repository

import android.content.Context
import android.content.SharedPreferences

/**
 * Persists user-facing backend configuration (gateway URL + auth token) so the
 * mobile app can point at any Pi Gateway server, matching the web client's
 * ability to switch servers.
 *
 * SECURITY NOTE (P1-6): The auth token is stored in plaintext SharedPreferences.
 * On rooted devices or via backup extraction, this token could be read by malicious apps.
 * For production use, consider migrating to EncryptedSharedPreferences (Jetpack Security library):
 *   implementation "androidx.security:security-crypto:1.1.0-alpha06"
 *   val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
 *   val prefs = EncryptedSharedPreferences.create(context, "pi_chat_settings", masterKey, ...)
 * For now, this is acceptable for development/LAN use but should be hardened before production.
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