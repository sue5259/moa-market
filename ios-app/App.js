/**
 * MOA 실험 앱 (iPhone · Expo Go)
 *
 * GitHub Pages의 실험 페이지를 앱 화면 전체로 열고,
 * 페이지가 보내는 신호를 받아 iPhone의 실제 진동을 실행한다.
 *   웹 → 앱  { type: 'haptic', style, id }               진동 요청
 *   앱 → 웹  { type: 'hapticAck', id, ok, error, style }  진동 실행 확인 (데이터에 기록됨)
 *   웹 → 앱  { type: 'export', filename, mime, content } CSV/JSON 공유 화면 열기
 *
 * 사후 인터뷰 녹음 (expo-audio 녹음 기능 사용, 응답은 같은 id로 회신)
 *   interviewMicPermission                         → interviewMicPermissionResult { granted }
 *   interviewRecordStart { participantId, questionId } → interviewRecordStarted
 *   interviewRecordStop  { participantId, questionId } → interviewRecordStopped { uri, fileName, durationMs, mimeType }
 *   interviewAudioPlay   { uri }                     → interviewAudioPlayed (끝나면 interviewAudioEnded 알림)
 *   interviewAudioPause / interviewAudioResume       → interviewAudioPaused / interviewAudioResumed
 *   interviewAudioShare  { uri, fileName }           → interviewAudioShared
 *   interviewAudioDelete { participantId | all }     → interviewAudioDeleted { count }
 *   녹음 파일: 앱 문서 폴더/moa-interview/P01_interview_Q01.m4a (참가 번호와 질문 번호만 사용)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as ExpoAudio from 'expo-audio';

// 실험 페이지 주소 (GitHub Pages)
const APP_URL = 'https://sue5259.github.io/moa-market/';
const ALLOWED_HOST = 'sue5259.github.io';
const BG = '#F3F4F6';

// 페이지가 열리기 전에 "앱 안에서 실행 중"임을 알려 줌
const INJECT_BEFORE_LOAD = `window.MOA_NATIVE_APP = { platform: 'ios', shell: 'expo-go', version: 1 }; true;`;

// 진동 실행
//   vibrate : iOS 기본 진동 (약 0.4초, 길이 고정 — iOS는 길이 지정을 지원하지 않음)
//   heavy   : 강하고 짧은 탭
//   warning : iOS 경고형 햅틱
async function runHaptic(style) {
  if (style === 'heavy') return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  if (style === 'warning') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  Vibration.vibrate();
}

// ── 인터뷰 녹음 파일 보관 (Expo SDK 버전에 따라 파일 API가 달라 둘 다 지원) ──
const INTERVIEW_DIR = 'moa-interview';
const SAFE_ID = /^[A-Za-z0-9]+$/;
const useRecorderHook = ExpoAudio.useAudioRecorder || (() => null);
const RECORDING_OPTIONS = ExpoAudio.RecordingPresets ? ExpoAudio.RecordingPresets.HIGH_QUALITY : undefined;

async function setRecordingMode(allowsRecording) {
  if (!ExpoAudio.setAudioModeAsync) return;
  // 녹음 중에만 allowsRecording. 끝나면 꺼서 경고음·재생이 스피커로 나오게 함
  await ExpoAudio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording, shouldRouteThroughEarpiece: false });
}
async function requestMicPermission() {
  if (ExpoAudio.requestRecordingPermissionsAsync) return ExpoAudio.requestRecordingPermissionsAsync();
  if (ExpoAudio.AudioModule && ExpoAudio.AudioModule.requestRecordingPermissionsAsync) return ExpoAudio.AudioModule.requestRecordingPermissionsAsync();
  throw new Error('recording_not_supported');
}
async function saveInterviewFile(srcUri, fileName) {
  if (FileSystem.File && FileSystem.Directory && FileSystem.Paths) {
    const dir = new FileSystem.Directory(FileSystem.Paths.document, INTERVIEW_DIR);
    if (!dir.exists) dir.create();
    const dest = new FileSystem.File(dir, fileName);
    if (dest.exists) dest.delete();                 // 다시 녹음하면 이전 파일 교체
    new FileSystem.File(srcUri).copy(dest);
    return dest.uri;
  }
  const dir = FileSystem.documentDirectory + INTERVIEW_DIR + '/';
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = dir + fileName;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.copyAsync({ from: srcUri, to: dest });
  return dest;
}
async function deleteInterviewFiles(prefix) {
  let count = 0;
  if (FileSystem.File && FileSystem.Directory && FileSystem.Paths) {
    const dir = new FileSystem.Directory(FileSystem.Paths.document, INTERVIEW_DIR);
    if (!dir.exists) return 0;
    for (const item of dir.list()) {
      if (item instanceof FileSystem.File && (!prefix || item.name.startsWith(prefix))) { item.delete(); count++; }
    }
    return count;
  }
  const dir = FileSystem.documentDirectory + INTERVIEW_DIR + '/';
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => []);
  for (const name of names) {
    if (!prefix || name.startsWith(prefix)) { await FileSystem.deleteAsync(dir + name, { idempotent: true }); count++; }
  }
  return count;
}

// 공유용 임시 파일 만들기 (Expo SDK 버전에 따라 파일 API가 달라 둘 다 지원)
async function writeTempFile(filename, content) {
  if (FileSystem.File && FileSystem.Paths) {
    const file = new FileSystem.File(FileSystem.Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(content);
    return file.uri;
  }
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content);
  return uri;
}

function Shell() {
  useKeepAwake();                       // 실험 중 화면 꺼짐 방지
  const webRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // 앱을 열 때마다 주소 뒤에 시각을 붙여 항상 최신 실험 페이지를 받음 (저장된 데이터에는 영향 없음)
  const [pageUrl, setPageUrl] = useState(() => `${APP_URL}?v=${Date.now()}`);

  // 인터뷰 녹음기 (expo-audio)
  const recorder = useRecorderHook(RECORDING_OPTIONS);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const recStartRef = useRef(0);
  const playerRef = useRef(null);

  // 옆면 무음 스위치가 켜져 있어도 경고음이 나도록 오디오 모드 설정
  useEffect(() => {
    try {
      const p = ExpoAudio.setAudioModeAsync && ExpoAudio.setAudioModeAsync({ playsInSilentMode: true });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* 지원하지 않으면 무시 */ }
  }, []);

  const reply = useCallback(payload => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript(`window.__moaNative && window.__moaNative(${JSON.stringify(payload)}); true;`);
  }, []);

  // 인터뷰 녹음 메시지 처리 (haptic / export 처리와는 별개)
  const handleInterview = useCallback(async msg => {
    const done = (type, extra = {}) => reply({ type, id: msg.id, ok: true, ...extra });
    const fail = (type, e) => reply({ type, id: msg.id, ok: false, error: String((e && e.message) || e) });
    const rec = recorderRef.current;
    const pid = String(msg.participantId || ''), qid = String(msg.questionId || '');

    if (msg.type === 'interviewMicPermission') {
      try {
        const st = await requestMicPermission();
        reply({ type: 'interviewMicPermissionResult', id: msg.id, ok: true, granted: !!(st && st.granted) && !!rec });
      } catch (e) { fail('interviewMicPermissionResult', e); }
      return;
    }
    if (msg.type === 'interviewRecordStart') {
      try {
        if (!rec) throw new Error('recording_not_supported');
        if (!SAFE_ID.test(pid) || !SAFE_ID.test(qid)) throw new Error('bad_id');
        if (playerRef.current) { try { playerRef.current.pause(); } catch (e) { /* noop */ } }
        await setRecordingMode(true);
        await rec.prepareToRecordAsync();
        rec.record();
        recStartRef.current = Date.now();
        done('interviewRecordStarted');
      } catch (e) { await setRecordingMode(false).catch(() => {}); fail('interviewRecordStarted', e); }
      return;
    }
    if (msg.type === 'interviewRecordStop') {
      try {
        if (!rec) throw new Error('recording_not_supported');
        await rec.stop();
        const durationMs = Date.now() - recStartRef.current;
        await setRecordingMode(false);
        if (!rec.uri) throw new Error('no_recording_file');
        const fileName = `${pid}_interview_${qid}.m4a`;
        const uri = await saveInterviewFile(rec.uri, fileName);
        done('interviewRecordStopped', { uri, fileName, durationMs, mimeType: 'audio/mp4' });
      } catch (e) { await setRecordingMode(false).catch(() => {}); fail('interviewRecordStopped', e); }
      return;
    }
    if (msg.type === 'interviewAudioPlay') {
      try {
        await setRecordingMode(false);
        const old = playerRef.current;
        if (old) { try { old.pause(); (old.remove || old.release || (() => {})).call(old); } catch (e) { /* noop */ } }
        const player = ExpoAudio.createAudioPlayer({ uri: msg.uri });
        playerRef.current = player;
        if (player.addListener) {
          player.addListener('playbackStatusUpdate', st => {
            if (st && st.didJustFinish && playerRef.current === player) reply({ type: 'interviewAudioEnded', uri: msg.uri });
          });
        }
        player.play();
        done('interviewAudioPlayed');
      } catch (e) { fail('interviewAudioPlayed', e); }
      return;
    }
    if (msg.type === 'interviewAudioPause') {
      try { if (playerRef.current) playerRef.current.pause(); done('interviewAudioPaused'); }
      catch (e) { fail('interviewAudioPaused', e); }
      return;
    }
    if (msg.type === 'interviewAudioResume') {
      try {
        if (!playerRef.current) throw new Error('no_player');
        await setRecordingMode(false);
        playerRef.current.play();
        done('interviewAudioResumed');
      } catch (e) { fail('interviewAudioResumed', e); }
      return;
    }
    if (msg.type === 'interviewAudioShare') {
      try {
        await Sharing.shareAsync(msg.uri, { mimeType: 'audio/mp4', UTI: 'com.apple.m4a-audio', dialogTitle: msg.fileName || 'interview.m4a' });
        done('interviewAudioShared');
      } catch (e) { fail('interviewAudioShared', e); }
      return;
    }
    if (msg.type === 'interviewAudioDelete') {
      try {
        if (!msg.all && !SAFE_ID.test(pid)) throw new Error('bad_id');
        const count = await deleteInterviewFiles(msg.all ? '' : `${pid}_`);
        done('interviewAudioDeleted', { count });
      } catch (e) { fail('interviewAudioDeleted', e); }
    }
  }, [reply]);

  const onMessage = useCallback(async event => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'haptic') {
      let ok = true, error = '';
      try { await runHaptic(msg.style); }
      catch (e) { ok = false; error = String((e && e.message) || e); }
      reply({ type: 'hapticAck', id: msg.id, ok, error, style: msg.style || 'vibrate' });
      return;
    }

    if (typeof msg.type === 'string' && msg.type.startsWith('interview')) {
      await handleInterview(msg);
      return;
    }

    if (msg.type === 'export') {
      const isJson = /\.json$/i.test(msg.filename || '');
      try {
        const uri = await writeTempFile(msg.filename, msg.content);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: msg.mime || (isJson ? 'application/json' : 'text/csv'),
            UTI: isJson ? 'public.json' : 'public.comma-separated-values-text',
            dialogTitle: msg.filename,
          });
        } else {
          await Share.share({ title: msg.filename, message: msg.content });
        }
        reply({ type: 'exportDone', ok: true, filename: msg.filename });
      } catch (e) {
        // 파일 공유가 안 되면 내용 자체를 텍스트로 공유 (메일·메모에 붙여넣기 가능)
        try {
          await Share.share({ title: msg.filename, message: msg.content });
          reply({ type: 'exportDone', ok: true, filename: msg.filename, fallback: 'text' });
        } catch (e2) {
          reply({ type: 'exportDone', ok: false, error: String((e2 && e2.message) || e2) });
        }
      }
    }
  }, [reply, handleInterview]);

  // 실험 페이지 밖으로 나가는 링크 차단
  const onShouldStart = useCallback(req => {
    const url = req.url || '';
    return url.startsWith('about:') || url.includes(ALLOWED_HOST);
  }, []);

  if (failed) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errTitle}>실험 페이지를 불러오지 못했습니다</Text>
        <Text style={styles.errText}>인터넷 연결을 확인한 뒤 다시 시도해 주세요.</Text>
        <Pressable style={styles.retry} onPress={() => { setFailed(false); setPageUrl(`${APP_URL}?v=${Date.now()}`); setReloadKey(k => k + 1); }}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <WebView
        key={reloadKey}
        ref={webRef}
        source={{ uri: pageUrl }}
        injectedJavaScriptBeforeContentLoaded={INJECT_BEFORE_LOAD}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        bounces={false}
        dataDetectorTypes="none"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}><ActivityIndicator size="large" color="#0F6B5C" /></View>
        )}
        onError={() => setFailed(true)}
        onHttpError={e => { if (e.nativeEvent.statusCode >= 400) setFailed(true); }}
        style={styles.web}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: BG },
  errTitle: { fontSize: 22, fontWeight: '800', color: '#16191D', textAlign: 'center' },
  errText: { fontSize: 18, color: '#434A53', marginTop: 8, textAlign: 'center' },
  retry: { marginTop: 24, minHeight: 56, paddingHorizontal: 32, borderRadius: 12, backgroundColor: '#0F6B5C', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 19, fontWeight: '700' },
});
