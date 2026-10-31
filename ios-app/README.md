# MOA 실험 앱 (iPhone · Expo Go)

iPhone 웹 브라우저로는 진동을 낼 수 없어서, 무료 앱 **Expo Go** 안에서 실험 페이지
(https://sue5259.github.io/moa-market/)를 열고 진동만 앱이 대신 실행합니다.
실험 화면·과제·데이터 저장은 GitHub에 올린 웹 실험과 완전히 같습니다.

## 준비물
- 노트북 (Windows 또는 Mac) + 인터넷
- 실험용 iPhone + App Store의 **Expo Go** 앱 (무료)

## 처음 한 번만: 노트북 설정 (약 20~30분)
1. https://nodejs.org 에서 **LTS** 버전 설치
2. 터미널 열기 (Windows: PowerShell / Mac: 터미널) 후 한 줄씩 실행
   ```
   npx create-expo-app@latest moa-app --template blank
   cd moa-app
   npx expo install react-native-webview expo-haptics expo-keep-awake react-native-safe-area-context expo-sharing expo-file-system expo-audio expo-status-bar
   ```
   (중간에 `y`를 물으면 `y` 입력)
3. 이 폴더의 **App.js** 로 `moa-app` 폴더 안의 `App.js`를 덮어쓰기

## 실험할 때마다
1. 노트북 터미널에서 `moa-app` 폴더로 이동 후
   ```
   npx expo start --no-dev --minify
   ```
   - iPhone과 노트북이 **다른 Wi-Fi**라면 끝에 `--tunnel`을 붙임 (처음엔 설치 확인에 `y`)
2. 화면에 나온 **QR 코드**를 iPhone **카메라 앱**으로 비춤 → Expo Go에서 열림
3. 실험이 끝날 때까지 노트북은 켜 둠

`--no-dev --minify`는 개발용 경고 문구가 참가자 화면에 뜨지 않게 합니다. 코드를 시험해 볼 때는 `npx expo start`만 써도 됩니다.

## iPhone 설정 체크
- 설정 › 손쉬운 사용 › 터치 › **진동** 켜기
- 설정 › 사운드 및 햅틱 › **햅틱 → 항상 재생**
- 미디어 볼륨 올리기, 저전력 모드 끄기, 방해 금지 모드 켜기

## 동작 확인
1. 앱 시작 화면에서 **MOA Market 로고를 3초 안에 5번** 누르기 → 연구자 모드
2. 기기 점검에서 진동 방식이 **실험 앱 진동 (vibrate)** 인지 확인
3. **VH 테스트** → 진동 + "앱 진동 실행 확인 (○ms)", **VA 테스트** → 소리
4. **참가자 화면으로** 를 눌러 실험 시작

## 진동 종류 바꾸기
웹 쪽 `app.js` 상단의 `WARNING_HAPTIC_NATIVE_STYLE` 값을 바꿔 GitHub에 올리면 됩니다 (앱 재설치 불필요).
- `vibrate` (기본): iOS 기본 진동, 약 0.4초, 길이 고정
- `heavy`: 강하고 짧은 탭 1회
- `warning`: iOS 경고형 햅틱

## 데이터
- 데이터는 **Expo Go 앱 안**에 저장됩니다 (Safari와 별개). Expo Go를 지우면 데이터도 사라지니 주의하세요.
- 연구자 모드의 **CSV 다운로드(공유)** / **JSON 백업(공유)** → AirDrop·메일·파일 앱으로 내보내기
- CSV `hapticTriggered=1`은 앱이 진동 실행을 확인해 돌려준 경우, `hapticAckLatencyMs`는 요청→확인 시간(ms)

## 문제 해결
- **"incompatible with this version of Expo Go"**: App Store에서 Expo Go를 최신으로 업데이트
- **QR을 찍어도 안 열림**: 같은 Wi-Fi인지 확인하거나 `--tunnel` 사용
- **"실험 페이지를 불러오지 못했습니다"**: iPhone 인터넷 확인 후 다시 시도
- **소리가 안 남**: 무음 모드 해제, 미디어 볼륨 확인
