#!/bin/bash
# MOA 실험 앱 — 처음 한 번만 실행 (Mac)
# 더블클릭하면 터미널이 열리고 자동으로 설치합니다. 다시 실행해도 안전합니다.

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/moa-app"

pause_exit() {
  echo
  read -n 1 -s -r -p "아무 키나 누르면 창을 닫습니다."
  echo
  exit "${1:-0}"
}
fail() {
  echo
  echo "❌ 설치 중 문제가 생겼습니다: $1"
  echo "   이 창의 내용을 캡처해서 보내 주세요."
  pause_exit 1
}

clear
echo "=============================================="
echo "   MOA 실험 앱 설치 (처음 한 번만)"
echo "=============================================="
echo

# 0. Node.js 확인
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 아직 설치되어 있지 않습니다."
  echo "→ 지금 열리는 웹페이지에서 'LTS' 버전의 macOS 설치 프로그램(.pkg)을 받아 설치한 뒤,"
  echo "  이 파일(1-setup.command)을 다시 더블클릭해 주세요."
  open "https://nodejs.org/ko/download"
  pause_exit 1
fi
echo "✔ Node.js $(node -v) 확인"

[ -f "$HERE/App.js" ] || fail "같은 폴더에 App.js가 없습니다. 압축을 푼 폴더 안에서 실행해 주세요."

# 1. Expo 프로젝트 만들기
if [ ! -f "$APP_DIR/package.json" ]; then
  echo
  echo "[1/3] 앱 프로젝트를 만드는 중입니다 (3~10분, 인터넷 필요)..."
  cd "$HOME" || fail "홈 폴더로 이동할 수 없습니다."
  npx --yes create-expo-app@latest moa-app --template blank || fail "프로젝트 만들기 실패"
else
  echo
  echo "[1/3] 이미 만들어진 프로젝트를 사용합니다: $APP_DIR"
fi
cd "$APP_DIR" || fail "$APP_DIR 폴더를 찾을 수 없습니다."

# 2. 필요한 기능 설치 (Expo Go 버전에 맞춰 자동 선택)
echo
echo "[2/3] 진동·화면 유지·공유 기능을 설치하는 중입니다..."
npx --yes expo install react-native-webview expo-haptics expo-keep-awake \
  react-native-safe-area-context expo-sharing expo-file-system expo-audio expo-status-bar \
  || fail "기능 설치 실패"
# 다른 Wi-Fi에서 연결할 때 쓰는 도구 (실패해도 나중에 자동 설치됨)
npm install --save-dev @expo/ngrok@^4.1.0 >/dev/null 2>&1 || true

# 3. 실험 앱 코드 복사
echo
echo "[3/3] 실험 앱 코드를 넣는 중입니다..."
cp "$HERE/App.js" "$APP_DIR/App.js" || fail "App.js 복사 실패"
[ -f "$APP_DIR/App.tsx" ] && rm -f "$APP_DIR/App.tsx"

# 실행 파일을 바탕화면에도 복사 (다음부터 찾기 쉽게)
if [ -f "$HERE/2-start.command" ]; then
  cp "$HERE/2-start.command" "$HOME/Desktop/MOA 실험 시작.command" 2>/dev/null && \
    chmod +x "$HOME/Desktop/MOA 실험 시작.command" 2>/dev/null
fi
# 인터넷에서 받은 파일 표시(격리 속성)를 지워, 다음부터 더블클릭 시 경고 없이 열리게 함
xattr -dr com.apple.quarantine "$HERE" 2>/dev/null || true
xattr -d com.apple.quarantine "$HOME/Desktop/MOA 실험 시작.command" 2>/dev/null || true

echo
echo "=============================================="
echo "   ✅ 설치 완료!"
echo "=============================================="
echo "다음부터는 바탕화면의 'MOA 실험 시작' 파일을 더블클릭하세요."
echo "iPhone에는 App Store에서 'Expo Go' 앱을 설치해 두세요."
pause_exit 0
