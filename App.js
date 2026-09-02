import './global.css';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Animated,
  Platform,
  StatusBar,
  KeyboardAvoidingView } from 'react-native';
import { SafeAreaView, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
// 書体。英単語と数字だけに当てる（日本語はヒラギノ等のシステム書体に任せる＝容量0）
import { useFonts, Lora_400Regular, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import { IBMPlexMono_400Regular, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
// 色・角丸・余白の値。tailwind.config.js もこれを読んでいる
import { C, R, SP, F as RAW_F } from './src/theme';
import * as Storage from './src/lib/storage';
// ファイル入出力・確認ダイアログ・発音はネイティブ／Web で実装が分かれる（.web.js を Metro が解決する）
import { saveBackup, pickBackup } from './src/lib/backup';
import { confirmDestructive } from './src/lib/confirm';
import { speakWord, stopSpeaking, setSpeechVolume } from './src/lib/speech';
import { pickPhoto } from './src/lib/photo';
import {
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  makeDeck,
  moveDeck,
  nextDeckId,
  uniqueDeckName,
  normalizeState,
  countBrokenWords,
  countScheduled,
  SR_VERSION,
  planImport,
  deckNameFromFile,
  buildState } from './src/lib/decks';
import {
  localDateStr,
  getToday,
  getYesterday,
  getDaysAgo,
  addDays,
  daysBetween,
  shuffleArr,
  clamp,
  calcProg,
  calcWeight,
  speedFactor,
  streakFromDates,
  nextSchedule,
  isDue,
  formatDue,
  addStudyTime,
  sumStudyTime,
  formatDuration,
  formatBytes,
  getLevel,
  LEVELS,
  inLevel,
  isWeak,
  isNew,
  parseLine,
  INIT_WORDS } from './src/lib/logic';

const STORAGE_KEY = '@eitango_state_v1';

/* Lora と IBM Plex Mono は欧文しか持っていない。
   Web でこの2つだけを指定すると、日本語がブラウザ既定の書体（Times など）に落ちてしまう。
   そこで Web のときだけ後ろにシステム書体を並べ、英数字＝Lora／日本語＝ヒラギノ、と描き分けさせる。
   iOS ではフォールバックの並記が効かないので、そのまま1書体だけを渡す。 */
const JP_FALLBACK = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif';
const ff = (name) => (Platform.OS === 'web' ? `${name}, ${JP_FALLBACK}` : name);
const F = {
  en: ff(RAW_F.en),
  enSemi: ff(RAW_F.enSemi),
  enBold: ff(RAW_F.enBold),
  num: ff(RAW_F.num),
  numBold: ff(RAW_F.numBold),
};
// 数字はこれを style に渡す。桁が動いても幅がガタつかない
const NUM = { fontFamily: F.num, fontVariant: ['tabular-nums'] };
const NUM_BOLD = { fontFamily: F.numBold, fontVariant: ['tabular-nums'] };

/* ===========================================================================
   見た目の共通パーツ（デザイン案A「英単語ノート」）

   ルールは design/DESIGN.md にまとめてある。要点だけ:
   - 影は使わない。段差は 1px の罫線と、紙（bg）と紙片（surface）のわずかな色差で作る
   - 押せるもの＝色の面がある／読むだけ＝罫線だけ
   - 英単語と数字だけ Lora / IBM Plex Mono を当てる。日本語はシステム書体のまま
   - 「いま見てほしい」ブロックは左端に3pxの縦罫（藍＝やること、朱＝赤ペンの印）
   =========================================================================== */

// Ionicons に無いものだけ MaterialCommunityIcons から借りる
const MCI_NAMES = new Set(['brain', 'fountain-pen-tip', 'notebook-outline', 'bookshelf', 'cards-outline']);
const Icon = ({ name, size = 20, color = C.text, style }) =>
  MCI_NAMES.has(name) ? (
    <MaterialCommunityIcons name={name} size={size} color={color} style={style} />
  ) : (
    <Ionicons name={name} size={size} color={color} style={style} />
  );

// 罫線1本。ノートの横罫。区切りはこれで作る
const Rule = ({ className = '', color }) => (
  <View className={`h-px ${className}`} style={{ backgroundColor: color || C.border }} />
);

// 紙片＝カード。全画面でこの1種類に揃える（影なし・1px罫線・角丸10px）
// mark に色を渡すと左端に3pxの縦罫が入る＝「赤ペンで囲んだ」段差
const Sheet = ({ children, className = '', mark, style }) => (
  // 左端の縦罫は、カードの内寸（p-4＝16px）の中に収める。
  // ここで paddingLeft を足すと className の p-4 を style 側が上書きして内寸が潰れるので足さない。
  <View className={`bg-sheet border border-rule rounded-lg overflow-hidden ${className}`} style={style}>
    {mark ? <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: mark }} /> : null}
    {children}
  </View>
);

// カードの中の見出し。サイズ＋太さ＋色の3つで階層を作る（太字だけで差をつけない）
const SectionTitle = ({ children, right, icon, iconColor, className = '' }) => (
  <View className={`flex-row items-center justify-between ${className}`} style={{ marginBottom: SP[3] }}>
    <View className="flex-row items-center" style={{ gap: SP[2] }}>
      {icon ? <Icon name={icon} size={16} color={iconColor || C.muted} /> : null}
      <Text className="text-base font-bold text-ink">{children}</Text>
    </View>
    {right}
  </View>
);

// 画面の顔。紫のベタ帯はやめ、紙の上に見出しを置いて罫線で締める。
// kicker は日付や英字などノートの上端の書き込み（Lora）、title は日本語の見出し。
const PageTitle = ({ title, sub, kicker, right }) => (
  <View className="bg-paper">
    <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[3] }}>
      <View className="flex-row items-end justify-between" style={{ gap: SP[3] }}>
        <View className="flex-1">
          {kicker ? (
            <Text className="text-sm" style={{ fontFamily: F.enSemi, color: C.muted, letterSpacing: 0.8, marginBottom: SP[1] }}>
              {kicker}
            </Text>
          ) : null}
          <Text className="text-2xl font-bold text-ink" style={{ letterSpacing: -0.2 }} numberOfLines={1}>
            {title}
          </Text>
          {sub ? (
            <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1], lineHeight: 18 }} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
    <Rule />
  </View>
);

