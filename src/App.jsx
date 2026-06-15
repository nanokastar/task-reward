/**
 * 任務積分系統 — 雙人協作版 v2
 * 淡藍 + 薰衣草紫・柔和夢幻風
 */

import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, setDoc, onSnapshot, getDoc, updateDoc,
} from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

// ─── Firebase 設定 ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyBtOI2deqFxVhyGsHS-XCSTThGmmgAMtxM",
  authDomain:        "test-4d7c0.firebaseapp.com",
  projectId:         "test-4d7c0",
  storageBucket:     "test-4d7c0.firebasestorage.app",
  messagingSenderId: "807060321988",
  appId:             "1:807060321988:web:72cba45b1f34ad95fbfb91",
};

const firebaseApp = initializeApp(firebaseConfig);
const db   = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// ─── 配色 ──────────────────────────────────────────────────────────
const C = {
  bg:          "#EEF2FC",
  bgEnd:       "#F6F0FC",
  card:        "#FFFFFF",
  cardDone:    "#F1ECFB",
  border:      "#E3E8F8",
  borderSoft:  "#ECE6FA",
  accentBorder:"#D8C9F4",
  text:        "#4F4B6E",
  textMuted:   "#A6A6C9",
  accent:      "#B19CEB",
  accentDark:  "#9580D6",
  pink:        "#FFB6C9",
  pinkDark:    "#FF93AE",
  mint:        "#A8E6C1",
  mintDark:    "#6FCB9F",
  shadow:      "0 4px 20px rgba(150,140,210,0.18)",
};

// ─── Helpers ──────────────────────────────────────────────────────
const todayKey = () => new Date().toISOString().slice(0, 10);
const fmtDate  = (d) =>
  new Date(d).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
const fmtDateShort = (d) =>
  new Date(d).toLocaleDateString("zh-TW", {
    month: "long", day: "numeric", weekday: "short",
  });
const fmtTime = (t) =>
  new Date(t).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const genId   = (p) => p + Date.now() + Math.floor(Math.random() * 1000);

const LS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem("tr2_" + k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem("tr2_" + k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem("tr2_" + k),
};
const getRooms     = () => LS.get("rooms") || [];
const setRooms     = (r) => LS.set("rooms", r);
const getActiveCode = () => LS.get("activeRoomCode");
const setActiveCode = (c) => LS.set("activeRoomCode", c);
const getNotepad   = () => LS.get("notepad") || "";
const setNotepadLS = (t) => LS.set("notepad", t);

// 從 v1 版本（單一房間）的本地資料轉換成 v2（多房間清單）
function migrateLegacySession() {
  if (getRooms().length > 0) return;
  try {
    const legacy = JSON.parse(localStorage.getItem("tr_session"));
    if (legacy && legacy.roomCode && legacy.role && legacy.pin) {
      setRooms([{ roomCode: legacy.roomCode, role: legacy.role, pin: legacy.pin }]);
      setActiveCode(legacy.roomCode);
      localStorage.removeItem("tr_session");
    }
  } catch {}
}

const roleLabel = (role) => role === "doer" ? "任務執行者" : "獎勵發放者";
const roleIcon  = (role) => role === "doer" ? "🙋" : "🎁";

const DEFAULT_TASKS = [
  { id: "t1", text: "早上喝完一杯水", points: 10, done: false, categoryId: null },
  { id: "t2", text: "運動 30 分鐘",    points: 30, done: false, categoryId: null },
  { id: "t3", text: "閱讀 20 分鐘",    points: 20, done: false, categoryId: null },
];
const DEFAULT_REWARDS = [
  { id: "r1", text: "看一集劇",       cost: 40, claimed: false },
  { id: "r2", text: "喝一杯手搖飲",   cost: 30, claimed: false },
  { id: "r3", text: "週末午睡不限時", cost: 60, claimed: false },
];

// ─── Firestore ────────────────────────────────────────────────────
const roomRef = (code) => doc(db, "rooms", code);

async function createRoom(code, creatorRole) {
  const data = {
    code, tasks: DEFAULT_TASKS, rewards: DEFAULT_REWARDS,
    categories: [], points: 0, notifications: [],
    lastDate: todayKey(), roles: { [creatorRole]: true },
  };
  await setDoc(roomRef(code), data);
  return data;
}

async function fetchRoom(code) {
  const snap = await getDoc(roomRef(code));
  return snap.exists() ? snap.data() : null;
}

async function saveRoom(code, data) {
  await setDoc(roomRef(code), data, { merge: true });
}

// ─── Confetti ─────────────────────────────────────────────────────
function Confetti({ active }) {
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const raf = useRef(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const colors = [C.accent, C.pink, C.mint, "#9ECBFF", "#FFE3A3"];
    particles.current = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width, y: -10,
      r: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 3,
      vy: Math.random() * 3 + 2, life: 1,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.life -= 0.011;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      });
      particles.current = particles.current.filter(p => p.life > 0);
      if (particles.current.length) raf.current = requestAnimationFrame(draw);
    };
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [active]);
  if (!active) return null;
  return <canvas ref={canvasRef} style={{
    position:"fixed", inset:0, width:"100%", height:"100%",
    pointerEvents:"none", zIndex:200,
  }} />;
}

// ─── Toast ────────────────────────────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position:"fixed", top:20, left:"50%", transform:"translateX(-50%)",
      background:"#FFFFFF", color:C.accentDark, padding:"10px 20px",
      borderRadius:20, fontSize:13, zIndex:300,
      border:`1px solid ${C.accentBorder}`, whiteSpace:"nowrap",
      boxShadow:C.shadow, maxWidth:"90vw", fontWeight:600,
    }}>{msg}</div>
  );
}

// ─── 共用樣式 ─────────────────────────────────────────────────────
const inputStyle = {
  width:"100%", background:"#FFFFFF", border:`1px solid ${C.border}`,
  borderRadius:10, padding:"10px 14px", color:C.text,
  fontSize:14, outline:"none", boxSizing:"border-box",
};

const cardStyle = {
  background:C.card, border:`1px solid ${C.border}`,
  borderRadius:14, padding:"14px 16px", boxShadow:"0 2px 10px rgba(150,140,210,0.08)",
};

const pillBtn = (active, accent = C.accent) => ({
  padding:"6px 14px", borderRadius:20, border:`1px solid ${active ? accent : C.border}`,
  background: active ? accent : "#FFFFFF",
  color: active ? "#FFFFFF" : C.textMuted,
  fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap",
  flexShrink:0,
});

