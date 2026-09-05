import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.pichat.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pichat.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 21600
        versionName = "2.16.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    signingConfigs {
        create("release") {
            // Support proper release signing via environment variables or Gradle properties.
            // Falls back to debug keystore for local development builds, but emits a warning
            // so production releases are not accidentally signed with a debug key.
            val releaseStoreFile = System.getenv("PI_RELEASE_STORE_FILE")
                ?: gradleLocalProperty("piReleaseStoreFile")
            val releaseStorePassword = System.getenv("PI_RELEASE_STORE_PASSWORD")
                ?: gradleLocalProperty("piReleaseStorePassword")
            val releaseKeyAlias = System.getenv("PI_RELEASE_KEY_ALIAS")
                ?: gradleLocalProperty("piReleaseKeyAlias")
            val releaseKeyPassword = System.getenv("PI_RELEASE_KEY_PASSWORD")
                ?: gradleLocalProperty("piReleaseKeyPassword")

            if (!releaseStoreFile.isNullOrEmpty() && file(releaseStoreFile).exists()) {
                storeFile = file(releaseStoreFile)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            } else {
                // Fallback to debug keystore for local development
                val debugKeystore = file("${System.getProperty("user.home")}/.android/debug.keystore")
                if (debugKeystore.exists()) {
                    storeFile = debugKeystore
                    storePassword = "android"
                    keyAlias = "androiddebugkey"
                    keyPassword = "android"
                } else {
                    initWith(getByName("debug"))
                }
                logger.warn("WARNING: Release build using debug keystore. Set PI_RELEASE_STORE_FILE etc. for production signing.")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    applicationVariants.all {
        val variant = this
        variant.outputs.all {
            val output = this as? com.android.build.gradle.internal.api.BaseVariantOutputImpl
            val cleanVersion = variant.versionName.removeSuffix("-debug")
            output?.outputFileName = "pi-chat-v${cleanVersion}-${variant.buildType.name}.apk"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    // AndroidX & Lifecycle
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Compose BOM & Material 3
    implementation(platform("androidx.compose:compose-bom:2024.11.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Network & WebSocket: OkHttp & Retrofit & Kotlinx Serialization
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Debugging
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}

/**
 * Reads a property from local.properties (project root) if it exists.
 */
fun gradleLocalProperty(key: String): String? {
    val localProps = rootProject.file("local.properties")
    if (!localProps.exists()) return null
    val props = Properties()
    localProps.inputStream().use { props.load(it) }
    return props.getProperty(key)
}
