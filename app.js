'use strict';
/* =====================================================================
   MOA Market — 실험용 모바일 웹 프로토타입
   연구: 시각 기반 멀티모달 경고가 고령자의 다크패턴 인지와 저항 행동에 미치는 영향

   URL 모드
     index.html               참가자 모드 (디버그 정보 없음)
     index.html?debug=1       개발자 테스트 모드 (현재 Task·Condition·T0·T1 패널 표시)
     index.html?researcher=1  연구자 데이터 화면 (CSV/JSON 다운로드, 삭제)
   ===================================================================== */

/* ─── 1. 실험 설정값 (여기서만 바꾸면 됩니다) ───────────────────────── */
// 시각 경고 팝업 문구 (V·VA·VH·VAH 모두 동일)
const WARNING_TITLE = '선택하기 전에 확인해 주세요';
const WARNING_BODY  = '화면의 정보를 다시 살펴보고,<br>원하는 선택이 맞는지 확인해 주세요.';

const WARNING_AUDIO_FREQUENCY = 880;     // Hz   ('single' 소리에 사용)
const WARNING_AUDIO_DURATION  = 180;     // ms
const WARNING_AUDIO_GAIN      = 0.12;    // 0 ~ 1
const WARNING_AUDIO_WAVEFORM  = 'sine';

// 경고음 후보 (CSV audioPreset 열에 실제 사용된 소리가 기록됨)
// beeps: [주파수 Hz, 길이 ms] 목록, gap: 소리 사이 간격 ms
const WARNING_AUDIO_PRESETS = {
  single:  { label: '삐 (1회, 처음 버전)', wave: WARNING_AUDIO_WAVEFORM, gain: WARNING_AUDIO_GAIN,
             beeps: [[WARNING_AUDIO_FREQUENCY, WARNING_AUDIO_DURATION]], gap: 0 },
  double:  { label: '삐삐 (2회)', wave: 'triangle', gain: 0.18, beeps: [[1000, 120], [1000, 120]], gap: 70 },
  triple:  { label: '삐삐삐 (3회, 빠르게)', wave: 'square', gain: 0.05, beeps: [[1050, 80], [1050, 80], [1050, 80]], gap: 55 },
  twoTone: { label: '삐-뽀 (높낮이 경고음)', wave: 'triangle', gain: 0.18, beeps: [[1175, 150], [880, 190]], gap: 30 },
  alarm:   { label: '삐뽀삐뽀 (빠른 경보음)', wave: 'square', gain: 0.05, beeps: [[1320, 95], [990, 95], [1320, 95], [990, 95]], gap: 0 },
};
// ▼ 실험에 사용할 경고음 (모든 참가자·VA·VAH 조건에 동일하게 적용)
const WARNING_AUDIO_PRESET = 'double';

const WARNING_HAPTIC_PATTERN  = [180];   // Android: navigator.vibrate() 패턴 (ms)

// iPhone: 웹 브라우저로는 진동을 낼 수 없어, 실험용 앱(Expo Go 안의 MOA 실험 앱)이 진동을 대신 실행한다.
// 'vibrate' = iOS 기본 진동 (약 0.4초, 길이 고정, 가장 잘 느껴짐)
// 'heavy'   = 강하고 짧은 탭 1회
// 'warning' = iOS 경고형 햅틱 (짧은 탭 여러 번)
// 이 값만 바꿔 GitHub에 올리면 앱을 다시 설치하지 않아도 적용된다.
const WARNING_HAPTIC_NATIVE_STYLE = 'vibrate';

const HAPTIC_UNSUPPORTED_MESSAGE =
  '현재 기기에서는 진동 기능을 사용할 수 없습니다. iPhone은 실험용 앱(Expo Go)에서, Android는 Chrome에서 실행해 주세요.';

const STORAGE_KEY = 'moaMarketExperiment.v1';
const REUSE_ASSIGNMENT_FOR_P11_TO_P20 = true; // P11~P20 → P01~P10 배정 반복 (참가자 20명까지)
const REQUEST_FULLSCREEN_ON_START = true;     // 모바일에서 시작 시 전체화면(주소창 숨김)
const DOUBLE_TAP_GUARD_MS = 300;              // 화면 전환 직후 중복 터치 무시

// 실험 시작 전 공통 안내 (한 번만 표시)
const COMMON_INTRO_TEXT = '실제 앱을 사용하는 것처럼, 평소라면 어떻게 할지 생각하면서 자유롭게 진행해 주세요. 정답은 없습니다.';

// 과제별 대상 상품 (O는 구매 과제 아님). 대상 상품은 해당 과제에서 구매 가능 상태가 됨
const TASK_PRODUCT = { N: 'tumbler', S: 'tumbler', I: 'mug', F: 'tote' };
// 과제별 시작 화면 (지정하지 않은 과제는 홈)
const TASK_START_SCREEN = { O: 'my', F: 'cart' };

const PRICE = { tumbler: 29000, addon: 2900, budget: 29000, plusDiscount: 5000, shareDiscount: 5000 };

/* ─── 2. 실험 조건 · 과제 정의 ─────────────────────────────────────── */
const CONDITION_SPEC = {
  NW:  { visual: false, audio: false, haptic: false, label: 'No Warning' },
  V:   { visual: true,  audio: false, haptic: false, label: 'Visual' },
  VA:  { visual: true,  audio: true,  haptic: false, label: 'Visual + Audio' },
  VH:  { visual: true,  audio: false, haptic: true,  label: 'Visual + Haptic' },
  VAH: { visual: true,  audio: true,  haptic: true,  label: 'Visual + Audio + Haptic' },
};
const CONDITIONS = Object.keys(CONDITION_SPEC);

const TASK_TYPES = { N: 'Nagging', O: 'Obstruction', S: 'Sneaking', I: 'Interface Interference', F: 'Forced Action' };
const TASK_IDS = Object.keys(TASK_TYPES);

// 참가자에게 보이는 과제 문구 (다크패턴이라는 표현 없음)
const TASK_TEXT = {
  N: { instruction: '데일리 텀블러를 구매하려고 하는 상황입니다. 구매를 진행해 주세요.' },
  O: { instruction: '현재 이용 중인 MOA Plus 멤버십을 종료하려고 하는 상황입니다. 멤버십 종료를 진행해 주세요.' },
  S: { instruction: '예산 29,000원 안에서 데일리 텀블러 1개를 구매하려고 하는 상황입니다. 구매를 진행해 주세요.' },
  I: { instruction: '스톤 머그컵 1개를 구매하려고 하는 상황입니다. 구매를 진행해 주세요.' },
  F: { instruction: '장바구니에 캔버스 토트백 1개가 담겨 있고, 이 상품을 구매하려고 하는 상황입니다. 구매를 진행해 주세요.' },
};

// 각 과제에서 경고·T0가 발생하는 핵심 의사결정 화면
const DECISION_SCREEN = { N: 'nagSecond', O: 'retention', S: 'checkout', I: 'plusOffer', F: 'shareOffer' };

// 선택값 → 저항(1) / 순응(0)
const CHOICE_RESISTANCE = {
  N: { view_discount: 0, continue_shopping: 1 },
  O: { keep_benefits: 0, cancel_anyway: 1 },     // O도 의사결정 화면 선택 기준 (최종 해지 여부는 finalCancellationCompleted)
  S: { pay_with_option: 0, pay_without_option: 1 },
  I: { start_plus_trial: 0, continue_regular: 1 },
  F: { share_for_discount: 0, buy_without_discount: 1 },
};

/* ─── 3. 사전 균형 배정표 ─────────────────────────────────────────── */
const ASSIGNMENT_TABLE = {
  P01: 'N-NW  O-V   S-VA  I-VH  F-VAH',
  P02: 'O-VA  S-VH  I-VAH F-NW  N-V',
  P03: 'S-VAH I-NW  F-V   N-VA  O-VH',
  P04: 'I-V   F-VA  N-VH  O-VAH S-NW',
  P05: 'F-VH  N-VAH O-NW  S-V   I-VA',
  P06: 'F-VAH I-VH  S-VA  O-V   N-NW',
  P07: 'N-V   F-NW  I-VAH S-VH  O-VA',
  P08: 'O-VH  N-VA  F-V   I-NW  S-VAH',
  P09: 'S-NW  O-VAH N-VH  F-VA  I-V',
  P10: 'I-VA  S-V   O-NW  N-VAH F-VH',
};
const ASSIGNMENTS = {};
for (const [pid, line] of Object.entries(ASSIGNMENT_TABLE)) {
  ASSIGNMENTS[pid] = line.trim().split(/\s+/).map(tok => {
    const [taskId, condition] = tok.split('-');
    return { taskId, condition };
  });
}
if (REUSE_ASSIGNMENT_FOR_P11_TO_P20) {
  for (let i = 11; i <= 20; i++) ASSIGNMENTS['P' + i] = ASSIGNMENTS['P' + String(i - 10).padStart(2, '0')];
}

function normalizeId(raw) {
  const m = String(raw || '').trim().toUpperCase().replace(/\s+/g, '').match(/^P?0*(\d{1,2})$/);
  if (!m) return null;
  const id = 'P' + String(Number(m[1])).padStart(2, '0');
  return ASSIGNMENTS[id] ? id : null;
}

function validateAssignments() {
  const participants = Object.keys(ASSIGNMENT_TABLE).map(pid => {
    const a = ASSIGNMENTS[pid];
    const issues = [];
    const ts = new Set(a.map(x => x.taskId));
    const cs = new Set(a.map(x => x.condition));
    if (a.length !== 5) issues.push('과제 수가 5개가 아님');
    if (ts.size !== 5 || !TASK_IDS.every(t => ts.has(t))) issues.push('과제 중복/누락');
    if (cs.size !== 5 || !CONDITIONS.every(c => cs.has(c))) issues.push('조건 중복/누락');
    return { pid, sequence: a.map(x => `${x.taskId}-${x.condition}`).join('  '), ok: issues.length === 0, issues };
  });
  for (let i = 1; i <= 5; i++) {
    const a = ASSIGNMENTS['P0' + i], bId = 'P' + String(i + 5).padStart(2, '0'), b = ASSIGNMENTS[bId];
    const rev = a.map(x => x.taskId + x.condition).reverse().join(',');
    if (rev !== b.map(x => x.taskId + x.condition).join(',')) {
      const r = participants.find(p => p.pid === bId);
      r.ok = false; r.issues.push(`P0${i}의 역순이 아님`);
    }
  }
  const combos = {};
  const positions = {};
  for (const pid of Object.keys(ASSIGNMENT_TABLE)) {
    ASSIGNMENTS[pid].forEach((x, i) => {
      combos[`${x.taskId}-${x.condition}`] = (combos[`${x.taskId}-${x.condition}`] || 0) + 1;
      positions[`${x.condition}@${i + 1}`] = (positions[`${x.condition}@${i + 1}`] || 0) + 1;
    });
  }
  return { allOk: participants.every(p => p.ok), participants, combos, positions };
}

/* ─── 4. 상품 데이터 ─────────────────────────────────────────────── */
const PRODUCTS = {
  tumbler: { id: 'tumbler', name: '데일리 텀블러', desc: '보온·보냉 스테인리스 텀블러 473ml', price: 29000, available: true, art: 'tumbler',
    body: '이중 진공 구조로 따뜻한 음료는 따뜻하게, 차가운 음료는 차갑게 오래 유지됩니다. 뚜껑을 돌려 잠그는 방식이라 가방에 넣어도 새지 않습니다.' },
  // Nagging 추천 상품 (데일리 텀블러와 비슷한 용도, 용량은 더 작음)
  slim: { id: 'slim', name: '슬림 텀블러', desc: '보온·보냉 스테인리스 텀블러 350ml', price: 32000, salePrice: 22400, sale: 30, available: true, art: 'slim',
    body: '얇고 가벼운 스테인리스 텀블러입니다. 따뜻한 음료와 차가운 음료를 모두 담을 수 있고, 작은 가방에도 넣기 편합니다.' },
  mug: { id: 'mug', name: '스톤 머그컵', desc: '도자기 머그컵 350ml', price: 15900, available: false, art: 'mug', body: '두툼한 도자기로 만들어 음료가 쉽게 식지 않습니다. 전자레인지와 식기세척기에 사용할 수 있습니다.' },
  towel: { id: 'towel', name: '소프트 타월 2매', desc: '면 100% 세면 타월', price: 12900, available: false, art: 'towel', body: '부드러운 면 타월 2장 묶음입니다.' },
  tote: { id: 'tote', name: '캔버스 토트백', desc: '두꺼운 면 캔버스 가방', price: 19800, available: false, art: 'tote', body: '두꺼운 면 캔버스로 만들어 튼튼하고, 장보기나 외출할 때 넉넉하게 들 수 있습니다.' },
  notebook: { id: 'notebook', name: '모눈 노트', desc: '모눈 노트 A5', price: 6500, available: false, art: 'notebook', body: '모눈 노트입니다.' },
};
const productPrice = p => p.salePrice || p.price;
// 기본 판매 상품(텀블러·이어폰) + 현재 과제의 대상 상품만 구매 가능. 나머지는 품절 표시
const isAvailable = p => p.available || (!!T && TASK_PRODUCT[T.taskId] === p.id);

/* ─── 5. 환경 · 유틸 ─────────────────────────────────────────────── */
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.get('debug') === '1';
const RESEARCHER = PARAMS.get('researcher') === '1';
// 앱 시작 시 진동 지원 검사
//   iPhone 실험 앱 안 = 앱이 진동 실행 (window.ReactNativeWebView 존재)
//   Android Chrome     = 'vibrate' in navigator
const NATIVE_APP = !!window.ReactNativeWebView;
const HAPTIC_VIBRATE = 'vibrate' in navigator;
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const HAPTIC_METHOD = NATIVE_APP ? 'native-app' : HAPTIC_VIBRATE ? 'vibrate' : 'none';
const HAPTIC_SUPPORTED = HAPTIC_METHOD !== 'none';
const HAPTIC_METHOD_LABEL = {
  'native-app': `실험 앱 진동 (${WARNING_HAPTIC_NATIVE_STYLE})`, vibrate: 'navigator.vibrate (Android)', none: '미지원',
}[HAPTIC_METHOD];
const CAN_SHARE_FILES = !NATIVE_APP && (() => {
  try { return !!navigator.canShare && navigator.canShare({ files: [new File(['x'], 'test.csv', { type: 'text/csv' })] }); }
  catch (e) { return false; }
})();

const iso = () => new Date().toISOString();
const won = n => Number(n).toLocaleString('ko-KR') + '원';
const round1 = n => (typeof n === 'number' ? Math.round(n * 10) / 10 : '');
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
function deviceInfo() {
  return {
    userAgent: navigator.userAgent,
    screenWidth: screen.width, screenHeight: screen.height,
    viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    hapticSupported: HAPTIC_SUPPORTED,
    hapticMethod: HAPTIC_METHOD,
    isIOS: IS_IOS,
  };
}

/* ─── 6. 저장소 (localStorage) ──────────────────────────────────── */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d.participants === 'object') {
        Object.values(d.participants).forEach(normalizeParticipant);   // 새 필드(preSurvey 등) 자동 보완
        return d;
      }
    }
  } catch (e) { console.error('[MOA] 저장 데이터 읽기 실패', e); }
  return { version: 1, participants: {} };
}
const store = loadStore();
function saveStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    console.error('[MOA] 저장 실패', e);
    alert('데이터 저장에 실패했습니다. 연구자에게 알려 주세요.');
    return false;
  }
}

/* ─── 7. 경고: 청각 (Web Audio API) ─────────────────────────────── */
let audioCtx = null;

// [실험 시작] 등 사용자 터치 순간에 호출 → AudioContext 생성/resume (autoplay 제한 대응)
function ensureAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return 'unsupported';
    // iPhone: 'playback' 오디오 세션은 옆면 무음 스위치가 켜져 있어도 소리를 냄 (Safari 16.4+)
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch (e) { /* 미지원 */ }
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state !== 'running') audioCtx.resume();   // suspended / interrupted(iOS) 모두 재개
    // 무음 버퍼를 한 번 재생해 오디오 출력 잠금 해제
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf; src.connect(audioCtx.destination); src.start(0);
    return audioCtx.state;
  } catch (e) {
    console.error('[MOA] AudioContext 오류', e);
    return 'error';
  }
}

// 한 의사결정 화면당 한 번 호출 (여러 번 '삐'가 나는 소리도 하나의 경고음으로 재생)
function playWarningTone(presetKey = WARNING_AUDIO_PRESET) {
  if (!audioCtx) ensureAudio();
  if (!audioCtx) return { played: false, state: 'unsupported', preset: presetKey };
  try {
    if (audioCtx.state !== 'running') audioCtx.resume();
    const p = WARNING_AUDIO_PRESETS[presetKey] || WARNING_AUDIO_PRESETS.single;
    const t0 = audioCtx.currentTime + 0.005;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = p.wave;
    gain.gain.setValueAtTime(0, t0);
    let t = t0;
    p.beeps.forEach(([freq, ms], i) => {
      const dur = ms / 1000, ramp = 0.008;     // 클릭 잡음 방지용 짧은 페이드
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(p.gain, t + ramp);
      gain.gain.setValueAtTime(p.gain, t + Math.max(ramp + 0.001, dur - ramp));
      gain.gain.linearRampToValueAtTime(0, t + dur);
      t += dur + (i < p.beeps.length - 1 ? p.gap / 1000 : 0);
    });
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t + 0.02);
    return { played: audioCtx.state === 'running', state: audioCtx.state, preset: presetKey };
  } catch (e) {
    console.error('[MOA] 경고음 재생 오류', e);
    return { played: false, state: 'error' };
  }
}

/* ─── 8. 경고: 진동 + 공통 경고 실행 함수 ───────────────────────── */
// iPhone 실험 앱과의 연결: 웹 → 앱 메시지로 진동 요청, 앱 → 웹으로 실행 확인(ack)
const nativePending = {};       // 요청 id → 보낸 시각
let testHapticId = null;        // 연구자 모드 테스트 버튼의 요청 id
function postToApp(payload) {
  window.ReactNativeWebView.postMessage(JSON.stringify(payload));
}
function requestNativeHaptic() {
  const id = 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  nativePending[id] = performance.now();
  postToApp({ type: 'haptic', style: WARNING_HAPTIC_NATIVE_STYLE, id });
  return id;
}
// 앱이 호출하는 함수: window.__moaNative({ type, ... })
window.__moaNative = msg => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'hapticAck') {
    const sentAt = nativePending[msg.id];
    const latency = sentAt != null ? Math.round(performance.now() - sentAt) : null;
    delete nativePending[msg.id];
    if (T && T.decision && T.decision.hapticRequestId === msg.id) {
      T.decision.hapticTriggered = !!msg.ok;
      T.decision.hapticAckLatencyMs = latency;
      T.decision.hapticError = msg.ok ? '' : (msg.error || 'app_error');
      logEvent('haptic_ack', { ok: !!msg.ok, latencyMs: latency, style: msg.style });
    }
    if (msg.id === testHapticId) {
      const el = document.getElementById('testResult');
      if (el) el.textContent += ` · 앱 진동 실행 ${msg.ok ? `확인 (${latency}ms)` : '실패: ' + (msg.error || '')}`;
    }
    debugUpdate();
  } else if (msg.type === 'exportDone') {
    showToast(msg.ok ? '공유 화면을 열었습니다.' : '내보내기 실패: ' + (msg.error || ''));
  } else if (typeof msg.type === 'string' && msg.type.startsWith('interview')) {
    handleInterviewNative(msg);                 // 인터뷰 녹음·재생·공유·삭제 응답
  }
};

// 시각 경고 팝업: 의사결정 화면 위에 살짝 어두운 배경 + 가운데 경고 카드 + 오른쪽 위 X 닫기
// 화면 배치에 영향을 주지 않는 겹침(overlay) 방식이라 조건에 따라 버튼 위치가 달라지지 않는다.
const warningRoot = document.getElementById('warningRoot');
const WARNING_POPUP_HTML = `<div class="warn-backdrop">
  <div class="warn-card" role="alertdialog" aria-modal="true" aria-labelledby="warnTitle" aria-describedby="warnBody">
    <button type="button" class="warn-close" data-act="closeWarning" aria-label="경고 닫기">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <h2 class="warn-title" id="warnTitle">
      <svg class="warn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3L2 21h20z" fill="#F2A900" stroke="#B37A00" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 9.5v5" stroke="#2B1F00" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.25" fill="#2B1F00"/></svg>
      <span>${WARNING_TITLE}</span>
    </h2>
    <p class="warn-body" id="warnBody">${WARNING_BODY}</p>
  </div>
</div>`;
function showWarningPopup() {
  warningRoot.innerHTML = WARNING_POPUP_HTML;
  return true;
}
// 팝업만 닫음 (화면 이동 등 내부 동작용 — 닫은 시각은 기록하지 않음)
function closeWarningPopup() { warningRoot.innerHTML = ''; }

