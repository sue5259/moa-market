#!/bin/bash
# MOA 실험 앱 — 실험할 때마다 더블클릭 (Mac)
# 앱 서버를 켜고 QR 코드를 보여 줍니다. 실험이 끝날 때까지 이 창을 닫지 마세요.

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

APP_DIR="$HOME/moa-app"

clear
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "아직 설치가 되어 있지 않습니다. 먼저 1-setup.command 를 실행해 주세요."
  read -n 1 -s -r -p "아무 키나 누르면 창을 닫습니다."
  exit 1
fi
cd "$APP_DIR" || exit 1

echo "=============================================="
echo "   MOA 실험 앱 시작"
echo "=============================================="
echo

# Expo 계정 로그인 확인 (iPhone Expo Go에도 같은 계정으로 로그인해야 앱이 열림)
if ! npx --yes expo whoami >/dev/null 2>&1; then
  echo "Expo 계정 로그인이 필요합니다 (처음 한 번만)."
  echo "계정이 없다면 https://expo.dev/signup 에서 무료로 만든 뒤 아래에 입력하세요."
  echo "iPhone의 Expo Go 앱에도 같은 계정으로 로그인해 주세요."
  echo
  npx --yes expo login || { echo "로그인에 실패했습니다. 창을 닫고 다시 실행해 주세요."; read -n 1 -s -r; exit 1; }
  echo
fi
echo "✔ Expo 로그인: $(npx --yes expo whoami 2>/dev/null)"
echo

echo "iPhone과 이 Mac이 같은 Wi-Fi인가요?"
echo "  · 같은 Wi-Fi  → 그냥 Enter"
echo "  · 다른 Wi-Fi, 또는 지난번에 QR로 연결이 안 됐다면 → t 입력 후 Enter"
read -r -p "> " MODE
echo
echo "잠시 후 QR 코드가 나타나면 iPhone 카메라로 비춰 주세요 (Expo Go로 열림)."
echo "실험이 끝날 때까지 이 창과 Mac 화면을 켜 두세요. 끝나면 이 창을 닫으면 됩니다."
echo "(Mac이 '들어오는 연결을 허용할까요?'라고 물으면 '허용'을 누르세요)"
echo

# caffeinate: 실험 중 Mac이 잠자기에 들어가지 않게 함
if [ "$MODE" = "t" ] || [ "$MODE" = "T" ]; then
  caffeinate -dims npx expo start --no-dev --minify --tunnel
else
  caffeinate -dims npx expo start --no-dev --minify --lan
fi
