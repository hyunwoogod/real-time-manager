#!/bin/bash

PLIST_PATH="$HOME/Library/LaunchAgents/com.zipgamdok.baseball.plist"
PROJECT_DIR="/Users/hyunwoo/Desktop/실시간경기게임사업"

echo "🚀 집감독(Zipgamdok) 백그라운드 상시 서버 자동 실행(LaunchAgent) 등록 시작..."

mkdir -p "$HOME/Library/LaunchAgents"

cat << 'EOF' > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.zipgamdok.baseball</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/python3</string>
        <string>/Users/hyunwoo/Desktop/실시간경기게임사업/server.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/hyunwoo/Desktop/실시간경기게임사업</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/hyunwoo/Desktop/실시간경기게임사업/server.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/hyunwoo/Desktop/실시간경기게임사업/server_error.log</string>
</dict>
</plist>
EOF

# 기존 서비스 언로드 후 새 서비스 로드
launchctl unload "$PLIST_PATH" 2>/dev/null
launchctl load -w "$PLIST_PATH"

echo "✅ LaunchAgent 등록 완료! 맥북을 켜거나 부팅해도 백그라운드에서 상시 http://localhost:8000 접속 가능합니다."
