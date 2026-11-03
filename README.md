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

## 화면 구성 메모
- 시각 경고: 의사결정 화면 위에 살짝 어두운 배경 + 가운데 경고 카드(제목 "선택하기 전에 확인해 주세요", 본문 "화면의 정보를 다시 살펴보고, 원하는 선택이 맞는지 확인해 주세요."), 오른쪽 위 X(48×48)로 닫기. V·VA·VH·VAH 동일. X 닫기는 응답으로 기록하지 않음
- 참가 번호 입력 후 공통 안내 화면 1회 ("실제 앱을 사용하는 것처럼 … 정답은 없습니다.")
- 시작 화면: N·S·I → 홈, O → MY, F → 장바구니(토트백 1개 담김)
- Nagging 추천 상품: 슬림 텀블러 (정상가 32,000원, 30% 할인 22,400원, 내부 ID `slim`). CSV `budsSelected` 열은 이름만 유지하고 '추천 상품 선택 여부'를 뜻함
- 과제별 대상 상품: N·S 데일리 텀블러(29,000원), I 스톤 머그컵(15,900원), F 캔버스 토트백(19,800원). 대상 상품은 그 과제에서만 구매 가능
- I·F의 taskSuccess = 대상 상품 구매 완료
- 상품명은 한국어 표기 (데일리 텀블러, 슬림 텀블러 등). 상품 ID는 영문 그대로(tumbler, buds …)

## 실험 흐름 (설문·인터뷰 포함)
참가 번호 → **사전설문(3화면)** → 공통 안내 → 과제 5개 → 인지 확인 → **사후설문(경고 방식 4개 × 4문항 + 최종 선호)** → **사후 인터뷰(7문항 음성 녹음)** → 종료
- phase: `preSurvey → tasks → recognition → postSurvey → interview → done` (단계마다 저장, 같은 번호로 이어하기)
- 기존 데이터에는 `preSurvey / postSurvey / interview / progress`가 자동 보완됨
- `completedAt`은 인터뷰 Q7까지 녹음 또는 '답변하지 않기' 후에만 기록
- 녹음: iPhone 앱 = expo-audio 녹음 → 앱 문서 폴더 `moa-interview/P01_interview_Q01.m4a` / 브라우저 = MediaRecorder → IndexedDB `MOAExperimentAudio.recordings` (키 `P01_Q01`). localStorage에는 녹음 정보(metadata)만 저장
- 연구자 모드: 사전설문·사후설문·인터뷰 기록 CSV, 질문별 녹음 재생·공유(다운로드). 참가자 삭제/전체 삭제 시 녹음 파일도 삭제
- JSON 백업에는 음성 파일이 들어가지 않음 → 녹음은 연구자 모드에서 질문별로 공유해 따로 보관

## 추가 기록 (과제 CSV)
- `warningCloseMs` = 경고 팝업을 닫은 시각 − T0, `postWarningRtMs` = T1 − 팝업 닫은 시각 (시각 경고 조건만, NW는 빈칸). responseTimeMs ≈ 두 값의 합
- `taskViewCount` = 과제 중 '과제 보기' 연 횟수, `taskViewAtDecision` = 의사결정 화면(T0~T1)에서 연 횟수
- 멤버십 해지(O) 저항 = 의사결정 화면에서 '그래도 해지하기'를 고르면 1 (최종 화면에서 유지해도 1). 최종 해지 여부는 `finalCancellationCompleted`
- 연구자용 과제 중단: '과제 보기' 창 제목('지금 할 일')을 3초 안에 5번 → 확인 → 저항·반응시간 빈칸, `status=aborted`, `abortedByResearcher=1`

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

taskSuccess 정의: N=데일리 텀블러로 구매 준비 도달, O=최종 해지 완료, S=29,000원 이내 결제, I·F=구매 완료.
같은 ID로 재시작하면 미완료 과제부터 이어서 진행되며 `attempts` 열에 재시도 횟수가 남습니다.