const primaryBtn = {
  background:`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
  color:"#FFFFFF", border:"none", borderRadius:10,
  fontSize:13, fontWeight:700, cursor:"pointer",
};

const secondaryBtn = {
  background:"#FFFFFF", color:C.textMuted, border:`1px solid ${C.border}`,
  borderRadius:10, fontSize:13, cursor:"pointer",
};

// ─── Setup Screen（首次使用：建立第一個房間）─────────────────────
function SetupScreen({ onDone }) {
  const [step, setStep]           = useState("choose");
  const [role, setRole]           = useState(null);
  const [code, setCode]           = useState("");
  const [pin, setPin]             = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [err, setErr]             = useState("");
  const [loading, setLoading]     = useState(false);
  const [roomCode]                = useState(genCode);

  const finish = (roomCode, role, pin) => {
    setRooms([{ roomCode, role, pin }]);
    setActiveCode(roomCode);
    onDone({ roomCode, role, pin });
  };

  const handleCreate = async () => {
    if (!role)              return setErr("請選擇你的角色");
    if (pin.length < 4)     return setErr("請設定至少 4 位數的 PIN 碼");
    if (pin !== pinConfirm) return setErr("兩次 PIN 碼不一致");
    setLoading(true);
    try {
      await signInAnonymously(auth);
      await createRoom(roomCode, role);
      finish(roomCode, role, pin);
    } catch (e) {
      if (e.code === "auth/operation-not-allowed") {
        setErr("請先在 Firebase Console 開啟「匿名登入」功能（Authentication → Sign-in method → 匿名）");
      } else {
        setErr("建立失敗：" + e.message);
      }
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!code.trim())       return setErr("請輸入房間代碼");
    if (pin.length < 4)     return setErr("請設定至少 4 位數的 PIN 碼");
    if (pin !== pinConfirm) return setErr("兩次 PIN 碼不一致");
    setLoading(true);
    const upperCode = code.toUpperCase();
    try {
      await signInAnonymously(auth);
      const rd = await fetchRoom(upperCode);
      if (!rd) { setLoading(false); return setErr("找不到此房間，請確認代碼"); }
      const takenRole  = Object.keys(rd.roles || {})[0];
      const joinedRole = takenRole === "doer" ? "giver" : "doer";
      await updateDoc(roomRef(upperCode), { [`roles.${joinedRole}`]: true });
      finish(upperCode, joinedRole, pin);
    } catch (e) {
      if (e.code === "auth/operation-not-allowed") {
        setErr("請先在 Firebase Console 開啟「匿名登入」功能（Authentication → Sign-in method → 匿名）");
      } else {
        setErr("加入失敗：" + e.message);
      }
    }
    setLoading(false);
  };

  const Btn = ({ label, onClick, accent }) => (
    <button onClick={onClick} disabled={loading} style={{
      width:"100%", padding:"14px 0", borderRadius:12, border:"none",
      background: accent || `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
      color:"#FFFFFF",
      fontSize:15, fontWeight:700, cursor:"pointer", marginTop:10,
      opacity: loading ? 0.6 : 1,
    }}>{loading ? "處理中…" : label}</button>
  );

  return (
    <div style={{
      minHeight:"100vh", background:`linear-gradient(160deg, ${C.bg}, ${C.bgEnd})`, color:C.text,
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:24,
      fontFamily:"'Noto Sans TC','PingFang TC',sans-serif",
    }}>
      <div style={{ fontSize:40, marginBottom:8 }}>💜</div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>任務積分系統</div>
      <div style={{ fontSize:13, color:C.textMuted, marginBottom:32 }}>雙人協作版</div>

      {step === "choose" && (
        <div style={{ width:"100%", maxWidth:320 }}>
          <Btn label="🏠 建立新房間"   onClick={() => setStep("create")} />
          <Btn label="🔗 加入現有房間" onClick={() => setStep("join")} accent={`linear-gradient(135deg, ${C.pink}, ${C.pinkDark})`} />
        </div>
      )}

      {step === "create" && (
        <div style={{ width:"100%", maxWidth:320 }}>
          <div style={{ ...cardStyle, marginBottom:16, textAlign:"center" }}>
            <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>你的房間代碼</div>
            <div style={{ fontSize:28, fontWeight:800, color:C.accentDark, letterSpacing:6 }}>{roomCode}</div>
            <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>把這組代碼傳給對方</div>
          </div>

          <div style={{ fontSize:13, color:C.textMuted, marginBottom:8 }}>我的角色</div>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {[
              ["doer",  "🙋", "任務執行者", "完成任務、累積積分"],
              ["giver", "🎁", "獎勵發放者", "設計獎勵、核准兌換"],
            ].map(([r, icon, name, desc]) => (
              <div key={r} onClick={() => setRole(r)} style={{
                flex:1, background: role === r ? C.cardDone : C.card,
                border: `2px solid ${role === r ? C.accent : C.border}`,
                borderRadius:12, padding:12, cursor:"pointer", textAlign:"center",
              }}>
                <div style={{ fontSize:24 }}>{icon}</div>
                <div style={{ fontSize:12, fontWeight:700, marginTop:4 }}>{name}</div>
                <div style={{ fontSize:10, color:C.textMuted, marginTop:2 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:13, color:C.textMuted, marginBottom:6 }}>設定 PIN 碼（4 位以上）</div>
          <input type="password" value={pin} onChange={e => setPin(e.target.value)}
            placeholder="PIN 碼" style={inputStyle} />
          <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
            placeholder="再輸入一次" style={{ ...inputStyle, marginTop:8 }} />

          {err && (
            <div style={{
              color:C.pinkDark, fontSize:12, marginTop:10,
              background:"#FFF1F4", borderRadius:8, padding:"10px 12px",
              lineHeight:1.6, border:`1px solid ${C.pink}40`,
            }}>{err}</div>
          )}
          <Btn label="建立房間" onClick={handleCreate} />
          <button onClick={() => { setStep("choose"); setErr(""); }} style={{
            width:"100%", background:"none", border:"none", color:C.textMuted,
            fontSize:13, cursor:"pointer", marginTop:10, padding:8,
          }}>← 返回</button>
        </div>
      )}

      {step === "join" && (
        <div style={{ width:"100%", maxWidth:320 }}>
          <div style={{ fontSize:13, color:C.textMuted, marginBottom:6 }}>輸入房間代碼</div>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="例：AB12CD" maxLength={6}
            style={{ ...inputStyle, letterSpacing:6, fontWeight:700, fontSize:20, textAlign:"center" }} />

          <div style={{ fontSize:13, color:C.textMuted, marginBottom:6, marginTop:16 }}>設定你的 PIN 碼</div>
          <input type="password" value={pin} onChange={e => setPin(e.target.value)}
            placeholder="PIN 碼" style={inputStyle} />
          <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
            placeholder="再輸入一次" style={{ ...inputStyle, marginTop:8 }} />

          {err && (
            <div style={{
              color:C.pinkDark, fontSize:12, marginTop:10,
              background:"#FFF1F4", borderRadius:8, padding:"10px 12px",
              lineHeight:1.6, border:`1px solid ${C.pink}40`,
            }}>{err}</div>
          )}
          <Btn label="加入房間" onClick={handleJoin} accent={`linear-gradient(135deg, ${C.pink}, ${C.pinkDark})`} />
          <button onClick={() => { setStep("choose"); setErr(""); }} style={{
            width:"100%", background:"none", border:"none", color:C.textMuted,
            fontSize:13, cursor:"pointer", marginTop:10, padding:8,
          }}>← 返回</button>
        </div>
      )}
    </div>
  );
}

// ─── PIN Lock Screen ──────────────────────────────────────────────
function PinScreen({ session, onUnlock, onResetAll }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const tryUnlock = () => {
    if (pin === session?.pin) onUnlock();
    else { setErr("PIN 碼錯誤"); setPin(""); }
  };

  return (
    <div style={{
      minHeight:"100vh", background:`linear-gradient(160deg, ${C.bg}, ${C.bgEnd})`, color:C.text,
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:24,
      fontFamily:"'Noto Sans TC','PingFang TC',sans-serif",
    }}>
      <div style={{ fontSize:56, marginBottom:12 }}>{roleIcon(session.role)}</div>
      <div style={{ fontSize:18, fontWeight:700 }}>{roleLabel(session.role)}</div>
      <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>房間 #{session.roomCode}</div>
      <div style={{ fontSize:13, color:C.textMuted, marginBottom:32, marginTop:4 }}>輸入 PIN 碼解鎖</div>
      <div style={{ width:"100%", maxWidth:280 }}>
        <input type="password" value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && tryUnlock()}
          placeholder="●●●●" autoFocus
          style={{ ...inputStyle, textAlign:"center", fontSize:28, letterSpacing:10 }} />
        {err && <div style={{ color:C.pinkDark, fontSize:12, marginTop:8, textAlign:"center" }}>{err}</div>}
        <button onClick={tryUnlock} style={{
          width:"100%", marginTop:14, padding:"13px 0", borderRadius:12,
          background:`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`, color:"#FFFFFF", border:"none",
          fontSize:15, fontWeight:700, cursor:"pointer",
        }}>解鎖</button>

        <div style={{
          marginTop:32, padding:16, background:C.card,
          borderRadius:12, border:`1px solid ${C.border}`,
        }}>
          <div style={{ fontSize:12, color:C.textMuted, marginBottom:4 }}>🔄 重新開始</div>
          <div style={{ fontSize:11, color:"#C2A8D6", marginBottom:10 }}>
            移除這台裝置上所有已儲存的房間，回到初始設定畫面。房間本身的資料不會消失。
          </div>
          <button onClick={onResetAll} style={{
            width:"100%", background:"none",
            border:`1px solid ${C.pink}`, color:C.pinkDark,
            borderRadius:8, padding:"8px 0", fontSize:12, cursor:"pointer",
          }}>移除所有房間，重新設定</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [session,       setSession]       = useState(null); // {roomCode, role, pin}
  const [unlocked,      setUnlocked]      = useState(false);
  const [roomData,      setRoomData]      = useState(null);
  const [page,          setPage]          = useState("tasks");
  const [toast,         setToast]         = useState(null);
  const [confetti,      setConfetti]      = useState(false);

  // task form
  const [newTask,       setNewTask]       = useState("");
  const [newTaskPts,    setNewTaskPts]    = useState(10);
  const [newTaskCategory, setNewTaskCategory] = useState("");
  // reward form
  const [newReward,     setNewReward]     = useState("");
  const [newRewardCost, setNewRewardCost] = useState(20);
  // task edit
  const [editingTaskId,   setEditingTaskId]   = useState(null);
  const [editTaskText,    setEditTaskText]    = useState("");
  const [editTaskPoints,  setEditTaskPoints]  = useState(10);
  const [editTaskCategory,setEditTaskCategory]= useState("");
  // reward edit
  const [editingRewardId, setEditingRewardId] = useState(null);
  const [editRewardText,  setEditRewardText]  = useState("");
  const [editRewardCost,  setEditRewardCost]  = useState(20);
  // categories
  const [selectedCategory, setSelectedCategory] = useState(null); // null = 全部
  const [managingCategories, setManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editCategoryDrafts, setEditCategoryDrafts] = useState({});
  // switch tab
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm,   setShowJoinForm]   = useState(false);
  const [createRole,     setCreateRole]     = useState(null);
  const [createPin,      setCreatePin]      = useState("");
  const [createPinConfirm, setCreatePinConfirm] = useState("");
  const [joinCode,       setJoinCode]       = useState("");
  const [joinPin,        setJoinPin]        = useState("");
  const [joinPinConfirm, setJoinPinConfirm] = useState("");
  const [switchErr,      setSwitchErr]      = useState("");
  const [switchLoading,  setSwitchLoading]  = useState(false);
  // notepad
  const [notepadOpen,  setNotepadOpen]  = useState(false);
  const [notepadText,  setNotepadText]  = useState("");

  const unsubRef = useRef(null);

  // Boot
  useEffect(() => {
    signInAnonymously(auth).catch(() => {});
    migrateLegacySession();
    const rooms = getRooms();
    const activeCode = getActiveCode();
    const active = rooms.find(r => r.roomCode === activeCode) || rooms[0] || null;
    if (active) setSession(active);
    setNotepadText(getNotepad());
  }, []);

  // Firestore real-time listener
  useEffect(() => {
    if (!session || !unlocked) return;
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onSnapshot(roomRef(session.roomCode), (snap) => {
      if (snap.exists()) setRoomData(snap.data());
    });
    return () => unsubRef.current?.();
  }, [session, unlocked]);

  // Daily reset — keep items, reset done/claimed flags only
  useEffect(() => {
    if (!roomData || !session) return;
    const today = todayKey();
    if (roomData.lastDate === today) return;
    saveRoom(session.roomCode, {
      ...roomData,
      tasks:   roomData.tasks.map(t   => ({ ...t, done:    false })),
      rewards: roomData.rewards.map(r => ({ ...r, claimed: false })),
      lastDate: today,
    });
  }, [roomData, session]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const boom = () => { setConfetti(true); setTimeout(() => setConfetti(false), 3000); };
  const unreadCount = (roomData?.notifications || []).filter(n => !n.read).length;

  const markAllRead = async () => {
    if (!roomData) return;
    const notifs = roomData.notifications || [];
    if (notifs.length === 0 || notifs.every(n => n.read)) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      notifications: notifs.map(n => ({ ...n, read: true })),
    });
  };

  // ── Tasks ─────────────────────────────────────────────────────
  const toggleTask = async (id) => {
    const task = roomData.tasks.find(t => t.id === id);
    if (!task.done) {
      if (session.role !== "doer") return showToast("只有任務執行者可以勾選任務 🙋");
      const tasks = roomData.tasks.map(t => t.id === id ? { ...t, done: true } : t);
      const updated = {
        ...roomData,
        points: roomData.points + task.points,
        tasks,
        notifications: [...(roomData.notifications || []), {
          id: genId("n"), type: "task_done",
          msg: `✅ 完成「${task.text}」+${task.points} 積分`, read: false, time: Date.now(),
        }],
      };
      if (tasks.every(t => t.done)) { boom(); showToast("🎉 所有任務都完成了！"); }
      else showToast(`+${task.points} 積分 ✨`);
      await saveRoom(session.roomCode, updated);
    } else {
      if (session.role !== "giver") return showToast("只有獎勵發放者可以取消勾選 🎁");
      const tasks = roomData.tasks.map(t => t.id === id ? { ...t, done: false } : t);
      const updated = {
        ...roomData,
        points: roomData.points - task.points,
        tasks,
        notifications: [...(roomData.notifications || []), {
          id: genId("n"), type: "task_undone",
          msg: `↩️ 取消「${task.text}」的完成狀態，已扣回 ${task.points} 積分`, read: false, time: Date.now(),
        }],
      };
      showToast(`已取消，扣回 ${task.points} 積分`);
      await saveRoom(session.roomCode, updated);
    }
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    const categories = roomData.categories || [];
    const catId = categories.length > 0 ? (newTaskCategory || categories[0].id) : null;
    await saveRoom(session.roomCode, {
      ...roomData,
      tasks: [...roomData.tasks, {
        id: genId("t"), text: newTask.trim(),
        points: Math.max(1, Number(newTaskPts) || 1),
        done: false, categoryId: catId,
      }],
    });
    setNewTask(""); showToast("任務已加入！");
  };

  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditTaskText(task.text);
    setEditTaskPoints(task.points);
    setEditTaskCategory(task.categoryId || "");
  };
  const cancelEditTask = () => setEditingTaskId(null);

  const saveEditTask = async () => {
    if (!editTaskText.trim()) return;
    const categories = roomData.categories || [];
    const catId = categories.length > 0 ? (editTaskCategory || null) : null;
    await saveRoom(session.roomCode, {
      ...roomData,
      tasks: roomData.tasks.map(t =>
        t.id === editingTaskId
          ? { ...t, text: editTaskText.trim(), points: Math.max(1, Number(editTaskPoints) || 1), categoryId: catId }
          : t
      ),
    });
    setEditingTaskId(null);
    showToast("任務已更新！");
  };

  const deleteTask = async (id) => {
    if (!window.confirm("確定要刪除這個任務嗎？")) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      tasks: roomData.tasks.filter(t => t.id !== id),
    });
    showToast("任務已刪除");
  };

  // ── Categories ───────────────────────────────────────────────
  const addCategory = async () => {
    if (!newCategoryName.trim()) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      categories: [...(roomData.categories || []), { id: genId("c"), name: newCategoryName.trim() }],
    });
    setNewCategoryName("");
  };

  const renameCategory = async (id) => {
    const draft = editCategoryDrafts[id];
    if (draft === undefined || !draft.trim()) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      categories: roomData.categories.map(c => c.id === id ? { ...c, name: draft.trim() } : c),
    });
    setEditCategoryDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const deleteCategory = async (id) => {
    if (!window.confirm("確定要刪除這個分類嗎？分類下的任務會變成「未分類」。")) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      categories: (roomData.categories || []).filter(c => c.id !== id),
      tasks: roomData.tasks.map(t => t.categoryId === id ? { ...t, categoryId: null } : t),
    });
    if (selectedCategory === id) setSelectedCategory(null);
  };

  // ── Rewards ───────────────────────────────────────────────────
  const claimReward = async (id) => {
    if (session.role !== "giver") return showToast("只有獎勵發放者可以兌換 🎁");
    const reward = roomData.rewards.find(r => r.id === id);
    if (!reward || reward.claimed) return;
    if (roomData.points < reward.cost) return showToast(`積分不足，還差 ${reward.cost - roomData.points} 分`);
    boom();
    await saveRoom(session.roomCode, {
      ...roomData,
      points:  roomData.points - reward.cost,
      rewards: roomData.rewards.map(r => r.id === id ? { ...r, claimed: true } : r),
      notifications: [...(roomData.notifications || []), {
        id: genId("n"), type: "reward_claimed",
        msg: `🎁 兌換了「${reward.text}」-${reward.cost} 積分`, read: false, time: Date.now(),
      }],
});
    showToast(`🎁 「${reward.text}」兌換成功！`);
  };

  const addReward = async () => {
    if (!newReward.trim()) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      rewards: [...roomData.rewards, {
        id: genId("r"), text: newReward.trim(),
        cost: Math.max(1, Number(newRewardCost) || 1), claimed: false,
      }],
    });
    setNewReward(""); showToast("獎勵已加入！");
  };

  const startEditReward = (reward) => {
    setEditingRewardId(reward.id);
    setEditRewardText(reward.text);
    setEditRewardCost(reward.cost);
  };
  const cancelEditReward = () => setEditingRewardId(null);

  const saveEditReward = async () => {
    if (!editRewardText.trim()) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      rewards: roomData.rewards.map(r =>
        r.id === editingRewardId
          ? { ...r, text: editRewardText.trim(), cost: Math.max(1, Number(editRewardCost) || 1) }
          : r
      ),
    });
    setEditingRewardId(null);
    showToast("獎勵已更新！");
  };

  const deleteReward = async (id) => {
    if (!window.confirm("確定要刪除這個獎勵嗎？")) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      rewards: roomData.rewards.filter(r => r.id !== id),
    });
    showToast("獎勵已刪除");
  };

  // ── Room switching ───────────────────────────────────────────
  const switchToRoom = (roomCode) => {
    const rooms = getRooms();
    const target = rooms.find(r => r.roomCode === roomCode);
    if (!target) return;
    setActiveCode(roomCode);
    setRoomData(null);
    setSession(target);
    setPage("tasks");
    setSelectedCategory(null);
    showToast(`已切換到房間 #${roomCode}`);
  };

  const handleCreateRoom = async () => {
    if (!createRole)               return setSwitchErr("請選擇角色");
    if (createPin.length < 4)      return setSwitchErr("請設定至少 4 位數的 PIN 碼");
    if (createPin !== createPinConfirm) return setSwitchErr("兩次 PIN 碼不一致");
    setSwitchLoading(true); setSwitchErr("");
    try {
      const code = genCode();
      await createRoom(code, createRole);
      const newSession = { roomCode: code, role: createRole, pin: createPin };
      setRooms([...getRooms(), newSession]);
      setActiveCode(code);
      setSession(newSession);
      setRoomData(null);
      setShowCreateForm(false);
      setCreatePin(""); setCreatePinConfirm(""); setCreateRole(null);
      setPage("tasks"); setSelectedCategory(null);
      showToast(`新房間 #${code} 已建立！`);
    } catch (e) {
      setSwitchErr(e.code === "auth/operation-not-allowed"
        ? "請先在 Firebase 開啟匿名登入" : "建立失敗：" + e.message);
    }
    setSwitchLoading(false);
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim())          return setSwitchErr("請輸入房間代碼");
    if (joinPin.length < 4)        return setSwitchErr("請設定至少 4 位數的 PIN 碼");
    if (joinPin !== joinPinConfirm) return setSwitchErr("兩次 PIN 碼不一致");
    const upperCode = joinCode.trim().toUpperCase();
    if (getRooms().some(r => r.roomCode === upperCode)) return setSwitchErr("這個房間已經在你的清單裡了");
    setSwitchLoading(true); setSwitchErr("");
    try {
      const rd = await fetchRoom(upperCode);
      if (!rd) { setSwitchLoading(false); return setSwitchErr("找不到此房間，請確認代碼"); }
      const takenRole  = Object.keys(rd.roles || {})[0];
      const joinedRole = takenRole === "doer" ? "giver" : "doer";
      await updateDoc(roomRef(upperCode), { [`roles.${joinedRole}`]: true });
      const newSession = { roomCode: upperCode, role: joinedRole, pin: joinPin };
      setRooms([...getRooms(), newSession]);
      setActiveCode(upperCode);
      setSession(newSession);
      setRoomData(null);
      setShowJoinForm(false);
      setJoinCode(""); setJoinPin(""); setJoinPinConfirm("");
      setPage("tasks"); setSelectedCategory(null);
      showToast(`已加入房間 #${upperCode}！`);
    } catch (e) {
      setSwitchErr(e.code === "auth/operation-not-allowed"
        ? "請先在 Firebase 開啟匿名登入" : "加入失敗：" + e.message);
    }
    setSwitchLoading(false);
  };

  const resetAll = () => {
    setRooms([]);
    LS.del("activeRoomCode");
    setSession(null);
    setUnlocked(false);
    setRoomData(null);
  };

  const handleNotepadChange = (text) => {
    setNotepadText(text);
    setNotepadLS(text);
  };

  // ── Screens ───────────────────────────────────────────────────
  if (!session) {
    return <SetupScreen onDone={({ roomCode, role, pin }) => {
      setSession({ roomCode, role, pin });
      setUnlocked(true);
    }} />;
  }
  if (!unlocked) {
    return <PinScreen session={session} onUnlock={() => setUnlocked(true)} onResetAll={resetAll} />;
  }
  if (!roomData) {
    return (
      <div style={{ minHeight:"100vh", background:`linear-gradient(160deg, ${C.bg}, ${C.bgEnd})`, display:"flex",
        alignItems:"center", justifyContent:"center", color:C.textMuted,
        fontFamily:"sans-serif", flexDirection:"column", gap:12 }}>
        <div style={{ fontSize:32 }}>⏳</div><div>連接房間中…</div>
      </div>
    );
  }

  const isDoer         = session.role === "doer";
  const completedCount = roomData.tasks.filter(t => t.done).length;
  const categories     = roomData.categories || [];
  const filteredTasks  = selectedCategory === null
    ? roomData.tasks
    : roomData.tasks.filter(t => (t.categoryId || null) === selectedCategory);
  const allRooms   = getRooms();
  const otherRooms = allRooms.filter(r => r.roomCode !== session.roomCode);

  // group notifications by date for history view
  const notifsByDate = {};
  (roomData.notifications || []).forEach(n => {
    const dateKey = new Date(n.time).toISOString().slice(0, 10);
    (notifsByDate[dateKey] ||= []).push(n);
  });
  const historyDates = Object.keys(notifsByDate).sort().reverse();

  return (
    <div style={{
      minHeight:"100vh", background:`linear-gradient(160deg, ${C.bg}, ${C.bgEnd})`,
      fontFamily:"'Noto Sans TC','PingFang TC',sans-serif",
      color:C.text, display:"flex", flexDirection:"column",
      maxWidth:430, margin:"0 auto",
    }}>
      <Confetti active={confetti} />
      <Toast msg={toast} />

      {/* Header */}
      <div style={{ padding:"24px 20px 0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:11, color:C.textMuted, letterSpacing:2 }}>{fmtDate(new Date())}</div>
            <div style={{ fontSize:20, fontWeight:700, marginTop:2 }}>
              {page==="tasks"?"今日任務":page==="rewards"?"獎勵兌換":page==="history"?"歷史紀錄":"切換房間"}
            </div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <button onClick={() => { setPage("history"); markAllRead(); }} style={{
              position:"relative", background:"none", border:"none",
              cursor:"pointer", fontSize:20, padding:4,
            }}>
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position:"absolute", top:0, right:0,
                  background:C.pinkDark, color:"white", borderRadius:"50%",
                  width:16, height:16, fontSize:9, fontWeight:700,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>{unreadCount}</span>
              )}
            </button>
            <div style={{
              background:`linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              borderRadius:14, padding:"6px 14px", textAlign:"center",
            }}>
              <div style={{ fontSize:20, fontWeight:800, color:"#FFFFFF", lineHeight:1 }}>{roomData.points}</div>
              <div style={{ fontSize:9, color:"#FFFFFFCC", letterSpacing:1 }}>積分</div>
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div style={{
          display:"inline-flex", alignItems:"center", gap:6, marginTop:10,
          background: isDoer ? "#EDE6FB" : "#FFE9EF",
          border:`1px solid ${isDoer ? C.accentBorder : C.pink}`,
          borderRadius:20, padding:"4px 12px",
        }}>
          <span style={{ fontSize:13 }}>{roleIcon(session.role)}</span>
          <span style={{ fontSize:12, fontWeight:600, color: isDoer ? C.accentDark : C.pinkDark }}>
            {roleLabel(session.role)}
          </span>
          <span style={{ fontSize:10, color:C.textMuted, marginLeft:4 }}>#{session.roomCode}</span>
        </div>

        {page === "tasks" && (
          <div style={{ marginTop:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.textMuted, marginBottom:5 }}>
              <span>今日進度</span><span>{completedCount} / {roomData.tasks.length}</span>
            </div>
            <div style={{ background:C.border, borderRadius:6, height:6, overflow:"hidden" }}>
              <div style={{
                height:"100%", borderRadius:6, transition:"width .5s ease",
                width: roomData.tasks.length ? `${(completedCount/roomData.tasks.length)*100}%` : "0%",
                background:`linear-gradient(90deg, ${C.accent}, ${C.pink})`,
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:"16px 20px 100px", overflowY:"auto" }}>

        {/* TASKS */}
        {page === "tasks" && (<>
          {/* Category tabs */}
          <div style={{ display:"flex", gap:8, overflowX:"auto", marginBottom:14, paddingBottom:2 }}>
            <button onClick={() => setSelectedCategory(null)} style={pillBtn(selectedCategory === null)}>全部</button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={pillBtn(selectedCategory === cat.id)}>
                {cat.name}
              </button>
            ))}
            <button onClick={() => setManagingCategories(v => !v)} style={{
              ...pillBtn(managingCategories, C.pink),
              fontSize:13,
            }}>⚙️ 分類</button>
          </div>

          {/* Category management panel */}
          {managingCategories && (
            <div style={{ ...cardStyle, marginBottom:14, border:`1px dashed ${C.pink}` }}>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:10, fontWeight:600 }}>管理分類</div>
              {categories.length === 0 && (
                <div style={{ fontSize:12, color:C.textMuted, marginBottom:10 }}>還沒有分類，新增一個吧！</div>
              )}
              {categories.map(cat => (
                <div key={cat.id} style={{ display:"flex", gap:6, marginBottom:8, alignItems:"center" }}>
                  <input
                    value={editCategoryDrafts[cat.id] !== undefined ? editCategoryDrafts[cat.id] : cat.name}
                    onChange={e => setEditCategoryDrafts(prev => ({ ...prev, [cat.id]: e.target.value }))}
                    onBlur={() => renameCategory(cat.id)}
                    onKeyDown={e => e.key === "Enter" && renameCategory(cat.id)}
                    style={{ ...inputStyle, padding:"7px 10px", fontSize:13 }} />
                  <button onClick={() => deleteCategory(cat.id)} style={{
                    background:"none", border:"none", color:C.pinkDark, fontSize:16, cursor:"pointer", padding:4,
                  }}>🗑️</button>
                </div>
              ))}
              <div style={{ display:"flex", gap:6, marginTop:4 }}>
                <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCategory()}
                  placeholder="新分類名稱…" style={{ ...inputStyle, padding:"7px 10px", fontSize:13 }} />
                <button onClick={addCategory} style={{ ...primaryBtn, padding:"0 16px" }}>新增</button>
              </div>
              <button onClick={() => setManagingCategories(false)} style={{
                ...secondaryBtn, width:"100%", marginTop:10, padding:"8px 0",
              }}>完成</button>
            </div>
          )}

          {/* Task list */}
          {filteredTasks.length === 0 && (
            <div style={{ textAlign:"center", color:C.textMuted, marginTop:40 }}>
              <div style={{ fontSize:36 }}>📋</div>
              <div style={{ marginTop:8 }}>{categories.length>0 && selectedCategory!==null ? "這個分類還沒有任務" : "還沒有任務，在下方新增吧！"}</div>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {filteredTasks.map(task => (
              editingTaskId === task.id ? (
                <div key={task.id} style={{ ...cardStyle, border:`1px solid ${C.accentBorder}` }}>
                  <input value={editTaskText} onChange={e => setEditTaskText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveEditTask()}
                    style={inputStyle} />
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <input type="number" min="1" value={editTaskPoints}
                      onChange={e => setEditTaskPoints(e.target.value)}
                      style={{ ...inputStyle, width:80, textAlign:"center" }} />
                    {categories.length > 0 && (
                      <select value={editTaskCategory} onChange={e => setEditTaskCategory(e.target.value)}
                        style={{ ...inputStyle, flex:1, padding:"10px 8px" }}>
                        <option value="">未分類</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <button onClick={saveEditTask} style={{ ...primaryBtn, flex:1, padding:"8px 0" }}>儲存</button>
                    <button onClick={cancelEditTask} style={{ ...secondaryBtn, padding:"8px 16px" }}>取消</button>
                  </div>
                </div>
              ) : (
                <div key={task.id} onClick={() => toggleTask(task.id)} style={{
                  display:"flex", alignItems:"center", gap:12,
                  background: task.done ? C.cardDone : C.card,
                  border:`1px solid ${task.done ? C.accentBorder : C.border}`,
                  borderRadius:14, padding:"14px 16px",
                  cursor: (isDoer && !task.done) || (!isDoer && task.done) ? "pointer" : "default",
                  transition:"all .2s", boxShadow:"0 2px 10px rgba(150,140,210,0.08)",
                }}>
                  <div style={{
                    width:22, height:22, borderRadius:6, flexShrink:0,
                    border:`2px solid ${task.done ? C.mintDark : "#D6D9F0"}`,
                    background: task.done ? C.mint : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {task.done && <span style={{ color:"#FFFFFF", fontSize:13 }}>✓</span>}
                  </div>
                  <span style={{
                    flex:1, fontSize:14, fontWeight:500,
                    textDecoration: task.done ? "line-through" : "none",
                    color: task.done ? C.textMuted : C.text,
                  }}>{task.text}</span>
                  <span style={{
                    fontSize:12, fontWeight:700, padding:"3px 8px", borderRadius:8,
                    color:      task.done ? C.mintDark : C.accentDark,
                    background: task.done ? "#E3F7EC" : "#F1ECFB",
                  }}>+{task.points}</span>
                  <button onClick={(e) => { e.stopPropagation(); startEditTask(task); }} style={{
                    background:"none", border:"none", color:C.textMuted,
                    fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                  }}>✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} style={{
                    background:"none", border:"none", color:C.textMuted,
                    fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                  }}>🗑️</button>
                </div>
              )
            ))}
          </div>

          {/* Add task */}
          <div style={{ marginTop:20, ...cardStyle, border:`1px dashed ${C.accentBorder}` }}>
            <div style={{ fontSize:12, color:C.textMuted, marginBottom:8 }}>新增任務</div>
            <input value={newTask} onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addTask()}
              placeholder="輸入任務內容…" style={inputStyle} />
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <input type="number" min="1" value={newTaskPts}
                onChange={e => setNewTaskPts(e.target.value)}
                placeholder="積分" style={{ ...inputStyle, width:80, textAlign:"center" }} />
              {categories.length > 0 && (
                <select value={newTaskCategory} onChange={e => setNewTaskCategory(e.target.value)}
                  style={{ ...inputStyle, flex:1, padding:"10px 8px" }}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button onClick={addTask} style={{ ...primaryBtn, flex: categories.length>0 ? "0 0 auto" : 1, padding:"0 18px" }}>＋ 加入</button>
            </div>
          </div>
        </>)}

        {/* REWARDS */}
        {page === "rewards" && (<>
          {roomData.rewards.length === 0 && (
            <div style={{ textAlign:"center", color:C.textMuted, marginTop:40 }}>
              <div style={{ fontSize:36 }}>🎁</div>
              <div style={{ marginTop:8 }}>還沒有獎勵，等待發放者新增！</div>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {roomData.rewards.map(reward => {
              const canAfford = roomData.points >= reward.cost;
              if (editingRewardId === reward.id) {
                return (
                  <div key={reward.id} style={{ ...cardStyle, border:`1px solid ${C.pink}` }}>
                    <input value={editRewardText} onChange={e => setEditRewardText(e.target.value)}
                      onKeyDown={e => e.key==="Enter" && saveEditReward()}
                      style={inputStyle} />
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <input type="number" min="1" value={editRewardCost}
                        onChange={e => setEditRewardCost(e.target.value)}
                        style={{ ...inputStyle, width:90, textAlign:"center" }} />
                      <button onClick={saveEditReward} style={{
                        flex:1, background:`linear-gradient(135deg, ${C.pink}, ${C.pinkDark})`,
                        color:"#FFFFFF", border:"none", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer",
                      }}>儲存</button>
                      <button onClick={cancelEditReward} style={{ ...secondaryBtn, padding:"0 16px" }}>取消</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={reward.id} style={{
                  background: reward.claimed ? C.cardDone : C.card,
                  border:`1px solid ${reward.claimed ? C.accentBorder : canAfford ? C.pink : C.border}`,
                  borderRadius:14, padding:"14px 16px",
                  opacity: reward.claimed ? 0.6 : 1,
                  display:"flex", alignItems:"center", gap:10,
                  boxShadow:"0 2px 10px rgba(150,140,210,0.08)",
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{
                      fontSize:14, fontWeight:500,
                      textDecoration: reward.claimed ? "line-through" : "none",
                      color: reward.claimed ? C.textMuted : C.text,
                    }}>{reward.text}</div>
                    <div style={{ fontSize:11, color:C.pinkDark, marginTop:3 }}>
                      {reward.claimed ? "今日已兌換，明天可再兌換" : `需要 ${reward.cost} 積分`}
                    </div>
                  </div>
                  {!reward.claimed && (
                    <button onClick={() => claimReward(reward.id)} style={{
                      background: (!isDoer && canAfford) ? `linear-gradient(135deg, ${C.pink}, ${C.pinkDark})` : C.border,
                      color: (!isDoer && canAfford) ? "#FFFFFF" : C.textMuted,
                      border:"none", borderRadius:10, padding:"8px 14px",
                      fontSize:12, fontWeight:700,
                      cursor: !isDoer ? "pointer" : "default", flexShrink:0,
                    }}>
                      {isDoer ? "不可兌換" : canAfford ? "兌換" : "積分不足"}
                    </button>
                  )}
                  {reward.claimed && <div style={{ fontSize:20 }}>✅</div>}
                  {!isDoer && (
                    <>
                      <button onClick={() => startEditReward(reward)} style={{
                        background:"none", border:"none", color:C.textMuted,
                        fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                      }}>✏️</button>
                      <button onClick={() => deleteReward(reward.id)} style={{
                        background:"none", border:"none", color:C.textMuted,
                        fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                      }}>🗑️</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:20, ...cardStyle, border:`1px dashed ${C.pink}` }}>
            <div style={{ fontSize:12, color:C.textMuted, marginBottom:8 }}>新增獎勵（發放者專用）</div>
            <input value={newReward} onChange={e => setNewReward(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addReward()}
              placeholder="輸入獎勵內容…" style={inputStyle} />
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <input type="number" min="1" value={newRewardCost}
                onChange={e => setNewRewardCost(e.target.value)}
                placeholder="所需積分" style={{ ...inputStyle, width:90, textAlign:"center" }} />
              <button onClick={addReward} disabled={isDoer} style={{
                flex:1,
                background: isDoer ? C.border : `linear-gradient(135deg, ${C.pink}, ${C.pinkDark})`,
                color: isDoer ? C.textMuted : "#FFFFFF",
                border:"none", borderRadius:8, fontSize:13, fontWeight:700,
                cursor: isDoer ? "not-allowed" : "pointer",
              }}>＋ 加入</button>
            </div>
            {isDoer && <div style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>只有獎勵發放者可以新增獎勵</div>}
          </div>
        </>)}

        {/* HISTORY (merged with notifications) */}
        {page === "history" && (<>
          {historyDates.length === 0 && (
            <div style={{ textAlign:"center", color:C.textMuted, marginTop:40 }}>
              <div style={{ fontSize:36 }}>📅</div>
              <div style={{ marginTop:8 }}>還沒有紀錄</div>
              <div style={{ fontSize:12, marginTop:4 }}>完成任務或兌換獎勵後會出現在這裡</div>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {historyDates.map(date => (
              <div key={date}>
                <div style={{
                  fontSize:12, fontWeight:700, color:C.accentDark,
                  marginBottom:8, paddingLeft:4,
                }}>
                  {fmtDateShort(date)}
                  {date === todayKey() && (
                    <span style={{
                      marginLeft:6, fontSize:10, color:"#FFFFFF",
                      background:C.pink, borderRadius:8, padding:"1px 8px",
                    }}>今天</span>
                  )}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {[...notifsByDate[date]].reverse().map(n => (
                    <div key={n.id} style={{
                      ...cardStyle, padding:"10px 14px",
                      display:"flex", justifyContent:"space-between", alignItems:"center",
                      border:`1px solid ${C.border}`,
                    }}>
                      <span style={{ fontSize:13 }}>{n.msg}</span>
                      <span style={{ fontSize:10, color:C.textMuted, flexShrink:0, marginLeft:8 }}>{fmtTime(n.time)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* SWITCH ROOMS */}
        {page === "switch" && (<>
          {/* Current room */}
          <div style={{ fontSize:12, color:C.textMuted, marginBottom:8, fontWeight:600 }}>目前房間</div>
          <div style={{ ...cardStyle, border:`1px solid ${C.accentBorder}`, marginBottom:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:20, fontWeight:800, letterSpacing:5, color:C.accentDark }}>{session.roomCode}</div>
              <div style={{
                display:"flex", alignItems:"center", gap:5,
                background: isDoer ? "#EDE6FB" : "#FFE9EF",
                borderRadius:14, padding:"4px 10px",
              }}>
                <span>{roleIcon(session.role)}</span>
                <span style={{ fontSize:11, fontWeight:600, color: isDoer ? C.accentDark : C.pinkDark }}>{roleLabel(session.role)}</span>
              </div>
            </div>
          </div>

          {/* Other rooms */}
          {otherRooms.length > 0 && (
            <>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:8, fontWeight:600 }}>其他房間（點擊切換）</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
                {otherRooms.map(r => (
                  <div key={r.roomCode} onClick={() => switchToRoom(r.roomCode)} style={{
                    ...cardStyle, cursor:"pointer",
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                  }}>
                    <div style={{ fontSize:16, fontWeight:700, letterSpacing:4, color:C.text }}>{r.roomCode}</div>
                    <div style={{
                      display:"flex", alignItems:"center", gap:5,
                      background: r.role==="doer" ? "#EDE6FB" : "#FFE9EF",
                      borderRadius:14, padding:"4px 10px",
                    }}>
                      <span>{roleIcon(r.role)}</span>
                      <span style={{ fontSize:11, fontWeight:600, color: r.role==="doer" ? C.accentDark : C.pinkDark }}>{roleLabel(r.role)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Action buttons */}
          <div style={{ display:"flex", gap:8, marginBottom:12 }}>
            <button onClick={() => { setShowCreateForm(v=>!v); setShowJoinForm(false); setSwitchErr(""); }} style={{
              ...primaryBtn, flex:1, padding:"12px 0",
            }}>🏠 建立新房間</button>
            <button onClick={() => { setShowJoinForm(v=>!v); setShowCreateForm(false); setSwitchErr(""); }} style={{
              flex:1, padding:"12px 0", borderRadius:10, border:"none",
              background:`linear-gradient(135deg, ${C.pink}, ${C.pinkDark})`,
              color:"#FFFFFF", fontSize:13, fontWeight:700, cursor:"pointer",
            }}>🔗 加入房間</button>
          </div>

          {/* Create room form */}
          {showCreateForm && (
            <div style={{ ...cardStyle, border:`1px dashed ${C.accentBorder}`, marginBottom:12 }}>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:8 }}>選擇你在新房間的角色</div>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                {[["doer","🙋","任務執行者"],["giver","🎁","獎勵發放者"]].map(([r,icon,name]) => (
                  <div key={r} onClick={() => setCreateRole(r)} style={{
                    flex:1, background: createRole===r ? C.cardDone : C.card,
                    border:`2px solid ${createRole===r ? C.accent : C.border}`,
                    borderRadius:10, padding:10, cursor:"pointer", textAlign:"center",
                  }}>
                    <div style={{ fontSize:20 }}>{icon}</div>
                    <div style={{ fontSize:11, fontWeight:700, marginTop:2 }}>{name}</div>
                  </div>
                ))}
              </div>
              <input type="password" value={createPin} onChange={e => setCreatePin(e.target.value)}
                placeholder="設定 PIN 碼（4位以上）" style={inputStyle} />
              <input type="password" value={createPinConfirm} onChange={e => setCreatePinConfirm(e.target.value)}
                placeholder="再輸入一次" style={{ ...inputStyle, marginTop:8 }} />
              {switchErr && (
                <div style={{ color:C.pinkDark, fontSize:12, marginTop:8, background:"#FFF1F4", borderRadius:8, padding:"8px 12px" }}>{switchErr}</div>
              )}
              <button onClick={handleCreateRoom} disabled={switchLoading} style={{
                ...primaryBtn, width:"100%", padding:"11px 0", marginTop:10, opacity: switchLoading?0.6:1,
              }}>{switchLoading ? "處理中…" : "建立房間"}</button>
            </div>
          )}

          {/* Join room form */}
          {showJoinForm && (
            <div style={{ ...cardStyle, border:`1px dashed ${C.pink}`, marginBottom:12 }}>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:8 }}>輸入房間代碼</div>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="例：AB12CD" maxLength={6}
                style={{ ...inputStyle, letterSpacing:5, fontWeight:700, fontSize:18, textAlign:"center" }} />
              <div style={{ fontSize:12, color:C.textMuted, marginTop:10, marginBottom:8 }}>設定你的 PIN 碼</div>
              <input type="password" value={joinPin} onChange={e => setJoinPin(e.target.value)}
                placeholder="PIN 碼" style={inputStyle} />
              <input type="password" value={joinPinConfirm} onChange={e => setJoinPinConfirm(e.target.value)}
                placeholder="再輸入一次" style={{ ...inputStyle, marginTop:8 }} />
              {switchErr && (
                <div style={{ color:C.pinkDark, fontSize:12, marginTop:8, background:"#FFF1F4", borderRadius:8, padding:"8px 12px" }}>{switchErr}</div>
              )}
              <button onClick={handleJoinRoom} disabled={switchLoading} style={{
                width:"100%", padding:"11px 0", marginTop:10, borderRadius:10, border:"none",
                background:`linear-gradient(135deg, ${C.pink}, ${C.pinkDark})`,
                color:"#FFFFFF", fontSize:13, fontWeight:700, cursor:"pointer",
                opacity: switchLoading?0.6:1,
              }}>{switchLoading ? "處理中…" : "加入房間"}</button>
            </div>
          )}

          <div style={{ height:80 }} />
        </>)}
      </div>

      {/* Notepad widget — bottom right, only on switch page */}
      {page === "switch" && (
        notepadOpen ? (
          <div style={{
            position:"fixed", bottom:90, right:16, zIndex:150,
            width:220, maxWidth:"70vw",
            background:"#FFFFFF", borderRadius:14,
            border:`1px solid ${C.accentBorder}`, boxShadow:C.shadow,
            padding:10,
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontSize:11, color:C.textMuted, fontWeight:600 }}>📝 房號筆記</span>
              <button onClick={() => setNotepadOpen(false)} style={{
                background:"none", border:"none", color:C.textMuted, fontSize:14, cursor:"pointer",
              }}>✕</button>
            </div>
            <textarea value={notepadText} onChange={e => handleNotepadChange(e.target.value)}
              placeholder="記下房號、PIN 提示…&#10;自動儲存"
              style={{
                width:"100%", minHeight:90, background:C.bg, border:`1px solid ${C.border}`,
                borderRadius:8, padding:8, fontSize:12, color:C.text,
                outline:"none", resize:"vertical", boxSizing:"border-box",
                fontFamily:"inherit",
              }} />
          </div>
        ) : (
          <button onClick={() => setNotepadOpen(true)} style={{
            position:"fixed", bottom:90, right:16, zIndex:150,
            width:48, height:48, borderRadius:"50%", border:"none",
            background:`linear-gradient(135deg, ${C.accent}, ${C.pink})`,
            color:"#FFFFFF", fontSize:20, cursor:"pointer", boxShadow:C.shadow,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>📝</button>
        )
      )}

      {/* Bottom Nav */}
      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430,
        background:"#FFFFFFCC", backdropFilter:"blur(20px)",
        borderTop:`1px solid ${C.border}`,
        display:"flex", padding:"10px 8px 20px", gap:4,
      }}>
        {[["tasks","☑️","任務"],["rewards","🎁","獎勵"],["history","📅","歷史"],["switch","🔁","切換"]].map(([key,icon,label]) => (
          <button key={key} onClick={() => { setPage(key); if(key==="history") markAllRead(); }} style={{
            flex:1, display:"flex", flexDirection:"column", alignItems:"center",
            gap:3, padding:"8px 0", border:"none",
            background: page===key ? C.cardDone : "transparent",
            borderRadius:12, cursor:"pointer", position:"relative",
          }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            {key==="history" && unreadCount>0 && (
              <span style={{
                position:"absolute", top:4, right:"calc(50% - 18px)",
                background:C.pinkDark, color:"white", borderRadius:"50%",
                width:14, height:14, fontSize:9, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>{unreadCount}</span>
            )}
            <span style={{ fontSize:10, fontWeight:600, color: page===key ? C.accentDark : C.textMuted }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
            }
