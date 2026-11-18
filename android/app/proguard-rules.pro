# kotlinx.serialization: keep generated serializers of our models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keep,includedescriptorclasses class app.bandival.android.**$$serializer { *; }
-keepclassmembers class app.bandival.android.** {
    *** Companion;
}
-keepclasseswithmembers class app.bandival.android.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp optional platform classes
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