// 참가자가 직접 팝업을 닫았을 때 (X 버튼 / Android 뒤로가기)
// 의사결정 화면에서 처음 닫은 시각을 기록한다 → warningCloseMs = 닫은 시각 − T0
function closeWarningByUser(via) {
  if (!warningRoot.innerHTML) return;
  closeWarningPopup();
  if (T && T.practice && T.noticeShownPerf != null && T.noticeCloseMs == null) {   // 연습 안내 창
    T.noticeCloseMs = Math.round(performance.now() - T.noticeShownPerf);
    logEvent('practice_notice_closed', { via, noticeCloseMs: T.noticeCloseMs });
  }
  const d = T && !T.finished ? T.decision : null;
  if (d && d.visualShown && d.t1 == null && d.warningClosedPerf == null) {
    const now = performance.now();
    d.warningClosedPerf = now;
    d.warningCloseMs = Math.round(now - d.t0);
    logEvent('warning_closed', { via, warningCloseMs: d.warningCloseMs });
    debugUpdate();
  }
}

/**
 * 모든 조건을 처리하는 단일 경고 함수.
 * NW → 없음 / V → 시각 / VA → 시각+청각 / VH → 시각+진동 / VAH → 시각+청각+진동
 * 시각 경고는 의사결정 화면 위에 팝업으로 겹쳐 표시한다 (모든 시각 조건에서 동일).
 */
function triggerWarning(condition) {
  const spec = CONDITION_SPEC[condition];
  const r = {
    condition, visualShown: false, audioTriggered: false, audioState: audioCtx ? audioCtx.state : 'none',
    hapticSupported: HAPTIC_SUPPORTED, hapticMethod: HAPTIC_METHOD, hapticTriggered: false, hapticError: '',
  };
  if (!spec) return r;
  if (spec.visual) {
    r.visualShown = showWarningPopup();
  }
  if (spec.audio) {
    const a = playWarningTone();
    r.audioTriggered = a.played; r.audioState = a.state; r.audioPreset = a.preset;
  }
  if (spec.haptic) {
    if (HAPTIC_METHOD === 'vibrate') {
      try { r.hapticTriggered = navigator.vibrate(WARNING_HAPTIC_PATTERN) === true; }
      catch (e) { r.hapticError = String(e); }
      if (!r.hapticTriggered && !r.hapticError) r.hapticError = 'vibrate_returned_false';
    } else if (HAPTIC_METHOD === 'native-app') {
      // 앱에 진동 요청. hapticTriggered는 앱이 실행 확인(ack)을 보내오면 1이 된다 (보통 수십 ms 이내)
      try { r.hapticRequestId = requestNativeHaptic(); r.hapticError = 'awaiting_app_ack'; }
      catch (e) { r.hapticError = String(e); }
    } else {
      r.hapticError = 'unsupported';
      console.warn('[MOA] ' + HAPTIC_UNSUPPORTED_MESSAGE);
    }
  }
  return r;
}

/* ─── 9. 앱 상태 · 라우터 ───────────────────────────────────────── */
let session = null;            // 현재 참가자 기록 (store.participants[id])
let T = null;                  // 현재 과제의 런타임 상태 (과제마다 새로 생성 → 과제 간 독립)
let view = { name: 'start', params: {} };
let navStack = [];
let lastRenderAt = 0;
let startDraft = '', startError = '';
let recogDraft = { yes: null, text: '' };
let lastSavedRow = null;
let wakeLock = null;

const appEl = document.getElementById('app');

const PUSHABLE = new Set(['home', 'list', 'detail', 'cart', 'checkout', 'my', 'plus', 'plusManage']);
const BACKABLE = new Set(['list', 'detail', 'cart', 'checkout', 'my', 'plus', 'plusManage']);

function canGoBack() {
  // 이전 화면이 있을 때만 '이전' 버튼 표시 (과제 시작 화면이나 하단 탭으로 연 화면에서는 숨김)
  return !!T && !T.finished && navStack.length > 0 && BACKABLE.has(view.name) && !(view.name === 'checkout' && T.taskId === 'S');
}
function go(name, params = {}, opts = {}) {
  closeWarningPopup();
  const push = opts.push !== false;
  if (push && PUSHABLE.has(view.name)) navStack.push(view);
  view = { name, params };
  if (T) logEvent('view', { to: name, id: params.id || undefined });
  render();
}
function goBack() {
  closeWarningPopup();
  view = navStack.pop() || { name: 'home', params: {} };
  if (T) logEvent('back', { to: view.name });
  render();
}
function render(opts = {}) {
  const fn = SCREENS[view.name];
  appEl.innerHTML = fn ? fn(view.params || {}) : '';
  if (!opts.keepScroll) window.scrollTo(0, 0);
  lastRenderAt = performance.now();
  afterRender();
  debugUpdate();
}

// 의사결정 화면이 DOM에 들어간 바로 그 순간: T0 기록 + 경고 실행 (모든 조건 동일 기준)
function afterRender() {
  if (T && !T.finished && view.name === DECISION_SCREEN[T.taskId] && !T.decision) beginDecision();
  if (T && T.practice && view.name === 'checkout' && T.noticeShownPerf == null) showPracticeNotice();
}
function beginDecision() {
  const t0 = performance.now();
  const w = triggerWarning(T.condition);
  T.decision = { screen: view.name, t0, shownAt: iso(), t1: null, madeAt: null, choice: null, responseTimeMs: null, ...w };
  logEvent('decision_screen_shown', {
    condition: T.condition, visualShown: w.visualShown, audioTriggered: w.audioTriggered,
    hapticTriggered: w.hapticTriggered, hapticError: w.hapticError || undefined,
  });
  if (DEBUG) console.info('[MOA] T0', T.taskId, T.condition, t0.toFixed(1), w);
}
function recordDecision(choice) {
  if (!T || !T.decision || T.decision.t1 != null) return false;   // 중복 기록 방지
  const t1 = performance.now();
  Object.assign(T.decision, {
    t1, madeAt: iso(), choice, responseTimeMs: Math.round(t1 - T.decision.t0),
    // 팝업을 닫은 뒤 선택까지 걸린 시간 (시각 경고 조건만, NW는 null)
    postWarningRtMs: T.decision.warningClosedPerf != null ? Math.round(t1 - T.decision.warningClosedPerf) : null,
  });
  logEvent('decision_made', { choice, responseTimeMs: T.decision.responseTimeMs, postWarningRtMs: T.decision.postWarningRtMs ?? undefined });
  if (DEBUG) console.info('[MOA] T1', choice, t1.toFixed(1), 'RT', T.decision.responseTimeMs, 'ms');
  debugUpdate();
  return true;
}

function newTaskState(taskId, condition, order) {
  return {
    taskId, condition, order, startedAt: iso(), startPerf: performance.now(),
    cart: taskId === 'F' ? [{ id: TASK_PRODUCT.F }] : [],
    member: taskId === 'O',
    orderItems: [],
    nag1Shown: false, nag1Open: false, nagIntent: null,
    addon: true, addonToggleCount: 0, optionFirstChangeMs: null,
    plusTrial: false, shared: false,
    decision: null, finished: false, events: [],
  };
}
function logEvent(type, data = {}) {
  if (!T) return;
  const now = performance.now();
  T.events.push({
    type, tMs: Math.round(now - T.startPerf),
    sinceT0Ms: T.decision ? Math.round(now - T.decision.t0) : null,
    screen: view.name, ...data,
  });
}

/* 과제 결과 저장 */
function finishTask(outcome) {
  if (!T || T.finished) return;
  const d = T.decision || {};
  const dev = session.device || deviceInfo();
  const row = {
    participantId: session.participantId,
    sessionMode: session.mode,
    taskOrder: T.order,
    taskId: T.taskId,
    taskType: TASK_TYPES[T.taskId],
    condition: T.condition,
    choice: d.choice ?? '',
    resistance: outcome.resistance,
    responseTimeMs: d.responseTimeMs ?? '',
    responseTimeSec: d.responseTimeMs != null ? Math.round(d.responseTimeMs) / 1000 : '',
    warningCloseMs: d.warningCloseMs ?? '',            // 경고 확인 시간 = 팝업 닫은 시각 − T0 (NW는 빈칸)
    postWarningRtMs: d.postWarningRtMs ?? '',          // 닫은 뒤 선택 시간 = T1 − 팝업 닫은 시각 (NW는 빈칸)
    taskSuccess: outcome.taskSuccess,
    taskViewCount: T.events.filter(e => e.type === 'instruction_reopened').length,   // 과제 전체에서 '과제 보기' 연 횟수
    taskViewAtDecision: d.instructionViews || 0,       // 의사결정 화면(T0~T1)에서 '과제 보기' 연 횟수
    abortedByResearcher: 0,
    visualShown: d.visualShown ? 1 : 0,
    audioTriggered: d.audioTriggered ? 1 : 0,
    audioPreset: d.audioPreset || '',
    audioContextState: d.audioState || '',
    hapticSupported: HAPTIC_SUPPORTED ? 1 : 0,
    hapticMethod: HAPTIC_METHOD,
    hapticTriggered: d.hapticTriggered ? 1 : 0,
    hapticError: d.hapticError === 'awaiting_app_ack' ? 'no_app_ack' : (d.hapticError || ''),
    hapticAckLatencyMs: d.hapticAckLatencyMs ?? '',
    optionChanged: '', optionChangeTime: '', optionToggleCount: '', finalOptionSelected: '',
    paidAmount: '', finalCancellationCompleted: '', finalChoice: '', budsSelected: '', nagFirstChoice: '', orderItems: '',
    t0Ms: round1(d.t0), t1Ms: round1(d.t1),
    decisionShownAt: d.shownAt || '', decisionMadeAt: d.madeAt || '',
    taskStartedAt: T.startedAt,
    timestamp: iso(),
    userAgent: dev.userAgent, screenWidth: dev.screenWidth, screenHeight: dev.screenHeight,
    ...(outcome.extra || {}),
  };
  T.finished = true;
  logEvent('task_finished', { resistance: row.resistance, taskSuccess: row.taskSuccess });
  row.events = T.events;
  session.results[T.taskId] = row;
  session.currentIndex = T.order;            // 다음 과제 인덱스
  if (session.currentIndex >= session.assignment.length) { session.phase = 'recognition'; session.recogIndex = 0; }
  session.updatedAt = iso();
  saveStore();
  lastSavedRow = row;
  console.info('[MOA] 과제 결과 저장', row.participantId, row.taskOrder, row.taskId);
  if (DEBUG) console.table([{ ...row, events: `${row.events.length} events` }]);
  debugUpdate();
}
function endTaskView() {
  T = null; navStack = [];
  go('taskDone', {}, { push: false });
}

