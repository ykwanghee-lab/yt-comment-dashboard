plugins { id("com.android.application") }

// 배포 주소: 웹앱이 올라간 곳. 바꾸면 strings.xml 의 launch_url/asset_statements 와 함께 바꿀 것.
val siteHost = "ykwanghee-lab.github.io"
val sitePath = "/yt-comment-dashboard/suneung-map/web/"

val keystoreFile = rootProject.file("upload.jks")
val keystorePassword: String = System.getenv("KEYSTORE_PASSWORD") ?: ""
val buildNumber: Int = (System.getenv("BUILD_NUMBER") ?: "1").toIntOrNull() ?: 1

android {
    namespace = "kr.suneungmap.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "kr.suneungmap.app"
        minSdk = 24
        targetSdk = 36
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
        manifestPlaceholders["hostName"] = siteHost
        manifestPlaceholders["pathPrefix"] = sitePath
    }

    signingConfigs {
        create("upload") {
            if (keystoreFile.exists()) {
                storeFile = keystoreFile
                storePassword = keystorePassword
                keyAlias = "upload"
                keyPassword = keystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystoreFile.exists()) signingConfigs.getByName("upload") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.6.2")
}
