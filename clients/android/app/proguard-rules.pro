# ProGuard / R8 Hardening & Obfuscation Rules for Pi-Chat Android

# Keep Kotlinx Serialization Models & Serializers
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
    @kotlinx.serialization.Serializable <fields>;
}
-keep class kotlinx.serialization.** { *; }
-keep class com.pichat.android.data.model.** { *; }
-keepclassmembers class com.pichat.android.data.model.** {
    *** Companion;
    *** $serializer;
}

# OkHttp & WebSocket
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** { *; }

# AndroidX Lifecycle & Compose ViewModels
-keepclassmembers class * extends androidx.lifecycle.ViewModel {
    <init>(...);
}
-keep class androidx.compose.** { *; }