// 押せるボタン。tone は navy（主役）/ line（枠だけ）/ red（赤ペン）/ green（正解）
const TONES = {
  navy: { bg: C.primary, fg: C.onPrimary, bd: C.primary },
  red: { bg: C.accent, fg: C.onPrimary, bd: C.accent },
  green: { bg: C.success, fg: C.onPrimary, bd: C.success },
  line: { bg: 'transparent', fg: C.primary, bd: C.primary },
  lineRed: { bg: 'transparent', fg: C.accent, bd: C.accent },
  quiet: { bg: C.surface, fg: C.muted, bd: C.border },
};
const Btn = ({ label, onPress, tone = 'navy', icon, disabled, className = '', style, small }) => {
  const t = TONES[disabled ? 'quiet' : tone] || TONES.navy;
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      activeOpacity={0.75}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center justify-center rounded ${className}`}
      style={[
        {
          backgroundColor: t.bg,
          borderWidth: 1,
          borderColor: t.bd,
          paddingVertical: small ? 8 : 12,
          paddingHorizontal: SP[4],
          minHeight: small ? 36 : 44,
          gap: SP[2],
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={small ? 15 : 17} color={t.fg} /> : null}
      <Text className={small ? 'text-xs font-bold' : 'text-sm font-bold'} style={{ color: t.fg }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

// 空っぽの画面。罫線だけ引いた白紙に、次の一手を1つだけ置く
const EmptyState = ({ title, body, actionLabel, onAction, icon = 'create-outline', tone = 'navy' }) => (
  <View className="items-center" style={{ paddingVertical: 40, paddingHorizontal: SP[4] }}>
    {/* 白紙のノート。罫線を4本引いて「まだ何も書いていない」ことを絵にする */}
    <View className="w-full bg-sheet border border-rule rounded-lg" style={{ maxWidth: 260, paddingVertical: SP[4], marginBottom: SP[4] }}>
      <View style={{ position: 'absolute', left: 22, top: 0, bottom: 0, width: 1, backgroundColor: C.accentTint }} />
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ height: 1, backgroundColor: C.border, marginTop: i === 0 ? 0 : 17, marginHorizontal: SP[3] }} />
      ))}
      <View style={{ position: 'absolute', right: SP[3], bottom: SP[2] }}>
        <Icon name={icon} size={20} color={C.border2} />
      </View>
    </View>
    <Text className="text-base font-bold text-ink text-center" style={{ marginBottom: SP[1], lineHeight: 24 }}>
      {title}
    </Text>
    {body ? (
      <Text className="text-xs text-ink-soft text-center" style={{ lineHeight: 19, marginBottom: SP[4], maxWidth: 280 }}>
        {body}
      </Text>
    ) : null}
    {actionLabel && onAction ? <Btn label={actionLabel} onPress={onAction} tone={tone} /> : null}
  </View>
);

export default function App() {
  // ===== 本棚 =====
  // 単語帳は複数持てる。既存の画面はすべて「選択中の1冊」だけを見ればよいように、
  // words / nid は選択中の単語帳を指す値として下で組み立てている。
  const [decks, setDecks] = useState(() => [makeDeck({ id: 1, name: 'マイ単語帳', words: INIT_WORDS, nid: 31 })]);
  const [activeId, setActiveId] = useState(1);

  const [scr, setScr] = useState('dashboard');
  const [streak, setStreak] = useState(0);
  // 「最後に学習した日」。まだ一度も学習していなければ null。
  // ここを getToday() で初期化すると、学習していないのに「今日はもう学習済み」と
  // みなされてしまい、連続日数が永久に加算されない（実際にその不具合があった）。
  const [lastDate, setLastDate] = useState(null);
  const [toast, setToast] = useState('');
  const [loaded, setLoaded] = useState(false);

  /* 英単語と数字に使う書体を読む。
     ⚠️ 読み終わるのを待って return null しないこと。待つと Web 版で一瞬まっ白になる。
     読めていない間はシステム書体で描かれ、読めた時点で自然に差し替わる。 */
  useFonts({
    Lora_400Regular,
    Lora_600SemiBold,
    Lora_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
  });

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeId) || decks[0],
    [decks, activeId]
  );
  const words = activeDeck ? activeDeck.words : [];
  const nid = activeDeck ? activeDeck.nid : 1;

  // 選択中の単語帳の中身だけを書き換える。
  // 既存コードは setWords(配列) / setWords(関数) の両方を使うので、どちらも受ける。
  const updateActive = useCallback(
    (patch) => setDecks((ds) => ds.map((d) => (d.id === activeId ? { ...d, ...patch(d) } : d))),
    [activeId]
  );
  const setWords = useCallback(
    (v) => updateActive((d) => ({ words: typeof v === 'function' ? v(d.words) : v })),
    [updateActive]
  );
  const setNid = useCallback(
    (v) => updateActive((d) => ({ nid: typeof v === 'function' ? v(d.nid) : v })),
    [updateActive]
  );

  // 学習設定
  const [cfgMode, setCfgMode] = useState(null);
  const [wordSel, setWordSel] = useState('normal');
  const [rStart, setRStart] = useState(1);
  const [rEnd, setREnd] = useState(30);
  const [rST, setRST] = useState('1');
  const [rET, setRET] = useState('30');
  // 出題数の既定は「全」（9999 は全件を意味する番兵。実際は対象単語数で頭打ちになる）
  const [numQ, setNumQ] = useState(9999);
  // ダブルタップモード（フラッシュカードのみ）。
  // オンだと「知ってた／知らない」の1回目のタップでは判定せず、意味を出すだけにする。
  // 意味を確かめてからもう一度押して判定する＝誤タップで進んでしまうのを防ぐ。
  const [dblTap, setDblTap] = useState(false);

  // 読み上げの音量（0〜1）。iPhone 本体の音量とは別に、アプリ内だけで下げられる
  const [volume, setVolume] = useState(1);

  // 学習時間の記録 { 'YYYY-MM-DD': { ms, n } }。
  // 時間を測れるのはフラッシュカードだけなので、積まれるのもそのぶんだけ
  const [timeLog, setTimeLog] = useState({});

  // 学習中
  const [sWords, setSWords] = useState([]);
  const [sIdx, setSIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [selAns, setSelAns] = useState(null);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [opts, setOpts] = useState([]);
  const [sMode, setSMode] = useState('');

  // フラッシュカードの「1つ前にもどる」用の控え。1枚判定するごとに
  // { word: 判定する前の単語, timeLog: 積む前の学習時間 } を積む。
  // 判定を押し間違えたときに、点も復習日も押す前に戻してからやり直せるようにするため。
  // 出題を始めるたびに空にする（前回の学習まで巻き戻さない）。
  const [undoStack, setUndoStack] = useState([]);

  // マッチング
  const [mWords, setMWords] = useState([]);
  const [mJa, setMJa] = useState([]);
  const [selEn, setSelEn] = useState(null);
  const [selJa, setSelJa] = useState(null);
  const [matched, setMatched] = useState(new Set());
  const [mErr, setMErr] = useState(0);
  const [mFailed, setMFailed] = useState(new Set());

  // スピード
  const [timer, setTimer] = useState(60);
  const [spScore, setSpScore] = useState(0);
  const [spTotal, setSpTotal] = useState(0);
  const tRef = useRef(null);

  // 単語管理
  const [showAdd, setShowAdd] = useState(false);
  const [newEn, setNewEn] = useState('');
  const [newJa, setNewJa] = useState('');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState(null);
  const [editEn, setEditEn] = useState('');
  const [editJa, setEditJa] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [wordFilter, setWordFilter] = useState('all');
  const [wordsTab, setWordsTab] = useState('manage');
  const [listHideEn, setListHideEn] = useState(false);
  const [listHideJa, setListHideJa] = useState(true);
  const [revealed, setRevealed] = useState(new Set());

  // 本棚（どの単語帳の名前を編集中か。null なら編集していない）
  const [editDeckId, setEditDeckId] = useState(null);
  const [editDeckName, setEditDeckName] = useState('');
  // 長押しで開く編集メニューの対象。null なら閉じている
  const [menuDeckId, setMenuDeckId] = useState(null);
  // 並べ替えモード中か。この間はカードのタップで単語帳を切り替えない
  const [sorting, setSorting] = useState(false);

  // 長押しの判定は自前でやる。
  // TouchableOpacity の onLongPress は react-native-web では発火しないことを実測で確認したため
  // （マウスで900ms押しても反応せず、離すと通常タップ扱いになった）。
  // onPressIn/onPressOut は効くので、その間の時間を測る。
  const longPress = useRef({ timer: null, fired: false });
  const startLongPress = useCallback((onFire) => {
    longPress.current.fired = false;
    clearTimeout(longPress.current.timer);
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      onFire();
    }, 450);
  }, []);
  const cancelLongPress = useCallback(() => clearTimeout(longPress.current.timer), []);
  useEffect(() => () => clearTimeout(longPress.current.timer), []);

  // フラッシュカードで、カードが表示された時刻。答えるまでの速さの計測に使う
  const cardShownAt = useRef(0);

  // 連続日数を今日ぶん数えたか（同じ操作で二重に加算しないための見張り）
  const countedDay = useRef(null);

  // フラッシュカードドラッグ
  const pan = useRef(new Animated.Value(0)).current;
  const [dragOff, setDragOff] = useState(0);

  // 初回ロード。
  // 新形式(v2)が無ければ旧形式(v1)から移行する。v1 のデータは消さずに残すので、
  // 万一移行に失敗しても元データは失われない。
  useEffect(() => {
    (async () => {
      try {
        const rawV2 = await Storage.getItem(STORAGE_KEY_V2);
        const raw = rawV2 || (await Storage.getItem(STORAGE_KEY_V1));
        if (raw) {
          const parsed = JSON.parse(raw);
          const state = normalizeState(parsed);
          if (state) {
            setDecks(state.decks);
            setActiveId(state.active);
            setStreak(state.s);
            if (state.ld) setLastDate(state.ld);
            setDblTap(state.dt === true);
            if (typeof state.vol === 'number') setVolume(state.vol);
            if (state.time) setTimeLog(state.time);
            // normalizeState が黙って書き換えたぶんは必ず知らせる。
            // 直したことに気づかないまま使われるのが一番まずい。
            //   1. 貼り付けの区切りを読み違えていた頃に壊れた単語 → 直した
            //   2. 昔の記録から後付けしていた復習の予定 → 外した（今日から組み直す）
            const notes = [];
            const fixed = countBrokenWords(parsed);
            if (fixed > 0) notes.push(`貼り付けで壊れていた${fixed}語を直しました`);
            if (parsed.srv !== SR_VERSION) {
              const dropped = countScheduled(parsed);
              if (dropped > 0) notes.push(`復習の予定を今日から組み直します（古い予定${dropped}語ぶんを外しました）`);
            }
            if (notes.length) setToast(notes.join('\n'));
          }
        }
      } catch (e) {
        console.log('load err', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // 自動保存。
  // 上限超過（QuotaExceededError）は握りつぶさずユーザーに知らせる。
  // 黙って保存されないのが一番まずい。
  //
  // 保存先は Web だと IndexedDB（src/lib/storage.web.js）。以前は localStorage で、
  // iPhone の 5MB 上限に当たって保存できなくなることがあった。
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      Storage.setItem(
        STORAGE_KEY_V2,
        JSON.stringify(buildState({ decks, active: activeId, s: streak, ld: lastDate, dt: dblTap, vol: volume, time: timeLog }))
      ).catch((e) => {
        const quota = String(e?.name || e?.message || '').toLowerCase().includes('quota');
        // 何が容量を食っているかは場合によるので、写真と決めつけない。
        // 実際の内訳は「データ管理」の保存データの大きさで見られる
        setToast(quota ? '保存領域がいっぱいです。データ管理で大きさを確認してください' : '保存に失敗しました');
      });
    }, 500);
    return () => clearTimeout(t);
  }, [decks, activeId, streak, lastDate, dblTap, volume, timeLog, loaded]);

  // 本棚を離れたら並べ替えモードは解除する。
  // 付けっぱなしで戻ってくると、タップしても単語帳が切り替わらず戸惑うため
  useEffect(() => {
    if (scr !== 'shelf') setSorting(false);
  }, [scr]);

  // 保存データの大きさ。何が容量を食っているかを「データ管理」に出すために測る。
  //
  // 全部を JSON 化するので安くはない。ホーム画面を開いている間だけ、
  // 変更が落ち着いてから測る（学習中に毎回測ると重くなる）。
  const [dataSize, setDataSize] = useState(null);
  useEffect(() => {
    if (scr !== 'dashboard' || !loaded) return;
    const t = setTimeout(() => {
      const cover = decks.reduce((n, d) => n + (d.cover ? d.cover.length : 0), 0);
      const total = JSON.stringify(
        buildState({ decks, active: activeId, s: streak, ld: lastDate, dt: dblTap, vol: volume, time: timeLog })
      ).length;
      setDataSize({
        cover,
        words: Math.max(0, total - cover),
        total,
        wordCnt: decks.reduce((n, d) => n + d.words.length, 0),
        coverCnt: decks.filter((d) => !!d.cover).length });
    }, 300);
    return () => clearTimeout(t);
  }, [scr, loaded, decks, activeId, streak, lastDate, dblTap, volume, timeLog]);

  // 端末側の空き容量。ブラウザが教えてくれる場合だけ出す（ネイティブは常に null）
  const [quota, setQuota] = useState(null);
  useEffect(() => {
    if (scr !== 'dashboard') return;
    Storage.estimateQuota().then(setQuota).catch(() => {});
  }, [scr]);

  // フラッシュカードで単語が出たら、その単語を発音する。
  // 依存に flipped を入れていないので、カードをめくり直しても鳴り直さない。
  // 他のモード（クイズ・タイピング等）では鳴らさない。
  // あわせて、答えるまでの時間を測るためにカードが出た時刻を控える。
  useEffect(() => {
    if (scr !== 'flashcard') return;
    const w = sWords[sIdx];
    if (!w) return;
    cardShownAt.current = Date.now();
    speakWord(w.en);
  }, [scr, sIdx, sWords]);

  // 画面が変わったときに音を止めることはしない。音は1秒未満で、
  // speakWord が次を鳴らす前に前の音を止めるので鳴りっぱなしにはならない。
  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => () => { if (tRef.current) clearInterval(tRef.current); }, []);
  useEffect(() => {
    if (scr !== 'speed' && tRef.current) {
      clearInterval(tRef.current);
      tRef.current = null;
    }
  }, [scr]);
  useEffect(() => {
    if (scr === 'speed' && timer === 0) {
      if (tRef.current) clearInterval(tRef.current);
      recStreak();
      setScr('results');
    }
  }, [timer, scr]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const mast = useMemo(() => words.filter((w) => w.progress >= 80).length, [words]);
  const learn = useMemo(() => words.filter((w) => w.progress >= 20 && w.progress < 80).length, [words]);

  // 覚え具合の段階ごとの語数。単語帳の絞り込みと統計の分布グラフが同じものを見る。
  // 段階の数だけ filter を回すと 1900 語で6周するので、1語につき1回だけ数える。
  // キーは LEVELS の k（'lv_review' など）と、どの段階にも入らない 'new'（未学習）。
  const lvCount = useMemo(() => {
    const m = { new: 0 };
    for (const lv of LEVELS) m[lv.k] = 0;
    for (const w of words) m[isNew(w) ? 'new' : getLevel(w.progress || 0).k]++;
    return m;
  }, [words]);
  const todayN = useMemo(() => {
    const t = getToday();
    return words.filter((w) => w.reviewedDates && w.reviewedDates.includes(t)).length;
  }, [words]);
  const totalStudied = useMemo(() => words.filter((w) => (w.correct + w.incorrect) > 0).length, [words]);
  const neverStudied = useMemo(() => words.filter((w) => (w.correct + w.incorrect) === 0).length, [words]);
  const totalCorrect = useMemo(() => words.reduce((s, w) => s + w.correct, 0), [words]);
  const totalIncorrect = useMemo(() => words.reduce((s, w) => s + w.incorrect, 0), [words]);
  const totalAccuracy = totalCorrect + totalIncorrect > 0 ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100) : 0;
  const weakWords = useMemo(() => words.filter(isWeak).sort((a, b) => a.progress - b.progress), [words]);
  const avgP = words.length ? Math.round(words.reduce((s, w) => s + w.progress, 0) / words.length) : 0;

  // ===== 間隔反復 =====
  // 今日やるべき単語（復習日が来ているもの）。期限を過ぎたものほど前に並べる
  const dueWords = useMemo(() => {
    const td = getToday();
    return words
      .filter((w) => isDue(w, td))
      .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  }, [words]);

  // 予定が付いている単語の数（＝一度は学習した単語）
  const scheduledCnt = useMemo(() => words.filter((w) => !!w.due).length, [words]);

  // 今日ぶんを終えたときに「次はいつか」を出すための、一番近い予定日
  const nextDueDay = useMemo(() => {
    const td = getToday();
    let best = null;
    for (const w of words) if (w.due && w.due > td && (!best || w.due < best)) best = w.due;
    return best;
  }, [words]);

  // これから7日ぶんの復習予定（統計画面のグラフ用）。
  // 今日の欄には期限を過ぎたぶんも含める（放置した単語が消えて見えないように）
  const dueForecast = useMemo(() => {
    const td = getToday();
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(td, i);
      const count = words.filter((w) => (i === 0 ? isDue(w, td) : w.due === day)).length;
      const [, m, d] = day.split('-');
      return { date: `${Number(m)}/${Number(d)}`, count };
    });
  }, [words]);

  // 音量の設定を再生側へ渡す
  useEffect(() => {
    setSpeechVolume(volume);
  }, [volume]);

  // 全単語帳を通して「学習した日」を集める。連続日数を数え直すのに使う
  const studiedDates = useMemo(() => {
    const set = new Set();
    for (const d of decks) {
      for (const w of d.words) {
        if (w.reviewedDates) for (const day of w.reviewedDates) set.add(day);
      }
    }
    return set;
  }, [decks]);

  // 画面に出す連続日数。
  //
  // 保存しているカウンタと、各単語に残っている学習履歴の**大きいほう**を採る。
  //   - カウンタ … 30日より長い連続も持てるが、壊れると復元できない
  //   - 履歴     … 約30日ぶんしか無いが、実際の記録なので確実
  // 以前カウンタが加算されない不具合があり0のまま止まっていたため、履歴から拾い直す。
  //
  // カウンタ側は、最後の学習が今日でも昨日でもなければ連続が切れているので 0 とみなす。
  const shownStreak = useMemo(() => {
    const alive = lastDate === getToday() || lastDate === getYesterday();
    const stored = lastDate && alive ? streak : 0;
    return Math.max(stored, streakFromDates(studiedDates, getToday()));
  }, [streak, lastDate, studiedDates]);

  const aTab = useMemo(() => {
    if (scr === 'shelf') return 'shelf';
    if (scr === 'dashboard') return 'home';
    if (['study', 'config', 'flashcard', 'quiz', 'typing', 'reverse', 'matching', 'speed', 'results'].includes(scr)) return 'study';
    if (scr === 'words') return 'words';
    return 'stats';
  }, [scr]);

  const last7 = useMemo(() => {
    const d = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const k = localDateStr(dt);
      d.push({
        date: `${dt.getMonth() + 1}/${dt.getDate()}`,
        count: words.filter((w) => w.reviewedDates && w.reviewedDates.includes(k)).length });
    }
    return d;
  }, [words]);

  // 今日の学習時間（ホーム画面用）
  const todayTime = useMemo(() => sumStudyTime(timeLog, [getToday()]), [timeLog]);

  // 直近7日の日付キー（学習時間の集計に使う）
  const last7keys = useMemo(() => {
    const d = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      d.push(localDateStr(dt));
    }
    return d;
  }, []);

  const poolInfo = useMemo(() => {
    const td = getToday();
    const s = clamp(rStart, 1, words.length);
    const e = clamp(rEnd, s, words.length);
    const range = words.slice(s - 1, e);
    const nw = range.filter(isNew);
    const wk = range.filter(isWeak);
    const du = range.filter((w) => isDue(w, td));
    let pool = range;
    if (wordSel === 'new') pool = nw.length > 0 ? nw : range;
    else if (wordSel === 'weak') pool = wk.length > 0 ? wk : range;
    // 復習だけは対象が無くても範囲全体に広げない。
    // 「今日の復習は0語」と出したのに全部出題されては意味が逆になる
    else if (wordSel === 'due') pool = du;
    return { total: range.length, pool: pool.length, nw: nw.length, wk: wk.length, du: du.length };
  }, [words, rStart, rEnd, wordSel]);

  const actualNumQ = Math.min(numQ, poolInfo.pool);

  const bulkCount = useMemo(() => {
    if (!bulkText.trim()) return 0;
    return bulkText.split('\n').filter((l) => parseLine(l) !== null).length;
  }, [bulkText]);

  const handleRSBlur = useCallback(() => {
    const v = parseInt(rST);
    if (isNaN(v) || v < 1) {
      setRStart(1);
      setRST('1');
    } else {
      const c = clamp(v, 1, words.length);
      setRStart(c);
      setRST(String(c));
      if (c > rEnd) {
        setREnd(c);
        setRET(String(c));
      }
    }
  }, [rST, rEnd, words.length]);

  const handleREBlur = useCallback(() => {
    const v = parseInt(rET);
    if (isNaN(v) || v < 1) {
      setREnd(rStart);
      setRET(String(rStart));
    } else {
      const c = clamp(v, rStart, words.length);
      setREnd(c);
      setRET(String(c));
    }
  }, [rET, rStart, words.length]);

  const filtered = useMemo(() => {
    let base = words;
    if (search) base = base.filter((w) => w.en.toLowerCase().includes(search.toLowerCase()) || w.ja.includes(search));
    if (wordFilter === 'weak') base = base.filter(isWeak);
    else if (wordFilter === 'new') base = base.filter(isNew);
    else if (wordFilter === 'due') base = base.filter((w) => isDue(w, getToday()));
    // 覚え具合の6段階。キーは LEVELS の k なので、段階を足しても分岐は増えない。
    // 未学習は inLevel が弾くので「要復習」に混ざらない
    else if (wordFilter.startsWith('lv_')) base = base.filter((w) => inLevel(w, wordFilter));
    return base;
  }, [words, search, wordFilter]);

  const recStreak = () => {
    const t = getToday();
    // 1回の操作で updWord が複数回走っても二重に数えないよう、ref でも見張る
    // （state の反映は非同期なので lastDate だけでは防げないことがある）
    if (countedDay.current === t) return;
    countedDay.current = t;
    if (lastDate === t) return; // 今日はすでに記録済み
    setStreak((prev) => (lastDate === getYesterday() ? prev + 1 : 1));
    setLastDate(t);
  };

  // elapsedMs を渡すと、正解時の獲得点が速さで増減する（フラッシュカードのみ使用）
  const updWord = (id, ok, mode = 'quiz', elapsedMs) => {
    const td = getToday();
    setWords((ws) =>
      ws.map((w) => {
        if (w.id !== id) return w;
        const { progress, streak: ns } = calcProg(w, ok, mode, elapsedMs);
        // 次回復習日は **streak を更新する前の w** から計算する。
        // nextSchedule は w.streak を「これまでの連続正解数」として読むため、
        // 更新後の値を渡すと間隔が1段階ぶん先走る
        const { due, ivl, ef } = nextSchedule(w, ok, td, elapsedMs);
        const dates = w.reviewedDates || [];
        const newDates = dates.includes(td) ? dates : [...dates, td];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const cutStr = localDateStr(cutoff);
        const trimmed = newDates.filter((d) => d >= cutStr);
        return {
          ...w,
          progress,
          streak: ns,
          correct: w.correct + (ok ? 1 : 0),
          incorrect: w.incorrect + (ok ? 0 : 1),
          lastReviewed: td,
          reviewedDates: trimmed,
          due,
          ivl,
          ef };
      })
    );
    recStreak();
  };

  const genOpts = (w) => shuffleArr([w, ...shuffleArr(words.filter((x) => x.id !== w.id)).slice(0, 3)]);

  const weightedPick = (pool, n) => {
    const count = Math.min(n, pool.length);
    if (count <= 0) return [];
    // 復習モードは復習日が早い（＝より長く放置している）ものから順に出す。
    // 出題数を絞ったときに、期限を過ぎた単語が後回しにならないようにするため
    if (wordSel === 'due') {
      return [...pool].sort((a, b) => String(a.due).localeCompare(String(b.due))).slice(0, count);
    }
    // 新規／苦手モードは getPool の時点で絞り込み済みなので、その中では均等に選ぶ
    if (wordSel !== 'normal') return shuffleArr(pool).slice(0, count);
    // 出題数が「全」のときは結局どの語も選ばれるので、重み付けを回さず並べ替えるだけにする。
    // 下の抽選は O(n²) で、1900語だと数百万回まわって目に見えて待たされる
    if (count >= pool.length) return shuffleArr(pool);
    // 通常モードは習熟度と間違い率で重みを付けて選ぶ（calcWeight を参照）
    const td = getToday();
    const items = pool.map((w) => ({ w, wt: calcWeight(w, td) }));
    const sel = [];
    const rem = [...items];
    while (sel.length < count && rem.length > 0) {
      const tot = rem.reduce((s, i) => s + i.wt, 0);
      let r = Math.random() * tot;
      for (let j = 0; j < rem.length; j++) {
        r -= rem[j].wt;
        if (r <= 0 || j === rem.length - 1) {
          sel.push(rem[j].w);
          rem.splice(j, 1);
          break;
        }
      }
    }
    return shuffleArr(sel);
  };

  const getPool = () => {
    const s = clamp(rStart, 1, words.length);
    const e = clamp(rEnd, s, words.length);
    let pool = words.slice(s - 1, e);
    if (wordSel === 'new') {
      const f = pool.filter(isNew);
      if (f.length > 0) pool = f;
    } else if (wordSel === 'weak') {
      const f = pool.filter(isWeak);
      if (f.length > 0) pool = f;
    } else if (wordSel === 'due') {
      // 復習は該当が無ければ 0 語のまま返す（poolInfo と同じ理由でフォールバックしない）
      const td = getToday();
      pool = pool.filter((w) => isDue(w, td));
    }
    return pool;
  };

  // sel を渡すと出題モード（通常／新規／苦手／復習）を選んだ状態で設定画面を開く
  const openConfig = (mode, sel = 'normal') => {
    setCfgMode(mode);
    setRStart(1);
    setREnd(words.length);
    setRST('1');
    setRET(String(words.length));
    setWordSel(sel);
    setNumQ(9999);
    setScr('config');
  };

  const startFromConfig = () => {
    const pool = getPool();
    // 復習モードは「今日ぶんを終わらせる」のが目的なので、残り1語でも始められる
    const minWords = wordSel === 'due' ? 1 : 2;
    if (pool.length < minWords) {
      setToast(wordSel === 'due' ? '今日の復習はもうありません' : '対象単語が不足しています');
      return;
    }
    if (['quiz', 'speed'].includes(cfgMode) && words.length < 4) {
      setToast('4択には全体で4語以上必要です');
      return;
    }
    if (cfgMode === 'matching' && pool.length < 4) {
      setToast('マッチングには4語以上必要です');
      return;
    }
    const n = cfgMode === 'matching' ? Math.min(6, pool.length) : Math.min(numQ, pool.length);
    const sel = weightedPick(pool, n);
    setSMode(cfgMode);
    setSWords(sel);
    setSIdx(0);
    setResults([]);
    setUndoStack([]);
    setFlipped(false);
    setSelAns(null);
    setTyped('');
    setAnswered(false);
    setDragOff(0);
    pan.setValue(0);
    if (cfgMode === 'matching') {
      setMWords(sel);
      setMJa(shuffleArr(sel));
      setSelEn(null);
      setSelJa(null);
      setMatched(new Set());
      setMErr(0);
      setMFailed(new Set());
      setScr('matching');
    } else if (cfgMode === 'speed') {
      setSpScore(0);
      setSpTotal(0);
      setTimer(60);
      setOpts(genOpts(sel[0]));
      setScr('speed');
      if (tRef.current) clearInterval(tRef.current);
      tRef.current = setInterval(() => setTimer((t) => (t <= 1 ? 0 : t - 1)), 1000);
    } else if (cfgMode === 'quiz') {
      setOpts(genOpts(sel[0]));
      setScr('quiz');
    } else {
      setScr(cfgMode);
    }
  };

  const hFlash = (knew) => {
    const w = sWords[sIdx];
    // カードが出てから答えるまでの時間。速いほど獲得点が増える（正解時のみ）
    const elapsed = cardShownAt.current ? Date.now() - cardShownAt.current : undefined;
    const cur = words.find((x) => x.id === w.id) || w;
    const { progress: np } = calcProg(cur, knew, 'flashcard', elapsed);
    // 「1つ前にもどる」ための控え。updWord より **先に** 取る（後だと更新後の姿になる）
    setUndoStack((st) => [...st, { word: cur, timeLog }]);
    updWord(w.id, knew, 'flashcard', elapsed);
    // 学習時間として積む。カードを開いたまま放置された分は addStudyTime 側で頭打ちになる
    if (typeof elapsed === 'number') {
      const td = getToday();
      setTimeLog((log) => addStudyTime(log, td, elapsed, td));
    }
    const nr = [...results, { word: w, correct: knew, delta: np - cur.progress, ms: elapsed }];
    setResults(nr);
    setDragOff(0);
    pan.setValue(0);
    if (sIdx + 1 < sWords.length) {
      setSIdx(sIdx + 1);
      setFlipped(false);
    } else {
      setScr('results');
    }
  };

  /**
   * フラッシュカードで「1つ前にもどる」。判定を押し間違えて次に進んでしまったときの取り消し。
   *
   * 控えておいた「判定する前の単語」をそのまま書き戻すので、
   * 覚え具合の点・連続正解数・正解/不正解の数・最後に学習した日・
   * 復習日まわり（due / ivl / ef）・学習時間が、すべて押す前の値にそろって戻る。
   * 結果一覧からもその1行を消す。
   *
   * そのうえで同じカードをもう一度出すので、**戻ったあとに押した判定だけ**が
   * 記録に残る（押し間違えたほうは無かったことになる）。
   * 何枚でも続けて戻れる。控えが空（＝まだ1枚も判定していない）なら何もしない。
   *
   * 連続日数（ストリーク）だけは戻さない。今日この単語帳を開いて学習したことは事実で、
   * どのみち戻ったカードを答え直せば同じ日が付くため。
   */
  const hFlashBack = () => {
    if (undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    setUndoStack((st) => st.slice(0, -1));
    // 学習中に単語が消された場合、id が一致せず何も書き戻らない（それで正しい）
    setWords((ws) => ws.map((x) => (x.id === snap.word.id ? snap.word : x)));
    setTimeLog(snap.timeLog);
    setResults((r) => r.slice(0, -1));
    // 最後の1枚を押し間違えると結果画面に出てしまうので、そこからも1枚だけ戻れるようにする。
    // 結果画面のとき sIdx は最後のカードのまま止まっているので、引かずにそのまま使う
    const onResults = scr === 'results';
    setSIdx(onResults ? sIdx : Math.max(0, sIdx - 1));
    // 戻したカードは意味を出した状態で見せる。どのカードに戻ったのかが一目で分かるし、
    // 押し間違えた本人はもう意味を見ている（ダブルタップモードでも1回で判定できる）
    setFlipped(true);
    setDragOff(0);
    pan.setValue(0);
    if (onResults) setScr('flashcard');
    setToast('1つ前にもどりました（さっきの判定は取り消し）');
  };

  const hQuiz = (opt) => {
    if (answered) return;
    const w = sWords[sIdx];
    const ok = opt.id === w.id;
    const cur = words.find((x) => x.id === w.id) || w;
    const { progress: np } = calcProg(cur, ok, 'quiz');
    setSelAns(opt.id);
    setAnswered(true);
    updWord(w.id, ok, 'quiz');
    setResults((r) => [...r, { word: w, correct: ok, delta: np - cur.progress }]);
    setTimeout(() => {
      if (sIdx + 1 < sWords.length) {
        const ni = sIdx + 1;
        setSIdx(ni);
        setSelAns(null);
        setAnswered(false);
        setOpts(genOpts(sWords[ni]));
      } else {
        setScr('results');
      }
    }, 900);
  };

  const hType = () => {
    if (answered) return;
    const w = sWords[sIdx];
    const ok = typed.trim().toLowerCase() === w.en.toLowerCase();
    const cur = words.find((x) => x.id === w.id) || w;
    const { progress: np } = calcProg(cur, ok, 'typing');
    setAnswered(true);
    updWord(w.id, ok, 'typing');
    setResults((r) => [...r, { word: w, correct: ok, delta: np - cur.progress }]);
  };

  const hReverse = () => {
    if (answered) return;
    const w = sWords[sIdx];
    const ok = typed.trim().length > 0 && w.ja.includes(typed.trim());
    const cur = words.find((x) => x.id === w.id) || w;
    const { progress: np } = calcProg(cur, ok, 'reverse');
    setAnswered(true);
    updWord(w.id, ok, 'reverse');
    setResults((r) => [...r, { word: w, correct: ok, delta: np - cur.progress }]);
  };

  const hTypeNext = () => {
    if (sIdx + 1 < sWords.length) {
      setSIdx(sIdx + 1);
      setTyped('');
      setAnswered(false);
    } else {
      setScr('results');
    }
  };

  const hMatch = (type, item) => {
    if (matched.has(item.id)) return;
    let en = selEn,
      ja = selJa;
    if (type === 'en') {
      if (selEn === item.id) {
        setSelEn(null);
        return;
      }
      en = item.id;
      setSelEn(item.id);
    } else {
      if (selJa === item.id) {
        setSelJa(null);
        return;
      }
      ja = item.id;
      setSelJa(item.id);
    }
    if (en !== null && ja !== null) {
      if (en === ja) {
        const nm = new Set(matched);
        nm.add(en);
        setMatched(nm);
        const wasClean = !mFailed.has(en);
        const mw = mWords.find((w) => w.id === en);
        const cur = words.find((x) => x.id === en) || mw;
        if (wasClean) updWord(en, true, 'matching');
        setResults((r) => [
          ...r,
          { word: mw, correct: wasClean, delta: wasClean ? calcProg(cur, true, 'matching').progress - cur.progress : 0 },
        ]);
        if (nm.size === mWords.length) setTimeout(() => setScr('results'), 500);
      } else {
        const nf = new Set(mFailed);
        nf.add(en);
        nf.add(ja);
        setMFailed(nf);
        setMErr((e) => e + 1);
        updWord(en, false, 'matching');
        updWord(ja, false, 'matching');
      }
      setSelEn(null);
      setSelJa(null);
    }
  };

  const hSpeed = (opt) => {
    if (answered) return;
    const w = sWords[sIdx % sWords.length];
    const ok = opt.id === w.id;
    setSelAns(opt.id);
    setAnswered(true);
    if (ok) setSpScore((s) => s + 1);
    setSpTotal((t) => t + 1);
    updWord(w.id, ok, 'speed');
    setTimeout(() => {
      if (timer > 0) {
        const ni = (sIdx + 1) % sWords.length;
        setSIdx(ni);
        setSelAns(null);
        setAnswered(false);
        setOpts(genOpts(sWords[ni]));
      }
    }, 350);
  };

  const addWord = () => {
    if (!newEn.trim() || !newJa.trim()) return;
    setWords((w) => [
      ...w,
      {
        id: nid,
        en: newEn.trim(),
        ja: newJa.trim(),
        progress: 0,
        correct: 0,
        incorrect: 0,
        streak: 0,
        lastReviewed: null,
        reviewedDates: [] },
    ]);
    setNid((n) => n + 1);
    setNewEn('');
    setNewJa('');
    setShowAdd(false);
    setToast('1語追加しました');
  };

  const saveEdit = () => {
    if (!editEn.trim() || !editJa.trim()) return;
    setWords((ws) => ws.map((w) => (w.id === editId ? { ...w, en: editEn.trim(), ja: editJa.trim() } : w)));
    setEditId(null);
  };

  const addBulk = () => {
    const lines = bulkText.split('\n').filter((l) => l.trim());
    const nw = [];
    let id = nid;
    for (const line of lines) {
      const p = parseLine(line);
      if (p) nw.push({ id: id++, en: p.en, ja: p.ja, progress: 0, correct: 0, incorrect: 0, streak: 0, lastReviewed: null, reviewedDates: [] });
    }
    if (nw.length > 0) {
      setWords((w) => [...w, ...nw]);
      setNid(id);
      setBulkText('');
      setShowBulk(false);
      setToast(`${nw.length}語追加しました！`);
    } else setToast('追加できる単語がありません');
  };

  const deleteWord = async (id) => {
    const ok = await confirmDestructive({
      title: '削除確認',
      message: 'この単語を削除しますか？' });
    if (ok) setWords((ws) => ws.filter((x) => x.id !== id));
  };

  // 本棚まるごと1ファイルに書き出す（単語帳が何冊あってもこれ1つで済む）
  const exportData = async () => {
    try {
      const data = JSON.stringify(buildState({ decks, active: activeId, s: streak, ld: lastDate, dt: dblTap, vol: volume, time: timeLog }));
      const { message } = await saveBackup(data);
      setToast(message);
    } catch (e) {
      setToast('保存失敗: ' + e.message);
    }
  };

  /**
   * ファイルを読み込む。中身によって動きが変わる:
   *   単語の一覧だけのファイル → 本棚に1冊として**追加**（今ある単語帳は消えない）
   *   本棚まるごとのファイル   → 本棚全体を置き換え（確認を取る）
   */
  const importData = async () => {
    try {
      const picked = await pickBackup();
      if (picked == null) return;
      const content = typeof picked === 'string' ? picked : picked.content;
      const fileName = typeof picked === 'string' ? '' : picked.name;

      const plan = planImport(JSON.parse(content), deckNameFromFile(fileName));
      if (!plan) return setToast('単語帳として読めないファイルです');

      if (plan.mode === 'replace') {
        const ok = await confirmDestructive({
          title: '本棚を復元',
          message: `今ある単語帳（${decks.length}冊）をすべて置き換えます。よろしいですか？`,
          confirmLabel: '復元する' });
        if (!ok) return;
        setDecks(plan.decks);
        setActiveId(plan.decks[0].id);
        setScr('shelf');
        return setToast(`${plan.decks.length}冊を復元しました`);
      }

      // 追加：既存の単語帳はそのまま残す
      const src = plan.decks[0];
      const deck = makeDeck({
        ...src,
        id: nextDeckId(decks),
        name: uniqueDeckName(decks, src.name) });
      setDecks((ds) => [...ds, deck]);
      setActiveId(deck.id);
      setScr('shelf');
      setToast(`「${deck.name}」を${deck.words.length}語で追加しました`);
    } catch (e) {
      setToast('読み込み失敗: ' + e.message);
    }
  };

  // ===== 本棚の操作 =====

  const selectDeck = (id) => {
    setActiveId(id);
    setScr('dashboard');
  };

  const createDeck = () => {
    const deck = makeDeck({ id: nextDeckId(decks), name: uniqueDeckName(decks, '新しい単語帳'), words: [] });
    setDecks((ds) => [...ds, deck]);
    setActiveId(deck.id);
    setEditDeckId(deck.id);
    setEditDeckName(deck.name);
    setToast('空の単語帳を作りました');
  };

  const renameDeck = (id, name) => {
    const trimmed = String(name).trim();
    if (!trimmed) return setToast('名前を入れてください');
    setDecks((ds) => ds.map((d) => (d.id === id ? { ...d, name: trimmed } : d)));
    setEditDeckId(null);
  };

  const changeCover = async (id) => {
    try {
      const uri = await pickPhoto();
      // ネイティブ版は未対応で常に null。Web でキャンセルしたときも null
      if (uri == null) return;
      setDecks((ds) => ds.map((d) => (d.id === id ? { ...d, cover: uri } : d)));
      setToast('表紙を変えました');
    } catch (e) {
      setToast('写真を読み込めませんでした');
    }
  };

  const removeCover = (id) => {
    setDecks((ds) => ds.map((d) => (d.id === id ? { ...d, cover: null } : d)));
    setToast('表紙を外しました');
  };

  const deleteDeck = async (id) => {
    if (decks.length <= 1) return setToast('最後の1冊は削除できません');
    const target = decks.find((d) => d.id === id);
    const ok = await confirmDestructive({
      title: '単語帳を削除',
      message: `「${target.name}」（${target.words.length}語）と、その学習記録を削除します。元に戻せません。` });
    if (!ok) return;
    const rest = decks.filter((d) => d.id !== id);
    setDecks(rest);
    if (activeId === id) setActiveId(rest[0].id);
    setEditDeckId(null);
    setToast('削除しました');
  };

  /**
   * 本棚の並び順を1つずつ動かす。
   * delta に -decks.length を渡せば先頭に持ってこられる（moveDeck が端で止める）。
   */
  const moveDeckBy = (id, delta) => setDecks((ds) => moveDeck(ds, id, delta));

  const toggleReveal = (key) => {
    setRevealed((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const revealAll = () => {
    const all = new Set();
    filtered.forEach((w) => {
      if (listHideEn) all.add(w.id + '-en');
      if (listHideJa) all.add(w.id + '-ja');
    });
    setRevealed(all);
  };

  const hideAll = () => setRevealed(new Set());

  // PanResponder for flashcard
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
      onPanResponderMove: (_, g) => {
        pan.setValue(g.dx);
        setDragOff(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 80) {
          Animated.timing(pan, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => {
            hFlashRef.current(true);
          });
        } else if (g.dx < -80) {
          Animated.timing(pan, { toValue: -400, duration: 200, useNativeDriver: true }).start(() => {
            hFlashRef.current(false);
          });
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start();
          setDragOff(0);
        }
      } })
  ).current;
  /**
   * 「知ってた／知らない」ボタンが押されたときの入口。
   *
   * ダブルタップモードがオンで、まだ意味が出ていない場合は判定せず意味を出すだけにする。
   * 意味が出ている状態でもう一度押されたら判定する（＝実質ダブルタップ）。
   * カードを直接タップして意味を出した後は、ボタン1回で判定してよい（もう意味を見ているため）。
   *
   * 次のカードに進むとき flipped は false に戻るので、カードごとに必ず1回目は意味表示になる。
   */
  const hFlashTap = (knew) => {
    if (dblTap && !flipped) {
      setFlipped(true);
      return;
    }
    hFlash(knew);
  };

  const hFlashRef = useRef(hFlash);
  useEffect(() => {
    hFlashRef.current = hFlash;
  });

  // ===================== render helpers =====================

  // 画面上部の帯。ベタ塗りをやめ、紙の上に見出しを置いて罫線1本で締める
  const Header = ({ title, back, right }) => (
    <View className="bg-paper">
      <View className="flex-row items-center" style={{ paddingHorizontal: SP[4], paddingVertical: SP[2], gap: SP[1] }}>
        <TouchableOpacity
          onPress={() => setScr(back || 'study')}
          hitSlop={10}
          accessibilityLabel="戻る"
          activeOpacity={0.75}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -SP[3] }}
        >
          <Icon name="chevron-back" size={24} color={C.primary} />
        </TouchableOpacity>
        <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      <Rule />
    </View>
  );

  // 覚え具合のしるし。絵文字はやめ、藍の濃淡だけで「どこまで進んだか」を言う
  const LvBadge = ({ w }) => {
    const lv = getLevel(w.progress, !isNew(w));
    return (
      <View
        className="flex-row items-center rounded-sm"
        style={{ paddingHorizontal: SP[2], paddingVertical: SP[1], gap: SP[1], backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: lv.barColor }} />
        <Text className={`text-xs font-bold ${lv.c}`}>{lv.name}</Text>
      </View>
    );
  };

  // 発音ボタン。押した単語を読み上げる（事前生成の音声があればそれを鳴らす）
  const SpeakButton = ({ word, size = 20, color = C.primary, hitSlop = 10 }) => (
    <TouchableOpacity
      onPress={() => speakWord(word)}
      hitSlop={hitSlop}
      accessibilityLabel={`${word} を発音`}
      className="p-1"
    >
      <Icon name="volume-high" size={size} color={color} />
    </TouchableOpacity>
  );

  // ===================== Dashboard =====================
  const renderDash = () => {
    // ノートの上端に鉛筆で書く日付のつもりで、今日を英字にする（例: 8/28 FRI）。
    // getToday() は 'YYYY-MM-DD' を返すので、そこから作る（state は増やさない）
    const [dY, dM, dD] = getToday().split('-').map(Number);
    const dateKicker = `${dM}/${dD} ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(dY, dM - 1, dD).getDay()]}`;

    return (
      <ScrollView>
        {/* 画面の顔。紫のベタ帯はやめ、紙に見出しを置いて罫線で締める。
            右のボタンを押すと本棚に行って単語帳を切り替えられる */}
        <PageTitle
          title="英単語マスター"
          kicker={dateKicker}
          sub={
            activeDeck ? (
              <>{activeDeck.name} ・ <Text className="text-xs" style={NUM}>{words.length}</Text>語</>
            ) : (
              '単語帳なし'
            )
          }
          right={
            <Btn
              label="切りかえ"
              tone="line"
              small
              icon="swap-horizontal"
              onPress={() => setScr('shelf')}
              style={{ minHeight: 44 }}
            />
          }
        />

        {words.length === 0 ? (
          // 単語が0件だと今日やることを出しようがない。学習画面と同じ白紙の画面を出す
          <EmptyState
            title="このノートはまだ白紙です"
            body="単語を書き込むと、今日やることが自動で決まります。"
            actionLabel="単語を書き込む"
            onAction={() => setScr('words')}
          />
        ) : (
          <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], gap: SP[3] }}>
            {/* 連続日数と今日の学習。丸いアイコン座布団はやめ、罫線1本で仕切った2列の数字にする */}
            <Sheet className="p-4">
              <View className="flex-row items-center">
                <View className="flex-1">
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-3xl text-ink" style={NUM_BOLD}>
                      {shownStreak}
                    </Text>
                    <Text className="text-xs text-ink-soft">日</Text>
                  </View>
                  <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                    連続日数
                  </Text>
                </View>

                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: SP[4] }} />

                <View className="flex-1">
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-3xl text-ink" style={NUM_BOLD}>
                      {todayN}
                    </Text>
                    <Text className="text-xs text-ink-soft">語</Text>
                  </View>
                  <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                    今日の学習
                  </Text>
                  {/* 学習時間はフラッシュカードでしか測れないので、記録があるときだけ出す。
                      1行に並べるとカード幅に収まらず見切れるため、行を分けている */}
                  {todayTime.n > 0 && (
                    <Text className="text-xs text-navy" style={[NUM, { marginTop: SP[1] }]}>
                      {formatDuration(todayTime.ms)}
                    </Text>
                  )}
                </View>
              </View>
            </Sheet>

            {/*
              今日の復習（間隔反復）。
              忘れる直前に復習するのが一番効率がよいので、ホーム画面の上のほうに置いている。
              まだ一度も学習していない単語帳では予定が1件も無いので、そのときは出さない。
              一覧に日本語訳は出さない（始める前に答えが見えてしまうため）。
            */}
            {scheduledCnt > 0 && (
              <Sheet mark={dueWords.length > 0 ? C.primary : C.success} className="p-4">
                <SectionTitle
                  icon={dueWords.length > 0 ? 'calendar-outline' : 'checkmark-circle-outline'}
                  iconColor={dueWords.length > 0 ? C.primary : C.success}
                  right={
                    dueWords.length > 0 ? (
                      <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                        <Text className="text-base text-navy" style={NUM_BOLD}>
                          {dueWords.length}
                        </Text>
                        <Text className="text-xs text-ink-soft">語</Text>
                      </View>
                    ) : null
                  }
                >
                  今日の復習
                </SectionTitle>

                {dueWords.length > 0 ? (
                  <>
                    {/* 1語＝1行。行の下に罫線を引いてノートの体裁にする */}
                    <View>
                      {dueWords.slice(0, 3).map((w) => {
                        const over = daysBetween(getToday(), w.due);
                        return (
                          <View key={w.id}>
                            <View
                              className="flex-row items-center justify-between"
                              style={{ paddingVertical: SP[2], gap: SP[3], minHeight: 40 }}
                            >
                              <Text
                                className="text-base text-ink flex-1"
                                style={{ fontFamily: F.enSemi }}
                                numberOfLines={1}
                              >
                                {w.en}
                              </Text>
                              {/* 期限を過ぎているものは何日放置しているかを赤ペンで書く */}
                              {over < 0 && (
                                <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                                  <Text className="text-sm" style={[NUM_BOLD, { color: C.accent }]}>
                                    {-over}
                                  </Text>
                                  <Text className="text-xs" style={{ color: C.accent }}>
                                    日超過
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Rule />
                          </View>
                        );
                      })}
                    </View>

                    {dueWords.length > 3 && (
                      <Text className="text-xs text-ink-soft" style={{ marginTop: SP[2] }}>
                        ほか <Text style={NUM}>{dueWords.length - 3}</Text> 語
                      </Text>
                    )}

                    {/* この画面で唯一のベタ塗りボタン＝いま次にやること */}
                    <Btn
                      label="復習を始める"
                      tone="navy"
                      icon="play"
                      onPress={() => openConfig('flashcard', 'due')}
                      style={{ marginTop: SP[3] }}
                    />
                  </>
                ) : (
                  <Text className="text-sm" style={{ color: C.success, lineHeight: 21 }}>
                    今日の復習は終わりました 🎉
                    {nextDueDay && (
                      <Text className="text-sm text-ink-soft">
                        {`\n次は${formatDue(nextDueDay, getToday())}（`}
                        <Text style={NUM}>{scheduledCnt}</Text>
                        {'語が予定に乗っています）'}
                      </Text>
                    )}
                  </Text>
                )}
              </Sheet>
            )}

            {/* 苦手な単語。ここも訳は出さない（テストの前に答えを見せない） */}
            {weakWords.length > 0 && (
              <Sheet mark={C.accent} className="p-4">
                <SectionTitle
                  icon="alert-circle-outline"
                  iconColor={C.accent}
                  right={
                    <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                      <Text className="text-base" style={[NUM_BOLD, { color: C.accent }]}>
                        {weakWords.length}
                      </Text>
                      <Text className="text-xs text-ink-soft">語</Text>
                    </View>
                  }
                >
                  苦手な単語
                </SectionTitle>

                <View>
                  {weakWords.slice(0, 3).map((w) => (
                    <View key={w.id}>
                      <View
                        className="flex-row items-center justify-between"
                        style={{ paddingVertical: SP[2], gap: SP[3], minHeight: 40 }}
                      >
                        <Text
                          className="text-base text-ink flex-1"
                          style={{ fontFamily: F.enSemi }}
                          numberOfLines={1}
                        >
                          {w.en}
                        </Text>
                        <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                          <Text className="text-sm" style={[NUM_BOLD, { color: C.accent }]}>
                            {w.progress}
                          </Text>
                          <Text className="text-xs" style={{ color: C.accent }}>
                            %
                          </Text>
                        </View>
                      </View>
                      <Rule />
                    </View>
                  ))}
                </View>

                <Btn
                  label="苦手克服モードで学習"
                  tone="lineRed"
                  icon="brain"
                  onPress={() => {
                    setCfgMode('quiz');
                    setWordSel('weak');
                    setRStart(1);
                    setREnd(words.length);
                    setRST('1');
                    setRET(String(words.length));
                    setNumQ(9999);
                    setScr('config');
                  }}
                  style={{ marginTop: SP[3] }}
                />
              </Sheet>
            )}

            {/* 全体の進捗。覚え具合は虹色をやめ、藍1色の濃淡で「濃いほど覚えている」を表す */}
            <Sheet className="p-4">
              <SectionTitle
                right={
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-lg text-navy" style={NUM_BOLD}>
                      {avgP}
                    </Text>
                    <Text className="text-xs text-ink-soft">%</Text>
                  </View>
                }
              >
                全体の進捗
              </SectionTitle>

              <View style={{ height: 8, borderRadius: R.sm, backgroundColor: C.navyTint, overflow: 'hidden' }}>
                <View style={{ height: 8, borderRadius: R.sm, backgroundColor: C.primary, width: `${avgP}%` }} />
              </View>

              <View className="flex-row" style={{ marginTop: SP[3], gap: SP[4] }}>
                {[
                  { c: C.lv5, l: 'マスター', n: mast },
                  { c: C.lv3, l: '学習中', n: learn },
                  { c: C.lv0, l: '未学習', n: lvCount.new },
                ].map((g) => (
                  <View key={g.l} className="flex-row items-center" style={{ gap: SP[1] }}>
                    <View style={{ width: 8, height: 8, borderRadius: R.sm, backgroundColor: g.c }} />
                    <Text className="text-xs text-ink-soft">{g.l}</Text>
                    <Text className="text-xs text-ink" style={NUM_BOLD}>
                      {g.n}
                    </Text>
                  </View>
                ))}
              </View>
            </Sheet>

            <BarChart7 data={last7} />
          </View>
        )}

        {/* ここから下は「読むだけ・たまに使う」もの。ベタ塗りはやめ、罫線と枠だけにする */}
        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[5], paddingBottom: SP[5], gap: SP[3] }}>
          {/* 単語が1語も無いときは押しても始められないので、クイックスタート自体を出さない */}
          {words.length > 0 && (
          <Sheet className="p-4">
            <SectionTitle icon="flash-outline">クイックスタート</SectionTitle>
            <View className="flex-row" style={{ gap: SP[2] }}>
              <Btn
                label="フラッシュカード"
                tone="line"
                small
                icon="layers-outline"
                onPress={() => openConfig('flashcard')}
                className="flex-1"
                style={{ minHeight: 44, paddingHorizontal: SP[2] }}
              />
              <Btn
                label="4択クイズ"
                tone="line"
                small
                icon="brain"
                onPress={() => openConfig('quiz')}
                className="flex-1"
                style={{ minHeight: 44, paddingHorizontal: SP[2] }}
              />
            </View>
          </Sheet>
          )}

          {/*
            発音の音量。iPhone 本体の音量は変えず、アプリの中だけで下げられる。
            スライダーは追加ライブラリが要るので、押すだけで決まる4段階にしてある。
            選択中だけ藍のベタ塗り＝いまどれを選んでいるかを色の面で言う。
          */}
          <Sheet className="p-4">
            <SectionTitle right={<Text className="text-xs text-ink-soft">端末の音量は変わりません</Text>}>
              発音の音量
            </SectionTitle>
            {/* 4つから1つ選ぶ帯。<Btn> ではなく設定画面（出題モード）と同じ書き方にそろえてある。
                Btn は読み上げ名が label 固定で「音量 大」と読ませられず、押すたびに「大」としか言えないため */}
            <View className="flex-row" style={{ gap: SP[2] }}>
              {[
                { v: 0, i: 'volume-mute', l: '消音' },
                { v: 0.3, i: 'volume-low', l: '小' },
                { v: 0.6, i: 'volume-medium', l: '中' },
                { v: 1, i: 'volume-high', l: '大' },
              ].map((o) => {
                const active = Math.abs(volume - o.v) < 0.01;
                return (
                  <TouchableOpacity
                    key={o.l}
                    onPress={() => {
                      setVolume(o.v);
                      // 変えた音量ですぐ聞けるように、見本を1語鳴らす（消音のときは鳴らさない）
                      if (o.v > 0) {
                        setSpeechVolume(o.v);
                        speakWord(words[0] ? words[0].en : 'sample');
                      }
                    }}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`音量 ${o.l}`}
                    accessibilityState={{ selected: active }}
                    className="flex-1 items-center justify-center rounded"
                    style={{
                      backgroundColor: active ? C.primary : C.surface,
                      borderWidth: 1,
                      borderColor: active ? C.primary : C.border,
                      paddingVertical: SP[2],
                      paddingHorizontal: SP[1],
                      minHeight: 44,
                      gap: SP[1],
                    }}
                  >
                    <Icon name={o.i} size={16} color={active ? C.onPrimary : C.muted} />
                    <Text
                      className="text-xs font-bold"
                      style={{ color: active ? C.onPrimary : C.text }}
                      numberOfLines={1}
                    >
                      {o.l}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Sheet>

          <Sheet className="p-4">
            <SectionTitle icon="save-outline">データ管理</SectionTitle>
            <View className="flex-row" style={{ gap: SP[2] }}>
              <Btn label="保存" tone="line" icon="download-outline" onPress={exportData} className="flex-1" />
              <Btn label="読込" tone="line" icon="cloud-upload-outline" onPress={importData} className="flex-1" />
            </View>

            {/*
              保存データの大きさ。「保存できません」が出たときに、
              単語と表紙写真のどちらが容量を食っているかを自分で見られるようにしている。
            */}
            {dataSize && (
              <View style={{ marginTop: SP[3] }}>
                <Rule />
                <View className="flex-row justify-between items-baseline" style={{ marginTop: SP[3] }}>
                  <Text className="text-xs text-ink">保存データの大きさ</Text>
                  <Text className="text-xs text-ink" style={NUM_BOLD}>
                    {formatBytes(dataSize.total * 2)}
                  </Text>
                </View>
                <View className="flex-row justify-between items-baseline" style={{ marginTop: SP[2] }}>
                  <Text className="text-xs text-ink-soft">単語 <Text style={NUM}>{dataSize.wordCnt}</Text>語</Text>
                  <Text className="text-xs text-ink-soft" style={NUM}>
                    {formatBytes(dataSize.words * 2)}
                  </Text>
                </View>
                <View className="flex-row justify-between items-baseline" style={{ marginTop: SP[1] }}>
                  <Text className="text-xs text-ink-soft">表紙写真 <Text style={NUM}>{dataSize.coverCnt}</Text>枚</Text>
                  <Text className="text-xs text-ink-soft" style={NUM}>
                    {formatBytes(dataSize.cover * 2)}
                  </Text>
                </View>
                {/*
                  使用量（quota.used）は出さない。ブラウザ側の集計が遅れていて、
                  すぐ上の「保存データの大きさ」と食い違って見えるため。
                  知りたいのは「まだどれだけ入るか」なので上限だけ出す。
                */}
                {quota && (
                  <Text className="text-xs text-ink-soft" style={{ marginTop: SP[2], lineHeight: 19 }}>
                    この端末で保存できる上限 約<Text style={NUM}>{formatBytes(quota.quota)}</Text>
                  </Text>
                )}
              </View>
            )}
          </Sheet>
        </View>
      </ScrollView>
    );
  };

  // ===================== Study mode menu =====================
  const renderStudy = () => {
    const modes = [
      { m: 'flashcard', icon: 'layers-outline', t: 'フラッシュカード', d: 'スワイプで直感的に暗記' },
      { m: 'quiz', icon: 'brain', t: '4択クイズ', d: '4つの選択肢から正解を選ぶ' },
      { m: 'typing', icon: 'create-outline', t: 'タイピング（日→英）', d: '日本語を見て英語を入力' },
      { m: 'reverse', icon: 'swap-horizontal-outline', t: '逆引き（英→日）', d: '英語を見て日本語を入力' },
      { m: 'matching', icon: 'shuffle-outline', t: 'マッチング', d: '英語と日本語をペアにする' },
      { m: 'speed', icon: 'flash-outline', t: 'スピードチャレンジ', d: '60秒で何問解けるか挑戦' },
    ];
    return (
      <ScrollView>
        <PageTitle title="学習モード" sub="モードを選んで設定画面へ" />
        {words.length === 0 ? (
          // 単語が0件だとどのモードも始められない。ダッシュボード／学習設定と同じ白紙の画面を出す
          <EmptyState
            title="このノートはまだ白紙です"
            body="単語を書き込むと、ここからモードを選んで練習を始められます。"
            actionLabel="単語を書き込む"
            onAction={() => setScr('words')}
            icon="create-outline"
          />
        ) : (
          <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5] }}>
            {/* 1枚の紙に「1行＝1モード」を並べる。色でモードを分けず、藍1色で「押せる」だけを言う */}
            <Sheet>
              {modes.map(({ m, icon, t, d }, i) => (
                <View key={m}>
                  <TouchableOpacity
                    onPress={() => openConfig(m)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    // モード名だけだと説明文が読み上げられない。1行ぜんぶを1つの読み上げにする
                    accessibilityLabel={`${t}。${d}`}
                    className="flex-row items-center"
                    style={{ minHeight: 64, paddingHorizontal: SP[4], paddingVertical: SP[3], gap: SP[3] }}
                  >
                    <View
                      className="items-center justify-center"
                      style={{ width: 40, height: 40, borderWidth: 1, borderColor: C.primary, borderRadius: R.md }}
                    >
                      <Icon name={icon} size={20} color={C.primary} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-bold text-ink">{t}</Text>
                      <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1], lineHeight: 19 }}>
                        {d}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={C.muted2} />
                  </TouchableOpacity>
                  {/* 単語一覧などと違いこの一覧はスクロールせず6行で終わるので、最終行に罫を引くと
                      Sheet の下枠と重なって2px の二重線に見える。ここだけ最終行の罫を省く */}
                  {i < modes.length - 1 ? <Rule /> : null}
                </View>
              ))}
            </Sheet>
          </View>
        )}
      </ScrollView>
    );
  };

  // ===================== Config =====================
  const renderConfig = () => {
    const mn = { flashcard: 'フラッシュカード', quiz: '4択クイズ', typing: 'タイピング', reverse: '逆引き', matching: 'マッチング', speed: 'スピード' };
    const isMat = cfgMode === 'matching';
    const dNQ = isMat ? Math.min(6, poolInfo.pool) : actualNumQ;
    return (
      // 「学習を開始」までスクロールせずに届くよう、かたまりの数を5つ以内に抑えてある。
      // 要素を足すときは実機幅（375×812）で開始ボタンが見えるか確かめること。
      <ScrollView>
        {/* モード名はヘッダのタイトルに入れる。バンドを1枚減らしたぶん、下の余白を広く取れる */}
        <Header title={`${mn[cfgMode] || '学習'}の設定`} back="study" />
        {words.length === 0 ? (
          <EmptyState
            title="このノートはまだ白紙です"
            body="単語を1語でも書き込むと、ここから学習を始められます。"
            actionLabel="単語を書き込む"
            onAction={() => setScr('words')}
            icon="create-outline"
          />
        ) : (
          <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
            {/* ── 出題モード ── 見出しを他画面と同じ SectionTitle（16px）にしたので、
                そのぶんかたまり同士は 12px に詰めて「学習を開始」がスクロールなしで届く高さを保っている */}
            <View>
              <SectionTitle>出題モード</SectionTitle>
              {/* 4つ並ぶので、375px 幅でも折り返さないよう文字を12pxに抑えてある。
                  4つ目は「今日の復習」。ホームのカード・単語帳の絞り込み・統計もこの呼び方なので
                  ここだけ「復習」にすると別のものに見え、実際に見落とされた。 */}
              <View className="flex-row" style={{ gap: SP[2] }}>
                {[
                  { k: 'normal', l: '通常', d: 'バランス' },
                  { k: 'new', l: '新規', d: poolInfo.nw },
                  { k: 'weak', l: '苦手', d: poolInfo.wk },
                  { k: 'due', l: '今日の復習', d: poolInfo.du },
                ].map((mi) => {
                  const active = wordSel === mi.k;
                  return (
                    <TouchableOpacity
                      key={mi.k}
                      onPress={() => setWordSel(mi.k)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className="flex-1 items-center justify-center rounded"
                      style={{
                        backgroundColor: active ? C.primary : C.surface,
                        borderWidth: 1,
                        borderColor: active ? C.primary : C.border,
                        paddingVertical: SP[2],
                        paddingHorizontal: SP[1],
                        minHeight: 48,
                        gap: SP[1],
                      }}
                    >
                      {/* 「今日の復習」だけ5文字あり、375px では1行に収まるが 320px だと
                          「今日の…」と切れて肝心の語が消える。2行まで許して折り返させる。
                          折り返すのは幅が足りないときだけなので、375px では見た目は変わらない。 */}
                      <Text className="text-xs font-bold text-center" style={{ color: active ? C.onPrimary : C.text }} numberOfLines={2}>
                        {mi.l}
                      </Text>
                      <Text className="text-xs text-center" style={{ color: active ? C.navyTint : C.muted }} numberOfLines={1}>
                        {typeof mi.d === 'number' ? <Text style={NUM}>{mi.d}</Text> : null}
                        {typeof mi.d === 'number' ? '語' : mi.d}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── 出題範囲 ── */}
            <View>
              <SectionTitle
                right={
                  <Text className="text-xs text-ink-soft">
                    全<Text style={NUM}>{words.length}</Text>語
                  </Text>
                }
              >
                出題範囲
              </SectionTitle>
              <View className="flex-row items-center" style={{ gap: SP[2] }}>
                <TextInput
                  keyboardType="number-pad"
                  value={rST}
                  onChangeText={setRST}
                  onBlur={handleRSBlur}
                  className="flex-1 bg-sheet border border-rule rounded px-3 py-3 text-base text-center"
                  style={[{ minWidth: 0 }, NUM_BOLD, { color: C.text, minHeight: 44 }]}
                />
                <Text className="text-sm text-ink-soft">〜</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={rET}
                  onChangeText={setRET}
                  onBlur={handleREBlur}
                  className="flex-1 bg-sheet border border-rule rounded px-3 py-3 text-base text-center"
                  style={[{ minWidth: 0 }, NUM_BOLD, { color: C.text, minHeight: 44 }]}
                />
              </View>
            </View>

            {/* ── 出題数 ── マッチングは6問固定なので出さない */}
            {!isMat && (
              <View>
                <SectionTitle>出題数</SectionTitle>
                {/* 「全」を先頭に置いている。既定が全なので、選択中のものが左端に来るほうが分かりやすい */}
                <View className="flex-row" style={{ gap: SP[2] }}>
                  {[9999, 10, 20, 30, 50].map((n) => {
                    const active = numQ === n;
                    const label = n === 9999 ? '全' : String(n);
                    return (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setNumQ(n)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className="flex-1 items-center justify-center rounded"
                        style={{
                          backgroundColor: active ? C.primary : C.surface,
                          borderWidth: 1,
                          borderColor: active ? C.primary : C.border,
                          paddingVertical: SP[2],
                          minHeight: 44,
                        }}
                      >
                        <Text
                          className="text-sm text-center"
                          style={[{ color: active ? C.onPrimary : C.text }, n === 9999 ? { fontWeight: '700' } : NUM_BOLD]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View className="flex-row items-center" style={{ gap: SP[2], marginTop: SP[2] }}>
                  <Text className="text-xs text-ink-soft">カスタム</Text>
                  <TextInput
                    keyboardType="number-pad"
                    value={numQ === 9999 ? '' : String(numQ)}
                    onChangeText={(t) => {
                      const v = parseInt(t.replace(/[^0-9]/g, ''), 10);
                      if (!isNaN(v) && v > 0) setNumQ(Math.min(v, 9999));
                      else if (t === '') setNumQ(1);
                    }}
                    placeholder="例: 15"
                    placeholderTextColor={C.muted2}
                    className="flex-1 bg-sheet border border-rule rounded px-3 py-3 text-base text-center"
                    style={[NUM_BOLD, { color: C.text, minHeight: 44 }]}
                  />
                  <Text className="text-xs text-ink-soft">問</Text>
                </View>
              </View>
            )}

            {/* ダブルタップモードはフラッシュカードにしか効かないので、そのときだけ出す */}
            {cfgMode === 'flashcard' && (
              <TouchableOpacity
                onPress={() => setDblTap((v) => !v)}
                activeOpacity={0.75}
                className="bg-sheet border border-rule rounded-lg flex-row items-center"
                style={{ padding: SP[4], gap: SP[3] }}
                accessibilityRole="switch"
                accessibilityState={{ checked: dblTap }}
              >
                <Icon name="hand-left-outline" size={18} color={dblTap ? C.primary : C.muted} />
                <View className="flex-1">
                  <Text className="text-sm font-bold text-ink">ダブルタップモード</Text>
                  <Text className="text-xs text-ink-soft" style={{ lineHeight: 19, marginTop: SP[1] }}>
                    {dblTap ? '1回目で意味を表示、もう一度で判定' : '1回押すとすぐ判定'}
                  </Text>
                </View>
                <View
                  className="w-11 h-6 rounded-full justify-center"
                  style={{ padding: SP[1], backgroundColor: dblTap ? C.primary : C.border2 }}
                >
                  <View className="w-4 h-4 rounded-full" style={{ backgroundColor: C.surface, marginLeft: dblTap ? 20 : 0 }} />
                </View>
              </TouchableOpacity>
            )}

            {/* いま見てほしい1ブロック。要約と開始ボタンをひとまとめにして左端に藍の縦罫を引く */}
            <Sheet mark={C.primary} className="p-4">
              <View className="flex-row items-end justify-between" style={{ gap: SP[3], marginBottom: SP[3] }}>
                <Text className="flex-1 text-xs text-ink-soft" style={{ lineHeight: 19 }}>
                  {wordSel === 'due' ? (
                    poolInfo.du > 0 ? (
                      <>
                        復習日が来た<Text className="text-ink" style={NUM_BOLD}>{poolInfo.du}</Text>語だけ出題します
                      </>
                    ) : (
                      '今日の復習はもうありません'
                    )
                  ) : (
                    <>
                      No.<Text style={NUM}>{rStart}</Text>〜<Text style={NUM}>{rEnd}</Text> ／ 対象
                      <Text className="text-ink" style={NUM_BOLD}>{poolInfo.pool}</Text>語
                    </>
                  )}
                </Text>
                <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                  <Text className="text-2xl" style={[NUM_BOLD, { color: C.primary }]}>
                    {dNQ}
                  </Text>
                  <Text className="text-xs text-ink-soft">問</Text>
                </View>
              </View>
              {/* 押せない条件は startFromConfig 側のトーストで知らせる（元の動きのまま） */}
              <Btn
                label="学習を開始"
                onPress={startFromConfig}
                tone="navy"
                icon="play"
                style={{ paddingVertical: SP[4], minHeight: 52 }}
              />
            </Sheet>
          </View>
        )}
      </ScrollView>
    );
  };

  // ===================== Flashcard =====================
  const renderFlash = () => {
    const w = sWords[sIdx];
    // 出題できる語が無いとき。return null にすると真っ白になって戻れなくなる
    if (!w)
      return (
        <View>
          <Header title="フラッシュカード" />
          <EmptyState
            title="出題できる単語がありません"
            body="いまの条件に合う単語が見つかりませんでした。学習メニューに戻って条件を選び直すか、単語を書き足してください。"
            actionLabel="学習メニューへ"
            onAction={() => setScr('study')}
            icon="albums-outline"
          />
        </View>
      );
    const rot = pan.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
    const bgTint =
      dragOff > 20
        ? `rgba(233,239,226,${Math.min(0.4, (dragOff - 20) / 200)})`
        : dragOff < -20
        ? `rgba(247,231,227,${Math.min(0.4, (Math.abs(dragOff) - 20) / 200)})`
        : C.surface;
    return (
      <View>
        <Header title="フラッシュカード" />
        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
          {/* 何枚目か。数字は等幅にして桁が動いてもガタつかせない。
              進み具合は藍1色の細い罫で言う（クイズ・タイピングと同じ形にそろえてある） */}
          <View>
            <Text className="text-xs text-ink-soft" style={NUM}>
              {sIdx + 1} / {sWords.length}
            </Text>
            <View className="rounded-sm overflow-hidden" style={{ height: 4, marginTop: SP[2], backgroundColor: C.border }}>
              <View style={{ height: 4, width: `${((sIdx + 1) / sWords.length) * 100}%`, backgroundColor: C.primary }} />
            </View>
            <View className="flex-row items-center" style={{ gap: SP[1], marginTop: SP[2] }}>
              <Icon name="flash-outline" size={13} color={C.muted} />
              <Text className="text-xs text-ink-soft">早く答えるほど得点アップ</Text>
            </View>
          </View>

          {/* スワイプの向き。朱＝知らない／苔＝知ってた */}
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-vermilion">← 知らない</Text>
            <Text className="text-xs text-moss">知ってた →</Text>
          </View>

          <Animated.View
            {...panResponder.panHandlers}
            style={{ transform: [{ translateX: pan }, { rotate: rot }] }}
          >
            <Pressable
              onPress={() => {
                if (Math.abs(dragOff) < 5) setFlipped(!flipped);
              }}
            >
              {/* ノートの1ページ。いま見てほしい1枚なので左端に藍の縦罫、その内側に朱のマージン罫 */}
              {/* この画面の主役。左端の縦罫は朱の「マージン罫」1本だけにする
                  （藍の mark を足すと縦線が2本並んでノートに見えなくなる） */}
              <Sheet className="justify-center" style={{ backgroundColor: bgTint, minHeight: 280 }}>
                <View style={{ position: 'absolute', left: 22, top: 0, bottom: 0, width: 1, backgroundColor: C.accentTint }} />
                <View className="items-center" style={{ paddingHorizontal: SP[5], paddingVertical: SP[5] }}>
                  <View style={{ marginBottom: SP[4] }}>
                    <LvBadge w={w} />
                  </View>
                  {!flipped ? (
                    <>
                      <Text className="text-4xl text-ink text-center" style={{ fontFamily: F.enBold, lineHeight: 46 }}>
                        {w.en}
                      </Text>
                      <Rule className="w-full mt-3" color={C.border2} />
                      <Text className="text-xs text-ink-soft text-center" style={{ marginTop: SP[3] }}>
                        タップで意味を表示
                      </Text>
                    </>
                  ) : (
                    <>
                      {/* 単語は消さない。同じ罫の上に残したまま小さくして、意味を一段下に書き足す */}
                      <Text className="text-2xl text-ink text-center" style={{ fontFamily: F.enSemi, lineHeight: 32 }}>
                        {w.en}
                      </Text>
                      <Rule className="w-full mt-3" color={C.border2} />
                      <Text className="text-2xl font-bold text-ink text-center" style={{ marginTop: SP[3], lineHeight: 34 }}>
                        {w.ja}
                      </Text>
                    </>
                  )}
                </View>
              </Sheet>
            </Pressable>
          </Animated.View>

          {/* 2つとも同じ重みの自己申告なので、どちらも「枠だけ」で対称にする。
              朱＝知らない（赤ペンの印）／苔＝知ってた（正解）。ベタ塗りにすると片方だけ押しやすくなる */}
          <View className="flex-row" style={{ gap: SP[3] }}>
            <TouchableOpacity
              onPress={() => hFlashTap(false)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="知らない"
              className="flex-row items-center justify-center rounded"
              style={{
                flex: 1,
                minHeight: 48,
                gap: SP[2],
                paddingVertical: SP[3],
                paddingHorizontal: SP[4],
                borderWidth: 1,
                borderColor: C.accent,
                backgroundColor: C.accentSoft,
              }}
            >
              <Icon name="close" size={17} color={C.accent} />
              <Text className="text-sm font-bold" style={{ color: C.accent }}>
                知らない
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => hFlashTap(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="知ってた"
              className="flex-row items-center justify-center rounded"
              style={{
                flex: 1,
                minHeight: 48,
                gap: SP[2],
                paddingVertical: SP[3],
                paddingHorizontal: SP[4],
                borderWidth: 1,
                borderColor: C.success,
                backgroundColor: C.successSoft,
              }}
            >
              <Icon name="checkmark" size={17} color={C.success} />
              <Text className="text-sm font-bold" style={{ color: C.success }}>
                知ってた
              </Text>
            </TouchableOpacity>
          </View>

          {/* 押し間違えて次に進んでしまったときの取り消し（→ hFlashBack）。
              判定の2つより弱い「白地＋灰の罫」にして、幅も内容ぶんに縮めてある。
              ここが目立つと、答えに迷ったときの逃げ道として押されてしまうため。
              どのカードに戻るのかが分かるように、戻る先の単語を括弧で添える。 */}
          {undoStack.length > 0 && (
            <View className="items-center">
              <Btn
                label={`1つ前にもどる（${undoStack[undoStack.length - 1].word.en}）`}
                onPress={hFlashBack}
                tone="quiet"
                icon="arrow-undo-outline"
                small
                style={{ minHeight: 44 }}
              />
            </View>
          )}

          {/* いま1回目なのか2回目なのかが分かるようにする */}
          {dblTap && (
            <View className="flex-row items-center justify-center" style={{ gap: SP[2] }}>
              <Icon name={flipped ? 'checkmark-circle' : 'information-circle'} size={14} color={flipped ? C.success : C.muted} />
              <Text className={`text-xs ${flipped ? 'text-moss font-bold' : 'text-ink-soft'}`} style={{ lineHeight: 19 }}>
                {flipped ? 'もう一度押すと判定されます' : '1回押すと意味が出ます（判定されません）'}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ===================== Quiz =====================
  const renderQuiz = () => {
    const w = sWords[sIdx];
    if (!w)
      return (
        <View>
          <Header title="4択クイズ" />
          <EmptyState
            title="出題できる単語がありません"
            body="いまの条件に合う単語が見つかりませんでした。学習メニューに戻って条件を選び直すか、単語を書き足してください。"
            actionLabel="学習メニューへ"
            onAction={() => setScr('study')}
            icon="help-circle-outline"
          />
        </View>
      );
    return (
      <View>
        <Header title="4択クイズ" />
        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
          {/* 何問目か。数字は等幅にして桁が動いてもガタつかせない。進み具合は藍1色の細い罫で言う */}
          <View>
            <Text className="text-xs text-ink-soft" style={NUM}>
              {sIdx + 1} / {sWords.length}
            </Text>
            <View className="rounded-sm overflow-hidden" style={{ height: 4, marginTop: SP[2], backgroundColor: C.border }}>
              <View style={{ height: 4, width: `${((sIdx + 1) / sWords.length) * 100}%`, backgroundColor: C.primary }} />
            </View>
          </View>

          {/* 問題。いま一番見てほしいので左端に藍の縦罫を入れる */}
          <Sheet mark={C.primary} className="p-6 items-center">
            <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[2] }}>
              この単語の意味は？
            </Text>
            <Text className="text-3xl text-ink text-center" style={{ fontFamily: F.enBold }}>
              {w.en}
            </Text>
            <View style={{ marginTop: SP[3] }}>
              <LvBadge w={w} />
            </View>
          </Sheet>

          {/* 選択肢。ふだんは藍の枠だけ。答えたあとだけ苔（正解）と朱（外した方）の面が出る */}
          <View style={{ gap: SP[2] }}>
            {opts.map((o) => {
              // 押せるものなので枠は藍（<Btn tone="line"> と同じ意味）。読むだけの Sheet と見分ける
              let face = 'bg-sheet border-navy';
              let txtClr = 'text-ink';
              let markClr = null;
              let tailIcon = null;
              if (answered) {
                if (o.id === w.id) {
                  face = 'bg-moss-soft border-moss';
                  txtClr = 'text-moss';
                  markClr = C.success;
                  tailIcon = 'checkmark';
                } else if (o.id === selAns) {
                  face = 'bg-vermilion-soft border-vermilion';
                  txtClr = 'text-vermilion';
                  markClr = C.accent;
                  tailIcon = 'close';
                }
              }
              return (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => hQuiz(o)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={o.ja}
                  className={`flex-row items-center overflow-hidden rounded border py-4 px-4 ${face}`}
                  style={{ minHeight: 52, gap: SP[3] }}
                >
                  {/* 左端の縦罫。色だけに頼らないよう、行末のアイコンと2つで伝える */}
                  {markClr ? (
                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: markClr }} />
                  ) : null}
                  <Text className={`flex-1 text-base ${txtClr}`} style={{ lineHeight: 24 }}>
                    {o.ja}
                  </Text>
                  {tailIcon ? <Icon name={tailIcon} size={18} color={markClr} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // ===================== Typing / Reverse =====================
  const renderTyping = (isRev) => {
    const w = sWords[sIdx];
    // 出題できる語が0のとき return null にすると真っ白になって戻れない（DESIGN.md「空っぽの画面」）
    if (!w)
      return (
        <View>
          <Header title={isRev ? '逆引き（英→日）' : 'タイピング（日→英）'} />
          <EmptyState
            title="出題できる単語がありません"
            body="いまの条件に合う単語が見つかりませんでした。学習メニューに戻って条件を選び直すか、単語を書き足してください。"
            actionLabel="学習メニューへ"
            onAction={() => setScr('study')}
            icon="create-outline"
          />
        </View>
      );
    const ok = isRev ? typed.trim().length > 0 && w.ja.includes(typed.trim()) : typed.trim().toLowerCase() === w.en.toLowerCase();
    const title = isRev ? '逆引き（英→日）' : 'タイピング（日→英）';
    const display = isRev ? w.en : w.ja;
    const answer = isRev ? w.ja : w.en;
    const hSub = isRev ? hReverse : hType;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Header title={title} />
        <ScrollView className="bg-paper" keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
            {/* 何問目か。数字は等幅にして桁が動いてもガタつかせない。進み具合は藍1色の細い罫で言う */}
            <View>
              <Text className="text-xs text-ink-soft" style={NUM}>
                {sIdx + 1} / {sWords.length}
              </Text>
              <View className="rounded-sm overflow-hidden" style={{ height: 4, marginTop: SP[2], backgroundColor: C.border }}>
                <View style={{ height: 4, width: `${((sIdx + 1) / sWords.length) * 100}%`, backgroundColor: C.primary }} />
              </View>
            </View>

            {/* 問題。いま一番見てほしいので左端に藍の縦罫を入れる */}
            <Sheet mark={C.primary} className="p-6 items-center">
              <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[2] }}>
                {isRev ? '日本語の意味を入力' : '英語で入力'}
              </Text>
              {/* 出す語が英語のときだけ Lora。日本語の意味には書体を当てない（偽の太字になる） */}
              {isRev ? (
                <Text className="text-3xl text-ink text-center" style={{ fontFamily: F.enBold, lineHeight: 38 }}>
                  {display}
                </Text>
              ) : (
                <Text className="text-2xl font-bold text-ink text-center" style={{ lineHeight: 32 }}>
                  {display}
                </Text>
              )}
              <View style={{ marginTop: SP[3] }}>
                <LvBadge w={w} />
              </View>
            </Sheet>

            {/* 答えを書く欄。書けるあいだは枠が藍（＝ここを操作する）、答え合わせ後は罫線の色に落とす */}
            <TextInput
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => !answered && hSub()}
              editable={!answered}
              placeholder={isRev ? '日本語を入力...' : '英語を入力...'}
              placeholderTextColor={C.muted2}
              className="text-lg text-ink"
              style={[
                {
                  height: 52,
                  paddingHorizontal: SP[4],
                  paddingVertical: 0,
                  borderRadius: R.md,
                  borderWidth: 1,
                  borderColor: answered ? C.border : C.primary,
                  backgroundColor: answered ? C.bg2 : C.surface,
                },
                isRev ? null : { fontFamily: F.en },
              ]}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* 判定。色だけに頼らないよう、左端の縦罫とアイコンと言葉の3つで伝える */}
            {answered &&
              (ok ? (
                <View className="overflow-hidden rounded border bg-moss-soft border-moss" style={{ padding: SP[4] }}>
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.success }} />
                  <View className="flex-row items-center" style={{ gap: SP[2] }}>
                    <Icon name="checkmark-circle" size={18} color={C.success} />
                    <Text className="text-sm font-bold text-moss">正解</Text>
                  </View>
                </View>
              ) : (
                <View className="overflow-hidden rounded border bg-vermilion-soft border-vermilion" style={{ padding: SP[4] }}>
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.accent }} />
                  <View className="flex-row items-center" style={{ gap: SP[2] }}>
                    <Icon name="close-circle" size={18} color={C.accent} />
                    <Text className="text-sm font-bold text-vermilion">不正解</Text>
                  </View>
                  <Text className="text-xs text-vermilion" style={{ marginTop: SP[2] }}>
                    正しい答え
                  </Text>
                  <Text
                    className="text-base text-vermilion"
                    style={[{ marginTop: SP[1], lineHeight: 24 }, isRev ? null : { fontFamily: F.enSemi }]}
                  >
                    {answer}
                  </Text>
                </View>
              ))}

            {/* ベタ塗りの藍は画面に1つだけ＝「次にやること」 */}
            {!answered ? (
              <Btn label="回答する" onPress={hSub} tone="navy" icon="checkmark-outline" />
            ) : (
              <Btn
                label={sIdx + 1 < sWords.length ? '次へ' : '結果を見る'}
                onPress={hTypeNext}
                tone="navy"
                icon={sIdx + 1 < sWords.length ? 'arrow-forward-outline' : 'flag-outline'}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // ===================== Matching =====================
  const renderMatch = () => {
    // 出せる単語が1語も無いとき。左右の列が空のまま理由も出ないので、何をすればいいかを1つ置く
    if (mWords.length === 0)
      return (
        <View>
          <Header title="マッチング" />
          <EmptyState
            title="組み合わせる単語がありません"
            body="いまの条件に合う単語が見つかりませんでした。学習メニューに戻って条件を選び直すか、単語を書き足してください。"
            actionLabel="学習メニューへ"
            onAction={() => setScr('study')}
            icon="link-outline"
          />
        </View>
      );
    return (
      <ScrollView>
        <Header title="マッチング" />
        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
          {/* いまどこまで進んだか。この画面で一番見てほしいので左端に藍の縦罫を入れる */}
          <Sheet mark={C.primary} className="p-4">
            <View className="flex-row items-end justify-between" style={{ gap: SP[3], marginBottom: SP[3] }}>
              <View>
                <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[1] }}>
                  そろったペア
                </Text>
                <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                  <Text className="text-2xl text-navy" style={NUM_BOLD}>
                    {matched.size}
                  </Text>
                  <Text className="text-sm text-ink-soft" style={NUM}>
                    / {mWords.length}
                  </Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[1] }}>
                  ミス
                </Text>
                <Text className={`text-2xl ${mErr > 0 ? 'text-vermilion' : 'text-ink-soft'}`} style={NUM_BOLD}>
                  {mErr}
                </Text>
              </View>
            </View>
            {/* 進み具合の帯。高さ4pxは他の出題画面と同じ。虹色は使わず藍1色 */}
            <View className="rounded-sm overflow-hidden" style={{ height: 4, backgroundColor: C.border }}>
              <View
                style={{
                  height: 4,
                  width: `${Math.round((matched.size / mWords.length) * 100)}%`,
                  backgroundColor: C.primary,
                }}
              />
            </View>
          </Sheet>

          <Text className="text-xs text-ink-soft" style={{ lineHeight: 19 }}>
            英語と日本語を1つずつ選ぶと、合っているかどうかが判定されます。
          </Text>

          <View className="flex-row" style={{ gap: SP[3] }}>
            {/* ── 英語の側 ── */}
            <View className="flex-1">
              <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[2] }}>
                English
              </Text>
              <Rule />
              {/* 押せるものなので枠は藍（<Btn tone="line"> と同じ意味）。
                  選んでいる間は藍のベタ塗り＝いま押しているのがどれか一目で分かる。
                  そろったペアは苔の枠＋面＋チェック印にして、色以外でも終わりが伝わるようにする。
                  枠は常に1px。選択で太さを変えると文字の位置がずれる */}
              <View style={{ gap: SP[2], marginTop: SP[2] }}>
                {mWords.map((w) => {
                  const m = matched.has(w.id);
                  const sel = selEn === w.id;
                  return (
                    <TouchableOpacity
                      key={'e' + w.id}
                      onPress={() => hMatch('en', w)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={w.en}
                      accessibilityState={{ selected: sel }}
                      className="rounded items-center justify-center"
                      style={{
                        minHeight: 48,
                        paddingVertical: SP[2],
                        paddingHorizontal: SP[2],
                        borderWidth: 1,
                        borderColor: m ? C.success : C.primary,
                        backgroundColor: m ? C.successSoft : sel ? C.primary : C.surface,
                      }}
                    >
                      <View className="flex-row items-center justify-center" style={{ gap: SP[1] }}>
                        {m ? <Icon name="checkmark" size={14} color={C.success} /> : null}
                        {/* 途中で「…」に切らない。全文が読めないと組み合わせを選べない */}
                        <Text
                          className="text-base text-center"
                          style={{
                            flexShrink: 1,
                            fontFamily: F.enSemi,
                            color: m ? C.success : sel ? C.onPrimary : C.text,
                          }}
                        >
                          {w.en}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── 日本語の側。書体は当てない（システム書体のまま） ── */}
            <View className="flex-1">
              <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[2] }}>
                日本語
              </Text>
              <Rule />
              <View style={{ gap: SP[2], marginTop: SP[2] }}>
                {mJa.map((w) => {
                  const m = matched.has(w.id);
                  const sel = selJa === w.id;
                  return (
                    <TouchableOpacity
                      key={'j' + w.id}
                      onPress={() => hMatch('ja', w)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={w.ja}
                      accessibilityState={{ selected: sel }}
                      className="rounded items-center justify-center"
                      style={{
                        minHeight: 48,
                        paddingVertical: SP[2],
                        paddingHorizontal: SP[2],
                        borderWidth: 1,
                        borderColor: m ? C.success : C.primary,
                        backgroundColor: m ? C.successSoft : sel ? C.primary : C.surface,
                      }}
                    >
                      <View className="flex-row items-center justify-center" style={{ gap: SP[1] }}>
                        {m ? <Icon name="checkmark" size={14} color={C.success} /> : null}
                        {/* こちらも省略しない。意味は最後まで読めて初めて選べる */}
                        <Text
                          className="text-sm text-center"
                          style={{
                            flexShrink: 1,
                            lineHeight: 21,
                            color: m ? C.success : sel ? C.onPrimary : C.text,
                          }}
                        >
                          {w.ja}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  // ===================== Speed =====================
  const renderSpeed = () => {
    const w = sWords[sIdx % sWords.length];
    if (!w)
      return (
        <View>
          <Header title="スピードチャレンジ" back="study" />
          <EmptyState
            title="出題できる単語がありません"
            body="いまの条件に合う単語が見つかりませんでした。学習メニューに戻って条件を選び直すか、単語を書き足してください。"
            actionLabel="学習メニューへ"
            onAction={() => setScr('study')}
            icon="timer-outline"
          />
        </View>
      );
    return (
      <View>
        {/* 上部バーは他の学習画面と同じ Header。
            戻ると scr が speed から外れ、App 側の useEffect が時計を止める */}
        <Header title="スピードチャレンジ" back="study" />
        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
          {/* のこり時間と正解数。数字は等幅にして、秒が減っても桁がガタつかないようにする。
              持ち時間は開始時にいつも60秒なので、そのぶんを藍1色の細い帯で減らしていく */}
          <View>
            <View className="flex-row items-end justify-between" style={{ gap: SP[3] }}>
              <View>
                <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[1] }}>
                  のこり時間
                </Text>
                <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                  {/* 10秒を切ったら朱＝赤ペンの色にして急かす */}
                  <Text className="text-2xl" style={[NUM_BOLD, { color: timer <= 10 ? C.accent : C.text }]}>
                    {timer}
                  </Text>
                  <Text className="text-xs text-ink-soft">秒</Text>
                </View>
              </View>
              <View className="items-end">
                <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[1] }}>
                  正解
                </Text>
                <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                  <Text className="text-2xl text-moss" style={NUM_BOLD}>
                    {spScore}
                  </Text>
                  <Text className="text-sm text-ink-soft" style={NUM}>
                    / {spTotal}
                  </Text>
                </View>
              </View>
            </View>
            <View className="rounded-sm overflow-hidden" style={{ height: 4, marginTop: SP[2], backgroundColor: C.border }}>
              <View
                style={{
                  height: 4,
                  width: `${Math.max(0, Math.min(100, (timer / 60) * 100))}%`,
                  backgroundColor: C.primary,
                }}
              />
            </View>
          </View>

          {/* 問題。いま一番見てほしいので左端に藍の縦罫を入れる */}
          <Sheet mark={C.primary} className="p-6 items-center">
            <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[2] }}>
              この単語の意味は？
            </Text>
            <Text className="text-3xl text-ink text-center" style={{ fontFamily: F.enBold }}>
              {w.en}
            </Text>
          </Sheet>

          {/* 選択肢。ふだんは藍の枠だけ。答えたあとだけ苔（正解）と朱（外した方）の面が出る */}
          <View style={{ gap: SP[2] }}>
            {opts.map((o) => {
              // 押せるものなので枠は藍（<Btn tone="line"> と同じ意味）。読むだけの Sheet と見分ける
              let face = 'bg-sheet border-navy';
              let txtClr = 'text-ink';
              let markClr = null;
              let tailIcon = null;
              if (answered) {
                if (o.id === w.id) {
                  face = 'bg-moss-soft border-moss';
                  txtClr = 'text-moss';
                  markClr = C.success;
                  tailIcon = 'checkmark';
                } else if (o.id === selAns) {
                  face = 'bg-vermilion-soft border-vermilion';
                  txtClr = 'text-vermilion';
                  markClr = C.accent;
                  tailIcon = 'close';
                }
              }
              return (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => hSpeed(o)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={o.ja}
                  className={`flex-row items-center overflow-hidden rounded border py-4 px-4 ${face}`}
                  style={{ minHeight: 52, gap: SP[3] }}
                >
                  {/* 左端の縦罫。色だけに頼らないよう、行末のアイコンと2つで伝える */}
                  {markClr ? (
                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: markClr }} />
                  ) : null}
                  <Text className={`flex-1 text-base ${txtClr}`} style={{ lineHeight: 24 }}>
                    {o.ja}
                  </Text>
                  {tailIcon ? <Icon name={tailIcon} size={18} color={markClr} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // ===================== Results =====================
  const renderResults = () => {
    const sc = sMode === 'speed' ? spScore : results.filter((r) => r.correct).length;
    const tot = sMode === 'speed' ? spTotal : results.length;
    const pct = tot > 0 ? Math.round((sc / tot) * 100) : 0;
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪';
    // 見出しの下に「何の結果か」を出すための対応表（この画面の中だけで使う）
    const MODE_LABEL = {
      flashcard: 'フラッシュカード',
      quiz: '4択クイズ',
      typing: 'タイピング',
      reverse: '逆引き',
      matching: 'マッチング',
      speed: 'スピード',
    };
    const modeLabel = MODE_LABEL[sMode] || '学習';
    return (
      <ScrollView>
        <PageTitle
          title="学習おわり"
          sub={
            <>
              {modeLabel} ・{' '}
              <Text className="text-xs" style={NUM}>
                {tot}
              </Text>
              問
            </>
          }
        />
        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
          {tot === 0 ? (
            /* 1問も答えないまま抜けたとき。0% や採点欄を出すと嘘になるので出さない。
               下の「もう一度 / モード選択」は消さない（消すとこの画面から出られなくなる） */
            <EmptyState
              title="今回は記録なし"
              body="1問も答えないまま終わりました。下の「もう一度」からやり直せます。"
              icon="refresh-outline"
            />
          ) : (
            <>
              {/* 採点欄。主役は正答率ではなく「8 / 10」の形 */}
              <Sheet mark={C.primary} className="p-6 items-center">
                <Text className="text-xs text-ink-soft" style={{ letterSpacing: 0.4 }}>
                  正解した数
                </Text>
                <View className="flex-row items-baseline" style={{ marginTop: SP[2], gap: SP[2] }}>
                  <Text className="text-4xl text-navy" style={NUM_BOLD}>
                    {sc}
                  </Text>
                  <Text className="text-2xl text-ink-faint" style={NUM}>
                    /
                  </Text>
                  <Text className="text-2xl text-ink-soft" style={NUM}>
                    {tot}
                  </Text>
                </View>
                <Text className="text-sm text-ink-soft" style={{ marginTop: SP[2] }}>
                  正答率{' '}
                  <Text className="text-sm" style={NUM_BOLD}>
                    {pct}
                  </Text>
                  %
                </Text>
                <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                  {pct >= 80 ? 'よくできました' : pct >= 50 ? 'その調子' : 'ここからが本番'} {emoji}
                </Text>
              </Sheet>

              {/* 結果一覧。カードを並べず、1行＝1罫線の帳簿にする。
                  並び順は答えた順のまま（元の results をそのまま描く） */}
              {results.length > 0 && sMode !== 'speed' && (
                <View style={{ marginTop: SP[2] }}>
                  <SectionTitle
                    icon="reader-outline"
                    right={
                      <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                        <Text className="text-base text-ink" style={NUM_BOLD}>
                          {tot - sc}
                        </Text>
                        <Text className="text-xs text-ink-soft">語まちがい</Text>
                      </View>
                    }
                  >
                    結果一覧
                  </SectionTitle>
                  <Rule />
                  <View style={{ maxHeight: 320 }}>
                    <ScrollView>
                      {results.map((r, i) => (
                        <View key={i}>
                          <View className="flex-row items-center" style={{ paddingVertical: SP[3], gap: SP[3], minHeight: 44 }}>
                            <Icon
                              name={r.correct ? 'checkmark' : 'close'}
                              size={16}
                              color={r.correct ? C.success : C.accent}
                            />
                            <View className="flex-1">
                              <Text className="text-base text-ink" style={{ fontFamily: F.enSemi }} numberOfLines={1}>
                                {r.word.en}
                              </Text>
                              <Text className="text-sm text-ink-soft" style={{ lineHeight: 21, marginTop: SP[1] }} numberOfLines={2}>
                                {r.word.ja}
                              </Text>
                            </View>
                            {/* 正解時だけ、かかった時間と速さボーナスを出す（フラッシュカードのみ ms が入る） */}
                            {r.correct && typeof r.ms === 'number' && (
                              <View className="flex-row items-center" style={{ gap: SP[1] }}>
                                {speedFactor(r.ms) > 1.05 && <Icon name="flash" size={12} color={C.ochre} />}
                                <Text className="text-xs text-ink-soft">
                                  <Text className="text-xs" style={NUM}>
                                    {(r.ms / 1000).toFixed(1)}
                                  </Text>
                                  秒
                                </Text>
                              </View>
                            )}
                            {r.delta != null && r.delta !== 0 && (
                              <Text
                                className="text-xs"
                                style={[NUM_BOLD, { color: r.delta > 0 ? C.success : C.accent, minWidth: 40, textAlign: 'right' }]}
                              >
                                {r.delta > 0 ? '+' : ''}
                                {r.delta}%
                              </Text>
                            )}
                          </View>
                          <Rule />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              )}
            </>
          )}

          {/* 最後の1枚を押し間違えたとき用。ここからでも1枚だけ戻ってやり直せる。
              戻るとフラッシュカード画面に帰り、その1語の記録は押す前に戻る（→ hFlashBack） */}
          {sMode === 'flashcard' && undoStack.length > 0 && (
            <View style={{ marginTop: SP[2] }}>
              <Btn
                label={`最後の1語をやり直す（${undoStack[undoStack.length - 1].word.en}）`}
                onPress={hFlashBack}
                tone="quiet"
                icon="arrow-undo-outline"
                small
              />
              <Text className="text-xs text-ink-soft text-center" style={{ marginTop: SP[2], lineHeight: 19 }}>
                押し間違えたときはここから。判定を取り消してやり直せます
              </Text>
            </View>
          )}

          {/* ベタ塗りは「もう一度」の1つだけ。戻る側は控えめに。
              記録なしのときも出す＝この画面から必ず出られるようにする */}
          <View className="flex-row" style={{ gap: SP[3], marginTop: SP[2] }}>
            <Btn label="もう一度" onPress={startFromConfig} tone="navy" icon="refresh" className="flex-1" />
            <Btn label="モード選択" onPress={() => setScr('study')} tone="quiet" className="flex-1" />
          </View>
        </View>
      </ScrollView>
    );
  };

  // ===================== Words list =====================
  const renderWords = () => {
    /* 絞り込みは2段に分けてある。
       上＝いま何をしたいか（全て／今日の復習／苦手／未学習）。
       下＝覚え具合の段階（LEVELS と同じ並び。左が覚えていない側）。
       ひとつながりの10個にすると375px幅で3段に折り返し、単語リストが下に押し出される。 */
    const stateTabs = [
      { k: 'all', l: '全て', n: words.length },
      { k: 'due', l: '今日の復習', n: dueWords.length },
      { k: 'weak', l: '苦手', n: weakWords.length },
      { k: 'new', l: '未学習', n: lvCount.new },
    ];
    const levelTabs = LEVELS.map((lv) => ({ k: lv.k, l: lv.name, n: lvCount[lv.k], dot: lv.barColor }));
    const curTab = [...stateTabs, ...levelTabs].find((t) => t.k === wordFilter);

    /* 絞り込みと検索。**管理タブと学習シートの両方**に同じものを出す。
       学習シートは赤シートで隠して覚える画面なので、「定着だけ」「うろ覚えだけ」を
       出せないと使いどころが限られる（以前はここに絞り込みが無く、管理タブで
       選んでから切り替えるしかなかった）。
       wordFilter / search は画面で1つなので、タブを行き来しても選んだ絞り込みは続く。 */
    const filterBar = (
      <>
        {/*
          以前はここを横スクロールの ScrollView にしていたが、Web では
          ScrollView が flex: 1 1 auto を持つため、下の単語リストに押し潰されて
          高さ 5.6px になりタブが見えなくなっていた。
          折り返す普通の行にすれば潰れず、幅が足りなければ2段になる。
        */}
        <View className="flex-row" style={{ gap: SP[2], flexWrap: 'wrap' }}>
          {stateTabs.map((t) => {
            const active = wordFilter === t.k;
            return (
              <TouchableOpacity
                key={t.k}
                onPress={() => setWordFilter(t.k)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${t.l} ${t.n}語`}
                accessibilityState={{ selected: active }}
                className="flex-row items-center rounded-full"
                style={{
                  minHeight: 44,
                  paddingHorizontal: SP[3],
                  gap: SP[1],
                  borderWidth: 1,
                  borderColor: active ? C.primary : C.border,
                  backgroundColor: active ? C.primary : 'transparent',
                }}
              >
                <Text className="text-xs font-bold" style={{ color: active ? C.onPrimary : C.muted }}>{t.l}</Text>
                <Text className="text-xs" style={[NUM, { color: active ? C.navyTint : C.muted2 }]}>{t.n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/*
          覚え具合の6段階。丸いチップを6つ足すと375px幅で2段に折り返し、
          そのぶん単語リストが下に押し出される。幅を6等分した1本の帯にして1行に収めた。
          左が覚えていない側で、右へ行くほど覚えている＝並びそのものが目盛りになる。
          段階の色（藍の濃淡。要復習だけ朱）は下の罫線で出す。

          実機幅 375px なら「マスター」まで収まる。320px（iPhone SE 初代）だけは
          「マス…」と切れるが、並びの位置と語数で読めるのでそのままにしてある。

          「全て」はこの帯に入っていないので、選んでいる段をもう一度押すと絞り込みを外す。
        */}
        <View>
          <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[1] }}>覚え具合</Text>
          <View
            className="flex-row bg-sheet border border-rule rounded"
            style={{ overflow: 'hidden' }}
          >
            {levelTabs.map((t, i) => {
              const active = wordFilter === t.k;
              return (
                <TouchableOpacity
                  key={t.k}
                  onPress={() => setWordFilter(active ? 'all' : t.k)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.l} ${t.n}語`}
                  accessibilityState={{ selected: active }}
                  className="flex-1 items-center justify-center"
                  style={{
                    minHeight: 44,
                    paddingVertical: SP[1],
                    paddingHorizontal: 2,
                    backgroundColor: active ? C.primary : 'transparent',
                    borderLeftWidth: i === 0 ? 0 : 1,
                    borderLeftColor: C.border,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: active ? C.onPrimary : C.muted }}
                    numberOfLines={1}
                  >
                    {t.l}
                  </Text>
                  <Text className="text-xs" style={[NUM, { color: active ? C.navyTint : C.muted2 }]}>
                    {t.n}
                  </Text>
                  {/* 段階の色。選んでいる間は地が藍なので引かない（濃い藍だと見えないため） */}
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 2,
                      backgroundColor: active ? 'transparent' : t.dot,
                    }}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="flex-row items-center bg-sheet border border-rule rounded" style={{ minHeight: 44, paddingHorizontal: SP[3], gap: SP[2] }}>
          <Icon name="search" size={16} color={C.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="単語を検索"
            placeholderTextColor={C.muted2}
            className="flex-1 text-sm text-ink"
            style={{ minWidth: 0, paddingVertical: SP[3] }}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity
              onPress={() => setSearch('')}
              activeOpacity={0.75}
              accessibilityLabel="検索をやめる"
              style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close-circle" size={16} color={C.muted2} />
            </TouchableOpacity>
          ) : null}
        </View>
      </>
    );

    /* 空っぽのときは3通りに出し分ける。
       「単語が見つかりません」の一言だけだと、次に何をすればいいのか分からないため。 */
    const emptyView =
      words.length === 0 ? (
        <EmptyState
          icon="create-outline"
          title="このノートはまだ白紙です"
          body="英語と意味を1語ずつ書き込むか、コピーした一覧をまとめて貼り付けて取り込めます。"
          actionLabel="単語を書き込む"
          onAction={() => { setWordsTab('manage'); setShowAdd(true); setShowBulk(false); }}
        />
      ) : search ? (
        <EmptyState
          icon="search-outline"
          tone="line"
          title={`「${search}」に一致する単語はありません`}
          body="つづりの一部でも、日本語の意味でも探せます。"
          actionLabel="検索をやめる"
          onAction={() => setSearch('')}
        />
      ) : (
        <EmptyState
          icon="funnel-outline"
          tone="line"
          title={`${curTab ? curTab.l : 'この条件'}の単語はありません`}
          body="ほかの単語は「全て」に入っています。"
          actionLabel="全てを見る"
          onAction={() => setWordFilter('all')}
        />
      );

    const renderWordItem = ({ item: w }) => {
      const lv = getLevel(w.progress, !isNew(w));
      if (editId === w.id) {
        return (
          <View>
            <View style={{ paddingVertical: SP[3], paddingLeft: SP[2] }}>
              <TextInput
                value={editEn}
                onChangeText={setEditEn}
                autoCapitalize="none"
                placeholderTextColor={C.muted2}
                className="bg-paper border border-rule rounded text-base text-ink"
                style={{ fontFamily: F.enSemi, paddingVertical: SP[3], paddingHorizontal: SP[3], minHeight: 44, marginBottom: SP[2] }}
              />
              <TextInput
                value={editJa}
                onChangeText={setEditJa}
                onSubmitEditing={saveEdit}
                placeholderTextColor={C.muted2}
                className="bg-paper border border-rule rounded text-sm text-ink"
                style={{ paddingVertical: SP[3], paddingHorizontal: SP[3], minHeight: 44, marginBottom: SP[3] }}
              />
              <View className="flex-row" style={{ gap: SP[2] }}>
                <Btn label="保存" onPress={saveEdit} tone="navy" small style={{ minHeight: 44 }} />
                <Btn label="取消" onPress={() => setEditId(null)} tone="quiet" small style={{ minHeight: 44 }} />
              </View>
            </View>
            <Rule />
          </View>
        );
      }
      const weak = isWeak(w);
      const dueNow = w.due ? isDue(w, getToday()) : false;
      // 期限を過ぎたぶんだけ朱（赤ペン）。今日ぶんは藍。ホーム画面の「◯日超過」と同じ決め方に揃える
      const overdue = w.due ? daysBetween(getToday(), w.due) < 0 : false;
      return (
        <View>
          <View className="flex-row items-center" style={{ minHeight: 56, paddingVertical: SP[2], paddingLeft: SP[2], gap: SP[2] }}>
            {/* 苦手な行だけ、左端に赤ペンで縦線を引いた印 */}
            {weak ? (
              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: C.accent }} />
            ) : null}

            <Text className="text-xs text-ink-soft" style={[NUM, { width: 30 }]}>
              {words.indexOf(w) + 1}
            </Text>

            <View className="flex-1">
              <View className="flex-row items-center" style={{ gap: SP[1] }}>
                <Text className="text-base text-ink flex-1" style={{ fontFamily: F.enSemi }} numberOfLines={1}>
                  {w.en}
                </Text>
                <SpeakButton word={w.en} size={16} color={C.primary} hitSlop={10} />
                {w.streak > 0 ? (
                  <View className="flex-row items-center" style={{ gap: SP[1] }}>
                    <Icon name="flame" size={12} color={C.ochre} />
                    <Text className="text-xs" style={[NUM, { color: C.ochre }]}>{w.streak}</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-sm text-ink-soft" style={{ lineHeight: 21 }} numberOfLines={2}>
                {w.ja}
              </Text>
              <View className="flex-row items-center" style={{ gap: SP[2], marginTop: SP[1], flexWrap: 'wrap' }}>
                <View className="flex-row items-center" style={{ gap: SP[1] }}>
                  <Icon name="checkmark" size={12} color={C.muted2} />
                  <Text className="text-xs text-ink-soft" style={NUM}>{w.correct}</Text>
                  <Icon name="close" size={12} color={C.muted2} style={{ marginLeft: SP[1] }} />
                  <Text className="text-xs text-ink-soft" style={NUM}>{w.incorrect}</Text>
                </View>
                {/* 覚え具合のしるし。苦手な行だけは朱の「苦手」に差し替える
                    ＝ LvBadge の「要復習」と左端の朱の縦罫と意味が重なるので、1行につきどちらか一方だけ出す。
                    右カラムに置くと右が太って主役の英単語が途中で切れるので、記録と同じ行に置く */}
                {weak ? (
                  <Text className="text-xs font-bold text-vermilion">苦手</Text>
                ) : (
                  <LvBadge w={w} />
                )}
                {/* 次回復習日。一度も学習していない単語には予定が付かないので出ない */}
                {w.due ? (
                  <View className="flex-row items-center" style={{ gap: SP[1] }}>
                    <Icon name="calendar-outline" size={12} color={overdue ? C.accent : dueNow ? C.primary : C.muted2} />
                    <Text className="text-xs" style={{ color: overdue ? C.accent : dueNow ? C.primary : C.muted, fontWeight: dueNow ? '700' : '400' }}>
                      {formatDue(w.due, getToday())}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', gap: SP[1] }}>
              <View className="flex-row items-center" style={{ gap: SP[1] }}>
                <TouchableOpacity
                  onPress={() => { setEditId(w.id); setEditEn(w.en); setEditJa(w.ja); }}
                  activeOpacity={0.75}
                  hitSlop={4}
                  accessibilityLabel={`${w.en} を書き直す`}
                  style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="create-outline" size={16} color={C.muted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deleteWord(w.id)}
                  activeOpacity={0.75}
                  hitSlop={4}
                  accessibilityLabel={`${w.en} を消す`}
                  style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="trash-outline" size={16} color={C.muted} />
                </TouchableOpacity>
              </View>
              <View className="flex-row items-center" style={{ gap: SP[2] }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.bg2, overflow: 'hidden' }}>
                  <View style={{ width: `${w.progress}%`, height: 4, backgroundColor: lv.barColor }} />
                </View>
                <Text className={`text-sm ${lv.c}`} style={[NUM_BOLD, { width: 34, textAlign: 'right' }]}>
                  {w.progress}
                  <Text className="text-xs text-ink-soft">%</Text>
                </Text>
              </View>
            </View>
          </View>
          <Rule />
        </View>
      );
    };

    return (
      <View style={{ flex: 1 }}>
        <PageTitle
          title="単語帳"
          sub={`${activeDeck ? activeDeck.name : '単語帳なし'} ・ ${words.length}語`}
          right={
            <View className="flex-row" style={{ gap: SP[2] }}>
              <TouchableOpacity
                onPress={() => { setWordsTab('manage'); setShowBulk(true); setShowAdd(false); }}
                activeOpacity={0.75}
                accessibilityLabel="まとめて追加"
                className="bg-sheet border border-rule rounded items-center justify-center"
                style={{ width: 44, height: 44 }}
              >
                <Icon name="document-text-outline" size={18} color={C.primary} />
              </TouchableOpacity>
              {/* ベタ塗りは1画面に1つ。入力パネルを開いている間は、パネル側の「追加」が主役になるので枠だけにする */}
              <Btn
                label="追加"
                icon="add"
                onPress={() => { setWordsTab('manage'); setShowAdd(true); setShowBulk(false); }}
                tone={showAdd || showBulk ? 'line' : 'navy'}
              />
            </View>
          }
        />
        <View style={{ flex: 1, paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
          <View className="flex-row bg-sheet border border-rule rounded overflow-hidden">
            <TouchableOpacity
              onPress={() => setWordsTab('manage')}
              activeOpacity={0.75}
              className="flex-1 flex-row items-center justify-center"
              style={{ minHeight: 44, gap: SP[2], backgroundColor: wordsTab === 'manage' ? C.primary : 'transparent' }}
            >
              <Icon name="create-outline" size={16} color={wordsTab === 'manage' ? C.onPrimary : C.muted} />
              <Text className="text-sm font-bold" style={{ color: wordsTab === 'manage' ? C.onPrimary : C.muted }}>管理</Text>
            </TouchableOpacity>
            <View style={{ width: 1, backgroundColor: C.border }} />
            <TouchableOpacity
              onPress={() => { setWordsTab('list'); setRevealed(new Set()); }}
              activeOpacity={0.75}
              className="flex-1 flex-row items-center justify-center"
              style={{ minHeight: 44, gap: SP[2], backgroundColor: wordsTab === 'list' ? C.primary : 'transparent' }}
            >
              <Icon name="list-outline" size={16} color={wordsTab === 'list' ? C.onPrimary : C.muted} />
              <Text className="text-sm font-bold" style={{ color: wordsTab === 'list' ? C.onPrimary : C.muted }}>学習シート</Text>
            </TouchableOpacity>
          </View>

          {wordsTab === 'manage' ? (
            <>
              {showBulk && (
                <Sheet mark={C.primary} className="p-4">
                  <SectionTitle icon="document-text-outline">まとめて追加</SectionTitle>
                  <TextInput
                    value={bulkText}
                    onChangeText={setBulkText}
                    placeholder={'apple りんご\nbanana, バナナ'}
                    placeholderTextColor={C.muted2}
                    multiline
                    numberOfLines={5}
                    className="bg-paper border border-rule rounded text-sm text-ink"
                    style={{ minHeight: 100, textAlignVertical: 'top', paddingVertical: SP[3], paddingHorizontal: SP[3], lineHeight: 21 }}
                  />
                  <View className="flex-row justify-between items-center" style={{ marginTop: SP[3], gap: SP[3] }}>
                    <View className="flex-1">
                      {bulkCount > 0 ? (
                        <Text className="text-xs text-moss" numberOfLines={1}>
                          <Text className="text-xs" style={NUM_BOLD}>{bulkCount}</Text> 語を読み取りました
                        </Text>
                      ) : (
                        <Text className="text-xs text-ink-soft" numberOfLines={1}>貼り付け待ち</Text>
                      )}
                    </View>
                    <View className="flex-row" style={{ gap: SP[2] }}>
                      <Btn label="取消" onPress={() => { setShowBulk(false); setBulkText(''); }} tone="quiet" small style={{ minHeight: 44 }} />
                      <Btn label="追加" onPress={addBulk} disabled={bulkCount === 0} tone="navy" small style={{ minHeight: 44 }} />
                    </View>
                  </View>
                </Sheet>
              )}
              {showAdd && (
                <Sheet mark={C.primary} className="p-4">
                  <SectionTitle icon="create-outline">単語を書き込む</SectionTitle>
                  <TextInput
                    value={newEn}
                    onChangeText={setNewEn}
                    placeholder="英語"
                    placeholderTextColor={C.muted2}
                    autoCapitalize="none"
                    className="bg-paper border border-rule rounded text-base text-ink"
                    style={{ fontFamily: F.enSemi, paddingVertical: SP[3], paddingHorizontal: SP[3], minHeight: 44, marginBottom: SP[2] }}
                  />
                  <TextInput
                    value={newJa}
                    onChangeText={setNewJa}
                    placeholder="日本語"
                    placeholderTextColor={C.muted2}
                    onSubmitEditing={addWord}
                    className="bg-paper border border-rule rounded text-sm text-ink"
                    style={{ paddingVertical: SP[3], paddingHorizontal: SP[3], minHeight: 44, marginBottom: SP[3] }}
                  />
                  <View className="flex-row" style={{ gap: SP[2] }}>
                    <Btn label="追加" onPress={addWord} tone="navy" className="flex-1" />
                    <Btn label="取消" onPress={() => { setShowAdd(false); setNewEn(''); setNewJa(''); }} tone="quiet" className="flex-1" />
                  </View>
                </Sheet>
              )}

              {filterBar}

              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderWordItem}
                ListEmptyComponent={emptyView}
                initialNumToRender={20}
                windowSize={10}
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            </>
          ) : (
            <>
              {/* 学習シートでも同じ絞り込みを出す。
                  「何を出すか」を決めてから「どう隠すか」を決める順に並べてある */}
              {filterBar}

              <Sheet className="p-4">
                <SectionTitle icon="eye-off-outline">かくして覚える</SectionTitle>
                <View className="flex-row" style={{ gap: SP[2] }}>
                  <TouchableOpacity
                    onPress={() => { setListHideEn(!listHideEn); setRevealed(new Set()); }}
                    activeOpacity={0.75}
                    className="flex-1 flex-row items-center justify-center rounded"
                    style={{
                      minHeight: 44,
                      gap: SP[2],
                      borderWidth: 1,
                      borderColor: listHideEn ? C.primary : C.border,
                      backgroundColor: listHideEn ? C.primary : C.bg,
                    }}
                  >
                    <Icon name={listHideEn ? 'eye-off' : 'eye'} size={16} color={listHideEn ? C.onPrimary : C.muted} />
                    <Text className="text-sm font-bold" style={{ color: listHideEn ? C.onPrimary : C.muted }}>英語をかくす</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setListHideJa(!listHideJa); setRevealed(new Set()); }}
                    activeOpacity={0.75}
                    className="flex-1 flex-row items-center justify-center rounded"
                    style={{
                      minHeight: 44,
                      gap: SP[2],
                      borderWidth: 1,
                      borderColor: listHideJa ? C.primary : C.border,
                      backgroundColor: listHideJa ? C.primary : C.bg,
                    }}
                  >
                    <Icon name={listHideJa ? 'eye-off' : 'eye'} size={16} color={listHideJa ? C.onPrimary : C.muted} />
                    <Text className="text-sm font-bold" style={{ color: listHideJa ? C.onPrimary : C.muted }}>日本語をかくす</Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row" style={{ gap: SP[2], marginTop: SP[2] }}>
                  <Btn label="全て表示" onPress={revealAll} tone="line" small className="flex-1" style={{ minHeight: 44 }} />
                  <Btn label="全て隠す" onPress={hideAll} tone="quiet" small className="flex-1" style={{ minHeight: 44 }} />
                </View>
              </Sheet>

              {/* 0件のときは見出し行と一覧の紙片ごと出さない。
                  <Sheet> の中に EmptyState の白紙カードを入れると枠が二重になるため */}
              {filtered.length === 0 ? (
                emptyView
              ) : (
                <Sheet style={{ flex: 1 }}>
                  <View className="flex-row items-center bg-paper" style={{ paddingHorizontal: SP[3], paddingVertical: SP[2] }}>
                    <Text className="w-8 text-xs text-ink-soft text-center">#</Text>
                    <Text className="flex-1 text-xs text-ink-soft" style={{ paddingHorizontal: SP[2] }}>英語</Text>
                    <Text className="flex-1 text-xs text-ink-soft" style={{ paddingHorizontal: SP[2] }}>日本語</Text>
                    <Text className="w-10 text-xs text-ink-soft text-center">%</Text>
                  </View>
                  <Rule />
                  <FlatList
                    data={filtered}
                    keyExtractor={(item) => String(item.id)}
                    initialNumToRender={30}
                    windowSize={10}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    renderItem={({ item: w }) => {
                      const num = words.indexOf(w) + 1;
                      const enKey = w.id + '-en';
                      const jaKey = w.id + '-ja';
                      const enHidden = listHideEn && !revealed.has(enKey);
                      const jaHidden = listHideJa && !revealed.has(jaKey);
                      const lv = getLevel(w.progress, !isNew(w));
                      return (
                        <View>
                          <View className="flex-row items-center" style={{ minHeight: 44, paddingHorizontal: SP[3] }}>
                            <Text className="w-8 text-xs text-ink-soft text-center" style={NUM}>{num}</Text>
                            <TouchableOpacity
                              onPress={() => listHideEn && toggleReveal(enKey)}
                              activeOpacity={0.75}
                              className="flex-1 rounded-sm justify-center"
                              style={{ paddingHorizontal: SP[2], paddingVertical: SP[2], minHeight: 44, backgroundColor: enHidden ? C.navyTint : 'transparent' }}
                            >
                              <Text className="text-base" style={{ fontFamily: F.enSemi, color: enHidden ? C.navyTint : C.text }} numberOfLines={2}>
                                {enHidden ? '••••••' : w.en}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => listHideJa && toggleReveal(jaKey)}
                              activeOpacity={0.75}
                              className="flex-1 rounded-sm justify-center"
                              style={{ paddingHorizontal: SP[2], paddingVertical: SP[2], minHeight: 44, backgroundColor: jaHidden ? C.navyTint : 'transparent' }}
                            >
                              <Text className="text-sm" style={{ color: jaHidden ? C.navyTint : C.muted, lineHeight: 21 }} numberOfLines={2}>
                                {jaHidden ? '••••••' : w.ja}
                              </Text>
                            </TouchableOpacity>
                            <Text className={`w-10 text-sm text-center ${lv.c}`} style={NUM_BOLD}>{w.progress}</Text>
                          </View>
                          <Rule />
                        </View>
                      );
                    }}
                  />
                </Sheet>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  // ===================== 本棚 =====================
  const renderShelf = () => {
    const menuDeck = decks.find((d) => d.id === menuDeckId) || null;
    // 表紙写真が無いときは、名前から色を決めて頭文字を出す（毎回同じ色になる）。
    // 色数は藍1色の濃淡だけに絞る。虹色に散らすと「色＝意味」が読めなくなるため
    const coverColors = [C.primary, C.navyMid, C.navyDark];
    const colorOf = (name) => {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
      return coverColors[h % coverColors.length];
    };
    // 見出しに出す本棚全体の量。1冊ごとの語数と進み具合は各カードの帯に出ている
    const totalWords = decks.reduce((s, d) => s + d.words.length, 0);

    return (
      <ScrollView>
        <PageTitle
          title="本棚"
          sub={
            /* まず本棚全体の量。学習中の1冊は名前だけ続ける
               （語数と％はその本の帯に出ているので、行が溢れないよう重ねて書かない） */
            activeDeck ? (
              <><Text className="text-xs" style={NUM}>{decks.length}</Text>冊 ・ 全<Text className="text-xs" style={NUM}>{totalWords}</Text>語 ／ 学習中：{activeDeck.name}</>
            ) : (
              '単語帳がありません'
            )
          }
          right={
            // 1冊しか無いときは並べ替えようがないので出さない
            decks.length > 1 ? (
              <Btn
                label={sorting ? '完了' : '並べ替え'}
                icon={sorting ? 'checkmark' : 'reorder-two-outline'}
                tone={sorting ? 'navy' : 'line'}
                small
                onPress={() => setSorting((v) => !v)}
                style={{ minHeight: 44 }}
              />
            ) : null
          }
        />

        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], paddingBottom: SP[5], gap: SP[3] }}>
          {decks.length === 0 ? (
            <EmptyState
              title="本棚が空です"
              body="単語帳を1冊つくると、ここに並びます。書き出したファイルがあれば下から読み込めます。"
              actionLabel="単語帳を作る"
              onAction={createDeck}
              icon="bookshelf"
            />
          ) : (
            <>
              <Text className="text-xs text-ink-soft" numberOfLines={1}>
                {sorting ? '左右の矢印で順番を入れ替えます' : 'タップで切り替え ／ 長押しで編集'}
              </Text>

              <View className="flex-row" style={{ flexWrap: 'wrap', gap: SP[3] }}>
                {decks.map((d, i) => {
                  const isActive = d.id === activeId;
                  const pct = d.words.length ? Math.round((d.words.reduce((s, w) => s + w.progress, 0) / d.words.length)) : 0;
                  const editing = editDeckId === d.id;
                  const initial = d.name.trim().charAt(0) || '?';
                  // 頭文字が英字のときだけ Lora を当てる（日本語に当てると豆腐や偽の太字になる）
                  const enInitial = /[A-Za-z0-9?]/.test(initial);
                  return (
                    <View key={d.id} style={{ width: '47%' }}>
                      <TouchableOpacity
                        // 並べ替え中は切り替えも編集メニューも出さない。
                        // 矢印を押すつもりでカードに触れて単語帳が変わってしまうのを防ぐ
                        disabled={sorting}
                        onPressIn={() => startLongPress(() => setMenuDeckId(d.id))}
                        onPressOut={cancelLongPress}
                        // 長押しが成立していたら、指を離したときの通常タップは無視する
                        onPress={() => { if (!longPress.current.fired) selectDeck(d.id); }}
                        activeOpacity={0.75}
                        // 長押しで iOS のテキスト選択メニューが出ないようにする
                        style={{ userSelect: 'none' }}
                      >
                        {/* 本の表紙。写真は切り取らずに全体を見せる（余白は単語帳の色で埋める）。
                            影は使わず 1px の罫線だけで縁を作る */}
                        <View
                          className="rounded-lg overflow-hidden"
                          style={{
                            aspectRatio: 3 / 4,
                            backgroundColor: colorOf(d.name),
                            borderWidth: 1,
                            borderColor: C.border,
                          }}
                        >
                          {d.cover ? (
                            <Image source={{ uri: d.cover }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                          ) : (
                            <View className="flex-1 items-center justify-center">
                              <Text
                                className={enInitial ? '' : 'font-bold'}
                                style={{
                                  fontSize: 52,
                                  lineHeight: 62,
                                  color: C.onPrimary,
                                  fontFamily: enInitial ? F.enBold : undefined,
                                }}
                              >
                                {initial}
                              </Text>
                            </View>
                          )}

                          {/* 名前と語数は写真の上に重ねる。読めるように暗い帯を敷く */}
                          <View
                            style={{
                              position: 'absolute',
                              // 栞（左端の縦帯）はこの帯より後ろで描くので、帯は端まで敷いてよい。
                              // 中の文字は paddingHorizontal 8px なので 6px の栞には重ならない
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: 'rgba(34,32,27,0.72)',
                              paddingHorizontal: SP[2],
                              paddingTop: SP[2],
                              paddingBottom: SP[2],
                            }}
                          >
                            {editing ? (
                              <TextInput
                                value={editDeckName}
                                onChangeText={setEditDeckName}
                                onSubmitEditing={() => renameDeck(d.id, editDeckName)}
                                onBlur={() => renameDeck(d.id, editDeckName)}
                                autoFocus
                                className="text-sm font-bold"
                                style={{
                                  color: C.onPrimary,
                                  borderBottomWidth: 1,
                                  borderBottomColor: C.onPrimary,
                                  paddingVertical: SP[2],
                                  minHeight: 44,
                                }}
                              />
                            ) : (
                              <Text className="text-sm font-bold" style={{ color: C.onPrimary, lineHeight: 19 }} numberOfLines={2}>
                                {d.name}
                              </Text>
                            )}
                            <Text className="text-xs" style={{ color: C.navyTint, marginTop: SP[1] }} numberOfLines={1}>
                              <Text className="text-xs" style={NUM}>{d.words.length}</Text>語 ・ <Text className="text-xs" style={NUM}>{pct}</Text>%
                            </Text>
                            <View style={{ height: 4, borderRadius: R.pill, backgroundColor: 'rgba(255,253,247,0.28)', marginTop: SP[1], overflow: 'hidden' }}>
                              <View style={{ height: 4, width: `${pct}%`, borderRadius: R.pill, backgroundColor: C.onPrimary }} />
                            </View>
                          </View>

                          {/* 並べ替え中は今が何番目かを出す。動いたことが一目で分かるように */}
                          {sorting ? (
                            <View
                              style={{
                                position: 'absolute',
                                top: SP[2],
                                left: SP[2],
                                width: 24,
                                height: 24,
                                borderRadius: R.pill,
                                backgroundColor: C.surface,
                                borderWidth: 1,
                                borderColor: C.border,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text className="text-xs" style={{ ...NUM_BOLD, color: C.primary }}>{i + 1}</Text>
                            </View>
                          ) : null}

                          {/* 学習中の1冊にだけ、藍の栞を挟んだように左端へ帯を差す。
                              藍＝選んでいる・進行中。朱（赤ペンの印）はこの画面では削除メニューにしか使わない。
                              「学習中」のバッジと意味が二重になるので、印はこの栞 1 本に寄せてある。
                              表紙の地色も藍の濃淡なので、内側に1pxの紙色の罫を入れて帯として読めるようにする */}
                          {isActive && (
                            <View
                              style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 7,
                                // 表紙も藍系なので、藍のベタ帯だと同化して見えない。
                                // 紙色の帯の中に藍の線を1本入れて、写真の表紙でも必ず読めるようにする
                                backgroundColor: C.surface,
                                borderLeftWidth: 3,
                                borderLeftColor: C.primary,
                                borderRightWidth: 1,
                                borderRightColor: C.border,
                              }}
                              accessible
                              accessibilityLabel="学習中"
                            />
                          )}
                        </View>
                      </TouchableOpacity>

                      {/*
                        並べ替えの矢印。カードの上に重ねると表紙が隠れるので下に出す。
                        ドラッグではなくボタンにしているのは、Web とネイティブの両方で
                        確実に動かすため（RNW では長押し・ドラッグ系が素直に動かない）。
                      */}
                      {sorting && (
                        <View className="flex-row" style={{ gap: SP[2], marginTop: SP[2] }}>
                          {[
                            { dir: -1, icon: 'chevron-back', off: i === 0 },
                            { dir: 1, icon: 'chevron-forward', off: i === decks.length - 1 },
                          ].map((b) => (
                            <Btn
                              key={b.dir}
                              label={b.dir === -1 ? '前へ' : '後へ'}
                              icon={b.icon}
                              tone="line"
                              small
                              disabled={b.off}
                              onPress={() => moveDeckBy(d.id, b.dir)}
                              className="flex-1"
                              style={{ paddingHorizontal: SP[2], minHeight: 44 }}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* 追加カード。並べ替え中は順番の話に集中できるよう隠す */}
                {!sorting && (
                <TouchableOpacity onPress={createDeck} activeOpacity={0.75} style={{ width: '47%' }}>
                  <View
                    className="rounded-lg items-center justify-center bg-sheet"
                    style={{ aspectRatio: 3 / 4, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border2, gap: SP[1] }}
                  >
                    <Icon name="add" size={28} color={C.primary} />
                    <Text className="text-xs font-bold" style={{ color: C.primary }}>新しい単語帳</Text>
                  </View>
                </TouchableOpacity>
                )}
              </View>
            </>
          )}

          <Sheet className="p-4" style={{ marginTop: SP[3] }}>
            <SectionTitle icon="folder-open-outline">ファイルから追加</SectionTitle>
            <Text className="text-xs text-ink-soft" style={{ lineHeight: 19, marginBottom: SP[3] }}>
              単語だけのファイルは1冊として追加します。本棚ごと書き出したファイルなら、全体を元に戻します。
            </Text>
            <View className="flex-row" style={{ gap: SP[2] }}>
              <Btn label="本棚を保存" icon="download-outline" tone="line" onPress={exportData} className="flex-1" style={{ paddingHorizontal: SP[2] }} />
              <Btn label="読込" icon="cloud-upload-outline" tone="line" onPress={importData} className="flex-1" style={{ paddingHorizontal: SP[2] }} />
            </View>
          </Sheet>
        </View>

        {/* 長押しで出す編集メニュー */}
        <Modal visible={menuDeck !== null} transparent animationType="fade" onRequestClose={() => setMenuDeckId(null)}>
          <Pressable
            onPress={() => setMenuDeckId(null)}
            style={{ flex: 1, backgroundColor: 'rgba(34,32,27,0.5)', justifyContent: 'flex-end', padding: SP[3] }}
          >
            {/* 中身のタップでは閉じないよう、押しても何もしない Pressable で包む */}
            <Pressable onPress={() => {}}>
              <Sheet className="p-4">
                <Text className="text-base font-bold text-ink text-center" numberOfLines={1}>
                  {menuDeck ? menuDeck.name : ''}
                </Text>
                <Text className="text-xs text-ink-soft text-center" style={{ marginTop: SP[1] }}>
                  {menuDeck ? (
                    <><Text className="text-xs" style={NUM}>{menuDeck.words.length}</Text>語</>
                  ) : (
                    ''
                  )}
                </Text>

                <Rule className="my-4" />

                {[
                  { i: 'image-outline', l: menuDeck && menuDeck.cover ? '表紙の写真を変える' : '表紙に写真を付ける', on: () => changeCover(menuDeckId) },
                  ...(menuDeck && menuDeck.cover
                    ? [{ i: 'close-circle-outline', l: '表紙を外す', on: () => removeCover(menuDeckId) }]
                    : []),
                  { i: 'create-outline', l: '名前を変える', on: () => { setEditDeckId(menuDeckId); setEditDeckName(menuDeck.name); } },
                  // よく使う単語帳を先頭に置きたいことが多いので、1タップで済む道を用意する。
                  // すでに先頭なら出さない
                  ...(menuDeck && decks[0] && decks[0].id !== menuDeck.id
                    ? [{ i: 'arrow-up-outline', l: '本棚の先頭に移動', on: (id) => { moveDeckBy(id, -decks.length); setToast('先頭に移動しました'); } }]
                    : []),
                  { i: 'trash-outline', l: 'この単語帳を削除', on: () => deleteDeck(menuDeckId), danger: true },
                ].map((it) => (
                  <TouchableOpacity
                    key={it.l}
                    onPress={() => { const id = menuDeckId; setMenuDeckId(null); setTimeout(() => it.on(id), 0); }}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={it.l}
                    className="flex-row items-center"
                    style={{ gap: SP[3], paddingVertical: SP[3], minHeight: 48 }}
                  >
                    <Icon name={it.i} size={20} color={it.danger ? C.accent : C.primary} />
                    <Text className="text-sm" style={{ color: it.danger ? C.accent : C.text }}>{it.l}</Text>
                  </TouchableOpacity>
                ))}

                <Btn label="閉じる" tone="quiet" onPress={() => setMenuDeckId(null)} style={{ marginTop: SP[3] }} />
              </Sheet>
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    );
  };

  // ===================== Stats =====================
  const renderStats = () => {
    // 学習時間。フラッシュカードで計った時間だけが入っている
    const tToday = sumStudyTime(timeLog, [getToday()]);
    const t7 = sumStudyTime(timeLog, last7keys);
    const tAll = sumStudyTime(timeLog);

    // 復習予定のグラフで、一番高いバーに合わせる基準
    const dueMax = Math.max(1, ...dueForecast.map((d) => d.count));

    // 覚え具合は虹色をやめ、藍1色の濃淡で「濃いほど覚えている」を表す。
    // 値は theme.js のランプ（getLevel() の barColor と同じ並び）。要復習だけ朱＝赤ペンの印
    // 段階の並び・境目・色は LEVELS が持っている（src/lib/logic.js）。
    // ここは表示のためにひっくり返すだけ（グラフは覚えている側を上にする）。
    // 語数は単語帳の絞り込みと同じ lvCount を使う。同じ数を2通りに数えると必ずずれる。
    const bandLabel = (lv) =>
      `${lv.name}(${lv.max === Infinity ? `${lv.min}%↑` : `${lv.min}-${lv.max - 1}%`}${lv.min === 0 ? '触れた' : ''})`;
    const lvDist = [
      ...[...LEVELS].reverse().map((lv) => ({ name: bandLabel(lv), count: lvCount[lv.k], barColor: lv.barColor })),
      { name: '未学習(未着手)', count: lvCount.new, barColor: C.lv0 },
    ];
    return (
      <ScrollView>
        {/* 画面の顔。紫のベタ帯はやめ、紙に見出しを置いて罫線で締める */}
        <PageTitle
          title="統計"
          sub={activeDeck ? `${activeDeck.name}・${words.length}語` : '単語帳なし'}
        />

        {/* まだ一度も解いていないときはグラフを全部0で並べても読めない。次の一手だけを出す。
            ただし連続日数と学習時間は単語帳をまたいだ記録なので、
            「この1冊がまだ0語」というだけで隠すと、他の単語帳でやった記録まで消えて見える。
            アプリ全体でまだ何もしていないときだけ空状態にする。 */}
        {totalStudied === 0 && shownStreak === 0 && tAll.n === 0 ? (
          <EmptyState
            title="まだ記録がありません"
            body="1回学習すると、ここにグラフが出ます。"
            actionLabel="学習をはじめる"
            onAction={() => setScr('study')}
            icon="stats-chart-outline"
          />
        ) : (
          <View style={{ paddingHorizontal: SP[4], paddingTop: SP[4], gap: SP[3] }}>
            {/* 連続日数と今日の学習。丸いアイコン座布団はやめ、罫線1本で仕切った2列の数字にする */}
            <Sheet className="p-4">
              <View className="flex-row items-center">
                <View className="flex-1">
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-3xl text-ink" style={NUM_BOLD}>
                      {shownStreak}
                    </Text>
                    <Text className="text-xs text-ink-soft">日</Text>
                  </View>
                  <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                    連続日数
                  </Text>
                </View>

                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: SP[4] }} />

                <View className="flex-1">
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-3xl text-ink" style={NUM_BOLD}>
                      {todayN}
                    </Text>
                    <Text className="text-xs text-ink-soft">語</Text>
                  </View>
                  <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                    今日の学習
                  </Text>
                </View>
              </View>
            </Sheet>

            {/* 学習時間。計測できるのはフラッシュカードだけなので、その旨を明記する */}
            <Sheet className="p-4">
              <SectionTitle
                icon="time-outline"
                right={<Text className="text-xs text-ink-soft">フラッシュカードのみ計測</Text>}
              >
                学習時間
              </SectionTitle>

              <View className="flex-row items-end justify-between" style={{ gap: SP[3] }}>
                <View>
                  <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[1] }}>
                    今日
                  </Text>
                  <Text className="text-3xl text-navy" style={NUM_BOLD}>
                    {formatDuration(tToday.ms)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[1] }}>
                    1語あたり
                  </Text>
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-2xl text-ink" style={NUM_BOLD}>
                      {tToday.n > 0 ? (tToday.avgMs / 1000).toFixed(1) : '—'}
                    </Text>
                    <Text className="text-xs text-ink-soft">秒</Text>
                  </View>
                </View>
              </View>

              <View style={{ marginTop: SP[3] }}>
                <Rule />
              </View>

              <View className="flex-row" style={{ paddingTop: SP[3], gap: SP[2] }}>
                {[
                  { l: '今日の語数', v: String(tToday.n), u: '語' },
                  { l: '7日間', v: formatDuration(t7.ms), u: '' },
                  { l: '累計', v: formatDuration(tAll.ms), u: '' },
                ].map((it) => (
                  <View key={it.l} className="flex-1 items-center">
                    <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                      <Text className="text-sm text-ink" style={NUM_BOLD}>
                        {it.v}
                      </Text>
                      {it.u ? <Text className="text-xs text-ink-soft">{it.u}</Text> : null}
                    </View>
                    <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                      {it.l}
                    </Text>
                  </View>
                ))}
              </View>

              {tAll.n === 0 && (
                <Text className="text-xs text-ink-soft text-center" style={{ marginTop: SP[3], lineHeight: 19 }}>
                  フラッシュカードで学習すると記録がたまります
                </Text>
              )}
            </Sheet>

            {/*
              復習予定（間隔反復）。この画面で一番見てほしいのは「これから何語やるか」なので、
              ここだけ左端に藍の縦罫を入れる。
              バーの高さは % ではなく px で出す。Web ではパーセント指定が 0px に潰れる
              （BarChart7 と同じ理由。README の「Web 版 / ネイティブとの実装の違い」参照）。
            */}
            <Sheet mark={C.primary} className="p-4">
              <SectionTitle
                icon="calendar-outline"
                iconColor={C.primary}
                right={
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-xs text-ink-soft">予定あり</Text>
                    <Text className="text-base text-navy" style={NUM_BOLD}>
                      {scheduledCnt}
                    </Text>
                    <Text className="text-xs text-ink-soft">語</Text>
                  </View>
                }
              >
                これからの復習予定
              </SectionTitle>

              {scheduledCnt === 0 ? (
                <Text className="text-sm text-ink-soft text-center" style={{ paddingVertical: SP[5], lineHeight: 21 }}>
                  学習すると復習の予定が入ります
                </Text>
              ) : (
                <>
                  <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[3], lineHeight: 19 }}>
                    忘れそうな頃に出します。「今日」には期限を過ぎたぶんも含みます
                  </Text>
                  <View className="flex-row items-end justify-between" style={{ paddingHorizontal: SP[1] }}>
                    {dueForecast.map((d, i) => (
                      <View key={d.date} className="items-center" style={{ flex: 1 }}>
                        <Text className="text-xs text-ink-soft" style={[NUM, { marginBottom: SP[1] }]}>
                          {d.count > 0 ? d.count : ''}
                        </Text>
                        <View style={{ height: 64, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <View
                            style={{
                              width: '60%',
                              height: Math.max(2, (d.count / dueMax) * 64),
                              // 今日ぶんだけ濃い藍にして「今やるもの」を目立たせる
                              backgroundColor: i === 0 ? C.primary : C.lv2,
                              borderTopLeftRadius: R.sm,
                              borderTopRightRadius: R.sm }}
                          />
                        </View>
                        <Text
                          className={`text-xs ${i === 0 ? 'font-bold text-navy' : 'text-ink-soft'}`}
                          style={i === 0 ? { marginTop: SP[1] } : [NUM, { marginTop: SP[1] }]}
                        >
                          {i === 0 ? '今日' : d.date}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </Sheet>

            {/* 習熟度の内訳。色の面（バッジ）はやめ、罫線で仕切った3列の数字にする */}
            <Sheet className="p-4">
              <SectionTitle
                right={
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-xs text-ink-soft">全</Text>
                    <Text className="text-sm text-ink" style={NUM_BOLD}>
                      {words.length}
                    </Text>
                    <Text className="text-xs text-ink-soft">語</Text>
                  </View>
                }
              >
                習熟度の内訳
              </SectionTitle>
              <View className="flex-row items-center">
                {[
                  { c: C.lv5, l: 'マスター', d: '80%以上', n: mast },
                  { c: C.lv3, l: '学習中', d: '20〜79%', n: learn },
                  { c: C.lv0, l: '未学習', d: '未着手', n: lvCount.new },
                ].map((g, i) => (
                  <React.Fragment key={g.l}>
                    {i > 0 && (
                      <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: SP[3] }} />
                    )}
                    <View className="flex-1 items-center">
                      <Text className="text-2xl" style={[NUM_BOLD, { color: g.c }]}>
                        {g.n}
                      </Text>
                      <Text className="text-xs text-ink" style={{ marginTop: SP[1] }}>
                        {g.l}
                      </Text>
                      <Text className="text-xs text-ink-soft">{g.d}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </Sheet>

            {/* 解答実績。数字だけの表なので、色の面はやめて罫線で段を作る */}
            <Sheet className="p-4">
              <SectionTitle icon="checkmark-done-outline">解答実績</SectionTitle>

              <View className="flex-row items-center">
                <View className="flex-1 items-center">
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-2xl text-navy" style={NUM_BOLD}>
                      {totalStudied}
                    </Text>
                    <Text className="text-xs text-ink-soft" style={NUM}>
                      /{words.length}
                    </Text>
                  </View>
                  <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                    解答済み
                  </Text>
                </View>

                <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: SP[3] }} />

                <View className="flex-1 items-center">
                  <Text className="text-2xl text-ink" style={NUM_BOLD}>
                    {neverStudied}
                  </Text>
                  <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                    未解答
                  </Text>
                </View>
              </View>

              <View style={{ marginVertical: SP[3] }}>
                <Rule />
              </View>

              <View className="flex-row items-center">
                {[
                  { l: '正解', n: totalCorrect, u: '' },
                  { l: '不正解', n: totalIncorrect, u: '' },
                  { l: '正解率', n: totalAccuracy, u: '%' },
                ].map((it, i) => (
                  <React.Fragment key={it.l}>
                    {i > 0 && (
                      <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border, marginHorizontal: SP[3] }} />
                    )}
                    <View className="flex-1 items-center">
                      <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                        <Text className="text-xl text-ink" style={NUM_BOLD}>
                          {it.n}
                        </Text>
                        {it.u ? <Text className="text-xs text-ink-soft">{it.u}</Text> : null}
                      </View>
                      <Text className="text-xs text-ink-soft" style={{ marginTop: SP[1] }}>
                        {it.l}
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </Sheet>

            {/* 苦手な単語。赤ペンで印を付けた行なので、ここだけ左端の縦罫を朱にする。
                入れ子のスクロールはやめ、上位5語だけ平置きする */}
            <Sheet mark={C.accent} className="p-4">
              <SectionTitle
                icon="alert-circle-outline"
                iconColor={C.accent}
                right={
                  <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                    <Text className="text-base" style={[NUM_BOLD, { color: C.accent }]}>
                      {weakWords.length}
                    </Text>
                    <Text className="text-xs text-ink-soft">語</Text>
                  </View>
                }
              >
                苦手な単語
              </SectionTitle>

              {weakWords.length > 0 ? (
                <>
                  <View>
                    {weakWords.slice(0, 5).map((w) => {
                      const lv = getLevel(w.progress, !isNew(w));
                      const t = w.correct + w.incorrect;
                      const rate = t > 0 ? Math.round((w.correct / t) * 100) : 0;
                      return (
                        <View key={w.id}>
                          <View style={{ paddingVertical: SP[2] }}>
                            <View className="flex-row items-baseline justify-between" style={{ gap: SP[3] }}>
                              <Text
                                className="text-base text-ink flex-1"
                                style={{ fontFamily: F.enSemi }}
                                numberOfLines={1}
                              >
                                {w.en}
                              </Text>
                              <View className="flex-row items-baseline" style={{ gap: SP[1] }}>
                                <Text className="text-sm" style={[NUM_BOLD, { color: lv.barColor }]}>
                                  {w.progress}
                                </Text>
                                <Text className="text-xs text-ink-soft">%</Text>
                              </View>
                            </View>
                            <View className="flex-row items-baseline justify-between" style={{ gap: SP[3], marginTop: SP[1] }}>
                              <Text className="text-xs text-ink-soft flex-1" numberOfLines={1}>
                                {w.ja}
                              </Text>
                              <Text className="text-xs text-ink-soft">
                                {'正解 '}<Text style={NUM}>{`${w.correct}/${t}`}</Text>{'（'}<Text style={NUM}>{rate}</Text>{'%）'}
                              </Text>
                            </View>
                          </View>
                          <Rule />
                        </View>
                      );
                    })}
                  </View>

                  {weakWords.length > 5 && (
                    <View style={{ marginTop: SP[3] }}>
                      {/* 5語で打ち切ったままだと続きに行けない。単語一覧の「苦手」タブへ送る */}
                      <Text className="text-xs text-ink-soft" style={{ marginBottom: SP[2] }}>
                        ほか <Text style={NUM}>{weakWords.length - 5}</Text> 語
                      </Text>
                      <Btn
                        tone="line"
                        small
                        label="苦手な単語をぜんぶ見る"
                        onPress={() => { setWordFilter('weak'); setScr('words'); }}
                      />
                    </View>
                  )}
                </>
              ) : (
                <Text className="text-sm text-center" style={{ color: C.success, paddingVertical: SP[3], lineHeight: 21 }}>
                  苦手な単語はありません 🎉
                </Text>
              )}
            </Sheet>

            {/* レベル分布。横棒は藍1色の濃淡（要復習だけ朱）。高さ10px・角丸2px */}
            <Sheet className="p-4">
              <SectionTitle icon="stats-chart-outline">レベル分布</SectionTitle>
              <View style={{ gap: SP[2] }}>
                {lvDist.map((lv, i) => {
                  const pct = words.length ? (lv.count / words.length) * 100 : 0;
                  return (
                    <View key={i} className="flex-row items-center" style={{ gap: SP[2] }}>
                      <Text className="text-xs text-ink-soft text-right" style={{ width: 112, lineHeight: 19 }}>
                        {lv.name}
                      </Text>
                      <View
                        className="flex-1"
                        style={{ height: 10, borderRadius: R.sm, backgroundColor: C.bg2, overflow: 'hidden' }}
                      >
                        <View style={{ height: 10, borderRadius: R.sm, width: `${pct}%`, backgroundColor: lv.barColor }} />
                      </View>
                      <Text className="text-xs text-ink text-right" style={[NUM_BOLD, { width: 30 }]}>
                        {lv.count}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Sheet>

            <BarChart7 data={last7} />
          </View>
        )}

        {/* データ管理は「記録が0のときこそ使う（バックアップの読込）」ので、空のときも隠さない。
            たまにしか使わないものなので段を1つ空け、ベタ塗りはやめて枠だけのボタンにする */}
        <View style={{ paddingHorizontal: SP[4], paddingTop: SP[5], paddingBottom: SP[5] }}>
          <Sheet className="p-4">
            <SectionTitle icon="save-outline">データ管理</SectionTitle>
            <View className="flex-row" style={{ gap: SP[2] }}>
              <Btn
                label="保存"
                tone="line"
                icon="download-outline"
                onPress={exportData}
                className="flex-1"
                style={{ paddingHorizontal: SP[2] }}
              />
              <Btn
                label="読込"
                tone="line"
                icon="cloud-upload-outline"
                onPress={importData}
                className="flex-1"
                style={{ paddingHorizontal: SP[2] }}
              />
            </View>
          </Sheet>
        </View>
      </ScrollView>
    );
  };
  // ===================== Render Tree =====================
  return (
    <SafeAreaProvider>
      {/* 背景が明るい紙になったので、時計や電池のアイコンは黒にする */}
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <View style={{ flex: 1 }}>
          {scr === 'dashboard' && renderDash()}
          {scr === 'study' && renderStudy()}
          {scr === 'config' && renderConfig()}
          {scr === 'flashcard' && renderFlash()}
          {scr === 'quiz' && renderQuiz()}
          {scr === 'typing' && renderTyping(false)}
          {scr === 'reverse' && renderTyping(true)}
          {scr === 'matching' && renderMatch()}
          {scr === 'speed' && renderSpeed()}
          {scr === 'results' && renderResults()}
          {scr === 'words' && renderWords()}
          {scr === 'shelf' && renderShelf()}
          {scr === 'stats' && renderStats()}
        </View>

        <Toast text={toast} />
        <TabBar active={aTab} onSelect={setScr} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* 下タブ。影を使わないぶん、上辺だけ2pxの罫線で「浮いている」ことを言う。
   iPhone のホームインジケータ（下の横棒）にラベルが重ならないよう、
   useSafeAreaInsets().bottom を下の余白に足す。 */
function TabBar({ active, onSelect }) {
  const insets = useSafeAreaInsets();
  const tabs = [
    { k: 'home', s: 'dashboard', i: 'home-outline', on: 'home', l: 'ホーム' },
    { k: 'study', s: 'study', i: 'school-outline', on: 'school', l: '学習' },
    { k: 'words', s: 'words', i: 'list-outline', on: 'list', l: '単語帳' },
    { k: 'shelf', s: 'shelf', i: 'library-outline', on: 'library', l: '本棚' },
    { k: 'stats', s: 'stats', i: 'stats-chart-outline', on: 'stats-chart', l: '統計' },
  ];
  return (
    <View style={{ backgroundColor: C.surface, borderTopWidth: 2, borderTopColor: C.border2, paddingBottom: insets.bottom }}>
      <View className="flex-row">
        {tabs.map((t) => {
          const on = active === t.k;
          return (
            <TouchableOpacity
              key={t.k}
              onPress={() => onSelect(t.s)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.l}
              className="flex-1 items-center"
              style={{ paddingTop: SP[2], paddingBottom: SP[2], gap: SP[1], minHeight: 52 }}
            >
              {/* 選んでいるタブは、しおりのように上端へ藍の帯を出す */}
              <View style={{ position: 'absolute', top: 0, left: 18, right: 18, height: 2, backgroundColor: on ? C.primary : 'transparent' }} />
              <Icon name={on ? t.on : t.i} size={21} color={on ? C.primary : C.muted} />
              <Text className="text-xs" style={{ color: on ? C.primary : C.muted, fontWeight: on ? '700' : '400' }}>
                {t.l}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// 一言だけ知らせる帯。下タブの上に出す（安全領域ぶんも避ける）
function Toast({ text }) {
  const insets = useSafeAreaInsets();
  if (!text) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: SP[4],
        right: SP[4],
        bottom: 52 + insets.bottom + SP[3],
        alignItems: 'center',
      }}
      pointerEvents="none"
    >
      <View style={{ backgroundColor: C.text, paddingHorizontal: SP[4], paddingVertical: SP[3], borderRadius: R.md }}>
        <Text className="text-sm font-medium" style={{ color: C.surface, lineHeight: 21 }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

// シンプルなバーチャート（recharts代替）
//
// バーの高さは % ではなく px で出す。Web（react-native-web）では CSS の規則がそのまま効くため、
// 親の高さが内容依存だと height: '46%' のようなパーセント指定が解決できず 0px に潰れる。
// px なら両プラットフォームで同じ高さになる。
const BAR_AREA = 80; // バーが伸びる領域の高さ(px)

function BarChart7({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  // 7日ぶん全部0なら棒を描かず、罫線と日付だけ残して一言添える
  const empty = data.every((d) => d.count === 0);
  return (
    <Sheet className="p-4">
      {/* 統計画面の「レベル分布」が stats-chart なので、こちらは縦棒の bar-chart にして見分けをつける */}
      <SectionTitle icon="bar-chart-outline">過去7日間の学習語数</SectionTitle>

      {empty ? (
        // 高さは棒のある時とそろえる（本数ラベル 16 ＋ すきま SP[1] ＋ 棒の領域）
        <View style={{ height: 16 + SP[1] + BAR_AREA, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="text-sm text-ink-soft text-center" style={{ lineHeight: 21 }}>
            学習するとここに記録が出ます
          </Text>
        </View>
      ) : (
        <View className="flex-row items-end">
          {data.map((d, i) => (
            <View key={i} className="items-center" style={{ flex: 1 }}>
              <Text className="text-xs text-ink-soft" style={[NUM, { lineHeight: 16, marginBottom: SP[1] }]}>
                {d.count > 0 ? d.count : ''}
              </Text>
              {/* 棒が伸びる領域。下端をそろえて罫線の上に立たせる */}
              <View style={{ height: BAR_AREA, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                {d.count > 0 ? (
                  <View
                    style={{
                      width: '40%',
                      height: Math.max(2, (d.count / max) * BAR_AREA),
                      backgroundColor: C.primary,
                      borderTopLeftRadius: R.sm,
                      borderTopRightRadius: R.sm }}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ノートの横罫。棒はこの線の上に立っている */}
      <Rule />

      <View className="flex-row">
        {data.map((d, i) => (
          <Text
            key={i}
            className="text-xs text-center"
            style={[NUM, { flex: 1, marginTop: SP[2], lineHeight: 16, color: i === data.length - 1 ? C.primary : C.muted }]}
          >
            {d.date}
          </Text>
        ))}
      </View>
    </Sheet>
  );
}