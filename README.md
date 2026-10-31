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
| iPhone | 실험 앱(Expo Go) 안에서 열기 → 앱이 iOS 진동 실행 | `ios-app/README.md` 참고. 기본 'vibrate' (약 0.4초, 길이 고정) |
| Android Chrome | `navigator.vibrate([180])` | 180ms 진동 |
| iPhone Safari 등 그 외 | 미지원 | 시작 시 연구자 경고, 실험 시작 차단 |

CSV `hapticMethod` 열에 방식(`native-app` / `vibrate`)이 기록됩니다. iPhone 앱에서는 앱이 진동 실행을 확인해 돌려줘야
`hapticTriggered=1`이 되고, `hapticAckLatencyMs`에 요청→확인 시간이 남습니다.

## 설정값 (app.js 상단)
`WARNING_AUDIO_PRESET`('double' = 삐삐: 1000Hz 삼각파 120ms × 2회, 간격 70ms, gain 0.18) ·
`WARNING_HAPTIC_PATTERN`([180], Android) · `WARNING_HAPTIC_NATIVE_STYLE`('vibrate', iPhone 앱) ·
`ASSIGNMENT_TABLE`(P01~P10) · `TASK_TEXT`(과제 문구)

## iPhone에서 실행
`ios-app/README.md`의 순서를 따르세요 (노트북에서 Expo 실행 → iPhone Expo Go로 QR).
앱 안에는 주소창이 없으므로 시작 화면 **로고를 3초 안에 5번** 눌러 연구자 모드에 들어갑니다.

## 데이터 옮기기
데이터는 **실험한 기기의 그 앱/브라우저 안**에만 저장됩니다. 세션이 끝날 때마다 연구자 모드에서
**CSV 다운로드** / **JSON 백업 다운로드** (iPhone 앱에서는 공유 화면 → AirDrop·메일·파일 앱).

## 주요 저장 열 (CSV)
participantId, taskOrder, taskId, taskType, condition, choice, resistance, responseTimeMs, responseTimeSec, taskSuccess,
visualShown, audioTriggered, audioPreset, hapticSupported, hapticMethod, hapticTriggered, hapticAckLatencyMs, optionChanged, optionChangeTime(T0 기준 ms),
finalCancellationCompleted, recognitionYesNo, recognitionText, attempts, t0Ms, t1Ms, timestamp, userAgent, screenWidth, screenHeight, events(JSON)

taskSuccess 정의: N=Daily Tumbler로 구매 준비 도달, O=최종 해지 완료, S=29,000원 이내 결제, I·F=구매 완료.
같은 ID로 재시작하면 미완료 과제부터 이어서 진행되며 `attempts` 열에 재시도 횟수가 남습니다.
