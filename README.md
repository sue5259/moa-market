# MOA Market — 다크패턴 × 멀티모달 경고 실험 프로토타입

## 파일
- `index.html` · `styles.css` · `app.js` (백엔드 없음, 데이터는 브라우저 localStorage)

## URL 모드
| URL | 용도 |
|---|---|
| `index.html` | 참가자 모드 (디버그 정보 없음) |
| `index.html?debug=1` | 테스트 모드: 현재 Task·Condition·T0·T1·RT·저장 로그 패널, 경고 테스트 버튼 |
| `index.html?researcher=1` | 연구자 모드: 결과표, 조건별 요약, CSV/JSON 다운로드, 삭제(확인 2회) |

주소창을 쓸 수 없을 때(홈 화면 앱 등)는 **시작 화면의 MOA Market 로고를 3초 안에 5번 터치**하면 연구자 모드로 들어갑니다.

## 진동 방식 (자동 선택)
| 기기 | 방식 | 비고 |
|---|---|---|
| iPhone (iOS 18 이상 Safari) | Safari 스위치 컨트롤 시스템 햅틱 | 짧은 '톡' 1회. 길이·세기 조절 불가 |
| Android Chrome | `navigator.vibrate([180])` | 180ms 진동 |
| 그 외 (iOS 17 이하 등) | 미지원 | 시작 시 연구자 경고, 실험 시작 차단 |

CSV의 `hapticMethod` 열에 어떤 방식이 쓰였는지 기록됩니다. iPhone은 햅틱이 실제로 울렸는지 브라우저가 알려 주지 않으므로 `hapticTriggered=1`은 "햅틱 실행 요청이 정상 처리됨"을 뜻합니다.

## 설정값 (app.js 상단)
`WARNING_AUDIO_FREQUENCY`(880) · `WARNING_AUDIO_DURATION`(180ms) · `WARNING_AUDIO_GAIN`(0.12) ·
`WARNING_HAPTIC_PATTERN`([180], Android) · `WARNING_HAPTIC_IOS_TAPS`([0] = 1회, iPhone) ·
`ASSIGNMENT_TABLE`(P01~P10) · `TASK_TEXT`(과제 문구)

## iPhone에서 실행
1. 세 파일을 HTTPS 정적 호스팅(GitHub Pages 등)에 올리고 iPhone **Safari**로 접속
   (같은 Wi-Fi에서 노트북 `python3 -m http.server 8000` 후 `http://<노트북IP>:8000/` 접속도 가능)
2. iPhone 설정
   - 설정 › 사운드 및 햅틱 › **시스템 햅틱 켜기** (꺼져 있으면 진동 조건에서 아무 느낌이 없음)
   - **저전력 모드 끄기**
   - 화면 표시 및 밝기 › 자동 잠금 → **안 함**
   - 미디어 볼륨을 적당히 올리기 (무음 스위치는 앱이 우회하도록 설정했지만, 실험 전 테스트로 꼭 확인)
   - 알림이 뜨지 않게 **방해 금지 모드** 켜기
3. `?researcher=1` → 기기 점검의 VA / VH / VAH 테스트 버튼으로 소리·햅틱 확인
4. 참가자 시작은 `index.html` (debug 없이)

**선택: 홈 화면에 추가** — Safari 공유 버튼 › 홈 화면에 추가 → 주소창 없이 앱처럼 열림.
주의: 홈 화면 앱과 Safari 탭은 저장 공간이 **서로 분리**됩니다. 실험과 데이터 다운로드를 같은 쪽에서 해야 하며,
홈 화면 앱에서는 로고 5번 터치로 연구자 모드에 들어갑니다. 이 방식으로 진행할 경우 햅틱이 동작하는지 먼저 테스트하세요.

## 데이터 옮기기
데이터는 **그 iPhone의 그 브라우저**에만 저장됩니다. 세션이 끝날 때마다 연구자 모드에서:
- **CSV 공유 (AirDrop·메일)** → 노트북으로 바로 보내기
- 또는 **CSV 다운로드** / **JSON 백업 다운로드** → 파일 앱에 저장

## 주요 저장 열 (CSV)
participantId, taskOrder, taskId, taskType, condition, choice, resistance, responseTimeMs, responseTimeSec, taskSuccess,
visualShown, audioTriggered, hapticSupported, hapticMethod, hapticTriggered, optionChanged, optionChangeTime(T0 기준 ms),
finalCancellationCompleted, recognitionYesNo, recognitionText, attempts, t0Ms, t1Ms, timestamp, userAgent, screenWidth, screenHeight, events(JSON)

taskSuccess 정의: N=Daily Tumbler로 구매 준비 도달, O=최종 해지 완료, S=29,000원 이내 결제, I·F=구매 완료.
같은 ID로 재시작하면 미완료 과제부터 이어서 진행되며 `attempts` 열에 재시도 횟수가 남습니다.
