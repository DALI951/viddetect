@echo off
cd /d "%~dp0"

REM Download yt-dlp Android binaries
echo Downloading yt-dlp for Android...
if not exist "app-bin\yt-dlp_arm" (
  curl -L -o "app-bin\yt-dlp_arm" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_arm"
)
if not exist "app-bin\yt-dlp_arm64" (
  curl -L -o "app-bin\yt-dlp_arm64" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_arm64"
)

REM Download ffmpeg Android builds
echo Downloading ffmpeg for Android...
if not exist "app-bin\ffmpeg-arm64.tar.gz" (
  curl -L -o "app-bin\ffmpeg-arm64.tar.gz" "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.gz"
  tar -xzf "app-bin\ffmpeg-arm64.tar.gz" -C "app-bin" --strip-components=2 "ffmpeg-master-latest-linuxarm64-gpl/bin/ffmpeg"
  move "app-bin\ffmpeg" "app-bin\ffmpeg_arm64"
)

REM Build APK
echo Building APK...
gradlew assembleRelease

echo Done! APK at app\build\outputs\apk\release\
pause