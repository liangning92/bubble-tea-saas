#!/bin/bash
# ========================================================
# 📺 YOUME 电视大屏客户端 - APK 打包脚本
# ========================================================

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "🚀 开始构建 YOUME 智能电视沉浸式全屏 APK..."
echo "========================================================"

if command -v ./gradlew >/dev/null 2>&1; then
    ./gradlew assembleRelease
elif command -v gradle >/dev/null 2>&1; then
    gradle assembleRelease
else
    echo "提示: 当前系统未配置 Gradle/Android SDK。"
    echo "您可以使用 Android Studio 打开当前目录 [tv-android-app]，点击 Build -> Build APK(s)，即可直接生成 APK。"
fi

echo ""
echo "✅ 项目文件已就绪: $DIR"
