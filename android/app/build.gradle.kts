plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "com.viddetect"
    compileSdk = 34
    ndkVersion = "24.0.8215888"

    defaultConfig {
        applicationId = "com.viddetect"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "2.0.0"

        ndk {
            abiFilters += listOf("arm64-v8a", "x86_64")
        }

        externalNativeBuild {
            cmake {
                arguments("-DANDROID_STL=c++_shared")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    aaptOptions {
        noCompress += listOf("node", "so")
    }

    sourceSets {
        getByName("main") {
            assets.srcDirs("src/main/assets")
            jniLibs.srcDirs("libnode/bin/")
        }
    }

    externalNativeBuild {
        cmake {
            path = file("CMakeLists.txt")
            version = "4.1.2"
        }
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.webkit:webkit:1.9.0")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.activity:activity-ktx:1.8.2")
}