/* ─── 10. 아이콘 · 일러스트 ─────────────────────────────────────── */
const ICON_PATHS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  cart: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9.5" cy="19" r="1.6"/><circle cx="17.5" cy="19" r="1.6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const icon = (name, sw = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;

const ART = {
  tumbler: '<rect width="120" height="120" rx="18" fill="#E3F1EE"/><rect x="43" y="19" width="34" height="11" rx="4" fill="#24313B"/><path d="M40 32h40l-5 66a7 7 0 0 1-7 6H52a7 7 0 0 1-7-6z" fill="#0F6B5C"/><rect x="45" y="56" width="30" height="13" rx="3" fill="#fff" opacity=".9"/>',
  slim: '<rect width="120" height="120" rx="18" fill="#EEF0F7"/><rect x="47" y="17" width="26" height="10" rx="4" fill="#2F3747"/><path d="M45 29h30l-3 71a6 6 0 0 1-6 5h-12a6 6 0 0 1-6-5z" fill="#6B7A90"/><rect x="50" y="56" width="20" height="11" rx="3" fill="#fff" opacity=".9"/>',
  mug: '<rect width="120" height="120" rx="18" fill="#F6EEE6"/><rect x="32" y="38" width="46" height="52" rx="8" fill="#B5835A"/><path d="M78 50h7a11 11 0 0 1 0 22h-7" fill="none" stroke="#B5835A" stroke-width="7"/>',
  towel: '<rect width="120" height="120" rx="18" fill="#EAF2FB"/><rect x="26" y="34" width="68" height="22" rx="6" fill="#7FA8D8"/><rect x="26" y="62" width="68" height="22" rx="6" fill="#A9C6E8"/>',
  tote: '<rect width="120" height="120" rx="18" fill="#F3F0E6"/><path d="M46 48a14 14 0 0 1 28 0" fill="none" stroke="#8C7A55" stroke-width="5"/><rect x="33" y="48" width="54" height="46" rx="6" fill="#D8CBA8"/>',
  notebook: '<rect width="120" height="120" rx="18" fill="#EEF3EA"/><rect x="37" y="26" width="48" height="68" rx="5" fill="#5D7F4B"/><rect x="43" y="26" width="4" height="68" fill="#46623A"/>',
  plus: '<rect width="120" height="120" rx="18" fill="#E3F1EE"/><circle cx="60" cy="60" r="31" fill="#0F6B5C"/><path d="M60 45v30M45 60h30" stroke="#fff" stroke-width="8" stroke-linecap="round"/>',
  share: '<rect width="120" height="120" rx="18" fill="#FFF1E8"/><path d="M42 60L80 40M42 60L80 80" stroke="#C2410C" stroke-width="5"/><circle cx="42" cy="60" r="12" fill="#C2410C"/><circle cx="80" cy="40" r="12" fill="#C2410C"/><circle cx="80" cy="80" r="12" fill="#C2410C"/>',
};
const art = (kind, cls = '') => `<svg class="art ${cls}" viewBox="0 0 120 120" aria-hidden="true">${ART[kind] || ''}</svg>`;

/* ─── 11. 공통 UI 조각 ──────────────────────────────────────────── */
function topBar({ title = '', back, logo = false, preview = false } = {}) {
  const showBack = back ?? canGoBack();
  return `<header class="topbar">
    ${showBack ? '<button class="topbar-back" data-act="back">‹ 이전</button>' : '<span></span>'}
    ${logo ? '<div class="logo">MOA<span>Market</span></div>' : `<h1 class="topbar-title">${title}</h1>`}
    ${preview || !T ? '<span></span>' : '<button class="topbar-task" data-act="openInstruction">과제 보기</button>'}
  </header>`;
}
function bottomNav(active) {
  const count = T ? T.cart.length : 0;
  const tab = (to, ic, label) =>
    `<button class="nav-item ${active === to ? 'is-active' : ''}" data-act="tab" data-to="${to}">${icon(ic)}<span>${label}</span>${to === 'cart' && count ? `<span class="badge">${count}</span>` : ''}</button>`;
  return `<nav class="bottom-nav" aria-label="메뉴">${tab('home', 'home', '홈')}${tab('list', 'grid', '카테고리')}${tab('cart', 'cart', '장바구니')}${tab('my', 'user', 'MY')}</nav>`;
}
function priceHTML(p) {
  return p.sale
    ? `<span class="discount">${p.sale}%</span><span class="price">${won(p.salePrice)}</span><span class="strike">${won(p.price)}</span>`
    : `<span class="price">${won(p.price)}</span>`;
}
function itemRow(p) {
  return `<div class="item-row">${art(p.art)}<div><p class="item-name">${p.name}</p><p class="item-meta">수량 1개</p><p class="item-price">${won(productPrice(p))}</p></div></div>`;
}
function doneScreen(title, text, act, label) {
  return `<main class="screen center-screen"><div class="intro-card">
    <div class="done-mark" aria-hidden="true">✓</div>
    <h2 class="done-title">${title}</h2><p class="done-text">${text}</p>
    <button class="btn btn-primary btn-xl" data-act="${act}">${label}</button></div></main>`;
}
const pv = preview => (preview ? 'tabindex="-1"' : '');

/* ─── 12. 진행 화면 (시작 · 과제 안내 · 완료 · 인지 확인) ──────────── */
function screenStart() {
  return `<main class="screen center-screen">
    <div class="start-card">
      <div class="logo logo-lg" data-act="logoTap">MOA<span>Market</span></div>
      <p class="start-lead">참가 번호를 입력해 주세요.</p>
      <form id="startForm" autocomplete="off">
        <label class="sr-only" for="pid">참가 번호</label>
        <input id="pid" class="input-xl" type="text" inputmode="text" autocapitalize="characters" autocorrect="off"
          spellcheck="false" maxlength="4" placeholder="예: P01" value="${esc(startDraft)}">
        <p class="form-error" role="alert">${esc(startError)}</p>
        <button type="submit" class="btn btn-primary btn-xl">실험 시작</button>
      </form>
    </div>
    ${DEBUG ? debugStartTools() : ''}
  </main>`;
}
function debugStartTools() {
  const v = validateAssignments();
  return `<section class="dbg-tools">
    <h2>DEBUG MODE (참가자 화면에는 표시되지 않음)</h2>
    <p>진동: <b>${HAPTIC_METHOD_LABEL}</b> · 배정표 검증: <b>${v.allOk ? '정상' : '오류'}</b></p>
    <p>경고 테스트 (버튼 터치 시 실제 소리·진동 발생)</p>
    <div class="r-test">${CONDITIONS.map(c => `<button class="btn btn-secondary" data-act="testWarning" data-cond="${c}">${c}</button>`).join('')}</div>
    <p style="margin-top:10px"><a href="?researcher=1">연구자 모드 열기</a></p>
  </section>`;
}
function screenCommonIntro() {
  return `<main class="screen center-screen"><div class="intro-card">
    <p class="step-label">시작하기 전에</p>
    <p class="task-box-text" style="margin:16px 0 28px">${COMMON_INTRO_TEXT}</p>
    <button class="btn btn-primary btn-xl" data-act="commonIntroNext">다음</button>
  </div></main>`;
}
function screenTaskIntro() {
  const idx = session.currentIndex;
  const a = session.assignment[idx];
  const t = TASK_TEXT[a.taskId];
  return `<main class="screen center-screen"><div class="intro-card">
    <p class="step-label">과제 ${idx + 1} / ${session.assignment.length}</p>
    ${idx > 0 ? '<p class="intro-sub">앞의 과제와는 관계없는 새로운 상황입니다.</p>' : ''}
    <div class="task-box"><p class="task-box-label">과제</p><p class="task-box-text">${t.instruction}</p>${t.note ? `<p class="task-box-note">${t.note}</p>` : ''}</div>
    <p class="intro-hint">과제 중에 화면 오른쪽 위 <b>과제 보기</b>를 누르면 이 내용을 다시 볼 수 있습니다.</p>
    <button class="btn btn-primary btn-xl" data-act="beginTask">과제 시작하기</button>
  </div></main>`;
}
function screenTaskDone() {
  const moreTasks = session.phase === 'tasks';
  return doneScreen('과제를 마쳤습니다',
    moreTasks ? '다음 과제를 시작합니다.' : '모든 과제를 마쳤습니다. 다음 단계로 넘어갑니다.',
    'afterTask', moreTasks ? '다음 과제로' : '다음으로');
}
function screenRecogIntro() {
  return `<main class="screen center-screen"><div class="intro-card">
    <p class="step-label">다음 단계</p>
    <h2 class="done-title" style="text-align:left;margin-top:8px">앞에서 보았던 화면을 다시 보여드립니다</h2>
    <p class="intro-sub" style="margin:12px 0 24px">화면을 하나씩 보면서 질문에 답해 주세요. 정답은 없습니다. 느낀 그대로 답해 주시면 됩니다.<br>‘있었다’를 고르시면 어떤 부분이 그렇게 느껴졌는지 말로 답해 주세요. 답변은 녹음됩니다.</p>
    <button class="btn btn-primary btn-xl" data-act="startRecognition">시작하기</button>
  </div></main>`;
}
function screenRecog() {
  const idx = session.recogIndex;
  const a = session.assignment[idx];
  const yes = recogDraft.yes;
  return `<main class="screen recog">
    <p class="step-label">화면 ${idx + 1} / ${session.assignment.length}</p>
    <p class="recog-lead">앞의 과제에서 보았던 화면입니다.</p>
    <div class="preview-frame" inert aria-hidden="true">${decisionPreview(a.taskId)}</div>
    <section class="recog-q">
      <h2 class="q-title">이 화면에서 사용자의 선택을 특정 방향으로 유도한다고 느낀 요소가 있었나요?</h2>
      <div class="choice-row">
        <button class="btn choice ${yes === true ? 'is-selected' : ''}" data-act="recogAnswer" data-v="1" aria-pressed="${yes === true}">있었다</button>
        <button class="btn choice ${yes === false ? 'is-selected' : ''}" data-act="recogAnswer" data-v="0" aria-pressed="${yes === false}">없었다</button>
      </div>
      ${yes === true ? recogAudioPanel() : ''}
      <p class="form-error" id="recogError" role="alert"></p>
      <button class="btn btn-primary btn-xl" data-act="recogNext">다음</button>
    </section>
  </main>`;
}
function screenEnd() {
  return `<main class="screen center-screen"><div class="intro-card" style="text-align:center">
    <div class="done-mark" aria-hidden="true">✓</div>
    <h2 class="done-title">실험이 완료되었습니다.</h2>
    <p class="done-text" style="margin-bottom:0">연구자의 안내를 기다려 주세요.</p>
  </div></main>`;
}
// 인지 확인용 미리보기: 경고 없이(빈 경고 영역) 핵심 화면을 다시 그림
function decisionPreview(taskId) {
  const ctx = { taskId, condition: 'NW', decision: null, addon: true, orderItems: [TASK_PRODUCT[taskId] || 'tumbler'], plusTrial: false, shared: false };
  switch (taskId) {
    case 'N': return screenNagSecond({}, ctx, true);
    case 'O': return screenRetention({}, ctx, true);
    case 'S': return screenCheckout({}, ctx, true);
    case 'I': return screenPlusOffer({}, ctx, true);
    case 'F': return screenShareOffer({}, ctx, true);
    default: return '';
  }
}

/* ─── 13. 쇼핑 앱 화면 ──────────────────────────────────────────── */
function productCard(id) {
  const p = PRODUCTS[id];
  return `<button class="pcard" data-act="openProduct" data-id="${id}">${art(p.art)}
    <p class="pcard-name">${p.name}</p>
    <p class="pcard-price">${won(p.price)}${isAvailable(p) ? '' : '<span class="tag-soldout">품절</span>'}</p></button>`;
}
function screenHome() {
  return `<div class="screen has-nav">${topBar({ logo: true, back: false })}
    <main class="content">
      <button class="search-bar" data-act="go" data-to="list">${icon('search', 2.4)}<span>상품을 검색해 보세요</span></button>
      <section class="banner"><p class="banner-kicker">이번 주 기획전</p><p class="banner-title">가을 생활용품 모음</p><p class="banner-sub">매일 쓰는 물건을 새로 준비해 보세요</p></section>
      <h2 class="section-title">오늘의 추천 상품</h2>
      <div class="grid">${['tumbler', 'mug', 'notebook', 'tote'].map(productCard).join('')}</div>
      <button class="btn btn-secondary" data-act="go" data-to="list">생활용품 전체 보기</button>
    </main>${bottomNav('home')}</div>`;
}
function screenList() {
  const ids = ['tumbler', 'mug', 'towel', 'tote', 'notebook'];
  const row = id => {
    const p = PRODUCTS[id];
    return `<li><button class="plist-row" data-act="openProduct" data-id="${id}">${art(p.art)}<div>
      <p class="plist-name">${p.name}</p><p class="plist-desc">${p.desc}</p>
      <p class="plist-price">${won(p.price)}${isAvailable(p) ? '' : '<span class="tag-soldout">품절</span>'}</p></div></button></li>`;
  };
  return `<div class="screen has-nav">${topBar({ title: '생활용품' })}
    <main class="content"><p class="muted" style="margin-bottom:10px">상품 ${ids.length}개</p><ul class="plist">${ids.map(row).join('')}</ul></main>
    ${bottomNav('list')}</div>`;
}
function screenDetail({ id }) {
  const p = PRODUCTS[id] || PRODUCTS.tumbler;
  const showNag1 = T && T.taskId === 'N' && T.nag1Open && id === 'tumbler';
  const actions = isAvailable(p)
    ? `<div class="btn-row"><button class="btn btn-secondary" data-act="addToCart" data-id="${p.id}">장바구니 담기</button>
       <button class="btn btn-primary" data-act="buyNow" data-id="${p.id}">구매하기</button></div>`
    : '<button class="btn btn-secondary" disabled>일시품절</button>';
  return `<div class="screen">${topBar({ title: '상품 정보' })}
    <main class="content">
      <div class="detail-art">${art(p.art)}</div>
      <h2 class="detail-name">${p.name}</h2><p class="detail-desc">${p.desc}</p>
      <div class="detail-price">${priceHTML(p)}</div>
      <ul class="detail-info"><li><span>배송</span><b>무료배송 · 내일 도착 예정</b></li><li><span>적립</span><b>구매 금액의 1%</b></li></ul>
      <p class="detail-body">${p.body}</p>
      ${actions}
    </main>
    ${showNag1 ? `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-row">${art('slim')}<p class="sheet-text">${PRODUCTS.slim.name}가 현재 30% 할인 중입니다.</p></div>
      <div class="btn-stack" style="margin-top:0">
        <button class="btn btn-primary btn-xl" data-act="nagFirstView">상품 확인하러 가기</button>
        <button class="btn btn-secondary btn-xl" data-act="closeNagFirst">계속 쇼핑하기</button>
      </div></div></div>` : ''}
  </div>`;
}
function screenCart() {
  const items = T.cart.map(c => PRODUCTS[c.id]);
  const total = items.reduce((s, p) => s + productPrice(p), 0);
  return `<div class="screen has-nav">${topBar({ title: '장바구니' })}
    <main class="content">
      ${items.length ? `<section class="card">${items.map(itemRow).join('')}</section>
        <section class="card"><div class="sum-row"><span>상품 금액</span><b>${won(total)}</b></div><div class="sum-row"><span>배송비</span><b>무료</b></div>
        <div class="sum-total"><span>합계</span><b>${won(total)}</b></div></section>`
        : '<p class="empty">장바구니에 담긴 상품이 없습니다.</p>'}
      <button class="btn btn-primary btn-xl" data-act="orderFromCart" ${items.length ? '' : 'disabled'}>주문하기</button>
    </main>${bottomNav('cart')}</div>`;
}
function orderSummary(ctx) {
  const ids = ctx.orderItems && ctx.orderItems.length ? ctx.orderItems : [TASK_PRODUCT[ctx.taskId] || 'tumbler'];
  const items = ids.map(id => PRODUCTS[id]);
  const subtotal = items.reduce((s, p) => s + productPrice(p), 0);
  const addon = ctx.taskId === 'S' && ctx.addon ? PRICE.addon : 0;
  const discounts = [];
  if (ctx.taskId === 'I' && ctx.plusTrial) discounts.push(['MOA Plus 체험 할인', PRICE.plusDiscount]);
  if (ctx.taskId === 'F' && ctx.shared) discounts.push(['친구 공유 할인', PRICE.shareDiscount]);
  const total = subtotal + addon - discounts.reduce((s, d) => s + d[1], 0);
  return { items, subtotal, addon, discounts, total };
}
function summaryRows(s) {
  return `<h2 class="card-title">결제 금액</h2>
    <div class="sum-row"><span>상품 금액</span><b>${won(s.subtotal)}</b></div>
    ${s.addon ? `<div class="sum-row"><span>안심 배송</span><b>+${won(s.addon)}</b></div>` : ''}
    ${s.discounts.map(d => `<div class="sum-row minus"><span>${d[0]}</span><b>-${won(d[1])}</b></div>`).join('')}
    <div class="sum-row"><span>배송비</span><b>무료</b></div>
    <div class="sum-total"><span>총 결제금액</span><b>${won(s.total)}</b></div>`;
}
function screenCheckout(_, ctx = T, preview = false) {
  const isDecision = ctx.taskId === 'S';
  const s = orderSummary(ctx);
  const addon = isDecision ? `<section class="card"><h2 class="card-title">안심 배송 서비스</h2>
      <button type="button" class="check-row" role="checkbox" aria-checked="${ctx.addon}" data-act="toggleAddon" ${preview ? 'tabindex="-1"' : 'id="addonToggle"'}>
        <span class="check-box">${ctx.addon ? icon('check', 3) : ''}</span><span>안심 배송 <b>+${won(PRICE.addon)}</b></span></button>
      <p class="muted small">배송 중 파손·분실 시 상품 금액을 보상해 드립니다.</p></section>` : '';
  return `<div class="screen">${topBar({ title: '주문 / 결제', back: preview ? false : (isDecision ? false : undefined), preview })}
    <main class="content">
      <section class="card"><h2 class="card-title">주문 상품</h2>${s.items.map(itemRow).join('')}</section>
      ${addon}
      <section class="card compact-info"><p><span class="muted">배송지</span> 기본 배송지 (집)</p><p><span class="muted">결제 수단</span> MOA Pay · 등록된 카드</p></section>
      <section class="card" ${preview ? '' : 'id="summaryCard"'}>${summaryRows(s)}</section>
      <button class="btn btn-primary btn-xl" data-act="pay" ${pv(preview)}>결제하기</button>
    </main></div>`;
}
function screenOrderDone({ total }) {
  return doneScreen('주문이 완료되었습니다', `결제 금액 ${won(total || 0)}`, 'orderDoneOk', '확인');
}
function screenMy() {
  const member = T && T.member;
  const row = (label, right = '›', act = 'unavailable') =>
    `<li><button class="menu-row" data-act="${act}" data-label="${label}" ${act === 'go' ? 'data-to="plus"' : ''}><span>${label}</span><span class="menu-right">${right}</span></button></li>`;
  return `<div class="screen has-nav">${topBar({ title: 'MY' })}
    <main class="content">
      <section class="card profile"><div class="avatar">${icon('user')}</div><div><p class="profile-name">MOA 회원님</p><p class="muted">적립금 1,250원 · 쿠폰 2장</p></div></section>
      <ul class="menu">
        ${row('MOA Plus 멤버십', `${member ? '<span class="pill pill-brand">이용 중</span>' : '<span class="pill">미가입</span>'} ›`, 'go')}
        ${row('주문 내역')}${row('쿠폰함')}${row('배송지 관리')}${row('고객센터')}${row('설정')}
      </ul>
    </main>${bottomNav('my')}</div>`;
}
function screenPlus() {
  const member = T && T.member;
  const benefits = '<ul class="benefits"><li>무료배송 무제한</li><li>구매 금액 5% 적립</li><li>회원 전용 할인가</li></ul>';
  if (!member) {
    return `<div class="screen">${topBar({ title: 'MOA Plus' })}<main class="content">
      <section class="plus-hero"><p>MOA Plus 멤버십</p><p class="big">월 4,900원</p></section>
      <section class="card"><h2 class="card-title">멤버십 혜택</h2>${benefits}</section>
      <p class="muted" style="text-align:center;margin-top:12px">현재 가입하지 않은 상태입니다.</p></main></div>`;
  }
  return `<div class="screen">${topBar({ title: 'MOA Plus' })}<main class="content">
    <section class="plus-hero"><p>MOA Plus 이용 중</p><p class="big">이번 달 13,700원 아꼈어요</p><p>월 4,900원 · 매월 15일 결제</p></section>
    <section class="card"><h2 class="card-title">이용 중인 혜택</h2>${benefits}</section>
    <button class="btn btn-primary btn-xl" data-act="go" data-to="plusManage">멤버십 관리</button></main></div>`;
}
function screenPlusManage() {
  return `<div class="screen">${topBar({ title: '멤버십 관리' })}<main class="content">
    <section class="card"><ul class="kv">
      <li><span>멤버십</span><b>MOA Plus (월간)</b></li><li><span>이용 시작일</span><b>2026.03.15</b></li>
      <li><span>결제 금액</span><b>월 4,900원</b></li><li><span>다음 결제일</span><b>매월 15일</b></li><li><span>결제 수단</span><b>MOA Pay</b></li>
    </ul></section>
    <button class="btn btn-secondary" data-act="unavailable" data-label="결제 수단 변경">결제 수단 변경</button>
    <button class="btn btn-secondary" data-act="unavailable" data-label="결제 알림 설정">결제 알림 설정</button>
    <p class="manage-foot">멤버십을 더 이상 이용하지 않으시나요?</p>
    <button class="btn-text" data-act="startCancel">멤버십 해지하기</button>
  </main></div>`;
}

/* ─── 14. 의사결정 화면 (경고 영역 + 다크패턴) ─────────────────────── */
// TASK 01 Nagging — 2차 추천
function screenNagSecond(_, ctx = T, preview = false) {
  const b = PRODUCTS.slim;
  return `<div class="screen">${topBar({ title: '추천 상품', back: false, preview })}
    <main class="content">
      <h2 class="dp-title">할인 상품을 다시 확인해보세요</h2>
      <section class="card offer-card">${art('slim')}<div>
        <p class="item-name" style="font-size:20px">${b.name}</p><span class="sale-pill">30% 할인</span>
        <p class="offer-price"><span class="strike">${won(b.price)}</span><b>${won(b.salePrice)}</b></p>
      </div></section>
      <div class="btn-stack">
        <button class="btn btn-primary btn-xl" data-act="nagChoice" data-c="view_discount" ${pv(preview)}>할인 상품 보기</button>
        <button class="btn btn-secondary btn-xl" data-act="nagChoice" data-c="continue_shopping" ${pv(preview)}>원래 쇼핑 계속하기</button>
      </div>
    </main></div>`;
}
// TASK 02 Obstruction — 혜택 유지 권유
function screenRetention(_, ctx = T, preview = false) {
  return `<div class="screen">${topBar({ title: '멤버십 해지', back: false, preview })}
    <main class="content">
      <h2 class="dp-title">정말 혜택을 포기하시겠어요?</h2>
      <div class="stat-grid">
        <div class="stat"><p class="stat-label">이번 달 받은 혜택</p><p class="stat-value">13,700원</p></div>
        <div class="stat stat-accent"><p class="stat-label">앞으로 받을 수 있는 혜택</p><p class="stat-value"><span class="stat-pre">최대</span> 25,000원</p></div>
      </div>
      <ul class="lose-list"><li>무료배송 혜택이 사라져요</li><li>구매 금액 5% 적립이 중단돼요</li><li>회원 전용 할인가를 받을 수 없어요</li></ul>
      <div class="btn-stack">
        <button class="btn btn-primary btn-xl" data-act="retentionChoice" data-c="keep_benefits" ${pv(preview)}>혜택 계속 받기</button>
        <button class="btn btn-secondary btn-xl" data-act="retentionChoice" data-c="cancel_anyway" ${pv(preview)}>그래도 해지하기</button>
      </div>
    </main></div>`;
}
function screenCancelConfirm() {
  return `<div class="screen">${topBar({ title: '멤버십 해지', back: false })}<main class="content">
    <h2 class="dp-title">해지 전에 확인해 주세요</h2>
    <section class="card"><ul class="kv"><li><span>혜택 이용 가능</span><b>이번 결제 기간까지</b></li><li><span>다음 결제</span><b>진행되지 않음</b></li></ul></section>
    <div class="btn-stack">
      <button class="btn btn-primary btn-xl" data-act="finalCancel" data-c="complete">해지 완료하기</button>
      <button class="btn btn-secondary btn-xl" data-act="finalCancel" data-c="keep">멤버십 유지하기</button>
    </div></main></div>`;
}
// TASK 04 Interface Interference — 강조된 체험 vs 약한 일반 구매
function screenPlusOffer(_, ctx = T, preview = false) {
  const price = orderSummary(ctx).subtotal;   // 주문하려는 상품 가격
  return `<div class="screen">${topBar({ title: '주문하기', back: false, preview })}
    <main class="content">
      <section class="card hero-center">${art('plus')}
        <h2 class="dp-title" style="margin-bottom:4px">MOA Plus로 더 저렴하게 구매하세요</h2>
        <p class="hero-big">무료 체험으로<br>오늘 5,000원 할인</p>
        <div class="compare"><span class="strike">${won(price)}</span><span class="now">${won(price - PRICE.plusDiscount)}</span></div>
        <ul class="benefits" style="text-align:left"><li>무료배송 무제한</li><li>구매 금액 5% 적립</li></ul>
      </section>
      <button class="btn btn-primary btn-hero" data-act="plusOfferChoice" data-c="start_plus_trial" ${pv(preview)}>MOA Plus 무료 체험 시작하기</button>
      <p class="fineprint">무료 체험 30일 후 월 4,900원이 자동 결제됩니다.</p>
      <button class="btn-text" data-act="plusOfferChoice" data-c="continue_regular" ${pv(preview)}>일반 구매 계속하기</button>
    </main></div>`;
}
function screenPlusStarted() {
  return doneScreen('MOA Plus 무료 체험이 시작되었습니다', '오늘 주문에 5,000원 할인이 적용됩니다.', 'continueToCheckout', '결제 계속하기');
}
// TASK 05 Forced Action — 공유 요구
function screenShareOffer(_, ctx = T, preview = false) {
  return `<div class="screen">${topBar({ title: '주문하기', back: false, preview })}
    <main class="content">
      <section class="card hero-center">${art('share')}
        <h2 class="dp-title" style="margin-bottom:8px">친구와 공유하고<br>5,000원 할인받기</h2>
        <p class="dp-lead">친구에게 MOA 상품을 공유하면<br>결제금액에서 5,000원을 할인해드립니다.</p>
      </section>
      <div class="btn-stack">
        <button class="btn btn-primary btn-xl" data-act="shareChoice" data-c="share_for_discount" ${pv(preview)}>친구에게 공유하고 할인받기</button>
        <button class="btn btn-secondary btn-xl" data-act="shareChoice" data-c="buy_without_discount" ${pv(preview)}>할인 없이 구매하기</button>
      </div>
    </main></div>`;
}
function screenShareDone() {
  return doneScreen('친구에게 공유되었습니다.', '5,000원 할인이 적용되었습니다.', 'continueToCheckout', '결제 계속하기');
}

const SCREENS = {
  start: screenStart, commonIntro: screenCommonIntro, taskIntro: screenTaskIntro, taskDone: screenTaskDone,
  recogIntro: screenRecogIntro, recog: screenRecog, end: screenEnd,
  home: screenHome, list: screenList, detail: screenDetail, cart: screenCart, checkout: screenCheckout,
  orderDone: screenOrderDone, my: screenMy, plus: screenPlus, plusManage: screenPlusManage,
  nagSecond: screenNagSecond, retention: screenRetention, cancelConfirm: screenCancelConfirm,
  cancelDone: () => doneScreen('멤버십 해지가 완료되었습니다', '이번 결제 기간이 끝나면 혜택이 종료됩니다.', 'toTaskDone', '확인'),
  keepDone: () => doneScreen('MOA Plus 혜택이 계속 유지됩니다', '다음 결제일에 월 4,900원이 결제됩니다.', 'toTaskDone', '확인'),
  plusOffer: screenPlusOffer, plusStarted: screenPlusStarted,
  shareOffer: screenShareOffer, shareDone: screenShareDone,
};

/* ─── 15. 동작 (참가자 흐름) ────────────────────────────────────── */
function actStart() {
  const input = document.getElementById('pid');
  startDraft = input ? input.value : '';
  const id = normalizeId(startDraft);
  if (!id) { startError = '참가 번호를 다시 확인해 주세요. (예: P01)'; render(); return; }
  ensureAudio();                      // 사용자 터치 순간 AudioContext 생성/resume
  if (!HAPTIC_SUPPORTED) {
    if (!DEBUG) {
      showModal({ title: '연구자 확인 필요', body: esc(HAPTIC_UNSUPPORTED_MESSAGE), actions: [{ label: '확인', primary: true }] });
      return;
    }
    showModal({ title: '연구자 확인 필요', body: esc(HAPTIC_UNSUPPORTED_MESSAGE) + '<br><br>(DEBUG) 진동 없이 테스트로 진행할 수 있습니다. 진동 조건은 hapticTriggered=0으로 기록됩니다.',
      actions: [{ label: '진동 없이 테스트 진행', primary: true, onClick: () => startSession(id) }, { label: '취소' }] });
    return;
  }
  startSession(id);
}
function startSession(id) {
  let p = store.participants[id];
  if (p && p.phase === 'done') {
    showModal({ title: '이미 완료된 참가 번호', body: `${id}의 실험은 이미 완료되었습니다. 연구자 모드(?researcher=1)에서 기록을 확인하거나 삭제한 뒤 다시 진행해 주세요.`,
      actions: [{ label: '확인', primary: true }] });
    return;
  }
  if (p) {
    const done = Object.keys(p.results).length;
    const where = p.phase === 'tasks' ? `과제 ${done}/5 완료` : `${PHASE_LABEL[p.phase] || p.phase} 진행 중`;
    showModal({ title: '이전 기록이 있습니다',
      body: `${id}: ${where} 상태입니다.<br>이어서 진행할까요? (진행 중이던 과제나 녹음은 처음부터 다시 시작합니다)`,
      actions: [{ label: '이어서 진행', primary: true, onClick: () => enterSession(p, true) }, { label: '취소' }] });
    return;
  }
  p = {
    participantId: id, mode: DEBUG ? 'debug' : 'participant',
    createdAt: iso(), updatedAt: iso(), completedAt: null,
    assignment: ASSIGNMENTS[id].map(x => ({ ...x })),
    currentIndex: 0, phase: 'preSurvey', recogIndex: 0,
    results: {}, recognition: {}, attempts: {}, device: deviceInfo(), sessionEvents: [],
    preSurvey: {}, postSurvey: {}, interview: {}, progress: {},
  };
  store.participants[id] = p;
  saveStore();
  enterSession(p, false);
}
function enterSession(p, resumed) {
  session = p;
  p.sessionEvents.push({ type: resumed ? 'resumed' : 'started', at: iso() });
  saveStore();
  startDraft = ''; startError = '';
  requestWakeLock();
  maybeFullscreen();
  // 공통 안내는 첫 과제를 아직 시작하지 않았을 때 한 번만
  normalizeParticipant(p);
  if (p.phase === 'preSurvey') go(!p.progress.introDone ? 'studyIntro' : p.progress.preSurveyPage ? 'preSurvey' : 'preSurveyIntro', {}, { push: false });
  else if (p.phase === 'practice') { T = null; go('practiceIntro', {}, { push: false }); }
  else if (p.phase === 'tasks') go(p.currentIndex === 0 && !Object.keys(p.attempts).length ? 'commonIntro' : 'taskIntro', {}, { push: false });
  else if (p.phase === 'recognition') { recogDraft = { yes: null, text: '' }; go(p.recogIndex === 0 ? 'recogIntro' : 'recog', {}, { push: false }); }
  else if (p.phase === 'postSurvey') go(p.progress.postSurveyIndex || Object.keys(p.postSurvey).length ? 'postSurvey' : 'postSurveyIntro', {}, { push: false });
  else if (p.phase === 'interview') { rec = { status: 'idle', qid: null, error: '' }; go('interviewIntro', {}, { push: false }); }
}
function actBeginTask() {
  ensureAudio();
  const idx = session.currentIndex;
  const a = session.assignment[idx];
  session.attempts[a.taskId] = (session.attempts[a.taskId] || 0) + 1;
  saveStore();
  T = newTaskState(a.taskId, a.condition, idx + 1);   // 과제마다 완전히 새로운 상태
  logEvent('task_started', { attempt: session.attempts[a.taskId] });
  navStack = [];
  // 과제별 시작 화면: O → MY, F → 장바구니(토트백 담긴 상태), 나머지 → 홈
  go(TASK_START_SCREEN[a.taskId] || 'home', {}, { push: false });
  if (CONDITION_SPEC[a.condition].haptic && !HAPTIC_SUPPORTED) {
    showModal({ title: '연구자 확인 필요', body: esc(HAPTIC_UNSUPPORTED_MESSAGE), actions: [{ label: '확인', primary: true }] });
  }
}
function actAfterTask() {
  if (session.phase === 'recognition') go('recogIntro', {}, { push: false });
  else go('taskIntro', {}, { push: false });
}
function actOpenInstruction() {
  if (!T) return;
  logEvent('instruction_reopened');
  if (T.decision && T.decision.t1 == null) T.decision.instructionViews = (T.decision.instructionViews || 0) + 1;
  const t = TASK_TEXT[T.taskId];
  // 제목 '지금 할 일'을 3초 안에 5번 누르면 연구자용 과제 중단 확인창이 열림 (참가자에게는 보이지 않는 기능)
  showModal({ title: '<span data-act="abortTap">지금 할 일</span>', body: `<p style="font-size:20px;font-weight:700;color:var(--text)">${t.instruction}</p>${t.note ? `<p style="margin-top:8px">${t.note}</p>` : ''}`,
    actions: [{ label: '닫기', primary: true }] });
}

// ── 연구자용 과제 중단 ──
// 참가자가 의사결정 화면에 도달하지 못하고 막힌 경우(예: O에서 해지 메뉴를 끝내 못 찾음) 사용.
// 저항·반응시간은 결측(빈칸), status = 'aborted' 로 기록하고 다음 과제로 넘어간다.
let abortTaps = [];
function actAbortTap() {
  if (!T || T.finished) return;
  const now = performance.now();
  abortTaps = abortTaps.filter(t => now - t < 3000);
  abortTaps.push(now);
  if (abortTaps.length < 5) return;
  abortTaps = [];
  closeModal();
  if (T.practice) { confirmSkipPractice(); return; }
  showModal({
    title: '연구자 확인: 과제 중단',
    body: '이 과제를 중단하고 다음 과제로 넘어갈까요?<br>저항 행동과 반응시간은 빈칸(결측)으로 기록됩니다.',
    actions: [{ label: '취소', primary: true }, { label: '과제 중단', onClick: abortTaskByResearcher }],
  });
}
function abortTaskByResearcher() {
  if (!T || T.finished) return;
  const d = T.decision;
  logEvent('task_aborted_by_researcher', { decisionReached: !!d, choiceMade: !!(d && d.choice) });
  finishTask({
    resistance: d && d.choice ? CHOICE_RESISTANCE[T.taskId][d.choice] ?? '' : '',
    taskSuccess: 0,
    extra: { abortedByResearcher: 1, finalChoice: 'aborted' },
  });
  endTaskView();
}

// 쇼핑 동작
function addCart(id) { if (!T.cart.some(c => c.id === id)) T.cart.push({ id }); }
function actOpenProduct({ id }) {
  if (!T) return;
  if (T.taskId === 'N' && id === 'tumbler' && !T.nag1Shown) {
    T.nag1Shown = true; T.nag1Open = true;
    logEvent('nag_first_shown');
  }
  go('detail', { id });
}
// 1차 추천에서 '상품 확인하러 가기' (측정 대상 아님, 2차 추천 화면은 그대로 유지)
function actNagFirstView() {
  if (!T || !T.nag1Open) return;
  T.nag1Open = false;
  T.nagFirstChoice = 'view_product';
  logEvent('nag_first_view_product');
  go('detail', { id: 'slim' });
}
function actCloseNagFirst() {
  if (!T) return;
  T.nag1Open = false;
  T.nagFirstChoice = 'continue_shopping';
  logEvent('nag_first_closed');
  render({ keepScroll: true });
}
function actAddToCart({ id }) {
  if (!T) return;
  addCart(id);
  logEvent('add_to_cart', { id });
  if (T.taskId === 'N' && id === 'tumbler' && !T.decision) { T.nagIntent = 'cart'; go('nagSecond'); return; }
  go('cart');
}
function actBuyNow({ id }) {
  if (!T) return;
  logEvent('buy_now', { id });
  T.orderItems = [id];
  if (T.taskId === 'N' && id === 'tumbler' && !T.decision) { T.nagIntent = 'buy'; go('nagSecond'); return; }
  proceedToOrder();
}
function actOrderFromCart() {
  if (!T || !T.cart.length) return;
  T.orderItems = T.cart.map(c => c.id);
  logEvent('order_from_cart', { items: T.orderItems.join('|') });
  proceedToOrder();
}
function proceedToOrder() {
  switch (T.taskId) {
    case 'N': finishNagging(); return;                                  // 구매 준비 화면 도달 = 과제 종료
    case 'I': go(T.decision ? 'checkout' : 'plusOffer'); return;
    case 'F': go(T.decision ? 'checkout' : 'shareOffer'); return;
    default: go('checkout');                                            // S: 결제 화면이 의사결정 화면
  }
}

// TASK 01 Nagging
function actNagChoice({ c }) {
  if (!recordDecision(c)) return;
  if (c === 'view_discount') go('detail', { id: 'slim' });
  else if (T.nagIntent === 'buy') finishNagging();
  else go('cart');
}
function finishNagging() {
  const items = T.orderItems.length ? T.orderItems : T.cart.map(c => c.id);
  logEvent('purchase_prep_reached', { items: items.join('|') });
  const d = T.decision;
  finishTask({
    resistance: d ? CHOICE_RESISTANCE.N[d.choice] : '',
    taskSuccess: items.includes('tumbler') ? 1 : 0,
    extra: { budsSelected: items.includes('slim') ? 1 : 0,   // 열 이름은 기존 유지: 추천 상품(슬림 텀블러) 담김 여부
                 nagFirstChoice: T.nagFirstChoice || '', orderItems: items.join('|') },
  });
  endTaskView();
}

// TASK 02 Obstruction
function actStartCancel() { if (T) go('retention'); }
function actRetentionChoice({ c }) {
  if (!recordDecision(c)) return;
  if (c === 'keep_benefits') {
    finishTask({ resistance: 0, taskSuccess: 0, extra: { finalCancellationCompleted: 0, finalChoice: 'keep_benefits' } });
    go('keepDone', {}, { push: false });
  } else {
    go('cancelConfirm', {}, { push: false });
  }
}
function actFinalCancel({ c }) {
  if (!T || T.finished) return;
  logEvent('final_cancel_step', { choice: c });
  // 저항은 의사결정 화면(경고가 나온 화면)의 선택으로 판정: '그래도 해지하기' = 1
  // 최종 화면 결과는 finalCancellationCompleted / taskSuccess 에 따로 기록
  const resistance = CHOICE_RESISTANCE.O[T.decision && T.decision.choice] ?? '';
  if (c === 'complete') {
    T.member = false;
    finishTask({ resistance, taskSuccess: 1, extra: { finalCancellationCompleted: 1, finalChoice: 'cancel_completed' } });
    go('cancelDone', {}, { push: false });
  } else {
    finishTask({ resistance, taskSuccess: 0, extra: { finalCancellationCompleted: 0, finalChoice: 'keep_membership' } });
    go('keepDone', {}, { push: false });
  }
}

// TASK 03 Sneaking
function actToggleAddon() {
  if (!T || T.taskId !== 'S' || !T.decision || T.decision.t1 != null) return;
  T.addon = !T.addon;
  T.addonToggleCount++;
  const sinceT0 = Math.round(performance.now() - T.decision.t0);
  if (T.optionFirstChangeMs == null) T.optionFirstChangeMs = sinceT0;
  logEvent('addon_toggle', { checked: T.addon });
  const btn = document.getElementById('addonToggle');
  if (btn) {
    btn.setAttribute('aria-checked', String(T.addon));
    btn.querySelector('.check-box').innerHTML = T.addon ? icon('check', 3) : '';
  }
  const card = document.getElementById('summaryCard');
  if (card) card.innerHTML = summaryRows(orderSummary(T));
  debugUpdate();
}

// 결제 (S의 최종 선택 / I·F의 과제 완료)
function actPay() {
  if (!T || T.finished) return;
  if (T.practice) { finishPractice(); return; }
  const s = orderSummary(T);
  if (T.taskId === 'S') {
    if (!recordDecision(T.addon ? 'pay_with_option' : 'pay_without_option')) return;
    finishTask({
      resistance: T.addon ? 0 : 1,
      taskSuccess: s.total <= PRICE.budget ? 1 : 0,
      extra: {
        optionChanged: T.addonToggleCount > 0 ? 1 : 0,
        optionChangeTime: T.optionFirstChangeMs ?? '',
        optionToggleCount: T.addonToggleCount,
        finalOptionSelected: T.addon ? 1 : 0,
        paidAmount: s.total, orderItems: s.items.map(p => p.id).join('|'),
      },
    });
  } else if ((T.taskId === 'I' || T.taskId === 'F') && T.decision && T.decision.choice) {
    finishTask({
      resistance: CHOICE_RESISTANCE[T.taskId][T.decision.choice],
      taskSuccess: s.items.some(p => p.id === TASK_PRODUCT[T.taskId]) ? 1 : 0,   // 대상 상품 구매 완료
      extra: { paidAmount: s.total, orderItems: s.items.map(p => p.id).join('|') },
    });
  } else {
    logEvent('order_paid', { total: s.total });          // 과제 목표와 무관한 구매 (예: O 과제 중)
  }
  go('orderDone', { total: s.total }, { push: false });
}
function actOrderDoneOk() {
  if (T && T.finished) { endTaskView(); return; }
  navStack = [];
  go('home', {}, { push: false });
}

// TASK 04 Interface Interference
function actPlusOfferChoice({ c }) {
  if (!recordDecision(c)) return;
  if (c === 'start_plus_trial') { T.plusTrial = true; go('plusStarted', {}, { push: false }); }
  else go('checkout', {}, { push: false });
}
// TASK 05 Forced Action
function actShareChoice({ c }) {
  if (!recordDecision(c)) return;
  if (c === 'share_for_discount') { T.shared = true; go('shareDone', {}, { push: false }); }
  else go('checkout', {}, { push: false });
}

// 다크패턴 인지 확인
function actRecogAnswer({ v }) {
  if (rec.status !== 'idle') return;
  recogDraft.yes = v === '1';
  render({ keepScroll: true });                 // '있었다'면 음성 답변 영역 표시
}
function actRecogNext() {
  if (recogDraft.yes === null) {
    document.getElementById('recogError').textContent = '‘있었다’ 또는 ‘없었다’를 선택해 주세요.';
    return;
  }
  if (rec.status !== 'idle') return;
  const a = session.assignment[session.recogIndex];
  const am = recogDraft.yes ? (session.recognitionAudio[a.taskId] || {}) : {};
  if (recogDraft.yes && !am.recorded && !am.skipped && !recogDraft.text.trim()) {
    document.getElementById('recogError').textContent = '녹음하시거나 ‘답변하지 않기’를 눌러 주세요.';
    return;
  }
  session.recognition[a.taskId] = {
    recognitionYesNo: recogDraft.yes ? 1 : 0,
    recognitionText: recogDraft.yes ? recogDraft.text.trim() : '',          // 마이크를 못 쓸 때만 글로 입력
    recognitionRecorded: am.recorded ? 1 : 0,
    recognitionAudioSkipped: am.skipped ? 1 : 0,
    recognitionDurationMs: am.recorded ? am.durationMs : '',
    recognitionAudioKey: am.recorded ? am.audioKey : '',
    recognitionStorageType: am.recorded ? am.storageType : '',
    recognitionAnsweredAt: iso(),
  };
  stopPlayback();
  rec = { status: 'idle', qid: null, error: '', micFailed: rec.micFailed };
  session.recogIndex++;
  session.updatedAt = iso();
  recogDraft = { yes: null, text: '' };
  if (session.recogIndex >= session.assignment.length) {
    session.phase = 'postSurvey';
    saveStore();
    go('postSurveyIntro', {}, { push: false });
  } else {
    saveStore();
    go('recog', {}, { push: false });
  }
}

// 경고 테스트 (디버그 시작 화면 / 연구자 모드)
function actTestWarning({ cond }) {
  ensureAudio();
  showModal({ title: `경고 테스트: ${cond}`, body: '<p id="testResult"></p>', actions: [{ label: '닫기', primary: true }] });
  const r = triggerWarning(cond);
  testHapticId = r.hapticRequestId || null;
  document.getElementById('testResult').textContent =
    `시각 ${r.visualShown ? 'O' : '-'} · 소리 ${r.audioTriggered ? 'O' : '-'} (${r.audioState}) · 진동 ${r.hapticTriggered ? 'O' : '-'}${r.hapticError ? ` (${r.hapticError})` : ''}`;
}

/* ─── 16. 모달 · 토스트 ────────────────────────────────────────── */
const modalRoot = document.getElementById('modalRoot');
function showModal({ title, body, actions = [] }) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">
    <h2 class="modal-title">${title}</h2><div class="modal-body">${body}</div>
    <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : 'btn-secondary'}" data-modal="${i}">${a.label}</button>`).join('')}</div>
  </div></div>`;
  modalRoot.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = actions[Number(btn.dataset.modal)];
      closeModal();
      if (a && a.onClick) a.onClick();
    });
  });
}
function closeModal() { modalRoot.innerHTML = ''; }
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ─── 17. 기기 보조 기능 (뒤로가기 방지, 화면 꺼짐 방지, 전체화면) ──── */
function setupBackTrap() {
  history.replaceState({ moa: 'base' }, '');
  history.pushState({ moa: 'trap' }, '');
  window.addEventListener('popstate', () => {
    history.pushState({ moa: 'trap' }, '');
    if (modalRoot.innerHTML) { closeModal(); return; }
    if (warningRoot.innerHTML) { closeWarningByUser('hardware_back'); return; }
    if (T) logEvent('hardware_back', { from: view.name });
    if (canGoBack()) goBack();
  });
}
async function requestWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* 지원 안 함 */ }
}
function releaseWakeLock() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* noop */ } wakeLock = null; }
function maybeFullscreen() {
  if (!REQUEST_FULLSCREEN_ON_START || DEBUG) return;
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

/* ─── 18. 디버그 패널 (?debug=1) ───────────────────────────────── */
let dbgOpen = true;
function debugUpdate() {
  if (!DEBUG) return;
  const el = document.getElementById('debugPanel');
  const d = T && T.decision;
  const f = n => (typeof n === 'number' ? n.toFixed(1) + ' ms' : '-');
  el.innerHTML = `<button class="dbg-toggle" data-dbg="toggle">DEBUG ${dbgOpen ? '▾' : '▸'}</button>${dbgOpen ? `<div class="dbg-body">
    <div>참가자 <b>${session ? session.participantId : '-'}</b> · ${session ? session.phase : '-'} · 화면 <b>${view.name}</b></div>
    <div>Task <b>${T ? `${T.order}/5 ${T.taskId} ${TASK_TYPES[T.taskId]}` : '-'}</b></div>
    <div>Condition <b>${T ? `${T.condition} (${CONDITION_SPEC[T.condition].label})` : '-'}</b></div>
    <div>AudioContext <b>${audioCtx ? audioCtx.state : '미생성'}</b> · 진동 <b>${HAPTIC_METHOD_LABEL}</b></div>
    <div>T0 <b>${f(d && d.t0)}</b> · T1 <b>${f(d && d.t1)}</b></div>
    <div>경고 닫음 <b>${d && d.warningCloseMs != null ? d.warningCloseMs + ' ms' : '-'}</b> · 닫은 뒤 선택 <b>${d && d.postWarningRtMs != null ? d.postWarningRtMs + ' ms' : '-'}</b></div>
    <div>RT <b>${d && d.responseTimeMs != null ? `${d.responseTimeMs} ms (${(d.responseTimeMs / 1000).toFixed(2)} s)` : '-'}</b></div>
    <div>경고 실행 ${d ? `V:<b>${d.visualShown ? 1 : 0}</b> A:<b>${d.audioTriggered ? 1 : 0}</b>(${d.audioState}) H:<b>${d.hapticTriggered ? 1 : 0}</b>${d.hapticError ? ' ' + d.hapticError : ''}` : '-'}</div>
    ${T && T.taskId === 'S' ? `<div>안심배송 ${T.addon ? 'ON' : 'OFF'} · 조작 ${T.addonToggleCount}회</div>` : ''}
    <details><summary>마지막 저장 로그</summary><pre>${esc(lastSavedRow ? JSON.stringify({ ...lastSavedRow, events: lastSavedRow.events.length + ' events' }, null, 1) : '-')}</pre></details>
    <details><summary>현재 이벤트 로그</summary><pre>${esc(T ? JSON.stringify(T.events.slice(-12), null, 1) : '-')}</pre></details>
    ${debugSurveyHTML()}
    <div><a href="?researcher=1" target="_blank">연구자 모드</a></div>
  </div>` : ''}`;
}

/* ─── 19. 연구자 모드 (?researcher=1) ──────────────────────────── */
const CSV_COLUMNS = [
  'participantId', 'sessionMode', 'status', 'taskOrder', 'taskId', 'taskType', 'condition',
  'choice', 'resistance', 'responseTimeMs', 'responseTimeSec', 'warningCloseMs', 'postWarningRtMs', 'taskSuccess',
  'taskViewCount', 'taskViewAtDecision', 'abortedByResearcher',
  'visualShown', 'audioTriggered', 'audioPreset', 'audioContextState', 'hapticSupported', 'hapticMethod', 'hapticTriggered', 'hapticAckLatencyMs', 'hapticError',
  'optionChanged', 'optionChangeTime', 'optionToggleCount', 'finalOptionSelected', 'paidAmount',
  'finalCancellationCompleted', 'finalChoice', 'budsSelected', 'nagFirstChoice', 'orderItems',
  'recognitionYesNo', 'recognitionText', 'recognitionRecorded', 'recognitionDurationMs', 'recognitionAudioKey', 'attempts',
  't0Ms', 't1Ms', 'decisionShownAt', 'decisionMadeAt', 'taskStartedAt', 'timestamp',
  'userAgent', 'screenWidth', 'screenHeight', 'events',
];
function sortedParticipants() {
  return Object.values(store.participants).sort((a, b) => a.participantId.localeCompare(b.participantId));
}
function buildExportRows() {
  const out = [];
  for (const p of sortedParticipants()) {
    p.assignment.forEach((a, i) => {
      const r = p.results[a.taskId];
      const rec = p.recognition[a.taskId] || {};
      const row = r ? { ...r } : {
        participantId: p.participantId, sessionMode: p.mode, taskOrder: i + 1, taskId: a.taskId,
        taskType: TASK_TYPES[a.taskId], condition: a.condition,
        userAgent: p.device && p.device.userAgent, screenWidth: p.device && p.device.screenWidth, screenHeight: p.device && p.device.screenHeight,
      };
      row.status = r ? (r.abortedByResearcher ? 'aborted' : 'completed') : 'not_completed';
      row.recognitionYesNo = rec.recognitionYesNo ?? '';
      row.recognitionText = rec.recognitionText ?? '';
      row.recognitionRecorded = rec.recognitionRecorded ?? '';
      row.recognitionDurationMs = rec.recognitionDurationMs ?? '';
      row.recognitionAudioKey = rec.recognitionAudioKey ?? '';
      row.attempts = p.attempts[a.taskId] || 0;
      out.push(row);
    });
  }
  return out;
}
function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+@]/.test(s)) s = "'" + s;               // 스프레드시트 수식 주입 방지
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(rows) {
  return [CSV_COLUMNS.join(','), ...rows.map(r => CSV_COLUMNS.map(c => csvCell(r[c])).join(','))].join('\r\n');
}
function download(name, text, type) {
  // iPhone 실험 앱 안: 앱이 파일을 만들어 공유 화면(AirDrop·메일·파일 앱)을 연다
  if (NATIVE_APP) { postToApp({ type: 'export', filename: name, mime: type.split(';')[0], content: text }); return; }
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const median = arr => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
function summaryTable(rows, key, order) {
  const done = rows.filter(r => r.status === 'completed');
  const groups = order.map(k => {
    const g = done.filter(r => r[key] === k);
    const res = g.filter(r => r.resistance === 0 || r.resistance === 1);
    const rts = g.map(r => r.responseTimeMs).filter(v => typeof v === 'number');
    const rec = g.filter(r => r.recognitionYesNo === 0 || r.recognitionYesNo === 1);
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');
    const med = median(rts);
    return `<tr><td>${k}</td><td>${g.length}</td><td>${pct(res.filter(r => r.resistance === 1).length, res.length)}</td>
      <td>${med != null ? (med / 1000).toFixed(2) + ' s' : '-'}</td><td>${pct(rec.filter(r => r.recognitionYesNo === 1).length, rec.length)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="r-table"><thead><tr><th>${key}</th><th>n</th><th>저항률</th><th>RT 중앙값</th><th>‘있었다’ 응답률</th></tr></thead><tbody>${groups}</tbody></table></div>
    <p class="r-meta">‘있었다’ 응답률은 자기보고 값이며, 최종 인지 코딩(0/1)은 연구자가 서술 내용을 보고 별도로 수행합니다.</p>`;
}
function participantSection(p) {
  normalizeParticipant(p);
  const status = participantStatusTag(p);
  const rows = p.assignment.map((a, i) => {
    const r = p.results[a.taskId];
    const rec = p.recognition[a.taskId] || {};
    const spec = CONDITION_SPEC[a.condition];
    if (!r) return `<tr><td>${i + 1}</td><td>${a.taskId} ${TASK_TYPES[a.taskId]}</td><td>${a.condition}</td><td colspan="9" class="na">미완료</td><td>${p.attempts[a.taskId] || 0}</td></tr>`;
    const audioBad = spec.audio !== !!r.audioTriggered;
    const hapticBad = spec.haptic !== !!r.hapticTriggered;
    return `<tr><td>${i + 1}</td><td>${a.taskId} ${TASK_TYPES[a.taskId]}</td><td>${a.condition}</td><td>${esc(r.choice)}</td>
      <td><b>${r.resistance}</b></td><td>${r.responseTimeMs}</td><td>${r.responseTimeSec}</td><td>${r.taskSuccess}</td>
      <td class="${audioBad ? 'bad' : ''}">${r.audioTriggered}</td><td class="${hapticBad ? 'bad' : ''}">${r.hapticTriggered}</td>
      <td>${rec.recognitionYesNo ?? '-'}</td><td class="wrap">${esc(rec.recognitionText || '')}</td><td>${p.attempts[a.taskId] || 0}</td></tr>`;
  }).join('');
  const dev = p.device || {};
  return `<section class="r-card">
    <div class="r-p-head"><h2 style="margin:0">${p.participantId}</h2>${status}${p.mode === 'debug' ? '<span class="tag tag-warn">DEBUG</span>' : ''}
      <button class="btn-small danger" data-act="rDeleteOne" data-id="${p.participantId}">이 참가자 삭제</button></div>
    <p class="r-meta">시작 ${new Date(p.createdAt).toLocaleString('ko-KR')} · 화면 ${dev.screenWidth}×${dev.screenHeight} · 진동 ${dev.hapticMethod || (dev.hapticSupported ? 'vibrate' : '미지원')}</p>
    <div class="table-wrap"><table class="r-table"><thead><tr><th>#</th><th>Task</th><th>Condition</th><th>Choice</th><th>Resist.</th><th>RT ms</th><th>RT s</th><th>Success</th><th>Audio</th><th>Haptic</th><th>인지</th><th>인지 서술</th><th>시도</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${participantSurveyHTML(p)}
  </section>`;
}
function renderResearcher() {
  document.title = 'MOA 실험 · 연구자 모드';
  const parts = sortedParticipants();
  const rows = buildExportRows();
  const v = validateAssignments();
  appEl.innerHTML = `<main class="researcher">
    <header class="r-head"><h1>연구자 모드</h1><p>참가자 ${parts.length}명 · 완료된 과제 기록 ${rows.filter(r => r.status === 'completed').length}건 · 저장 위치: 이 기기 브라우저(localStorage)</p></header>
    <section class="r-actions">
      <button class="btn btn-primary r-export-all" data-act="rExportAll">전체 내보내기 (CSV·JSON·녹음 zip)</button>
      <button class="btn btn-primary" data-act="rCsv">CSV 다운로드${NATIVE_APP ? ' (공유)' : ''}</button>
      <button class="btn btn-secondary" data-act="rJson">JSON 백업 다운로드${NATIVE_APP ? ' (공유)' : ''}</button>
      <button class="btn btn-secondary" data-act="rPreCsv">사전설문 CSV</button>
      <button class="btn btn-secondary" data-act="rPostCsv">사후설문 CSV</button>
      <button class="btn btn-secondary" data-act="rInterviewCsv">인터뷰 기록 CSV</button>
      <label class="btn btn-secondary file-btn">JSON 불러오기<input type="file" accept="application/json,.json" id="importFile" hidden></label>
      ${CAN_SHARE_FILES ? '<button class="btn btn-secondary" data-act="rShareCsv">CSV 공유 (AirDrop·메일)</button>' : ''}
      <button class="btn btn-secondary" data-act="rRefresh">새로고침</button>
      <a class="btn btn-secondary" href="${location.pathname}">참가자 화면으로</a>
    </section>
    <section class="r-card r-device"><h2>기기 점검</h2>
      <p>진동 방식: <b>${HAPTIC_SUPPORTED ? HAPTIC_METHOD_LABEL : '미지원 — ' + esc(HAPTIC_UNSUPPORTED_MESSAGE)}</b></p>
      <p>경고음: ${WARNING_AUDIO_PRESETS[WARNING_AUDIO_PRESET].label} /
        진동: ${HAPTIC_METHOD === 'native-app' ? `앱 진동 '${WARNING_HAPTIC_NATIVE_STYLE}'` : `패턴 [${WARNING_HAPTIC_PATTERN.join(', ')}]`}</p>
      ${IS_IOS ? '<p class="r-meta">iPhone 확인: 설정 › 손쉬운 사용 › 터치 › 진동 켜기 · 사운드 및 햅틱 › 햅틱 “항상 재생” · 무음 모드 해제 · 미디어 볼륨 올리기 · 저전력 모드 끄기</p>' : ''}
      ${IS_IOS && !NATIVE_APP ? '<p class="r-meta"><b>지금은 Safari에서 열려 있어 진동 테스트가 되지 않습니다. 실험 앱(Expo Go) 안에서 열어 주세요.</b></p>' : ''}
      <div class="r-test">${CONDITIONS.map(c => `<button class="btn btn-secondary" data-act="testWarning" data-cond="${c}">${c} 테스트</button>`).join('')}</div>
    </section>
    <section class="r-card"><h2>조건별 요약</h2>${summaryTable(rows, 'condition', CONDITIONS)}</section>
    <section class="r-card"><h2>다크패턴 유형별 요약</h2>${summaryTable(rows, 'taskType', TASK_IDS.map(t => TASK_TYPES[t]))}</section>
    ${parts.map(participantSection).join('') || '<section class="r-card"><p>저장된 데이터가 없습니다.</p></section>'}
    <section class="r-card"><h2>배정표 검증 ${v.allOk ? '<span class="tag tag-ok">정상</span>' : '<span class="tag tag-warn">오류</span>'}</h2>
      <div class="table-wrap"><table class="r-table"><thead><tr><th>ID</th><th>순서 (Task-Condition)</th><th>검증</th></tr></thead><tbody>
      ${v.participants.map(r => `<tr><td>${r.pid}</td><td>${r.sequence}</td><td>${r.ok ? '✓ 과제·조건 각 1회' : esc(r.issues.join(', '))}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="r-meta">${REUSE_ASSIGNMENT_FOR_P11_TO_P20 ? 'P11~P20은 P01~P10과 같은 배정을 사용합니다.' : ''}</p>
    </section>
    <section class="r-card danger"><h2>데이터 삭제</h2><p class="r-meta">삭제 전에 CSV와 JSON 백업을 먼저 받아 두세요.</p>
      <button class="btn btn-danger" style="width:auto" data-act="rWipe">전체 데이터 삭제</button></section>
  </main>`;
}
function rCsv() {
  const rows = buildExportRows();
  if (!rows.length) { alert('저장된 데이터가 없습니다.'); return; }
  download(`moa_experiment_${stamp()}.csv`, '\uFEFF' + toCSV(rows), 'text/csv;charset=utf-8');
}
// iPhone: 공유 시트로 AirDrop / 메일 / 파일 앱 저장
function rShareCsv() {
  const rows = buildExportRows();
  if (!rows.length) { alert('저장된 데이터가 없습니다.'); return; }
  const file = new File(['﻿' + toCSV(rows)], `moa_experiment_${stamp()}.csv`, { type: 'text/csv' });
  navigator.share({ files: [file], title: 'MOA 실험 데이터' }).catch(err => {
    if (err && err.name !== 'AbortError') alert('공유 실패: ' + err.message + '\nCSV 다운로드를 이용해 주세요.');
  });
}
function rJson() {
  download(`moa_experiment_backup_${stamp()}.json`, JSON.stringify({ ...store, exportedAt: iso() }, null, 2), 'application/json');
}
function rDeleteOne({ id }) {
  if (!confirm(`${id}의 기록을 삭제할까요?`)) return;
  if (!confirm(`정말 삭제합니까? ${id}의 기록은 되돌릴 수 없습니다.`)) return;
  delete store.participants[id];
  saveStore();
  deleteAudioFor(id).finally(renderResearcher);      // 이 참가자의 녹음 파일도 삭제
}
function rWipe() {
  if (!confirm('저장된 모든 실험 데이터를 삭제할까요?')) return;
  if (!confirm('마지막 확인: 전체 데이터를 영구 삭제합니다. CSV/JSON 백업을 받았나요? 삭제하려면 확인을 누르세요.')) return;
  store.participants = {};
  saveStore();
  deleteAllAudio().finally(renderResearcher);         // 모든 녹음 파일도 삭제
}
function rImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || typeof d.participants !== 'object') throw new Error('형식이 올바르지 않습니다.');
      const ids = Object.keys(d.participants);
      const dup = ids.filter(id => store.participants[id]);
      if (!confirm(`${ids.length}명의 기록을 불러옵니다.${dup.length ? `\n같은 ID(${dup.join(', ')})는 파일 내용으로 덮어씁니다.` : ''}\n계속할까요?`)) return;
      Object.assign(store.participants, d.participants);
      Object.values(store.participants).forEach(normalizeParticipant);
      saveStore(); renderResearcher();
    } catch (err) { alert('불러오기 실패: ' + err.message); }
  };
  reader.readAsText(file);
}

