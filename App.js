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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
// ファイル入出力・確認ダイアログ・発音はネイティブ／Web で実装が分かれる（.web.js を Metro が解決する）
import { saveBackup, pickBackup } from './src/lib/backup';
import { confirmDestructive } from './src/lib/confirm';
import { speakWord, stopSpeaking } from './src/lib/speech';
import { pickPhoto } from './src/lib/photo';
import {
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  makeDeck,
  nextDeckId,
  uniqueDeckName,
  normalizeState,
  planImport,
  deckNameFromFile,
  buildState,
} from './src/lib/decks';
import {
  localDateStr,
  getToday,
  getYesterday,
  getDaysAgo,
  shuffleArr,
  clamp,
  calcProg,
  calcWeight,
  speedFactor,
  streakFromDates,
  getLevel,
  isWeak,
  isNew,
  parseLine,
  INIT_WORDS,
} from './src/lib/logic';

const STORAGE_KEY = '@eitango_state_v1';

// Brain アイコンは Ionicons に無いので MaterialCommunityIcons から借りる
const Icon = ({ name, size = 20, color = '#000', style }) => {
  if (name === 'brain') {
    return <MaterialCommunityIcons name="brain" size={size} color={color} style={style} />;
  }
  return <Ionicons name={name} size={size} color={color} style={style} />;
};

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
  const [numQ, setNumQ] = useState(10);
  // ダブルタップモード（フラッシュカードのみ）。
  // オンだと「知ってた／知らない」の1回目のタップでは判定せず、意味を出すだけにする。
  // 意味を確かめてからもう一度押して判定する＝誤タップで進んでしまうのを防ぐ。
  const [dblTap, setDblTap] = useState(false);

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
        const rawV2 = await AsyncStorage.getItem(STORAGE_KEY_V2);
        const raw = rawV2 || (await AsyncStorage.getItem(STORAGE_KEY_V1));
        if (raw) {
          const state = normalizeState(JSON.parse(raw));
          if (state) {
            setDecks(state.decks);
            setActiveId(state.active);
            setStreak(state.s);
            if (state.ld) setLastDate(state.ld);
            setDblTap(state.dt === true);
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
  // 表紙写真を入れると保存量が増えるため、上限超過（QuotaExceededError）は
  // 握りつぶさずユーザーに知らせる。黙って保存されないのが一番まずい。
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem(
        STORAGE_KEY_V2,
        JSON.stringify(buildState({ decks, active: activeId, s: streak, ld: lastDate, dt: dblTap }))
      ).catch((e) => {
        const quota = String(e?.name || e?.message || '').toLowerCase().includes('quota');
        setToast(quota ? '保存できません。表紙写真を減らしてください' : '保存に失敗しました');
      });
    }, 500);
    return () => clearTimeout(t);
  }, [decks, activeId, streak, lastDate, dblTap, loaded]);

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
  const newCnt = useMemo(() => words.filter(isNew).length, [words]);
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
        count: words.filter((w) => w.reviewedDates && w.reviewedDates.includes(k)).length,
      });
    }
    return d;
  }, [words]);

  const poolInfo = useMemo(() => {
    const s = clamp(rStart, 1, words.length);
    const e = clamp(rEnd, s, words.length);
    const range = words.slice(s - 1, e);
    const nw = range.filter(isNew);
    const wk = range.filter(isWeak);
    let pool = range;
    if (wordSel === 'new') pool = nw.length > 0 ? nw : range;
    else if (wordSel === 'weak') pool = wk.length > 0 ? wk : range;
    return { total: range.length, pool: pool.length, nw: nw.length, wk: wk.length };
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
    else if (wordFilter === 'mastered') base = base.filter((w) => w.progress >= 80);
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
        };
      })
    );
    recStreak();
  };

  const genOpts = (w) => shuffleArr([w, ...shuffleArr(words.filter((x) => x.id !== w.id)).slice(0, 3)]);

  const weightedPick = (pool, n) => {
    const count = Math.min(n, pool.length);
    if (count <= 0) return [];
    // 新規／苦手モードは getPool の時点で絞り込み済みなので、その中では均等に選ぶ
    if (wordSel !== 'normal') return shuffleArr(pool).slice(0, count);
    // 通常モードは習熟度と間違い率で重みを付けて選ぶ（calcWeight を参照）
    const items = pool.map((w) => ({ w, wt: calcWeight(w) }));
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
    }
    return pool;
  };

  const openConfig = (mode) => {
    setCfgMode(mode);
    setRStart(1);
    setREnd(words.length);
    setRST('1');
    setRET(String(words.length));
    setWordSel('normal');
    setNumQ(10);
    setScr('config');
  };

  const startFromConfig = () => {
    const pool = getPool();
    if (pool.length < 2) {
      setToast('対象単語が不足しています');
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
    updWord(w.id, knew, 'flashcard', elapsed);
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
        reviewedDates: [],
      },
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
      message: 'この単語を削除しますか？',
    });
    if (ok) setWords((ws) => ws.filter((x) => x.id !== id));
  };

  // 本棚まるごと1ファイルに書き出す（単語帳が何冊あってもこれ1つで済む）
  const exportData = async () => {
    try {
      const data = JSON.stringify(buildState({ decks, active: activeId, s: streak, ld: lastDate, dt: dblTap }));
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
          confirmLabel: '復元する',
        });
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
        name: uniqueDeckName(decks, src.name),
      });
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
      message: `「${target.name}」（${target.words.length}語）と、その学習記録を削除します。元に戻せません。`,
    });
    if (!ok) return;
    const rest = decks.filter((d) => d.id !== id);
    setDecks(rest);
    if (activeId === id) setActiveId(rest[0].id);
    setEditDeckId(null);
    setToast('削除しました');
  };

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
      },
    })
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

  const Header = ({ title, back }) => (
    <View className="bg-indigo-600 px-4 py-4 flex-row items-center" style={{ gap: 12 }}>
      <TouchableOpacity onPress={() => setScr(back || 'study')} className="p-1">
        <Icon name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <Text className="text-white text-lg font-bold">{title}</Text>
    </View>
  );

  const LvBadge = ({ w }) => {
    const lv = getLevel(w.progress, !isNew(w));
    return (
      <View className={`${lv.bg} px-2 py-0.5 rounded-full`}>
        <Text className={`${lv.c} text-xs font-bold`}>
          {lv.i} {lv.name}
        </Text>
      </View>
    );
  };

  // 発音ボタン。押した単語を読み上げる（事前生成の音声があればそれを鳴らす）
  const SpeakButton = ({ word, size = 20, color = '#6366f1', hitSlop = 10 }) => (
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
  const renderDash = () => (
    <ScrollView>
      <View className="bg-indigo-600 px-5 pt-8 pb-12">
        <Text className="text-2xl font-bold text-white mb-1">📚 英単語マスター</Text>
        {/* 今どの単語帳をやっているか。押すと本棚に行って切り替えられる */}
        <TouchableOpacity onPress={() => setScr('shelf')} className="flex-row items-center" style={{ gap: 4 }}>
          <Text className="text-indigo-200 text-sm" numberOfLines={1}>
            {activeDeck ? activeDeck.name : '単語帳なし'}
          </Text>
          <Icon name="chevron-forward" size={14} color="#c7d2fe" />
        </TouchableOpacity>
      </View>
      <View className="px-4 -mt-6 pb-4" style={{ gap: 12 }}>
        <View className="flex-row" style={{ gap: 12 }}>
          <View className="flex-1 bg-white rounded-2xl p-4 flex-row items-center" style={{ gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <View className="bg-orange-100 p-2.5 rounded-xl">
              <Icon name="flame" size={22} color="#f97316" />
            </View>
            <View>
              <Text className="text-2xl font-bold text-gray-800">{shownStreak}</Text>
              <Text className="text-xs text-gray-500">連続日数</Text>
            </View>
          </View>
          <View className="flex-1 bg-white rounded-2xl p-4 flex-row items-center" style={{ gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <View className="bg-blue-100 p-2.5 rounded-xl">
              <Icon name="locate" size={22} color="#3b82f6" />
            </View>
            <View>
              <Text className="text-2xl font-bold text-gray-800">
                {todayN}
                <Text className="text-xs text-gray-400">語</Text>
              </Text>
              <Text className="text-xs text-gray-500">今日の学習</Text>
            </View>
          </View>
        </View>

        <View className="bg-white rounded-2xl p-5" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="font-semibold text-gray-800">全体の進捗</Text>
            <Text className="text-lg font-bold text-indigo-600">{avgP}%</Text>
          </View>
          <View className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <View className="h-3 bg-indigo-500 rounded-full" style={{ width: `${avgP}%` }} />
          </View>
          <View className="flex-row justify-between mt-3">
            <Text className="text-xs text-gray-500">🟢 マスター {mast}</Text>
            <Text className="text-xs text-gray-500">🟡 学習中 {learn}</Text>
            <Text className="text-xs text-gray-500">⚪ 未学習 {newCnt}</Text>
          </View>
        </View>

        {weakWords.length > 0 && (
          <View className="bg-rose-50 rounded-2xl p-5 border border-rose-100">
            <View className="flex-row justify-between items-center mb-3">
              <View className="flex-row items-center" style={{ gap: 6 }}>
                <Icon name="warning" size={18} color="#e11d48" />
                <Text className="font-semibold text-rose-700">苦手な単語</Text>
              </View>
              <View className="bg-rose-100 px-2.5 py-1 rounded-full">
                <Text className="text-rose-600 text-xs font-bold">{weakWords.length}語</Text>
              </View>
            </View>
            <View style={{ gap: 6 }}>
              {weakWords.slice(0, 3).map((w) => (
                <View key={w.id} className="flex-row items-center justify-between bg-white/70 rounded-lg px-3 py-2">
                  <Text className="text-sm font-medium text-gray-800">{w.en}</Text>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <Text className="text-xs text-gray-500">{w.ja}</Text>
                    <Text className="text-xs font-bold text-rose-500">{w.progress}%</Text>
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => {
                setCfgMode('quiz');
                setWordSel('weak');
                setRStart(1);
                setREnd(words.length);
                setRST('1');
                setRET(String(words.length));
                setNumQ(10);
                setScr('config');
              }}
              className="bg-rose-500 rounded-xl py-2.5 mt-3"
            >
              <Text className="text-white text-sm font-bold text-center">苦手克服モードで学習</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="bg-white rounded-2xl p-5" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <Text className="font-semibold text-gray-800 mb-3">クイックスタート</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <TouchableOpacity onPress={() => openConfig('flashcard')} className="flex-1 bg-indigo-50 rounded-xl p-3 flex-row items-center" style={{ gap: 8 }}>
              <Icon name="layers" size={18} color="#4f46e5" />
              <Text className="text-indigo-700 text-sm font-medium">フラッシュカード</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openConfig('quiz')} className="flex-1 bg-violet-50 rounded-xl p-3 flex-row items-center" style={{ gap: 8 }}>
              <Icon name="brain" size={18} color="#7c3aed" />
              <Text className="text-violet-700 text-sm font-medium">4択クイズ</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="bg-white rounded-2xl p-5" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
          <Text className="font-semibold text-gray-800 mb-3">データ管理</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <TouchableOpacity onPress={exportData} className="flex-1 bg-emerald-50 rounded-xl p-3 flex-row items-center" style={{ gap: 8 }}>
              <Icon name="download" size={18} color="#059669" />
              <Text className="text-emerald-700 text-sm font-medium">保存</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={importData} className="flex-1 bg-amber-50 rounded-xl p-3 flex-row items-center" style={{ gap: 8 }}>
              <Icon name="cloud-upload" size={18} color="#d97706" />
              <Text className="text-amber-700 text-sm font-medium">読込</Text>
            </TouchableOpacity>
          </View>
        </View>

        <BarChart7 data={last7} />
      </View>
    </ScrollView>
  );

  // ===================== Study mode menu =====================
  const renderStudy = () => {
    const modes = [
      { m: 'flashcard', icon: 'layers', t: 'フラッシュカード', d: 'スワイプで直感的に暗記', lb: 'bg-indigo-50', bg: '#6366f1' },
      { m: 'quiz', icon: 'brain', t: '4択クイズ', d: '4つの選択肢から正解を選ぶ', lb: 'bg-violet-50', bg: '#8b5cf6' },
      { m: 'typing', icon: 'text', t: 'タイピング（日→英）', d: '日本語を見て英語を入力', lb: 'bg-blue-50', bg: '#3b82f6' },
      { m: 'reverse', icon: 'refresh-circle', t: '逆引き（英→日）', d: '英語を見て日本語を入力', lb: 'bg-teal-50', bg: '#14b8a6' },
      { m: 'matching', icon: 'shuffle', t: 'マッチング', d: '英語と日本語をペアにする', lb: 'bg-amber-50', bg: '#f59e0b' },
      { m: 'speed', icon: 'flash', t: 'スピードチャレンジ', d: '60秒で何問解けるか挑戦！', lb: 'bg-rose-50', bg: '#f43f5e' },
    ];
    return (
      <ScrollView>
        <View className="bg-indigo-600 px-5 pt-8 pb-12">
          <Text className="text-2xl font-bold text-white mb-1">🎯 学習モード</Text>
          <Text className="text-indigo-200 text-sm">モードを選んで設定画面へ</Text>
        </View>
        <View className="px-4 -mt-6 pb-4" style={{ gap: 10 }}>
          {modes.map(({ m, icon, t, d, lb, bg }) => (
            <TouchableOpacity
              key={m}
              onPress={() => openConfig(m)}
              className={`${lb} rounded-2xl p-4 flex-row items-center`}
              style={{ gap: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}
            >
              <View className="p-3 rounded-xl" style={{ backgroundColor: bg }}>
                <Icon name={icon} size={22} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-gray-800">{t}</Text>
                <Text className="text-xs text-gray-500 mt-0.5">{d}</Text>
              </View>
              <Icon name="chevron-forward" size={20} color="#d1d5db" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  };

  // ===================== Config =====================
  const renderConfig = () => {
    const mn = { flashcard: 'フラッシュカード', quiz: '4択クイズ', typing: 'タイピング', reverse: '逆引き', matching: 'マッチング', speed: 'スピード' };
    const isMat = cfgMode === 'matching';
    const dNQ = isMat ? Math.min(6, poolInfo.pool) : actualNumQ;
    return (
      <ScrollView>
        <Header title="学習設定" back="study" />
        <View className="px-4 py-5" style={{ gap: 20 }}>
          <View className="bg-indigo-50 rounded-xl p-3">
            <Text className="font-bold text-indigo-700 text-lg text-center">{mn[cfgMode]}</Text>
          </View>

          <View>
            <View className="flex-row items-center mb-2" style={{ gap: 6 }}>
              <Icon name="filter" size={16} color="#374151" />
              <Text className="font-semibold text-gray-800">出題モード</Text>
            </View>
            <View className="flex-row" style={{ gap: 8 }}>
              {[
                { k: 'normal', l: '🎯 通常', d: 'バランス' },
                { k: 'new', l: '✨ 新規', d: `${poolInfo.nw}語` },
                { k: 'weak', l: '💪 苦手', d: `${poolInfo.wk}語` },
              ].map((mi) => {
                const active = wordSel === mi.k;
                const bg = active
                  ? mi.k === 'new'
                    ? 'bg-emerald-50 border-emerald-500'
                    : mi.k === 'weak'
                    ? 'bg-rose-50 border-rose-500'
                    : 'bg-indigo-50 border-indigo-500'
                  : 'bg-white border-gray-200';
                const tc = active ? (mi.k === 'new' ? 'text-emerald-700' : mi.k === 'weak' ? 'text-rose-700' : 'text-indigo-700') : 'text-gray-600';
                return (
                  <TouchableOpacity key={mi.k} onPress={() => setWordSel(mi.k)} className={`flex-1 rounded-xl p-3 border-2 ${bg}`}>
                    <Text className={`font-semibold text-sm text-center ${tc}`}>{mi.l}</Text>
                    <Text className={`text-xs mt-0.5 text-center ${tc} opacity-70`}>{mi.d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View>
            <Text className="font-semibold text-gray-800 mb-2">📖 出題範囲（全{words.length}語）</Text>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View className="flex-1">
                <Text className="text-xs text-gray-500">開始</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={rST}
                  onChangeText={setRST}
                  onBlur={handleRSBlur}
                  className="bg-white border-2 border-gray-200 rounded-lg py-2 px-3 text-center font-bold"
                />
              </View>
              <Text className="text-gray-400 mt-5">〜</Text>
              <View className="flex-1">
                <Text className="text-xs text-gray-500">終了</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={rET}
                  onChangeText={setRET}
                  onBlur={handleREBlur}
                  className="bg-white border-2 border-gray-200 rounded-lg py-2 px-3 text-center font-bold"
                />
              </View>
            </View>
          </View>

          {!isMat && (
            <View>
              <Text className="font-semibold text-gray-800 mb-2">📝 出題数</Text>
              <View className="flex-row" style={{ gap: 6 }}>
                {[10, 20, 30, 50, 9999].map((n) => {
                  const active = numQ === n;
                  const label = n === 9999 ? '全' : String(n);
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setNumQ(n)}
                      className={`flex-1 py-3 rounded-xl border-2 ${active ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200'}`}
                    >
                      <Text className={`text-center font-bold ${active ? 'text-white' : 'text-gray-500'}`}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View className="flex-row items-center mt-2" style={{ gap: 8 }}>
                <Text className="text-xs text-gray-500">カスタム</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={numQ === 9999 ? '' : String(numQ)}
                  onChangeText={(t) => {
                    const v = parseInt(t.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(v) && v > 0) setNumQ(Math.min(v, 9999));
                    else if (t === '') setNumQ(1);
                  }}
                  placeholder="例: 15"
                  className="flex-1 bg-white border-2 border-gray-200 rounded-lg py-2 px-3 text-center font-bold"
                />
                <Text className="text-xs text-gray-500">問</Text>
              </View>
            </View>
          )}

          <View className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
            <View className="flex-row justify-between mb-2">
              <Text className="text-sm text-gray-600">出題範囲</Text>
              <Text className="font-bold text-gray-800">No.{rStart}〜{rEnd}（{poolInfo.total}語）</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-sm text-gray-600">対象単語</Text>
              <Text className="font-bold text-indigo-600">{poolInfo.pool}語</Text>
            </View>
            <View className="flex-row justify-between items-center">
              <Text className="text-sm text-gray-600">出題数</Text>
              <Text className="text-2xl font-black text-indigo-600">
                {dNQ}
                <Text className="text-sm text-gray-400 font-normal"> 問</Text>
              </Text>
            </View>
          </View>

          {/* ダブルタップモードはフラッシュカードにしか効かないので、そのときだけ出す */}
          {cfgMode === 'flashcard' && (
            <TouchableOpacity
              onPress={() => setDblTap((v) => !v)}
              className="bg-white rounded-xl p-4 flex-row items-center border border-gray-200"
              style={{ gap: 12 }}
              accessibilityRole="switch"
              accessibilityState={{ checked: dblTap }}
            >
              <Icon name="hand-left" size={22} color={dblTap ? '#6366f1' : '#9ca3af'} />
              <View className="flex-1">
                <Text className="font-semibold text-gray-800">ダブルタップモード</Text>
                <Text className="text-xs text-gray-400 mt-0.5">
                  {dblTap
                    ? '1回目のタップで意味を表示、もう一度押すと判定'
                    : '「知ってた／知らない」を1回押すとすぐ判定'}
                </Text>
              </View>
              <View className={`w-12 h-7 rounded-full justify-center ${dblTap ? 'bg-indigo-600' : 'bg-gray-300'}`} style={{ padding: 3 }}>
                <View className="w-5 h-5 rounded-full bg-white" style={{ marginLeft: dblTap ? 20 : 0 }} />
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={startFromConfig}
            className="bg-indigo-600 rounded-xl py-4 flex-row items-center justify-center"
            style={{ gap: 8 }}
          >
            <Icon name="play" size={22} color="#fff" />
            <Text className="text-white font-bold text-lg">学習を開始</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // ===================== Flashcard =====================
  const renderFlash = () => {
    const w = sWords[sIdx];
    if (!w) return null;
    const rot = pan.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-12deg', '0deg', '12deg'] });
    const bgTint =
      dragOff > 20
        ? `rgba(209,250,229,${Math.min(0.4, (dragOff - 20) / 200)})`
        : dragOff < -20
        ? `rgba(254,226,226,${Math.min(0.4, (Math.abs(dragOff) - 20) / 200)})`
        : '#ffffff';
    return (
      <View>
        <Header title="フラッシュカード" />
        <View className="px-4 py-6">
          <Text className="text-center text-sm text-gray-400 mb-2">
            {sIdx + 1} / {sWords.length}
          </Text>
          <Text className="text-center text-xs text-gray-400 mb-2">⚡ 早く答えるほど得点アップ</Text>
          <View className="flex-row justify-between mb-3 px-4">
            <Text className="text-xs text-rose-400">← 知らない</Text>
            <Text className="text-xs text-emerald-400">知ってた →</Text>
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
              <View
                className="rounded-3xl items-center justify-center"
                style={{
                  backgroundColor: bgTint,
                  height: 256,
                  shadowColor: '#000',
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {!flipped ? (
                  <>
                    <Text className="text-3xl font-bold text-gray-800">{w.en}</Text>
                    <View className="mt-2">
                      <LvBadge w={w} />
                    </View>
                    <Text className="text-xs text-gray-300 mt-4">タップで意味を表示</Text>
                  </>
                ) : (
                  <>
                    <Text className="text-lg text-gray-400 mb-2">{w.en}</Text>
                    <Text className="text-3xl font-bold text-indigo-600">{w.ja}</Text>
                    <View className="mt-2">
                      <LvBadge w={w} />
                    </View>
                  </>
                )}
              </View>
            </Pressable>
          </Animated.View>
          <View className="flex-row mt-5" style={{ gap: 12 }}>
            <TouchableOpacity onPress={() => hFlashTap(false)} className="flex-1 bg-rose-100 rounded-xl py-3.5 flex-row items-center justify-center" style={{ gap: 8 }}>
              <Icon name="close" size={20} color="#be123c" />
              <Text className="text-rose-700 font-semibold">知らない</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => hFlashTap(true)} className="flex-1 bg-emerald-100 rounded-xl py-3.5 flex-row items-center justify-center" style={{ gap: 8 }}>
              <Icon name="checkmark" size={20} color="#047857" />
              <Text className="text-emerald-700 font-semibold">知ってた</Text>
            </TouchableOpacity>
          </View>

          {/* いま1回目なのか2回目なのかが分かるようにする */}
          {dblTap && (
            <View className="flex-row items-center justify-center mt-3" style={{ gap: 6 }}>
              <Icon name={flipped ? 'checkmark-circle' : 'information-circle'} size={14} color={flipped ? '#059669' : '#9ca3af'} />
              <Text className={`text-xs ${flipped ? 'text-emerald-600 font-semibold' : 'text-gray-400'}`}>
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
    if (!w) return null;
    return (
      <View>
        <Header title="4択クイズ" />
        <View className="px-4 py-6">
          <Text className="text-center text-sm text-gray-400 mb-4">
            {sIdx + 1} / {sWords.length}
          </Text>
          <View className="bg-white rounded-3xl items-center justify-center mb-5" style={{ height: 192, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
            <Text className="text-sm text-gray-400 mb-2">この単語の意味は？</Text>
            <Text className="text-3xl font-bold text-gray-800">{w.en}</Text>
            <View className="mt-2"><LvBadge w={w} /></View>
          </View>
          <View style={{ gap: 10 }}>
            {opts.map((o) => {
              let bgClr = 'bg-white border-gray-200';
              let txtClr = 'text-gray-800';
              if (answered) {
                if (o.id === w.id) {
                  bgClr = 'bg-emerald-50 border-emerald-500';
                  txtClr = 'text-emerald-800';
                } else if (o.id === selAns) {
                  bgClr = 'bg-rose-50 border-rose-400';
                  txtClr = 'text-rose-800';
                }
              }
              return (
                <TouchableOpacity key={o.id} onPress={() => hQuiz(o)} className={`rounded-xl py-3.5 px-5 border-2 ${bgClr}`}>
                  <Text className={`font-medium ${txtClr}`}>{o.ja}</Text>
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
    if (!w) return null;
    const ok = isRev ? typed.trim().length > 0 && w.ja.includes(typed.trim()) : typed.trim().toLowerCase() === w.en.toLowerCase();
    const title = isRev ? '逆引き（英→日）' : 'タイピング（日→英）';
    const display = isRev ? w.en : w.ja;
    const answer = isRev ? w.ja : w.en;
    const hSub = isRev ? hReverse : hType;
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Header title={title} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <View className="px-4 py-6">
            <Text className="text-center text-sm text-gray-400 mb-4">
              {sIdx + 1} / {sWords.length}
            </Text>
            <View className="bg-white rounded-3xl items-center justify-center mb-5" style={{ height: 192, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
              <Text className="text-sm text-gray-400 mb-2">{isRev ? '日本語の意味を入力' : '英語で入力'}</Text>
              <Text className={`text-3xl font-bold ${isRev ? 'text-gray-800' : 'text-indigo-600'}`}>{display}</Text>
              <View className="mt-2"><LvBadge w={w} /></View>
            </View>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={() => !answered && hSub()}
              editable={!answered}
              placeholder={isRev ? '日本語を入力...' : '英語を入力...'}
              className="bg-white border-2 border-gray-200 rounded-xl py-4 px-5 text-lg mb-3"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {answered && (
              <View className="mb-3">
                {ok ? (
                  <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex-row items-center" style={{ gap: 8 }}>
                    <Icon name="checkmark" size={20} color="#047857" />
                    <Text className="text-emerald-700 font-semibold">正解！</Text>
                  </View>
                ) : (
                  <View className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <Icon name="close" size={20} color="#be123c" />
                      <Text className="text-rose-700 font-semibold">不正解</Text>
                    </View>
                    <Text className="mt-1 text-sm text-rose-700">
                      正解: <Text className="font-bold">{answer}</Text>
                    </Text>
                  </View>
                )}
              </View>
            )}
            {!answered ? (
              <TouchableOpacity onPress={hSub} className="bg-indigo-600 rounded-xl py-4">
                <Text className="text-white text-center font-semibold">回答する</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={hTypeNext} className="bg-indigo-600 rounded-xl py-4">
                <Text className="text-white text-center font-semibold">
                  {sIdx + 1 < sWords.length ? '次へ' : '結果を見る'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  // ===================== Matching =====================
  const renderMatch = () => (
    <ScrollView>
      <Header title="マッチング" />
      <View className="px-4 py-6">
        <View className="flex-row justify-between mb-4">
          <Text className="text-sm text-gray-500">ペア: {matched.size}/{mWords.length}</Text>
          <Text className="text-sm text-rose-500">ミス: {mErr}</Text>
        </View>
        <View className="flex-row" style={{ gap: 12 }}>
          <View className="flex-1" style={{ gap: 8 }}>
            <Text className="text-xs text-gray-400 text-center font-semibold mb-1">English</Text>
            {mWords.map((w) => {
              const m = matched.has(w.id);
              const sel = selEn === w.id;
              const cls = m
                ? 'bg-emerald-100 border-emerald-200'
                : sel
                ? 'bg-indigo-500 border-indigo-500'
                : 'bg-white border-gray-200';
              const tc = m ? 'text-emerald-400' : sel ? 'text-white' : 'text-gray-800';
              return (
                <TouchableOpacity key={'e' + w.id} onPress={() => hMatch('en', w)} className={`rounded-xl py-3 px-2 border-2 ${cls}`}>
                  <Text className={`text-sm font-medium text-center ${tc}`}>{w.en}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View className="flex-1" style={{ gap: 8 }}>
            <Text className="text-xs text-gray-400 text-center font-semibold mb-1">日本語</Text>
            {mJa.map((w) => {
              const m = matched.has(w.id);
              const sel = selJa === w.id;
              const cls = m
                ? 'bg-emerald-100 border-emerald-200'
                : sel
                ? 'bg-amber-500 border-amber-500'
                : 'bg-white border-gray-200';
              const tc = m ? 'text-emerald-400' : sel ? 'text-white' : 'text-gray-800';
              return (
                <TouchableOpacity key={'j' + w.id} onPress={() => hMatch('ja', w)} className={`rounded-xl py-3 px-2 border-2 ${cls}`}>
                  <Text className={`text-sm font-medium text-center ${tc}`}>{w.ja}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );

  // ===================== Speed =====================
  const renderSpeed = () => {
    const w = sWords[sIdx % sWords.length];
    if (!w) return null;
    return (
      <View>
        <View className="bg-rose-600 px-4 py-4 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => {
              if (tRef.current) clearInterval(tRef.current);
              setScr('study');
            }}
            className="p-1"
          >
            <Icon name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text className="text-white font-bold">⚡ スピードチャレンジ</Text>
          <View className="flex-row items-center bg-rose-700 rounded-lg px-2.5 py-1" style={{ gap: 6 }}>
            <Icon name="time" size={16} color="#fff" />
            <Text className="text-white text-lg font-bold">{timer}</Text>
          </View>
        </View>
        <View className="px-4 py-5">
          <View className="items-center mb-4">
            <View className="bg-rose-100 px-3 py-1 rounded-full">
              <Text className="text-rose-600 font-bold text-sm">
                {spScore}正解 / {spTotal}問
              </Text>
            </View>
          </View>
          <View className="bg-white rounded-2xl items-center justify-center mb-4" style={{ height: 144, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
            <Text className="text-3xl font-bold text-gray-800">{w.en}</Text>
          </View>
          <View style={{ gap: 8 }}>
            {opts.map((o) => {
              let bgClr = 'bg-white border-gray-200';
              let txtClr = 'text-gray-800';
              if (answered) {
                if (o.id === w.id) {
                  bgClr = 'bg-emerald-50 border-emerald-400';
                  txtClr = 'text-emerald-800';
                } else if (o.id === selAns) {
                  bgClr = 'bg-rose-50 border-rose-400';
                  txtClr = 'text-rose-800';
                }
              }
              return (
                <TouchableOpacity key={o.id} onPress={() => hSpeed(o)} className={`rounded-xl py-3 px-4 border-2 ${bgClr}`}>
                  <Text className={`font-medium ${txtClr}`}>{o.ja}</Text>
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
    return (
      <ScrollView>
        <View className="bg-indigo-600 px-5 pt-8 pb-12 items-center">
          <Text style={{ fontSize: 60 }}>{emoji}</Text>
          <Text className="text-2xl font-bold text-white mb-1">学習完了！</Text>
        </View>
        <View className="px-4 -mt-6 pb-4" style={{ gap: 16 }}>
          <View className="bg-white rounded-2xl p-6 items-center" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <Text className="text-5xl font-bold text-indigo-600">{pct}%</Text>
            <Text className="text-gray-500 mt-2">
              {sc} / {tot} 正解
            </Text>
          </View>
          {results.length > 0 && sMode !== 'speed' && (
            <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
              <Text className="font-semibold text-gray-800 mb-3">結果一覧</Text>
              <View style={{ gap: 6, maxHeight: 280 }}>
                <ScrollView>
                  {results.map((r, i) => (
                    <View key={i} className={`flex-row items-center justify-between py-2.5 px-3 rounded-lg mb-1 ${r.correct ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                      <View className="flex-1 flex-row" style={{ flexWrap: 'wrap' }}>
                        <Text className="font-medium text-gray-800">{r.word.en}</Text>
                        <Text className="text-gray-400 mx-1">→</Text>
                        <Text className="text-gray-600">{r.word.ja}</Text>
                      </View>
                      <View className="flex-row items-center" style={{ gap: 6 }}>
                        {/* 正解時だけ、かかった時間と速さボーナスを出す（フラッシュカードのみ ms が入る） */}
                        {r.correct && typeof r.ms === 'number' && (
                          <>
                            {speedFactor(r.ms) > 1.05 && <Text className="text-xs">⚡</Text>}
                            <Text className="text-xs text-gray-400">{(r.ms / 1000).toFixed(1)}秒</Text>
                          </>
                        )}
                        {r.delta != null && r.delta !== 0 && (
                          <Text className={`text-xs font-bold ${r.delta > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {r.delta > 0 ? '+' : ''}
                            {r.delta}%
                          </Text>
                        )}
                        {r.correct ? <Icon name="checkmark" size={16} color="#10b981" /> : <Icon name="close" size={16} color="#f43f5e" />}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
          <View className="flex-row" style={{ gap: 12 }}>
            <TouchableOpacity onPress={startFromConfig} className="flex-1 bg-indigo-100 rounded-xl py-3.5 flex-row items-center justify-center" style={{ gap: 8 }}>
              <Icon name="refresh" size={18} color="#4f46e5" />
              <Text className="text-indigo-700 font-semibold">もう一度</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScr('study')} className="flex-1 bg-gray-100 rounded-xl py-3.5">
              <Text className="text-gray-700 font-semibold text-center">モード選択</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  // ===================== Words list =====================
  const renderWords = () => {
    const filterTabs = [
      { k: 'all', l: '全て', n: words.length },
      { k: 'weak', l: '苦手', n: weakWords.length },
      { k: 'new', l: '未学習', n: newCnt },
      { k: 'mastered', l: 'マスター', n: mast },
    ];

    const renderWordItem = ({ item: w }) => {
      const lv = getLevel(w.progress, !isNew(w));
      if (editId === w.id) {
        return (
          <View className="bg-white rounded-xl p-4 mb-2" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 }}>
            <TextInput value={editEn} onChangeText={setEditEn} className="bg-gray-50 rounded-lg py-2 px-3 border mb-2" autoCapitalize="none" />
            <TextInput value={editJa} onChangeText={setEditJa} onSubmitEditing={saveEdit} className="bg-gray-50 rounded-lg py-2 px-3 border mb-2" />
            <View className="flex-row" style={{ gap: 8 }}>
              <TouchableOpacity onPress={saveEdit} className="bg-indigo-600 rounded-lg px-4 py-1.5">
                <Text className="text-white text-xs font-semibold">保存</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditId(null)} className="bg-gray-200 rounded-lg px-4 py-1.5">
                <Text className="text-gray-600 text-xs font-semibold">取消</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }
      return (
        <View className="bg-white rounded-xl p-4 mb-2" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 }}>
          <View className="flex-row items-start justify-between mb-2">
            <View className="flex-1">
              <View className="flex-row items-center mb-1" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Text className="text-xs text-gray-300">No.{words.indexOf(w) + 1}</Text>
                <Text className="font-semibold text-gray-800">{w.en}</Text>
                {w.streak > 0 && <Text className="text-xs text-orange-500">🔥{w.streak}</Text>}
                {isWeak(w) && (
                  <View className="bg-rose-100 px-1.5 py-0.5 rounded">
                    <Text className="text-rose-600 text-xs font-bold">苦手</Text>
                  </View>
                )}
              </View>
              <Text className="text-sm text-gray-500">{w.ja}</Text>
            </View>
            <View className="flex-row" style={{ gap: 2 }}>
              <SpeakButton word={w.en} size={16} color="#6366f1" hitSlop={6} />
              <TouchableOpacity onPress={() => { setEditId(w.id); setEditEn(w.en); setEditJa(w.ja); }} className="p-1.5">
                <Icon name="create" size={14} color="#9ca3af" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteWord(w.id)} className="p-1.5">
                <Icon name="trash" size={14} color="#9ca3af" />
              </TouchableOpacity>
            </View>
          </View>
          <View className="flex-row items-center mb-1.5" style={{ gap: 8 }}>
            <View className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <View className="h-2.5 rounded-full" style={{ width: `${w.progress}%`, backgroundColor: lv.barColor }} />
            </View>
            <Text className={`text-xs font-bold ${lv.c}`}>{w.progress}%</Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <LvBadge w={w} />
            <Text className="text-xs text-gray-400">✓{w.correct} ✗{w.incorrect}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={{ flex: 1 }}>
        <View className="bg-indigo-600 px-5 pt-8 pb-12">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-2xl font-bold text-white mb-1">📖 単語帳</Text>
              <Text className="text-indigo-200 text-sm">{words.length}語登録済み</Text>
            </View>
            <View className="flex-row" style={{ gap: 8 }}>
              <TouchableOpacity onPress={() => { setShowBulk(true); setShowAdd(false); }} className="bg-white/20 rounded-xl p-2.5">
                <Icon name="document-text" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowAdd(true); setShowBulk(false); }} className="bg-white/20 rounded-xl p-2.5">
                <Icon name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View className="px-4 -mt-5" style={{ flex: 1 }}>
          <View className="flex-row bg-white rounded-xl mb-4 overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <TouchableOpacity onPress={() => setWordsTab('manage')} className={`flex-1 py-3 flex-row items-center justify-center ${wordsTab === 'manage' ? 'bg-indigo-600' : ''}`} style={{ gap: 6 }}>
              <Icon name="create" size={16} color={wordsTab === 'manage' ? '#fff' : '#6b7280'} />
              <Text className={`text-sm font-semibold ${wordsTab === 'manage' ? 'text-white' : 'text-gray-500'}`}>管理</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setWordsTab('list'); setRevealed(new Set()); }} className={`flex-1 py-3 flex-row items-center justify-center ${wordsTab === 'list' ? 'bg-indigo-600' : ''}`} style={{ gap: 6 }}>
              <Icon name="list" size={16} color={wordsTab === 'list' ? '#fff' : '#6b7280'} />
              <Text className={`text-sm font-semibold ${wordsTab === 'list' ? 'text-white' : 'text-gray-500'}`}>学習シート</Text>
            </TouchableOpacity>
          </View>

          {wordsTab === 'manage' ? (
            <>
              {showBulk && (
                <View className="bg-violet-50 rounded-2xl p-4 mb-4 border border-violet-100" style={{ gap: 12 }}>
                  <Text className="font-semibold text-violet-800">📋 一括追加</Text>
                  <TextInput
                    value={bulkText}
                    onChangeText={setBulkText}
                    placeholder={'apple りんご\nbanana, バナナ'}
                    multiline
                    numberOfLines={5}
                    className="bg-white rounded-xl py-3 px-4 text-sm border border-violet-200"
                    style={{ minHeight: 100, textAlignVertical: 'top' }}
                  />
                  <View className="flex-row justify-between items-center">
                    <Text className={`text-xs font-semibold ${bulkCount > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {bulkCount > 0 ? `✅ ${bulkCount}語検出` : '入力待ち...'}
                    </Text>
                    <View className="flex-row" style={{ gap: 8 }}>
                      <TouchableOpacity onPress={() => { setShowBulk(false); setBulkText(''); }} className="bg-gray-200 rounded-lg px-4 py-2">
                        <Text className="text-gray-600 text-sm font-semibold">取消</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={addBulk} disabled={bulkCount === 0} className={`rounded-lg px-4 py-2 ${bulkCount > 0 ? 'bg-violet-600' : 'bg-gray-200'}`}>
                        <Text className={`text-sm font-semibold ${bulkCount > 0 ? 'text-white' : 'text-gray-400'}`}>追加</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              {showAdd && (
                <View className="bg-indigo-50 rounded-2xl p-4 mb-4 border border-indigo-100" style={{ gap: 12 }}>
                  <Text className="font-semibold text-indigo-800">✨ 単語を追加</Text>
                  <TextInput value={newEn} onChangeText={setNewEn} placeholder="英語" autoCapitalize="none" className="bg-white rounded-xl py-3 px-4 border border-indigo-200" />
                  <TextInput value={newJa} onChangeText={setNewJa} placeholder="日本語" onSubmitEditing={addWord} className="bg-white rounded-xl py-3 px-4 border border-indigo-200" />
                  <View className="flex-row" style={{ gap: 8 }}>
                    <TouchableOpacity onPress={addWord} className="flex-1 bg-indigo-600 rounded-xl py-2.5">
                      <Text className="text-white text-center text-sm font-semibold">追加</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setShowAdd(false); setNewEn(''); setNewJa(''); }} className="flex-1 bg-gray-200 rounded-xl py-2.5">
                      <Text className="text-gray-600 text-center text-sm font-semibold">取消</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/*
                以前はここを横スクロールの ScrollView にしていたが、Web では
                ScrollView が flex: 1 1 auto を持つため、下の単語リストに押し潰されて
                高さ 5.6px になりタブが見えなくなっていた。
                折り返す普通の行にすれば潰れず、幅が足りなければ2段になる。
              */}
              <View className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {filterTabs.map((t) => {
                  const active = wordFilter === t.k;
                  return (
                    <TouchableOpacity
                      key={t.k}
                      onPress={() => setWordFilter(t.k)}
                      className={`px-3 py-2 rounded-full ${active ? (t.k === 'weak' ? 'bg-rose-500' : 'bg-indigo-600') : 'bg-gray-100'}`}
                    >
                      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-600'}`}>
                        {t.l} ({t.n})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View className="bg-white rounded-xl flex-row items-center px-4 py-3 mb-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
                <Icon name="search" size={18} color="#9ca3af" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="単語を検索..."
                  className="flex-1 ml-2 text-sm"
                  autoCapitalize="none"
                />
              </View>

              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderWordItem}
                ListEmptyComponent={<Text className="text-center text-gray-400 py-8">単語が見つかりません</Text>}
                initialNumToRender={20}
                windowSize={10}
                contentContainerStyle={{ paddingBottom: 100 }}
              />
            </>
          ) : (
            <>
              <View className="bg-white rounded-xl p-4 mb-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
                <View className="flex-row mb-3" style={{ gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => { setListHideEn(!listHideEn); setRevealed(new Set()); }}
                    className={`flex-1 rounded-xl py-2.5 flex-row items-center justify-center border-2 ${listHideEn ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200'}`}
                    style={{ gap: 6 }}
                  >
                    <Icon name={listHideEn ? 'eye-off' : 'eye'} size={16} color={listHideEn ? '#1d4ed8' : '#6b7280'} />
                    <Text className={`text-sm font-semibold ${listHideEn ? 'text-blue-700' : 'text-gray-500'}`}>英語</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setListHideJa(!listHideJa); setRevealed(new Set()); }}
                    className={`flex-1 rounded-xl py-2.5 flex-row items-center justify-center border-2 ${listHideJa ? 'bg-violet-50 border-violet-400' : 'bg-white border-gray-200'}`}
                    style={{ gap: 6 }}
                  >
                    <Icon name={listHideJa ? 'eye-off' : 'eye'} size={16} color={listHideJa ? '#6d28d9' : '#6b7280'} />
                    <Text className={`text-sm font-semibold ${listHideJa ? 'text-violet-700' : 'text-gray-500'}`}>日本語</Text>
                  </TouchableOpacity>
                </View>
                <View className="flex-row" style={{ gap: 8 }}>
                  <TouchableOpacity onPress={revealAll} className="flex-1 bg-emerald-50 rounded-lg py-2">
                    <Text className="text-emerald-700 text-xs font-semibold text-center">全て表示</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={hideAll} className="flex-1 bg-gray-100 rounded-lg py-2">
                    <Text className="text-gray-600 text-xs font-semibold text-center">全て隠す</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="bg-white rounded-xl overflow-hidden" style={{ flex: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
                <View className="flex-row items-center bg-gray-50 border-b border-gray-100 px-3 py-2.5">
                  <Text className="w-8 text-xs text-gray-400 font-semibold text-center">#</Text>
                  <Text className="flex-1 text-xs text-gray-500 font-semibold px-2">English</Text>
                  <Text className="flex-1 text-xs text-gray-500 font-semibold px-2">日本語</Text>
                  <Text className="w-10 text-xs text-gray-400 font-semibold text-center">%</Text>
                </View>
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
                      <View className="flex-row items-center px-3 py-3 border-b border-gray-50">
                        <Text className="w-8 text-xs text-gray-300 text-center">{num}</Text>
                        <TouchableOpacity onPress={() => listHideEn && toggleReveal(enKey)} className={`flex-1 px-2 py-1 rounded ${enHidden ? 'bg-blue-100' : ''}`}>
                          <Text className={`text-sm ${enHidden ? 'text-blue-100' : 'text-gray-800 font-medium'}`}>{enHidden ? '••••••' : w.en}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => listHideJa && toggleReveal(jaKey)} className={`flex-1 px-2 py-1 rounded ${jaHidden ? 'bg-violet-100' : ''}`}>
                          <Text className={`text-sm ${jaHidden ? 'text-violet-100' : 'text-gray-600'}`}>{jaHidden ? '••••••' : w.ja}</Text>
                        </TouchableOpacity>
                        <Text className={`w-10 text-xs font-bold text-center ${lv.c}`}>{w.progress}</Text>
                      </View>
                    );
                  }}
                />
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  // ===================== 本棚 =====================
  const renderShelf = () => {
    const menuDeck = decks.find((d) => d.id === menuDeckId) || null;
    // 表紙写真が無いときは、名前から色を決めて頭文字を出す（毎回同じ色になる）
    const coverColors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    const colorOf = (name) => {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
      return coverColors[h % coverColors.length];
    };

    return (
      <ScrollView>
        <View className="bg-indigo-600 px-5 pt-8 pb-12">
          <Text className="text-2xl font-bold text-white mb-1">🗂 本棚</Text>
          <Text className="text-indigo-200 text-sm">
            {decks.length}冊 ／ 全{decks.reduce((s, d) => s + d.words.length, 0)}語
          </Text>
        </View>

        <View className="px-4 -mt-6 pb-4" style={{ gap: 12 }}>
          <Text className="text-xs text-gray-400">タップで切り替え ／ 長押しで編集</Text>

          <View className="flex-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {decks.map((d) => {
              const isActive = d.id === activeId;
              const pct = d.words.length ? Math.round((d.words.reduce((s, w) => s + w.progress, 0) / d.words.length)) : 0;
              const editing = editDeckId === d.id;
              return (
                <View key={d.id} style={{ width: '47%' }}>
                  <TouchableOpacity
                    onPressIn={() => startLongPress(() => setMenuDeckId(d.id))}
                    onPressOut={cancelLongPress}
                    // 長押しが成立していたら、指を離したときの通常タップは無視する
                    onPress={() => { if (!longPress.current.fired) selectDeck(d.id); }}
                    activeOpacity={0.85}
                    // 長押しで iOS のテキスト選択メニューが出ないようにする
                    style={{ userSelect: 'none' }}
                  >
                    {/* 本の表紙。写真は切り取らずに全体を見せる（余白は単語帳の色で埋める） */}
                    <View
                      className={`rounded-2xl overflow-hidden ${isActive ? 'border-2 border-indigo-600' : ''}`}
                      style={{ aspectRatio: 3 / 4, backgroundColor: colorOf(d.name), shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6 }}
                    >
                      {d.cover ? (
                        <Image source={{ uri: d.cover }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Text className="text-white font-black" style={{ fontSize: 56 }}>
                            {d.name.trim().charAt(0) || '?'}
                          </Text>
                        </View>
                      )}

                      {/* 名前と語数は写真の上に重ねる。読めるように暗い帯を敷く */}
                      <View
                        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(17,24,39,0.72)', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 }}
                      >
                        {editing ? (
                          <TextInput
                            value={editDeckName}
                            onChangeText={setEditDeckName}
                            onSubmitEditing={() => renameDeck(d.id, editDeckName)}
                            onBlur={() => renameDeck(d.id, editDeckName)}
                            autoFocus
                            className="text-white text-sm font-bold border-b border-white pb-1"
                          />
                        ) : (
                          <Text className="text-white text-sm font-bold" numberOfLines={2}>
                            {d.name}
                          </Text>
                        )}
                        <Text className="text-gray-300 text-xs mt-0.5">{d.words.length}語 ・ {pct}%</Text>
                        <View className="bg-white/30 rounded-full mt-1.5" style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)' }}>
                          <View className="bg-white rounded-full" style={{ height: 4, width: `${pct}%` }} />
                        </View>
                      </View>

                      {isActive && (
                        <View style={{ position: 'absolute', top: 8, right: 8 }} className="bg-indigo-600 rounded-full px-2 py-1">
                          <Text className="text-white text-xs font-bold">学習中</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* 追加カード */}
            <TouchableOpacity onPress={createDeck} style={{ width: '47%' }}>
              <View
                className="rounded-2xl border-2 border-dashed border-gray-300 items-center justify-center bg-white"
                style={{ aspectRatio: 3 / 4 }}
              >
                <Icon name="add" size={30} color="#9ca3af" />
                <Text className="text-gray-400 text-xs mt-1 font-semibold">新しい単語帳</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <Text className="font-semibold text-gray-800 mb-1">ファイルから追加</Text>
            <Text className="text-xs text-gray-400 mb-3">
              単語だけのファイルは1冊として追加します。本棚ごと書き出したファイルなら、全体を元に戻します。
            </Text>
            <View className="flex-row" style={{ gap: 8 }}>
              <TouchableOpacity onPress={importData} className="flex-1 bg-amber-50 rounded-xl p-3 flex-row items-center justify-center" style={{ gap: 8 }}>
                <Icon name="cloud-upload" size={18} color="#b45309" />
                <Text className="text-amber-700 text-sm font-semibold">読込</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exportData} className="flex-1 bg-emerald-50 rounded-xl p-3 flex-row items-center justify-center" style={{ gap: 8 }}>
                <Icon name="download" size={18} color="#047857" />
                <Text className="text-emerald-700 text-sm font-semibold">本棚を保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 長押しで出す編集メニュー */}
        <Modal visible={menuDeck !== null} transparent animationType="fade" onRequestClose={() => setMenuDeckId(null)}>
          <Pressable
            onPress={() => setMenuDeckId(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
          >
            {/* 中身のタップでは閉じないよう、押しても何もしない Pressable で包む */}
            <Pressable onPress={() => {}} className="bg-white rounded-t-3xl px-4 pt-4 pb-8">
              <Text className="text-center text-gray-800 font-bold mb-1" numberOfLines={1}>
                {menuDeck ? menuDeck.name : ''}
              </Text>
              <Text className="text-center text-gray-400 text-xs mb-4">
                {menuDeck ? `${menuDeck.words.length}語` : ''}
              </Text>

              {[
                { i: 'image', l: menuDeck && menuDeck.cover ? '表紙の写真を変える' : '表紙に写真を付ける', on: () => changeCover(menuDeckId) },
                ...(menuDeck && menuDeck.cover
                  ? [{ i: 'close-circle', l: '表紙を外す', on: () => removeCover(menuDeckId) }]
                  : []),
                { i: 'create', l: '名前を変える', on: () => { setEditDeckId(menuDeckId); setEditDeckName(menuDeck.name); } },
                { i: 'trash', l: 'この単語帳を削除', on: () => deleteDeck(menuDeckId), danger: true },
              ].map((it) => (
                <TouchableOpacity
                  key={it.l}
                  onPress={() => { const id = menuDeckId; setMenuDeckId(null); setTimeout(() => it.on(id), 0); }}
                  className="flex-row items-center py-3.5"
                  style={{ gap: 12 }}
                >
                  <Icon name={it.i} size={20} color={it.danger ? '#e11d48' : '#4b5563'} />
                  <Text className={`text-base ${it.danger ? 'text-rose-600' : 'text-gray-700'}`}>{it.l}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity onPress={() => setMenuDeckId(null)} className="bg-gray-100 rounded-xl py-3 mt-2">
                <Text className="text-center text-gray-600 font-semibold">閉じる</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </ScrollView>
    );
  };

  // ===================== Stats =====================
  const renderStats = () => {
    const lvDist = [
      { name: '完璧(90%↑)', count: words.filter((w) => w.progress >= 90).length, color: '#9333ea' },
      { name: 'マスター(80-89%)', count: words.filter((w) => w.progress >= 80 && w.progress < 90).length, color: '#10b981' },
      { name: '定着(60-79%)', count: words.filter((w) => w.progress >= 60 && w.progress < 80).length, color: '#3b82f6' },
      { name: '学習中(40-59%)', count: words.filter((w) => w.progress >= 40 && w.progress < 60).length, color: '#f59e0b' },
      { name: '初級(20-39%)', count: words.filter((w) => w.progress >= 20 && w.progress < 40).length, color: '#f97316' },
      { name: '要復習(0-19%触れた)', count: words.filter((w) => w.progress < 20 && !isNew(w)).length, color: '#fb7185' },
      { name: '未学習(未着手)', count: words.filter(isNew).length, color: '#9ca3af' },
    ];
    return (
      <ScrollView>
        <View className="bg-indigo-600 px-5 pt-8 pb-12">
          <Text className="text-2xl font-bold text-white mb-1">📊 学習統計</Text>
          <Text className="text-indigo-200 text-sm">あなたの学習の記録</Text>
        </View>
        <View className="px-4 -mt-6 pb-4" style={{ gap: 16 }}>
          <View className="flex-row" style={{ gap: 8 }}>
            <View className="flex-1 bg-white rounded-2xl p-3 items-center" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
              <Icon name="flame" size={20} color="#f97316" />
              <Text className="text-xl font-bold text-gray-800 mt-1">{shownStreak}</Text>
              <Text className="text-xs text-gray-500">連続日数</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-3 items-center" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
              <Icon name="locate" size={20} color="#3b82f6" />
              <Text className="text-xl font-bold text-gray-800 mt-1">{todayN}</Text>
              <Text className="text-xs text-gray-500">今日学習</Text>
            </View>
          </View>

          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <View className="flex-row justify-between mb-2">
              <Text className="font-semibold text-gray-800">📈 習熟度の内訳</Text>
              <Text className="text-xs text-gray-400">全 {words.length} 語</Text>
            </View>
            <View className="flex-row" style={{ gap: 6 }}>
              <View className="flex-1 bg-emerald-50 rounded-xl p-3 items-center border border-emerald-100">
                <Text className="text-2xl font-bold text-emerald-600">{mast}</Text>
                <Text className="text-xs text-gray-500">マスター</Text>
                <Text className="text-xs text-gray-400">80%以上</Text>
              </View>
              <View className="flex-1 bg-amber-50 rounded-xl p-3 items-center border border-amber-100">
                <Text className="text-2xl font-bold text-amber-600">{learn}</Text>
                <Text className="text-xs text-gray-500">学習中</Text>
                <Text className="text-xs text-gray-400">20〜79%</Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-xl p-3 items-center border border-gray-200">
                <Text className="text-2xl font-bold text-gray-500">{newCnt}</Text>
                <Text className="text-xs text-gray-500">未学習</Text>
                <Text className="text-xs text-gray-400">未着手</Text>
              </View>
            </View>
          </View>

          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <Text className="font-semibold text-gray-800 mb-3">🎯 解答実績</Text>
            <View className="flex-row mb-2" style={{ gap: 6 }}>
              <View className="flex-1 bg-indigo-50 rounded-xl p-3 items-center">
                <Text className="text-xl font-bold text-indigo-600">
                  {totalStudied}
                  <Text className="text-xs text-gray-400 font-normal">/{words.length}</Text>
                </Text>
                <Text className="text-xs text-gray-500">解答済み</Text>
              </View>
              <View className="flex-1 bg-gray-50 rounded-xl p-3 items-center">
                <Text className="text-xl font-bold text-gray-500">{neverStudied}</Text>
                <Text className="text-xs text-gray-500">未解答</Text>
              </View>
            </View>
            <View className="flex-row" style={{ gap: 6 }}>
              <View className="flex-1 bg-emerald-50 rounded-xl p-3 items-center">
                <Text className="text-xl font-bold text-emerald-600">{totalCorrect}</Text>
                <Text className="text-xs text-gray-500">正解数</Text>
              </View>
              <View className="flex-1 bg-rose-50 rounded-xl p-3 items-center">
                <Text className="text-xl font-bold text-rose-600">{totalIncorrect}</Text>
                <Text className="text-xs text-gray-500">不正解数</Text>
              </View>
              <View className="flex-1 bg-blue-50 rounded-xl p-3 items-center">
                <Text className="text-xl font-bold text-blue-600">{totalAccuracy}%</Text>
                <Text className="text-xs text-gray-500">正解率</Text>
              </View>
            </View>
          </View>

          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <View className="flex-row justify-between mb-2">
              <Text className="font-semibold text-gray-800">💪 苦手な単語</Text>
              <View className="bg-rose-100 px-2.5 py-1 rounded-full">
                <Text className="text-rose-600 text-xs font-bold">{weakWords.length}語</Text>
              </View>
            </View>
            {weakWords.length > 0 ? (
              <View style={{ maxHeight: 192 }}>
                <ScrollView>
                  {weakWords.map((w, i) => {
                    const lv = getLevel(w.progress, !isNew(w));
                    const t = w.correct + w.incorrect;
                    const rate = t > 0 ? Math.round((w.correct / t) * 100) : 0;
                    return (
                      <View key={w.id} className="flex-row items-center bg-rose-50 rounded-lg p-2.5 mb-1.5" style={{ gap: 8 }}>
                        <Text className="text-xs text-gray-400 w-4 text-right">{i + 1}</Text>
                        <View className="flex-1">
                          <View className="flex-row items-center" style={{ gap: 8 }}>
                            <Text className="text-sm font-medium text-gray-800">{w.en}</Text>
                            <Text className="text-xs text-gray-400">{w.ja}</Text>
                          </View>
                          <View className="flex-row items-center mt-1" style={{ gap: 8 }}>
                            <View className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <View className="h-1.5 rounded-full" style={{ width: `${w.progress}%`, backgroundColor: lv.barColor }} />
                            </View>
                            <Text className={`text-xs font-bold ${lv.c}`}>{w.progress}%</Text>
                          </View>
                        </View>
                        <Text className="text-xs text-gray-400">
                          ✓{w.correct} ✗{w.incorrect} ({rate}%)
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <Text className="text-center text-gray-400 text-sm py-4">苦手な単語はありません 🎉</Text>
            )}
          </View>

          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <Text className="font-semibold text-gray-800 mb-3">レベル分布</Text>
            <View style={{ gap: 8 }}>
              {lvDist.map((lv, i) => {
                const pct = words.length ? (lv.count / words.length) * 100 : 0;
                return (
                  <View key={i} className="flex-row items-center" style={{ gap: 8 }}>
                    <Text className="text-xs text-gray-500 text-right" style={{ width: 110 }}>{lv.name}</Text>
                    <View className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                      <View className="h-4 rounded-full" style={{ width: `${pct}%`, backgroundColor: lv.color }} />
                    </View>
                    <Text className="text-xs font-bold text-gray-600 w-6 text-right">{lv.count}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <BarChart7 data={last7} />

          <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
            <Text className="font-semibold text-gray-800 mb-3">💾 データ管理</Text>
            <View className="flex-row" style={{ gap: 8 }}>
              <TouchableOpacity onPress={exportData} className="flex-1 bg-emerald-50 rounded-xl p-3 flex-row items-center justify-center" style={{ gap: 8 }}>
                <Icon name="download" size={18} color="#059669" />
                <Text className="text-emerald-700 text-sm font-semibold">保存</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={importData} className="flex-1 bg-amber-50 rounded-xl p-3 flex-row items-center justify-center" style={{ gap: 8 }}>
                <Icon name="cloud-upload" size={18} color="#d97706" />
                <Text className="text-amber-700 text-sm font-semibold">読込</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  };

  // ===================== Render Tree =====================
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }} edges={['top']}>
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

        {toast !== '' && (
          <View
            style={{
              position: 'absolute',
              bottom: 90,
              alignSelf: 'center',
              backgroundColor: '#1f2937',
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 12,
            }}
          >
            <Text className="text-white text-sm font-medium">{toast}</Text>
          </View>
        )}

        <View className="bg-white border-t border-gray-100 flex-row">
          {[
            { k: 'home', s: 'dashboard', i: 'home', l: 'ホーム' },
            { k: 'study', s: 'study', i: 'brain', l: '学習' },
            { k: 'words', s: 'words', i: 'book', l: '単語帳' },
            { k: 'shelf', s: 'shelf', i: 'library', l: '本棚' },
            { k: 'stats', s: 'stats', i: 'trending-up', l: '統計' },
          ].map((t) => {
            const active = aTab === t.k;
            return (
              <TouchableOpacity key={t.k} onPress={() => setScr(t.s)} className="flex-1 py-3 items-center" style={{ gap: 2 }}>
                <Icon name={t.i} size={22} color={active ? '#4f46e5' : '#9ca3af'} />
                <Text className={`text-xs ${active ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}>{t.l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
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
  return (
    <View className="bg-white rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4 }}>
      <Text className="font-semibold text-gray-800 mb-2">過去7日間の学習語数</Text>
      <View className="flex-row items-end justify-between" style={{ paddingHorizontal: 8 }}>
        {data.map((d, i) => (
          <View key={i} className="items-center" style={{ flex: 1 }}>
            <Text className="text-xs text-gray-400 mb-1">{d.count > 0 ? d.count : ''}</Text>
            <View style={{ height: BAR_AREA, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
              <View
                style={{
                  width: '60%',
                  height: Math.max(2, (d.count / max) * BAR_AREA),
                  backgroundColor: '#6366f1',
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                }}
              />
            </View>
            <Text className="text-xs text-gray-400 mt-1">{d.date}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