/* ─── 19-A. 사전설문 · 사후설문 · 사후 인터뷰(음성 녹음) ──────────────── */
const LIKERT_AGREE = ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다'];

// 사전설문 (3개 화면)
const PRE_SURVEY_PAGES = [
  [
    { key: 'age', type: 'number', text: '현재 나이를 만 나이 기준으로 입력해 주세요.' },
    { key: 'dailyUse', type: 'choice', text: '하루 평균 스마트폰을 얼마나 사용하시나요?',
      options: [['lt1', '1시간 미만'], ['1to3', '1~3시간'], ['3to5', '3~5시간'], ['5plus', '5시간 이상']] },
  ],
  [
    // 저장값 1~5 (빈도 순서). 1=한 달에 1번 미만 … 5=일주일에 4번 이상
    { key: 'shoppingFrequency', type: 'choice', text: '스마트폰으로 온라인 쇼핑을 얼마나 자주 이용하시나요?',
      options: [[1, '한 달에 1번 미만 (거의 이용하지 않음)'], [2, '한 달에 1~3번'], [3, '일주일에 1번 정도'], [4, '일주일에 2~3번'], [5, '일주일에 4번 이상']] },
    { key: 'subscriptionExperience', type: 'choice', text: '모바일 앱에서 유료 멤버십이나 정기구독 서비스를 이용해 본 경험이 있나요?',
      options: [[1, '있다'], [0, '없다']] },
    { key: 'mobilePaymentFamiliarity', type: 'scale', labels: LIKERT_AGREE, text: '스마트폰으로 상품을 구매하거나 결제하는 데 익숙하다.' },
  ],
  [
    { key: 'menuFindingConfidence', type: 'scale', labels: LIKERT_AGREE, text: '새로운 앱에서도 원하는 메뉴나 기능을 스스로 찾을 수 있다.' },
    { key: 'settingsFamiliarity', type: 'scale', labels: LIKERT_AGREE, text: '알림, 결제, 구독 등의 앱 설정을 스스로 변경하는 데 익숙하다.' },
  ],
];
const PRE_SURVEY_KEYS = PRE_SURVEY_PAGES.flat().map(q => q.key);
const SURVEY_MISSING_MESSAGE = '응답하지 않은 문항이 있습니다.';

// 사후설문 (No Warning 제외 4개 경고 방식 × 4문항 + 최종 선호)
const POST_CONDITIONS = ['V', 'VA', 'VH', 'VAH'];
const POST_CONDITION_LABEL = { V: '시각 경고', VA: '시각 + 소리 경고', VH: '시각 + 진동 경고', VAH: '시각 + 소리 + 진동 경고' };
const POST_CONDITION_DESC = {
  V: '화면에 경고 창만 나타나는 방식', VA: '경고 창과 함께 소리가 나는 방식',
  VH: '경고 창과 함께 진동이 오는 방식', VAH: '경고 창과 함께 소리와 진동이 모두 나는 방식',
};
const POST_ITEMS = [
  ['noticeable', '이 경고는 쉽게 알아차릴 수 있었다.'],
  ['recheck', '이 경고는 선택하기 전에 화면의 정보와 선택지를 다시 확인하는 데 도움이 되었다.'],
  ['burden', '이 경고는 불편하거나 부담스럽게 느껴졌다.'],
  ['usageIntent', '실제 모바일 서비스에서도 이러한 경고 방식을 사용하고 싶다.'],
];

// 사후 인터뷰 질문
const INTERVIEW_QUESTIONS = [
  ['Q01', '과제를 하면서 경고 창이 나타났을 때, 어떤 느낌이 드셨나요?'],
  ['Q02', '경고를 보고 화면을 다시 살펴보거나, 하려던 선택을 바꾼 적이 있었나요? 있었다면 어떤 상황이었는지 말씀해 주세요.'],
  ['Q03', '화면에만 경고가 나온 때와, 소리나 진동이 함께 나온 때는 어떻게 달랐나요?'],
  ['Q04', '실제 모바일 서비스를 이용한다면 어떤 경고 방식이 가장 적절하다고 생각하시나요? 그 이유는 무엇인가요?'],
];
const INTERVIEW_IDS = INTERVIEW_QUESTIONS.map(q => q[0]);
const MIC_UNAVAILABLE_MESSAGE = '마이크를 사용할 수 없습니다. 연구자에게 알려 주세요.';

const PHASE_LABEL = { preSurvey: '사전설문', tasks: '과제', recognition: '인지 확인', postSurvey: '사후설문', interview: '인터뷰', done: '완료' };

// 기존 참가자 데이터에 새 필드가 없으면 자동 보완 (하위 호환)
function normalizeParticipant(p) {
  if (!p || typeof p !== 'object') return p;
  for (const k of ['results', 'recognition', 'attempts', 'preSurvey', 'postSurvey', 'interview', 'progress', 'practice', 'recognitionAudio']) {
    if (!p[k] || typeof p[k] !== 'object' || Array.isArray(p[k])) p[k] = {};
  }
  if (!Array.isArray(p.sessionEvents)) p.sessionEvents = [];
  if (!p.phase) p.phase = 'tasks';
  return p;
}

/* 공통 UI: 선택 버튼 / 1~5 척도 */
function optionList(survey, q, value, extra = '') {
  return `<div class="opt-list" role="radiogroup">${q.options.map(([v, label]) => {
    const sel = value !== undefined && value !== null && String(value) === String(v);
    return `<button type="button" class="opt-btn ${sel ? 'is-selected' : ''}" data-act="surveyPick" data-survey="${survey}" data-key="${q.key}"
      data-v="${v}" data-num="${typeof v === 'number' ? 1 : 0}" ${extra} role="radio" aria-checked="${sel}">${label}</button>`;
  }).join('')}</div>`;
}
function scaleButtons(survey, key, labels, value, extra = '') {
  return `<div class="scale" role="radiogroup">${[1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="scale-btn ${value === n ? 'is-selected' : ''}" data-act="surveyPick" data-survey="${survey}" data-key="${key}"
      data-v="${n}" data-num="1" ${extra} role="radio" aria-checked="${value === n}" aria-label="${n} ${labels[n - 1]}">${n}</button>`).join('')}</div>
    <div class="scale-ends"><span>1 ${labels[0]}</span><span>5 ${labels[4]}</span></div>
    <p class="scale-picked">${value ? `선택: ${value} ${labels[value - 1]}` : ''}</p>`;
}

/* 사전설문 화면 */
function screenPreSurveyIntro() {
  return `<main class="screen center-screen"><div class="intro-card">
    <p class="step-label">사전 설문조사</p>
    <h2 class="done-title" style="text-align:left;margin-top:8px">사전 설문조사</h2>
    <p class="intro-sub" style="margin:12px 0 24px">실험을 시작하기 전에 스마트폰 사용 경험에 관한 간단한 질문에 답해 주세요.<br>응답 내용은 연구 결과를 분석하는 데에만 사용됩니다.</p>
    <button class="btn btn-primary btn-xl" data-act="preSurveyStart">설문 시작하기</button>
  </div></main>`;
}
function screenPreSurvey() {
  const page = Math.min(session.progress.preSurveyPage || 0, PRE_SURVEY_PAGES.length - 1);
  const ans = session.preSurvey;
  const blocks = PRE_SURVEY_PAGES[page].map((q, i) => {
    let body = '';
    if (q.type === 'number') {
      body = `<p class="q-help">예: 1958년 3월생이면 올해 생일이 지났을 때 68세</p><div class="age-row"><input id="ageInput" class="age-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3"
        value="${ans.age ?? ''}" aria-label="연령"><span class="age-unit">세</span></div>`;
    } else if (q.type === 'choice') body = optionList('pre', q, ans[q.key]);
    else body = scaleButtons('pre', q.key, q.labels, ans[q.key]);
    return `<section class="q-block"><p class="q-num">문항 ${PRE_SURVEY_KEYS.indexOf(q.key) + 1}</p><h3 class="q-title">${q.text}</h3>${body}</section>`;
  }).join('');
  return `<main class="screen survey">
    <p class="step-label">사전 설문 ${page + 1} / ${PRE_SURVEY_PAGES.length}</p>
    ${blocks}
    <p class="form-error" id="surveyError" role="alert"></p>
    <button class="btn btn-primary btn-xl" data-act="preSurveyNext">${page < PRE_SURVEY_PAGES.length - 1 ? '다음' : '설문 마치기'}</button>
  </main>`;
}
function actPreSurveyNext() {
  const page = session.progress.preSurveyPage || 0;
  const ageEl = document.getElementById('ageInput');
  if (ageEl) {
    const raw = ageEl.value.trim();
    session.preSurvey.age = /^\d{1,3}$/.test(raw) && Number(raw) > 0 && Number(raw) < 120 ? Number(raw) : (raw === '' ? undefined : raw);
  }
  const missing = PRE_SURVEY_PAGES[page].some(q => {
    const v = session.preSurvey[q.key];
    return v === undefined || v === null || v === '' || (q.type === 'number' && typeof v !== 'number');
  });
  if (missing) {
    const err = document.getElementById('surveyError');
    err.textContent = SURVEY_MISSING_MESSAGE + (ageEl && typeof session.preSurvey.age === 'string' ? ' (연령은 숫자로 입력해 주세요)' : '');
    err.scrollIntoView({ block: 'center' });
    return;
  }
  session.updatedAt = iso();
  if (page < PRE_SURVEY_PAGES.length - 1) {
    session.progress.preSurveyPage = page + 1;
    saveStore();
    go('preSurvey', {}, { push: false });
    return;
  }
  session.preSurvey.completedAt = iso();
  session.phase = 'practice';
  saveStore();
  go('practiceIntro', {}, { push: false });            // 연습 → (연습 후) 기존 공통 안내 → 과제 1
}

/* 사후설문 화면 */
function screenPostSurveyIntro() {
  return `<main class="screen center-screen"><div class="intro-card">
    <p class="step-label">다음 단계</p>
    <h2 class="done-title" style="text-align:left;margin-top:8px">경고 방식에 대한 설문</h2>
    <p class="intro-sub" style="margin:12px 0 24px">앞에서 경험한 경고 방식에 대해 질문드리겠습니다.<br>정답은 없습니다. 느끼신 그대로 답해 주세요.</p>
    <button class="btn btn-primary btn-xl" data-act="postSurveyStart">설문 시작하기</button>
  </div></main>`;
}
function screenPostSurvey() {
  const idx = session.progress.postSurveyIndex || 0;
  if (idx >= POST_CONDITIONS.length) return screenPostPreference();
  const cond = POST_CONDITIONS[idx];
  const ans = session.postSurvey[cond] || {};
  const blocks = POST_ITEMS.map(([key, text], i) => `<section class="q-block">
      <p class="q-num">문항 ${i + 1}</p><h3 class="q-title">${text}</h3>
      ${scaleButtons('post', key, LIKERT_AGREE, ans[key], `data-cond="${cond}"`)}</section>`).join('');
  return `<main class="screen survey">
    <p class="step-label">경고 방식 ${idx + 1} / ${POST_CONDITIONS.length}</p>
    <div class="cond-card"><h2 class="cond-name">${POST_CONDITION_LABEL[cond]}</h2><p class="cond-desc">${POST_CONDITION_DESC[cond]}</p>
      <button class="btn btn-secondary" data-act="postReplay" data-cond="${cond}">이 경고 다시 확인하기</button></div>
    ${blocks}
    <p class="form-error" id="surveyError" role="alert"></p>
    <button class="btn btn-primary btn-xl" data-act="postSurveyNext">다음</button>
  </main>`;
}
function screenPostPreference() {
  const v = session.postSurvey.preferredCondition;
  const q = { key: 'preferredCondition', options: POST_CONDITIONS.map(c => [c, POST_CONDITION_LABEL[c]]) };
  return `<main class="screen survey">
    <p class="step-label">마지막 질문</p>
    <section class="q-block"><h3 class="q-title">가장 선호하는 경고 방식은 무엇인가요?</h3>${optionList('pref', q, v)}</section>
    <p class="form-error" id="surveyError" role="alert"></p>
    <button class="btn btn-primary btn-xl" data-act="postSurveyNext">설문 마치기</button>
  </main>`;
}
function actPostSurveyNext() {
  const idx = session.progress.postSurveyIndex || 0;
  const err = document.getElementById('surveyError');
  if (idx < POST_CONDITIONS.length) {
    const ans = session.postSurvey[POST_CONDITIONS[idx]] || {};
    if (POST_ITEMS.some(([k]) => typeof ans[k] !== 'number')) { err.textContent = SURVEY_MISSING_MESSAGE; err.scrollIntoView({ block: 'center' }); return; }
    session.progress.postSurveyIndex = idx + 1;
    session.updatedAt = iso();
    saveStore();
    go('postSurvey', {}, { push: false });
    return;
  }
  if (!POST_CONDITIONS.includes(session.postSurvey.preferredCondition)) { err.textContent = SURVEY_MISSING_MESSAGE; return; }
  session.postSurvey.completedAt = iso();
  session.phase = 'interview';
  session.updatedAt = iso();
  saveStore();
  go('interviewIntro', {}, { push: false });
}

// 설문 선택 (화면을 다시 그리지 않고 선택 표시만 바꿈)
function actSurveyPick(d, el) {
  const v = d.num === '1' ? Number(d.v) : d.v;
  let labels = null;
  if (d.survey === 'pre') {
    session.preSurvey[d.key] = v;
    const q = PRE_SURVEY_PAGES.flat().find(x => x.key === d.key);
    labels = q && q.labels;
  } else if (d.survey === 'post') {
    session.postSurvey[d.cond] = session.postSurvey[d.cond] || {};
    session.postSurvey[d.cond][d.key] = v;
    labels = LIKERT_AGREE;
  } else if (d.survey === 'pref') {
    session.postSurvey.preferredCondition = v;
  }
  const group = el.closest('[role=radiogroup]');
  group.querySelectorAll('button').forEach(b => {
    const on = b === el;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-checked', String(on));
  });
  if (labels) {
    const picked = group.parentElement.querySelector('.scale-picked');
    if (picked) picked.textContent = `선택: ${v} ${labels[v - 1]}`;
  }
  const errEl = document.getElementById('surveyError');
  if (errEl) errEl.textContent = '';
  saveStore();
  debugUpdate();
}

/* ── 인터뷰: 녹음 ───────────────────────────────────────────── */
const AUDIO_DB = 'MOAExperimentAudio', AUDIO_STORE = 'recordings';
let micPermission = 'unknown';              // unknown | granted | denied
let micErrorCode = '';                       // 연구자 확인용 원인 코드
let rec = { status: 'idle', qid: null };    // idle | starting | recording | stopping
let recTimer = null;
let playingAudio = null;
const nativeAudioPending = {};               // 요청 id → { resolve, timer }

const fmtDuration = ms => {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const audioKeyOf = (pid, qid) => `${pid}_${qid}`;
const MEDIA_RECORDER_SUPPORTED = typeof window.MediaRecorder !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
function pickRecorderMime() {
  if (!MEDIA_RECORDER_SUPPORTED || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'];
  return candidates.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
}
const extOfMime = m => (/mp4|m4a|aac/.test(m || '') ? 'm4a' : /ogg/.test(m || '') ? 'ogg' : 'webm');

// IndexedDB (브라우저 녹음 보관. localStorage에는 음성을 넣지 않음)
function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('IndexedDB 미지원')); return; }
    const r = indexedDB.open(AUDIO_DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(AUDIO_STORE)) r.result.createObjectStore(AUDIO_STORE); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbRun(mode, fn) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, mode);
    const out = fn(tx.objectStore(AUDIO_STORE));
    tx.oncomplete = () => { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
const idbPut = (key, value) => idbRun('readwrite', s => s.put(value, key));
const idbGet = key => idbRun('readonly', s => s.get(key));
const idbKeys = () => idbRun('readonly', s => s.getAllKeys());
const idbClear = () => idbRun('readwrite', s => s.clear());
async function idbDeleteParticipant(pid) {
  const keys = await idbKeys();
  const mine = (keys || []).filter(k => String(k).startsWith(pid + '_'));
  if (mine.length) await idbRun('readwrite', s => { mine.forEach(k => s.delete(k)); });
  return mine.length;
}

// iPhone 앱 녹음 요청 (응답은 window.__moaNative 로 돌아옴)
function nativeAudioRequest(payload, timeoutMs = 12000) {
  return new Promise(resolve => {
    const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const timer = setTimeout(() => { delete nativeAudioPending[id]; resolve({ ok: false, error: 'app_timeout' }); }, timeoutMs);
    nativeAudioPending[id] = { resolve, timer };
    postToApp({ ...payload, id });
  });
}
function handleInterviewNative(msg) {
  if (msg.type === 'interviewAudioEnded') { onPlaybackEnded(); return; }   // 앱에서 재생이 끝났다는 알림
  const p = nativeAudioPending[msg.id];
  if (!p) return;
  clearTimeout(p.timer);
  delete nativeAudioPending[msg.id];
  p.resolve(msg);
}

async function requestMicPermission() {
  micErrorCode = '';
  if (NATIVE_APP) {
    const r = await nativeAudioRequest({ type: 'interviewMicPermission' });
    micPermission = r.ok && r.granted ? 'granted' : 'denied';
    if (micPermission !== 'granted') {
      // app_timeout: Mac의 App.js가 녹음 기능이 없는 예전 파일 / mic_denied: iPhone 설정에서 마이크 거부 / 그 외: 앱 오류 내용
      micErrorCode = !r.ok ? (r.error || 'app_error') : 'mic_denied';
    }
    return micPermission === 'granted';
  }
  if (!MEDIA_RECORDER_SUPPORTED) { micPermission = 'denied'; micErrorCode = 'recorder_unsupported'; return false; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    micPermission = 'granted';
    return true;
  } catch (e) {
    micPermission = 'denied';
    micErrorCode = (e && e.name) || 'mic_denied';
    return false;
  }
}

function startRecTimer() {
  clearInterval(recTimer);
  recTimer = setInterval(() => {
    const el = document.getElementById('recTimer');
    if (el && rec.status === 'recording') el.textContent = fmtDuration(performance.now() - rec.startedPerf);
    if (DEBUG) debugUpdate();
  }, 250);
}
function stopRecTimer() { clearInterval(recTimer); recTimer = null; }
function setRecError(text) {
  rec.error = text;
  const el = document.getElementById('recError');
  if (el) el.textContent = text;
}

async function actRecordStart() {
  if (rec.status !== 'idle') return;
  const tgt = recTarget();                      // 인터뷰 질문 또는 인지 확인 화면
  const qid = tgt.qid;
  stopPlayback();
  rec = { status: 'starting', qid, error: '' };
  render({ keepScroll: true });
  if (micPermission !== 'granted') {
    const ok = await requestMicPermission();
    if (!ok) {
      rec = { status: 'idle', qid: null, micFailed: true, error: MIC_UNAVAILABLE_MESSAGE + (micErrorCode ? ` (원인 코드: ${micErrorCode})` : '') };
      render({ keepScroll: true });
      return;
    }
  }
  if (NATIVE_APP) {
    const r = await nativeAudioRequest({ type: 'interviewRecordStart', participantId: session.participantId, questionId: qid });
    if (!r.ok) { rec = { status: 'idle', qid: null, error: '녹음을 시작할 수 없습니다. 연구자에게 알려 주세요.' }; render({ keepScroll: true }); return; }
    rec = { status: 'recording', qid, startedPerf: performance.now(), native: true, save: tgt.save };
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      mr.start(1000);
      rec = { status: 'recording', qid, startedPerf: performance.now(), mr, chunks, stream, mime: mr.mimeType || mime, save: tgt.save };
    } catch (e) {
      rec = { status: 'idle', qid: null, micFailed: true, error: MIC_UNAVAILABLE_MESSAGE };
      render({ keepScroll: true });
      return;
    }
  }
  render({ keepScroll: true });
  startRecTimer();
}

async function actRecordStop() {
  if (rec.status !== 'recording') return;
  const cur = rec;
  const pid = session.participantId;
  const webDuration = Math.round(performance.now() - cur.startedPerf);
  rec = { ...cur, status: 'stopping' };
  stopRecTimer();
  render({ keepScroll: true });
  let meta = null;
  if (cur.native) {
    const r = await nativeAudioRequest({ type: 'interviewRecordStop', participantId: pid, questionId: cur.qid });
    if (r.ok) {
      meta = { recorded: true, skipped: false, durationMs: Math.round(r.durationMs || webDuration), mimeType: r.mimeType || 'audio/mp4',
        storageType: 'native', audioKey: audioKeyOf(pid, cur.qid), nativeUri: r.uri || '', fileName: r.fileName || '', recordedAt: iso() };
    }
  } else {
    const blob = await new Promise(resolve => {
      cur.mr.onstop = () => resolve(new Blob(cur.chunks, { type: cur.mr.mimeType || cur.mime || 'audio/webm' }));
      try { cur.mr.stop(); } catch (e) { resolve(new Blob(cur.chunks, { type: cur.mime || 'audio/webm' })); }
    });
    cur.stream.getTracks().forEach(t => t.stop());
    const key = audioKeyOf(pid, cur.qid);
    try {
      await idbPut(key, { blob, mimeType: blob.type, participantId: pid, questionId: cur.qid, durationMs: webDuration, recordedAt: iso() });
      meta = { recorded: true, skipped: false, durationMs: webDuration, mimeType: blob.type, storageType: 'indexedDB', audioKey: key, recordedAt: iso() };
    } catch (e) { console.error('[MOA] 녹음 저장 실패', e); }
  }
  if (meta) {
    cur.save(meta);                             // 다시 녹음하면 같은 키로 교체됨
    session.updatedAt = iso();
    saveStore();
    rec = { status: 'idle', qid: null, error: '' };
  } else {
    rec = { status: 'idle', qid: null, error: '녹음을 저장하지 못했습니다. 다시 녹음해 주세요.' };
  }
  render({ keepScroll: true });
}

// 재생 상태: idle | playing | paused (key = 참가번호_질문)
let playState = { key: null, status: 'idle', native: false };
function stopPlayback() {
  if (playingAudio) { try { playingAudio.pause(); URL.revokeObjectURL(playingAudio.src); } catch (e) { /* noop */ } playingAudio = null; }
  if (playState.native && playState.status === 'playing') nativeAudioRequest({ type: 'interviewAudioPause' }, 3000);
  playState = { key: null, status: 'idle', native: false };
}
function onPlaybackEnded() {
  if (playState.status === 'idle') return;
  playState = { key: null, status: 'idle', native: false };
  refreshPlayButtons();
}
function playLabel(pid, qid, base) {
  if (playState.key !== audioKeyOf(pid, qid)) return base;
  return playState.status === 'playing' ? '⏸ 일시정지' : playState.status === 'paused' ? '▶ 이어 듣기' : base;
}
function refreshPlayButtons() {
  document.querySelectorAll('[data-act="recordPlay"]').forEach(b => {
    b.textContent = playLabel(session && session.participantId, recTarget().qid, b.dataset.base || '▶ 들어보기');
  });
}
// 참가자 화면의 듣기 버튼: 처음 누르면 재생, 재생 중이면 일시정지, 멈춰 있으면 이어 듣기
async function togglePlayback(pid, qid) {
  const key = audioKeyOf(pid, qid);
  if (playState.key === key && playState.status === 'playing') {
    if (playState.native) {
      const r = await nativeAudioRequest({ type: 'interviewAudioPause' }, 3000);
      if (!r.ok) { showToast('일시정지를 하려면 iPhone 앱(App.js) 업데이트가 필요합니다.'); return; }
    } else if (playingAudio) playingAudio.pause();
    playState.status = 'paused';
  } else if (playState.key === key && playState.status === 'paused') {
    if (playState.native) {
      const r = await nativeAudioRequest({ type: 'interviewAudioResume' }, 3000);
      if (!r.ok) { showToast('이어 듣기를 하지 못했습니다.'); return; }
    } else if (playingAudio) await playingAudio.play();
    playState.status = 'playing';
  } else {
    const ok = await playRecording(pid, qid);
    if (ok) playState = { key, status: 'playing', native: audioMetaOf(store.participants[pid], qid).storageType === 'native' };
  }
  refreshPlayButtons();
}
async function playRecording(pid, qid) {
  const meta = audioMetaOf(store.participants[pid], qid);
  if (!meta.recorded) return false;
  stopPlayback();
  if (meta.storageType === 'native') {
    if (!NATIVE_APP) { showToast('이 녹음은 iPhone 실험 앱 안에 저장되어 있습니다.'); return false; }
    const r = await nativeAudioRequest({ type: 'interviewAudioPlay', uri: meta.nativeUri });
    if (!r.ok) showToast('녹음을 재생하지 못했습니다.');
    return !!r.ok;
  }
  try {
    const item = await idbGet(meta.audioKey);
    if (!item || !item.blob) { showToast('녹음 파일을 찾을 수 없습니다.'); return false; }
    playingAudio = new Audio(URL.createObjectURL(item.blob));
    playingAudio.onended = onPlaybackEnded;
    await playingAudio.play();
    return true;
  } catch (e) {
    showToast('녹음을 재생하지 못했습니다.');
    return false;
  }
}

// 참가자/전체 녹음 삭제 (텍스트 데이터 삭제와 함께 호출)
async function deleteAudioFor(pid) {
  try { await idbDeleteParticipant(pid); } catch (e) { console.warn('[MOA] IndexedDB 삭제 실패', e); }
  if (NATIVE_APP) await nativeAudioRequest({ type: 'interviewAudioDelete', participantId: pid });
}
async function deleteAllAudio() {
  try { await idbClear(); } catch (e) { console.warn('[MOA] IndexedDB 삭제 실패', e); }
  if (NATIVE_APP) await nativeAudioRequest({ type: 'interviewAudioDelete', all: true });
}

/* 인터뷰 화면 */
function screenInterviewIntro() {
  return `<main class="screen center-screen"><div class="intro-card">
    <p class="step-label">마지막 단계</p>
    <h2 class="done-title" style="text-align:left;margin-top:8px">사후 인터뷰</h2>
    <p class="intro-sub" style="margin:12px 0 0">마지막으로 앞에서 경험한 경고 방식에 대해 몇 가지 질문드리겠습니다.</p>
    <p class="intro-sub" style="margin:12px 0 0">화면에 질문이 하나씩 나타납니다.<br>질문을 읽은 뒤 녹음 버튼을 누르고 편하게 말씀해 주세요.</p>
    <p class="intro-sub" style="margin:12px 0 24px">녹음된 답변은 연구 분석 목적으로만 사용됩니다.</p>
    <p class="form-error" id="micError" role="alert"></p>
    <p class="mic-code" id="micCode"></p>
    <button class="btn btn-primary btn-xl" data-act="interviewStart">마이크 허용 및 인터뷰 시작</button>
  </div></main>`;
}
function firstOpenInterviewIndex() {
  const i = INTERVIEW_IDS.findIndex(q => { const m = session.interview[q]; return !(m && (m.recorded || m.skipped)); });
  return i === -1 ? INTERVIEW_IDS.length - 1 : i;
}
async function actInterviewStart(d, el) {
  if (el) el.disabled = true;
  const ok = await requestMicPermission();
  if (!ok) {
    const err = document.getElementById('micError');
    if (err) err.textContent = MIC_UNAVAILABLE_MESSAGE;
    const code = document.getElementById('micCode');
    if (code) code.textContent = micErrorCode ? `(원인 코드: ${micErrorCode})` : '';
    if (session) { session.sessionEvents.push({ type: 'mic_unavailable', code: micErrorCode, at: iso() }); saveStore(); }
    if (el) el.disabled = false;
    debugUpdate();
    return;
  }
  session.progress.interviewIndex = firstOpenInterviewIndex();
  saveStore();
  rec = { status: 'idle', qid: null, error: '' };
  go('interview', {}, { push: false });
}
function screenInterview() {
  const idx = Math.min(session.progress.interviewIndex || 0, INTERVIEW_QUESTIONS.length - 1);
  const [qid, text] = INTERVIEW_QUESTIONS[idx];
  const meta = session.interview[qid] || {};
  const isLast = idx === INTERVIEW_QUESTIONS.length - 1;
  const nextLabel = isLast ? '인터뷰 마치기' : '다음 질문';
  let panel;
  if (rec.status === 'recording' && rec.qid === qid) {
    panel = `<p class="rec-status recording" role="status"><span aria-hidden="true">🔴</span> 녹음 중입니다</p>
      <p class="rec-timer" id="recTimer" aria-live="off">${fmtDuration(performance.now() - rec.startedPerf)}</p>
      <button class="btn btn-stop btn-xl" data-act="recordStop">녹음 종료</button>`;
  } else if (rec.status === 'starting' || rec.status === 'stopping') {
    panel = `<p class="rec-status" role="status">${rec.status === 'starting' ? '녹음을 준비하고 있습니다…' : '녹음을 저장하고 있습니다…'}</p>`;
  } else if (meta.recorded) {
    panel = `<p class="rec-done" role="status">답변이 녹음되었습니다. <span class="rec-len">(${fmtDuration(meta.durationMs)})</span></p>
      <div class="btn-stack" style="margin-top:16px">
        <button class="btn btn-secondary btn-xl" data-act="recordPlay" data-base="▶ 답변 들어보기">${playLabel(session.participantId, qid, '▶ 답변 들어보기')}</button>
        <button class="btn btn-secondary btn-xl" data-act="recordStart">다시 녹음하기</button>
        <button class="btn btn-primary btn-xl" data-act="interviewNext">${nextLabel}</button>
      </div>`;
  } else if (meta.skipped) {
    panel = `<p class="rec-done" role="status">이 질문에는 답변하지 않았습니다.</p>
      <div class="btn-stack" style="margin-top:16px">
        <button class="btn btn-secondary btn-xl" data-act="recordStart">🎙 녹음하기</button>
        <button class="btn btn-primary btn-xl" data-act="interviewNext">${nextLabel}</button>
      </div>`;
  } else {
    panel = `<button class="btn btn-primary btn-rec" data-act="recordStart">🎙 녹음 시작</button>
      <button class="btn-text" data-act="interviewSkip">이 질문에는 답변하지 않기</button>`;
  }
  return `<main class="screen survey interview">
    <p class="step-label">인터뷰 ${idx + 1} / ${INTERVIEW_QUESTIONS.length}</p>
    <h2 class="iv-question">${text}</h2>
    <section class="rec-panel">${panel}</section>
    <p class="form-error" id="recError" role="alert">${esc(rec.error || '')}</p>
  </main>`;
}
function actInterviewSkip() {
  if (rec.status !== 'idle') return;
  const qid = INTERVIEW_IDS[session.progress.interviewIndex || 0];
  session.interview[qid] = { recorded: false, skipped: true, durationMs: 0, mimeType: '', storageType: '', audioKey: '', recordedAt: iso() };
  session.updatedAt = iso();
  saveStore();
  render({ keepScroll: true });
}
function actInterviewNext() {
  if (rec.status !== 'idle') return;
  const idx = Math.min(session.progress.interviewIndex || 0, INTERVIEW_IDS.length - 1);
  const meta = session.interview[INTERVIEW_IDS[idx]];
  if (!meta || !(meta.recorded || meta.skipped)) return;
  stopPlayback();
  if (idx < INTERVIEW_IDS.length - 1) {
    session.progress.interviewIndex = idx + 1;
    session.updatedAt = iso();
    saveStore();
    go('interview', {}, { push: false });
    return;
  }
  // Q7까지 녹음 또는 건너뛰기가 끝난 뒤에만 실험 종료
  session.phase = 'done';
  session.completedAt = iso();
  saveStore();
  releaseWakeLock();
  go('end', {}, { push: false });
}

/* 디버그: 단계 이동 · 자동 입력 */
function dbgNeedSession() {
  if (session) return true;
  showToast('먼저 참가 번호로 시작해 주세요.');
  return false;
}
function dbgGoPre() { if (!dbgNeedSession()) return; T = null; session.phase = 'preSurvey'; session.progress.preSurveyPage = 0; saveStore(); go('preSurveyIntro', {}, { push: false }); }
function dbgFillPre() {
  if (!dbgNeedSession()) return;
  Object.assign(session.preSurvey, { age: 68, dailyUse: '1to3', shoppingFrequency: 3, subscriptionExperience: 1,
    mobilePaymentFamiliarity: 4, menuFindingConfidence: 3, settingsFamiliarity: 3 });
  session.phase = 'preSurvey'; saveStore(); T = null;
  go('preSurvey', {}, { push: false });
}
function dbgGoPost() { if (!dbgNeedSession()) return; T = null; session.phase = 'postSurvey'; session.progress.postSurveyIndex = 0; saveStore(); go('postSurveyIntro', {}, { push: false }); }
function dbgFillPost() {
  if (!dbgNeedSession()) return;
  POST_CONDITIONS.forEach((c, i) => { session.postSurvey[c] = { noticeable: 4, recheck: 4, burden: 2 + (i % 2), usageIntent: 4 }; });
  session.postSurvey.preferredCondition = 'VH';
  session.phase = 'postSurvey'; saveStore(); T = null;
  go('postSurvey', {}, { push: false });
}
function dbgGoInterview() { if (!dbgNeedSession()) return; T = null; session.phase = 'interview'; saveStore(); go('interviewIntro', {}, { push: false }); }
function debugSurveyHTML() {
  const recDur = rec.status === 'recording' ? fmtDuration(performance.now() - rec.startedPerf) : '-';
  return `<div class="dbg-sec"><b>설문·인터뷰</b>
    <div class="dbg-btns">
      <button data-act="dbgGoPre">사전설문</button><button data-act="dbgFillPre">사전 자동입력</button>
      <button data-act="dbgGoPost">사후설문</button><button data-act="dbgFillPost">사후 자동입력</button>
      <button data-act="dbgGoInterview">인터뷰</button>
    </div>
    <div>마이크 권한 <b>${micPermission}</b>${micErrorCode ? ` (${esc(micErrorCode)})` : ''} · 녹음 방식 <b>${NATIVE_APP ? 'iPhone 앱(native)' : MEDIA_RECORDER_SUPPORTED ? `MediaRecorder (${pickRecorderMime() || '기본'})` : '미지원'}</b></div>
    <div>녹음 상태 <b>${rec.status}</b> · 현재 녹음 시간 <b>${recDur}</b></div>
    <details><summary>저장된 audio metadata</summary><pre>${esc(session ? JSON.stringify(session.interview, null, 1) : '-')}</pre></details>
  </div>`;
}

/* 연구자 모드: 설문·인터뷰 표시와 CSV */
const PRE_CSV_COLUMNS = ['participantId', ...PRE_SURVEY_KEYS, 'completedAt', 'introViewMs', 'practiceRuns', 'practiceFirstDurationMs', 'practiceLastDurationMs', 'practiceNoticeCloseMs', 'practiceTaskViews', 'practiceSkipped'];
const POST_CSV_COLUMNS = ['participantId', ...POST_CONDITIONS.flatMap(c => POST_ITEMS.map(([k]) => `${c}_${k}`)), 'preferredCondition', 'completedAt'];
const INTERVIEW_CSV_COLUMNS = ['participantId', 'questionId', 'recorded', 'skipped', 'durationMs', 'mimeType', 'storageType', 'audioKey', 'recordedAt'];
const csvOf = (cols, rows) => '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n');
function rPreCsv() {
  const text = preCsvText();
  if (!text) { alert('사전설문 데이터가 없습니다.'); return; }
  download(`moa_presurvey_${stamp()}.csv`, text, 'text/csv;charset=utf-8');
}
function rPostCsv() {
  const text = postCsvText();
  if (!text) { alert('사후설문 데이터가 없습니다.'); return; }
  download(`moa_postsurvey_${stamp()}.csv`, text, 'text/csv;charset=utf-8');
}
function rInterviewCsv() {
  const text = interviewCsvText();
  if (!text) { alert('인터뷰 데이터가 없습니다.'); return; }
  download(`moa_interview_${stamp()}.csv`, text, 'text/csv;charset=utf-8');
}
function participantStatusTag(p) {
  const done = Object.keys(p.results).length;
  if (p.phase === 'done') return '<span class="tag tag-ok">완료</span>';
  if (p.phase === 'tasks') return `<span class="tag">과제 ${done}/5</span>`;
  if (p.phase === 'recognition') return `<span class="tag">인지 확인 ${p.recogIndex}/5</span>`;
  if (p.phase === 'preSurvey') return `<span class="tag">사전설문 ${(p.progress.preSurveyPage || 0) + 1}/${PRE_SURVEY_PAGES.length}</span>`;
  if (p.phase === 'postSurvey') return `<span class="tag">사후설문 ${Math.min((p.progress.postSurveyIndex || 0) + 1, POST_CONDITIONS.length + 1)}/${POST_CONDITIONS.length + 1}</span>`;
  if (p.phase === 'interview') return `<span class="tag">인터뷰 ${INTERVIEW_IDS.filter(q => p.interview[q] && (p.interview[q].recorded || p.interview[q].skipped)).length}/${INTERVIEW_IDS.length}</span>`;
  return `<span class="tag">${PHASE_LABEL[p.phase] || p.phase}</span>`;
}
function participantSurveyHTML(p) {
  const pre = p.preSurvey, post = p.postSurvey;
  const preHTML = Object.keys(pre).length
    ? `<div class="table-wrap"><table class="r-table"><thead><tr>${PRE_SURVEY_KEYS.map(k => `<th>${k}</th>`).join('')}</tr></thead>
       <tbody><tr>${PRE_SURVEY_KEYS.map(k => `<td>${esc(pre[k] ?? '-')}</td>`).join('')}</tr></tbody></table></div>` : '<p class="r-meta">응답 없음</p>';
  const postHTML = Object.keys(post).length
    ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>경고</th>${POST_ITEMS.map(([k]) => `<th>${k}</th>`).join('')}</tr></thead><tbody>
       ${POST_CONDITIONS.map(c => `<tr><td>${c}</td>${POST_ITEMS.map(([k]) => `<td>${(post[c] || {})[k] ?? '-'}</td>`).join('')}</tr>`).join('')}
       </tbody></table></div><p class="r-meta">가장 선호: <b>${post.preferredCondition || '-'}</b></p>` : '<p class="r-meta">응답 없음</p>';
  const recogQs = p.assignment.map(a => 'Recog' + a.taskId).filter(q => audioMetaOf(p, q).recorded);
  const ivRows = [...recogQs, ...INTERVIEW_IDS].map((q, i) => {
    const m = audioMetaOf(p, q);
    const state = m.recorded ? `녹음 완료 ${fmtDuration(m.durationMs)}` : m.skipped ? '답변 안 함' : '-';
    const actions = m.recorded ? `<button class="btn-small" data-act="rPlayAudio" data-id="${p.participantId}" data-q="${q}">재생</button>
      <button class="btn-small" data-act="rSaveAudio" data-id="${p.participantId}" data-q="${q}">${NATIVE_APP ? '공유' : '다운로드'}</button>` : '';
    const label = q.startsWith('Recog') ? `인지확인 ${q.slice(5)}` : `Q${INTERVIEW_IDS.indexOf(q) + 1}`;
    return `<tr><td>${label}</td><td>${state}</td><td>${m.storageType || ''}</td><td class="r-iv-actions">${actions}</td></tr>`;
  }).join('');
  return `<div class="r-sub"><h3>사전설문</h3>${preHTML}</div>
    <div class="r-sub"><h3>사후설문</h3>${postHTML}</div>
    <div class="r-sub"><h3>안내·연습</h3>${practiceSummaryHTML(p)}</div>
    <div class="r-sub"><h3>인터뷰 · 인지 확인 녹음</h3>${participantRecordings(p).length
      ? `<button class="btn btn-secondary r-share-all" data-act="rShareAllAudio" data-id="${p.participantId}">이 참가자 녹음 모두 ${NATIVE_APP ? '공유' : '다운로드'} (${participantRecordings(p).length}개, zip)</button>` : ''}${Object.keys(p.interview).length || recogQs.length
      ? `<div class="table-wrap"><table class="r-table"><thead><tr><th>질문</th><th>상태</th><th>저장</th><th></th></tr></thead><tbody>${ivRows}</tbody></table></div>` : '<p class="r-meta">응답 없음</p>'}</div>`;
}
async function rPlayAudio({ id, q }) { await playRecording(id, q); }
async function rSaveAudio({ id, q }) {
  const m = audioMetaOf(store.participants[id], q);
  if (!m.recorded) return;
  if (m.storageType === 'native') {
    if (!NATIVE_APP) { alert('이 녹음은 iPhone 실험 앱 안에 저장되어 있습니다. 앱의 연구자 모드에서 공유해 주세요.'); return; }
    const r = await nativeAudioRequest({ type: 'interviewAudioShare', uri: m.nativeUri, fileName: m.fileName || `${id}_interview_${q}.m4a` }, 120000);
    if (!r.ok && r.error !== 'cancelled') showToast('공유하지 못했습니다: ' + (r.error || ''));
    return;
  }
  try {
    const item = await idbGet(m.audioKey);
    if (!item || !item.blob) { alert('녹음 파일을 찾을 수 없습니다.'); return; }
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${id}_interview_${q}.${extOfMime(item.blob.type)}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { alert('다운로드 실패: ' + e.message); }
}

// 새 화면과 동작 등록
Object.assign(SCREENS, {
  preSurveyIntro: screenPreSurveyIntro, preSurvey: screenPreSurvey,
  postSurveyIntro: screenPostSurveyIntro, postSurvey: screenPostSurvey,
  interviewIntro: screenInterviewIntro, interview: screenInterview,
});
const SURVEY_ACTIONS = {
  preSurveyStart: () => { session.progress.preSurveyPage = session.progress.preSurveyPage || 0; saveStore(); go('preSurvey', {}, { push: false }); },
  preSurveyNext: actPreSurveyNext,
  postSurveyStart: () => { session.progress.postSurveyIndex = session.progress.postSurveyIndex || 0; saveStore(); go('postSurvey', {}, { push: false }); },
  postSurveyNext: actPostSurveyNext,
  postReplay: d => { ensureAudio(); triggerWarning(d.cond); },
  surveyPick: actSurveyPick,
  interviewStart: actInterviewStart, recordStart: actRecordStart, recordStop: actRecordStop,
  recordPlay: () => togglePlayback(session.participantId, recTarget().qid),
  interviewSkip: actInterviewSkip, interviewNext: actInterviewNext,
  dbgGoPre, dbgFillPre, dbgGoPost, dbgFillPost, dbgGoInterview,
  rPreCsv, rPostCsv, rInterviewCsv, rPlayAudio, rSaveAudio,
  rShareAllAudio: d => rShareAllAudio(d),
  rExportAll: () => rExportAll(),
};

/* ─── 19-B. 실험 안내 · 연습 과제 · 인지 확인 음성 답변 ─────────────── */
const STUDY_DURATION_TEXT = '약 20~30분';                     // 실험 안내에 표시되는 전체 소요 시간
const PRACTICE_NOTICE = { title: '배송 안내', body: '오늘 주문하면 내일 도착합니다.' };
TASK_TEXT.PR = { instruction: '모눈 노트 1개를 구매하려고 하는 상황입니다. 구매를 진행해 주세요.' };
TASK_PRODUCT.PR = 'notebook';                               // 연습에서만 구매 가능
PHASE_LABEL.practice = '연습';

/* 실험 안내 (참가 번호 입력 직후, 사전설문 전) */
function screenStudyIntro() {
  return `<main class="screen survey"><div class="intro-card">
    <p class="step-label">실험 안내</p>
    <h2 class="done-title" style="text-align:left;margin-top:8px">실험 안내</h2>
    <p class="intro-sub" style="margin-top:12px">이 실험은 스마트폰 쇼핑 앱을 사용하는 경험을 알아보기 위한 연구입니다.</p>
    <p class="intro-sub" style="margin-top:16px">실험은 다음 순서로 진행됩니다.</p>
    <ol class="study-steps">
      <li>스마트폰 사용 경험에 관한 간단한 설문</li>
      <li>앱 사용 연습</li>
      <li>쇼핑 앱에서 짧은 과제 5개 수행</li>
      <li>과제에 대한 질문과 설문 <span class="study-note">(일부 답변은 음성으로 녹음됩니다)</span></li>
      <li>짧은 인터뷰 <span class="study-note">(답변은 음성으로 녹음됩니다)</span></li>
    </ol>
    <p class="study-time">전체 시간은 <b>${STUDY_DURATION_TEXT}</b>입니다.</p>
    <p class="intro-sub" style="margin-top:12px">실험에 쓰이는 앱은 연구용으로 만든 가상의 앱입니다. 실제 결제나 가입은 이루어지지 않습니다.</p>
    <p class="intro-sub" style="margin-top:8px">이름 등 개인정보는 기록하지 않으며, 응답은 연구 목적으로만 사용됩니다.</p>
    <p class="intro-sub" style="margin:8px 0 24px">진행 중 불편하시면 언제든지 연구자에게 말씀해 주세요.</p>
    <button class="btn btn-primary btn-xl" data-act="studyIntroNext">다음</button>
  </div></main>`;
}
function actStudyIntroNext() {
  session.progress.introDone = true;
  session.progress.introViewMs = Math.round(performance.now() - lastRenderAt);   // 안내 화면을 본 시간
  session.updatedAt = iso();
  saveStore();
  go(session.progress.preSurveyPage ? 'preSurvey' : 'preSurveyIntro', {}, { push: false });
}

/* 연습 과제 (실험 결과에 포함되지 않음, 경고·소리·진동 없음) */
function screenPracticeIntro() {
  const again = (session.practice.runs || []).length > 0;
  return `<main class="screen center-screen"><div class="intro-card">
    <p class="step-label">앱 사용 연습</p>
    <h2 class="done-title" style="text-align:left;margin-top:8px">본 과제 전에 연습해 봅니다</h2>
    <p class="intro-sub" style="margin-top:12px">앱 사용에 익숙해지도록 짧은 연습을 해 보겠습니다. 연습은 실험 결과에 포함되지 않습니다.</p>
    <div class="task-box"><p class="task-box-label">연습 과제</p><p class="task-box-text">${TASK_TEXT.PR.instruction}</p></div>
    <p class="intro-hint">과제 중에 화면 오른쪽 위 <b>과제 보기</b>를 누르면 이 내용을 다시 볼 수 있습니다.</p>
    <button class="btn btn-primary btn-xl" data-act="practiceStart">${again ? '연습 다시 시작하기' : '연습 시작하기'}</button>
  </div></main>`;
}
function actPracticeStart() {
  ensureAudio();
  T = newTaskState('PR', 'NW', 0);
  T.practice = true;
  T.runNo = (session.practice.runs || []).length + 1;
  logEvent('practice_started', { run: T.runNo });
  navStack = [];
  go('home', {}, { push: false });
}
// 결제 화면에 처음 들어갔을 때 경고와 무관한 중립 안내 창 (X로 닫기 연습)
function showPracticeNotice() {
  warningRoot.innerHTML = `<div class="warn-backdrop">
    <div class="warn-card notice-card" role="dialog" aria-modal="true" aria-labelledby="noticeTitle">
      <button type="button" class="warn-close" data-act="closeWarning" aria-label="안내 닫기">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <h2 class="warn-title notice-title" id="noticeTitle">
        <svg class="warn-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#2F6FDB"/><path d="M12 10.5v6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.4" r="1.3" fill="#fff"/></svg>
        <span>${PRACTICE_NOTICE.title}</span>
      </h2>
      <p class="warn-body">${PRACTICE_NOTICE.body}</p>
    </div></div>`;
  T.noticeShownPerf = performance.now();
  logEvent('practice_notice_shown');
}
function finishPractice() {
  const s = orderSummary(T);
  const run = {
    run: T.runNo, startedAt: T.startedAt, completedAt: iso(),
    durationMs: Math.round(performance.now() - T.startPerf),
    items: s.items.map(p => p.id).join('|'), paidAmount: s.total,
    taskViews: T.events.filter(e => e.type === 'instruction_reopened').length,
    noticeCloseMs: T.noticeCloseMs ?? '',
    events: T.events,
  };
  session.practice.runs = [...(session.practice.runs || []), run];
  session.practice.completedAt = iso();
  session.updatedAt = iso();
  T.finished = true;
  T = null; navStack = [];
  saveStore();
  go('practiceDone', {}, { push: false });
}
function screenPracticeDone() {
  return `<main class="screen center-screen"><div class="intro-card">
    <div class="done-mark" aria-hidden="true">✓</div>
    <h2 class="done-title">연습을 마쳤습니다</h2>
    <p class="done-text">이제 본 과제를 시작합니다.<br>연습을 한 번 더 해 보고 싶으시면 아래 버튼을 눌러 주세요.</p>
    <div class="btn-stack" style="margin-top:0">
      <button class="btn btn-primary btn-xl" data-act="practiceFinish">본 과제 시작하기</button>
      <button class="btn btn-secondary btn-xl" data-act="practiceStart">연습 한 번 더 하기</button>
    </div>
  </div></main>`;
}
function actPracticeFinish() {
  session.phase = 'tasks';
  session.updatedAt = iso();
  saveStore();
  go('commonIntro', {}, { push: false });        // 기존 공통 안내 → 과제 1
}
// 연구자용: 연습 중 '과제 보기' 제목 5번 → 연습 건너뛰기
function confirmSkipPractice() {
  showModal({
    title: '연구자 확인: 연습 건너뛰기',
    body: '연습을 끝내고 본 과제로 넘어갈까요?',
    actions: [{ label: '취소', primary: true }, { label: '연습 건너뛰기', onClick: () => {
      if (T) logEvent('practice_skipped_by_researcher');
      session.practice.skipped = true;
      session.practice.skippedAt = iso();
      T = null; navStack = [];
      actPracticeFinish();
    } }],
  });
}

/* 인지 확인: '있었다' → 음성으로 답변 */
function recTarget() {
  if (view.name === 'recog') {
    const tid = session.assignment[session.recogIndex].taskId;
    return { qid: 'Recog' + tid, save: m => { session.recognitionAudio[tid] = m; }, meta: () => session.recognitionAudio[tid] || {} };
  }
  const qid = INTERVIEW_IDS[session.progress.interviewIndex || 0];
  return { qid, save: m => { session.interview[qid] = m; }, meta: () => session.interview[qid] || {} };
}
function audioMetaOf(p, qid) {
  if (!p) return {};
  if (String(qid).startsWith('Recog')) return (p.recognitionAudio || {})[String(qid).slice(5)] || {};
  return (p.interview || {})[qid] || {};
}
function recogAudioPanel() {
  const tgt = recTarget();
  const meta = tgt.meta();
  let panel;
  if (rec.status === 'recording' && rec.qid === tgt.qid) {
    panel = `<p class="rec-status recording" role="status"><span aria-hidden="true">🔴</span> 녹음 중입니다</p>
      <p class="rec-timer" id="recTimer">${fmtDuration(performance.now() - rec.startedPerf)}</p>
      <button class="btn btn-stop btn-xl" data-act="recordStop">녹음 종료</button>`;
  } else if (rec.status === 'starting' || rec.status === 'stopping') {
    panel = `<p class="rec-status" role="status">${rec.status === 'starting' ? '녹음을 준비하고 있습니다…' : '녹음을 저장하고 있습니다…'}</p>`;
  } else if (meta.recorded) {
    panel = `<p class="rec-done" role="status">답변이 녹음되었습니다. <span class="rec-len">(${fmtDuration(meta.durationMs)})</span></p>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn btn-secondary" data-act="recordPlay" data-base="▶ 들어보기">${playLabel(session.participantId, tgt.qid, '▶ 들어보기')}</button>
        <button class="btn btn-secondary" data-act="recordStart">다시 녹음하기</button>
      </div>`;
  } else if (meta.skipped) {
    panel = `<p class="rec-done" role="status">답변하지 않기로 했습니다.</p>
      <button class="btn btn-secondary" data-act="recordStart" style="margin-top:12px">🎙 녹음하기</button>`;
  } else {
    panel = `<button class="btn btn-primary btn-rec" data-act="recordStart">🎙 녹음 시작</button>
      <button class="btn-text" data-act="recogAudioSkip">답변하지 않기</button>`;
  }
  // 마이크를 쓸 수 없을 때만 글로 적을 수 있게 함
  const fallback = rec.micFailed ? `<label class="q-sub" for="recogText" style="margin-top:16px">녹음이 어려우면 글로 적어 주세요</label>
      <textarea id="recogText" rows="4" placeholder="자유롭게 적어 주세요">${esc(recogDraft.text)}</textarea>` : '';
  return `<div class="recog-audio">
    <p class="q-sub">어떤 부분이 그렇게 느껴졌나요?</p>
    <p class="recog-hint">녹음 버튼을 누르고 편하게 말씀해 주세요.</p>
    <section class="rec-panel" style="margin-top:12px">${panel}</section>
    <p class="form-error" id="recError" role="alert">${esc(rec.error || '')}</p>
    ${fallback}
  </div>`;
}
function actRecogAudioSkip() {
  if (rec.status !== 'idle') return;
  const tid = session.assignment[session.recogIndex].taskId;
  session.recognitionAudio[tid] = { recorded: false, skipped: true, durationMs: 0, mimeType: '', storageType: '', audioKey: '', recordedAt: iso() };
  saveStore();
  render({ keepScroll: true });
}

/* 연구자 모드 표시용 */
function practiceSummaryHTML(p) {
  const pr = p.practice || {};
  const runs = pr.runs || [];
  const intro = p.progress && p.progress.introViewMs != null ? `안내 화면 ${(p.progress.introViewMs / 1000).toFixed(1)}초` : '안내 화면 -';
  const runText = runs.length
    ? runs.map(r => `${r.run}회차 ${fmtDuration(r.durationMs)} (안내 창 닫기 ${r.noticeCloseMs !== '' ? (r.noticeCloseMs / 1000).toFixed(1) + '초' : '-'}, 과제 보기 ${r.taskViews}회)`).join(' · ')
    : '기록 없음';
  return `<p class="r-meta">${intro} · 연습: ${pr.skipped ? '<b>연구자가 건너뜀</b> · ' : ''}${runText}</p>`;
}
const PRACTICE_CSV_COLUMNS = ['introViewMs', 'practiceRuns', 'practiceFirstDurationMs', 'practiceLastDurationMs', 'practiceNoticeCloseMs', 'practiceTaskViews', 'practiceSkipped'];
function practiceCsvFields(p) {
  const runs = (p.practice && p.practice.runs) || [];
  return {
    introViewMs: p.progress && p.progress.introViewMs != null ? p.progress.introViewMs : '',
    practiceRuns: runs.length,
    practiceFirstDurationMs: runs[0] ? runs[0].durationMs : '',
    practiceLastDurationMs: runs.length ? runs[runs.length - 1].durationMs : '',
    practiceNoticeCloseMs: runs[0] ? runs[0].noticeCloseMs : '',
    practiceTaskViews: runs[0] ? runs[0].taskViews : '',
    practiceSkipped: p.practice && p.practice.skipped ? 1 : 0,
  };
}

Object.assign(SCREENS, {
  studyIntro: screenStudyIntro, practiceIntro: screenPracticeIntro, practiceDone: screenPracticeDone,
});
const PRACTICE_ACTIONS = {
  studyIntroNext: actStudyIntroNext, practiceStart: actPracticeStart, practiceFinish: actPracticeFinish,
  recogAudioSkip: actRecogAudioSkip,
};

/* ─── 19-C. 참가자 녹음 모두 공유 (zip 하나로 묶기) ───────────────── */
// 압축 없이 묶는 zip (녹음 파일은 이미 압축된 형식이라 압축 이득이 거의 없음)
const ZIP_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function zipCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = ZIP_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(entries) {               // entries: [{ name, bytes: Uint8Array }]
  const enc = new TextEncoder();
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = zipCrc32(e.bytes), size = e.bytes.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    locals.push(new Uint8Array(lh.buffer), name, e.bytes);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    centrals.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
  let p = 0; for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}

// 참가자의 녹음 목록 (인지 확인 → 인터뷰 순) + 질문 목록 CSV
function participantRecordings(p) {
  const list = [];
  p.assignment.forEach((a, i) => {
    const q = 'Recog' + a.taskId, m = audioMetaOf(p, q);
    if (m.recorded) list.push({ qid: q, kind: '인지 확인', order: i + 1, taskId: a.taskId, condition: a.condition,
      question: `[${TASK_TYPES[a.taskId]}] 이 화면에서 사용자의 선택을 특정 방향으로 유도한다고 느낀 요소가 있었나요? → 어떤 부분이 그렇게 느껴졌나요?`, meta: m });
  });
  INTERVIEW_QUESTIONS.forEach(([q, text], i) => {
    const m = audioMetaOf(p, q);
    if (m.recorded) list.push({ qid: q, kind: '인터뷰', order: i + 1, taskId: '', condition: '', question: text, meta: m });
  });
  return list;
}
function recordingFileName(pid, item) {
  const ext = item.meta.storageType === 'native' ? 'm4a' : extOfMime(item.meta.mimeType);
  return item.meta.fileName || `${pid}_interview_${item.qid}.${ext}`;
}
function recordingsManifestCsv(pid, items) {
  const cols = ['fileName', 'participantId', 'type', 'questionId', 'taskId', 'condition', 'question', 'durationMs', 'durationText', 'recordedAt'];
  const rows = items.map(it => ({ fileName: recordingFileName(pid, it), participantId: pid, type: it.kind, questionId: it.qid,
    taskId: it.taskId, condition: it.condition, question: it.question, durationMs: it.meta.durationMs,
    durationText: fmtDuration(it.meta.durationMs), recordedAt: it.meta.recordedAt }));
  return [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n');
}
async function rShareAllAudio({ id }) {
  const p = store.participants[id];
  if (!p) return;
  const items = participantRecordings(p);
  if (!items.length) { alert('이 참가자의 녹음이 없습니다.'); return; }
  const manifestName = `${id}_recordings_list.csv`;
  const manifest = recordingsManifestCsv(id, items);
  const nativeItems = items.filter(it => it.meta.storageType === 'native');
  const webItems = items.filter(it => it.meta.storageType !== 'native');

  if (NATIVE_APP && nativeItems.length) {
    const cap = await nativeAudioRequest({ type: 'interviewCapabilities' }, 3000);
    if (!cap.ok || !(cap.features || []).includes('shareAll')) {
      alert('녹음 모두 공유를 쓰려면 iPhone 앱(App.js)을 최신 파일로 교체해 주세요.\n그 전까지는 질문별 공유 버튼을 이용해 주세요.');
      return;
    }
    showToast(`녹음 ${nativeItems.length}개를 묶는 중입니다…`);
    const r = await nativeAudioRequest({ type: 'interviewAudioShareAll', participantId: id, zipName: `${id}_recordings.zip`,
      files: nativeItems.map(it => ({ uri: it.meta.nativeUri, name: recordingFileName(id, it) })),
      manifestName, manifest }, 300000);
    if (!r.ok && r.error !== 'cancelled') alert('공유하지 못했습니다: ' + (r.error || ''));
    return;
  }
  if (!webItems.length) { alert('이 녹음들은 iPhone 실험 앱 안에 저장되어 있습니다. 앱의 연구자 모드에서 공유해 주세요.'); return; }
  try {
    const entries = [];
    for (const it of webItems) {
      const rec = await idbGet(it.meta.audioKey);
      if (rec && rec.blob) entries.push({ name: recordingFileName(id, it), bytes: new Uint8Array(await rec.blob.arrayBuffer()) });
    }
    entries.push({ name: manifestName, bytes: new TextEncoder().encode('﻿' + manifest) });
    const blob = new Blob([buildZip(entries)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${id}_recordings.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { alert('녹음 묶기 실패: ' + e.message); }
}

/* ─── 19-D. 전체 내보내기 (CSV 4종 + JSON 백업 + 모든 녹음 → zip 하나) ──── */
function tasksCsvText() {
  const rows = buildExportRows();
  return rows.length ? '﻿' + toCSV(rows) : null;
}
function preCsvText() {
  const rows = sortedParticipants().filter(p => Object.keys(p.preSurvey).length)
    .map(p => ({ participantId: p.participantId, ...p.preSurvey, ...practiceCsvFields(p) }));
  return rows.length ? csvOf(PRE_CSV_COLUMNS, rows) : null;
}
function postCsvText() {
  const rows = sortedParticipants().filter(p => Object.keys(p.postSurvey).length).map(p => {
    const r = { participantId: p.participantId, preferredCondition: p.postSurvey.preferredCondition, completedAt: p.postSurvey.completedAt };
    POST_CONDITIONS.forEach(c => POST_ITEMS.forEach(([k]) => { r[`${c}_${k}`] = (p.postSurvey[c] || {})[k]; }));
    return r;
  });
  return rows.length ? csvOf(POST_CSV_COLUMNS, rows) : null;
}
function interviewCsvText() {
  const rows = [];
  sortedParticipants().filter(p => Object.keys(p.interview).length || Object.keys(p.recognitionAudio || {}).length).forEach(p => {
    const recogIds = p.assignment.map(a => 'Recog' + a.taskId).filter(q => audioMetaOf(p, q).recorded || audioMetaOf(p, q).skipped);
    [...recogIds, ...INTERVIEW_IDS].forEach(q => {
      const m = audioMetaOf(p, q);
      rows.push({ participantId: p.participantId, questionId: q, recorded: m.recorded ? 1 : 0, skipped: m.skipped ? 1 : 0,
        durationMs: m.durationMs ?? '', mimeType: m.mimeType || '', storageType: m.storageType || '', audioKey: m.audioKey || '', recordedAt: m.recordedAt || '' });
    });
  });
  return rows.length ? csvOf(INTERVIEW_CSV_COLUMNS, rows) : null;
}
function exportReadme(parts, nAudio, s) {
  const lines = [
    'MOA 실험 데이터 전체 내보내기',
    `내보낸 시각: ${new Date().toLocaleString('ko-KR')} (기기 시각)`,
    `참가자 수: ${sortedParticipants().length}명 / 녹음 파일: ${nAudio}개`,
    '',
    '[파일 설명]',
    `moa_experiment_${s}.csv  과제 결과 (참가자 × 과제 1행)`,
    `moa_presurvey_${s}.csv   사전설문 + 안내·연습 기록`,
    `moa_postsurvey_${s}.csv  사후설문 (경고 방식별 평가, 선호)`,
    `moa_interview_${s}.csv   녹음 기록 (인지 확인·인터뷰, 음성 제외)`,
    `moa_experiment_backup_${s}.json  전체 백업 (연구자 모드 'JSON 불러오기'로 복원 가능, 음성 제외)`,
    'recordings/참가번호/      참가자별 녹음 파일 + 질문 목록(참가번호_recordings_list.csv)',
    '',
    '시각(…At) 값은 UTC 기준입니다. 한국 시간은 9시간을 더하세요.',
    `포함된 데이터: ${parts.join(', ')}`,
  ];
  return lines.join('\r\n');
}
async function rExportAll() {
  const parts = sortedParticipants();
  if (!parts.length) { alert('저장된 데이터가 없습니다.'); return; }
  const s = stamp();
  const texts = [
    [`moa_experiment_${s}.csv`, tasksCsvText()], [`moa_presurvey_${s}.csv`, preCsvText()],
    [`moa_postsurvey_${s}.csv`, postCsvText()], [`moa_interview_${s}.csv`, interviewCsvText()],
    [`moa_experiment_backup_${s}.json`, JSON.stringify({ ...store, exportedAt: iso() }, null, 2)],
  ].filter(([, c]) => c);
  const audio = [];                           // { path, meta }
  const lists = [];
  for (const p of parts) {
    const items = participantRecordings(p);
    if (!items.length) continue;
    const pid = p.participantId;
    items.forEach(it => audio.push({ path: `recordings/${pid}/${recordingFileName(pid, it)}`, meta: it.meta }));
    lists.push([`recordings/${pid}/${pid}_recordings_list.csv`, '﻿' + recordingsManifestCsv(pid, items)]);
  }
  const allTexts = [['README.txt', exportReadme(texts.map(t => t[0]), audio.length, s)], ...texts, ...lists];
  const zipName = `moa_export_${s}.zip`;

  if (NATIVE_APP) {
    const cap = await nativeAudioRequest({ type: 'interviewCapabilities' }, 3000);
    if (!cap.ok || !(cap.features || []).includes('exportAll')) {
      alert('전체 내보내기를 쓰려면 iPhone 앱(App.js)을 최신 파일로 교체해 주세요.\n그 전까지는 위의 CSV·JSON 버튼과 참가자별 녹음 공유를 이용해 주세요.');
      return;
    }
    const nativeAudio = audio.filter(a => a.meta.storageType === 'native');
    showToast(`데이터와 녹음 ${nativeAudio.length}개를 묶는 중입니다…`);
    const r = await nativeAudioRequest({ type: 'interviewExportAll', zipName,
      textFiles: allTexts.map(([name, content]) => ({ name, content })),
      files: nativeAudio.map(a => ({ uri: a.meta.nativeUri, name: a.path })) }, 600000);
    if (!r.ok && r.error !== 'cancelled') alert('전체 내보내기 실패: ' + (r.error || ''));
    else if (r.ok) showToast(`내보내기 완료: 녹음 ${r.count}개 포함`);
    return;
  }
  try {
    const enc = new TextEncoder();
    const entries = allTexts.map(([name, content]) => ({ name, bytes: enc.encode(content) }));
    for (const a of audio.filter(x => x.meta.storageType !== 'native')) {
      const rec = await idbGet(a.meta.audioKey);
      if (rec && rec.blob) entries.push({ name: a.path, bytes: new Uint8Array(await rec.blob.arrayBuffer()) });
    }
    const blob = new Blob([buildZip(entries)], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url; el.download = zipName;
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  } catch (e) { alert('전체 내보내기 실패: ' + e.message); }
}

/* ─── 20. 이벤트 연결 · 시작 ───────────────────────────────────── */
const ACTIONS = {
  beginTask: actBeginTask, afterTask: actAfterTask,
  commonIntroNext: () => go('taskIntro', {}, { push: false }),
  startRecognition: () => { recogDraft = { yes: null, text: '' }; go('recog', {}, { push: false }); },
  recogAnswer: actRecogAnswer, recogNext: actRecogNext,
  openInstruction: actOpenInstruction, testWarning: actTestWarning,
  go: d => go(d.to, d.id ? { id: d.id } : {}),
  tab: d => { navStack = []; go(d.to, {}, { push: false }); },
  back: () => { if (canGoBack()) goBack(); },
  openProduct: actOpenProduct, closeNagFirst: actCloseNagFirst, nagFirstView: actNagFirstView,
  addToCart: actAddToCart, buyNow: actBuyNow, orderFromCart: actOrderFromCart,
  nagChoice: actNagChoice, toggleAddon: actToggleAddon, pay: actPay, orderDoneOk: actOrderDoneOk,
  startCancel: actStartCancel, retentionChoice: actRetentionChoice, finalCancel: actFinalCancel,
  toTaskDone: () => { if (T) endTaskView(); },
  plusOfferChoice: actPlusOfferChoice, shareChoice: actShareChoice,
  continueToCheckout: () => go('checkout', {}, { push: false }),
  unavailable: d => { showToast('현재 이용할 수 없는 메뉴입니다.'); logEvent('unavailable_menu', { label: d.label }); },
  rCsv, rShareCsv, rJson, rDeleteOne, rWipe, rRefresh: () => renderResearcher(),
  logoTap: actLogoTap,
  closeWarning: () => closeWarningByUser('x_button'),
  abortTap: actAbortTap,
  ...SURVEY_ACTIONS,
  ...PRACTICE_ACTIONS,
};

document.addEventListener('click', e => {
  const dbg = e.target.closest('[data-dbg]');
  if (dbg) { dbgOpen = !dbgOpen; debugUpdate(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || el.closest('.preview-frame')) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  if (!RESEARCHER && performance.now() - lastRenderAt < DOUBLE_TAP_GUARD_MS) {
    if (T) logEvent('tap_ignored_too_fast', { act: el.dataset.act });
    return;
  }
  fn({ ...el.dataset }, el);
});
document.addEventListener('submit', e => {
  if (e.target.id === 'startForm') { e.preventDefault(); actStart(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'recogText') recogDraft.text = e.target.value;
  if (e.target.id === 'pid') startDraft = e.target.value;
});
document.addEventListener('change', e => {
  if (e.target.id === 'importFile') rImport(e.target.files[0]);
});
document.addEventListener('visibilitychange', () => {
  if (T) logEvent('visibility', { state: document.visibilityState });
  if (document.visibilityState === 'visible' && session && session.phase !== 'done') requestWakeLock();
});
window.addEventListener('beforeunload', e => {
  if (!RESEARCHER && !DEBUG && session && session.phase !== 'done') { e.preventDefault(); e.returnValue = ''; }
});

// 콘솔 확인용
window.MOA = {
  store, ASSIGNMENTS, CONDITION_SPEC, validateAssignments, buildExportRows, toCSV, triggerWarning,
  recState: () => ({ ...rec, mr: undefined, stream: undefined, chunks: undefined }), idbKeys,
  state: () => ({ view: view.name, participant: session && session.participantId, task: T && { taskId: T.taskId, condition: T.condition, order: T.order, decision: T.decision } }),
};

// 주소창을 쓸 수 없을 때(iPhone 홈 화면 앱 등): 시작 화면 로고를 3초 안에 5번 터치 → 연구자 모드
let logoTaps = [];
function actLogoTap() {
  const now = performance.now();
  logoTaps = logoTaps.filter(t => now - t < 3000);
  logoTaps.push(now);
  if (logoTaps.length >= 5) location.href = location.pathname + '?researcher=1';
}

function init() {
  if (RESEARCHER) { document.body.classList.add('is-researcher'); renderResearcher(); return; }
  setupBackTrap();
  if (DEBUG) {
    document.body.classList.add('is-debug');
    const v = validateAssignments();
    console.info('[MOA] 배정표 검증', v.allOk ? '정상' : '오류', v);
  }
  go('start', {}, { push: false });
}
init();
