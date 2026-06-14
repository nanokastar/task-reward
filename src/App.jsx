/**
 * 任務積分系統 — 雙人版
 * Firebase 設定已填入，可直接使用
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

// ─── Helpers ──────────────────────────────────────────────────────
const todayKey = () => new Date().toISOString().slice(0, 10);
const fmtDate  = (d) =>
  new Date(d).toLocaleDateString("zh-TW", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const LS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem("tr_" + k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem("tr_" + k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem("tr_" + k),
};

const DEFAULT_TASKS = [
  { id: "t1", text: "早上喝完一杯水", points: 10, done: false },
  { id: "t2", text: "運動 30 分鐘",    points: 30, done: false },
  { id: "t3", text: "閱讀 20 分鐘",    points: 20, done: false },
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
    points: 0, history: {}, notifications: [],
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
    const colors = ["#F4C842","#FF8B72","#7C83FF","#4CAF50","#FF6BB5"];
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
      background:"#2D2E4A", color:"#F4C842", padding:"10px 20px",
      borderRadius:20, fontSize:13, zIndex:300,
      border:"1px solid #F4C84240", whiteSpace:"nowrap",
      boxShadow:"0 4px 20px #0008", maxWidth:"90vw",
    }}>{msg}</div>
  );
}

const inputStyle = {
  width:"100%", background:"#1A1B2E", border:"1px solid #2D2E4A",
  borderRadius:10, padding:"10px 14px", color:"#E8E9F3",
  fontSize:14, outline:"none", boxSizing:"border-box",
};

// ─── Setup Screen ─────────────────────────────────────────────────
function SetupScreen({ onDone }) {
  const [step, setStep]           = useState("choose");
  const [role, setRole]           = useState(null);
  const [code, setCode]           = useState("");
  const [pin, setPin]             = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [err, setErr]             = useState("");
  const [loading, setLoading]     = useState(false);
  const [roomCode]                = useState(genCode);

  const handleCreate = async () => {
    if (!role)              return setErr("請選擇你的角色");
    if (pin.length < 4)     return setErr("請設定至少 4 位數的 PIN 碼");
    if (pin !== pinConfirm) return setErr("兩次 PIN 碼不一致");
    setLoading(true);
    try {
      await signInAnonymously(auth);
      const rd = await createRoom(roomCode, role);
      LS.set("session", { roomCode, role, pin });
      onDone({ roomCode, role, roomData: rd });
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
      LS.set("session", { roomCode: upperCode, role: joinedRole, pin });
      await updateDoc(roomRef(upperCode), { [`roles.${joinedRole}`]: true });
      onDone({ roomCode: upperCode, role: joinedRole, roomData: rd });
    } catch (e) {
      if (e.code === "auth/operation-not-allowed") {
        setErr("請先在 Firebase Console 開啟「匿名登入」功能（Authentication → Sign-in method → 匿名）");
      } else {
        setErr("加入失敗：" + e.message);
      }
    }
    setLoading(false);
  };

  const Btn = ({ label, onClick, accent = "#F4C842" }) => (
    <button onClick={onClick} disabled={loading} style={{
      width:"100%", padding:"14px 0", borderRadius:12, border:"none",
      background: accent, color: accent === "#F4C842" ? "#1A1B2E" : "white",
      fontSize:15, fontWeight:700, cursor:"pointer", marginTop:10,
      opacity: loading ? 0.6 : 1,
    }}>{loading ? "處理中…" : label}</button>
  );

  return (
    <div style={{
      minHeight:"100vh", background:"#1A1B2E", color:"#E8E9F3",
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:24,
      fontFamily:"'Noto Sans TC','PingFang TC',sans-serif",
    }}>
      <div style={{ fontSize:40, marginBottom:8 }}>✨</div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>任務積分系統</div>
      <div style={{ fontSize:13, color:"#8889B0", marginBottom:32 }}>雙人協作版</div>

      {step === "choose" && (
        <div style={{ width:"100%", maxWidth:320 }}>
          <Btn label="🏠 建立新房間"   onClick={() => setStep("create")} />
          <Btn label="🔗 加入現有房間" onClick={() => setStep("join")} accent="#7C83FF" />
        </div>
      )}

      {step === "create" && (
        <div style={{ width:"100%", maxWidth:320 }}>
          <div style={{
            background:"#222340", borderRadius:14, padding:16,
            marginBottom:16, textAlign:"center",
          }}>
            <div style={{ fontSize:11, color:"#8889B0", marginBottom:4 }}>你的房間代碼</div>
            <div style={{ fontSize:28, fontWeight:800, color:"#F4C842", letterSpacing:6 }}>{roomCode}</div>
            <div style={{ fontSize:11, color:"#8889B0", marginTop:4 }}>把這組代碼傳給對方</div>
          </div>

          <div style={{ fontSize:13, color:"#8889B0", marginBottom:8 }}>我的角色</div>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {[
              ["doer",  "🙋", "任務執行者", "完成任務、累積積分"],
              ["giver", "🎁", "獎勵發放者", "設計獎勵、核准兌換"],
            ].map(([r, icon, name, desc]) => (
              <div key={r} onClick={() => setRole(r)} style={{
                flex:1, background: role === r ? "#2D3A5A" : "#222340",
                border: `2px solid ${role === r ? "#F4C842" : "#2D2E4A"}`,
                borderRadius:12, padding:12, cursor:"pointer", textAlign:"center",
              }}>
                <div style={{ fontSize:24 }}>{icon}</div>
                <div style={{ fontSize:12, fontWeight:700, marginTop:4 }}>{name}</div>
                <div style={{ fontSize:10, color:"#8889B0", marginTop:2 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:13, color:"#8889B0", marginBottom:6 }}>設定 PIN 碼（4 位以上）</div>
          <input type="password" value={pin} onChange={e => setPin(e.target.value)}
            placeholder="PIN 碼" style={inputStyle} />
          <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
            placeholder="再輸入一次" style={{ ...inputStyle, marginTop:8 }} />

          {err && (
            <div style={{
              color:"#FF8B72", fontSize:12, marginTop:10,
              background:"#2A1A1A", borderRadius:8, padding:"10px 12px",
              lineHeight:1.6,
            }}>{err}</div>
          )}
          <Btn label="建立房間" onClick={handleCreate} />
          <button onClick={() => { setStep("choose"); setErr(""); }} style={{
            width:"100%", background:"none", border:"none", color:"#8889B0",
            fontSize:13, cursor:"pointer", marginTop:10, padding:8,
          }}>← 返回</button>
        </div>
      )}

      {step === "join" && (
        <div style={{ width:"100%", maxWidth:320 }}>
          <div style={{ fontSize:13, color:"#8889B0", marginBottom:6 }}>輸入房間代碼</div>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="例：AB12CD" maxLength={6}
            style={{ ...inputStyle, letterSpacing:6, fontWeight:700, fontSize:20, textAlign:"center" }} />

          <div style={{ fontSize:13, color:"#8889B0", marginBottom:6, marginTop:16 }}>設定你的 PIN 碼</div>
          <input type="password" value={pin} onChange={e => setPin(e.target.value)}
            placeholder="PIN 碼" style={inputStyle} />
          <input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)}
            placeholder="再輸入一次" style={{ ...inputStyle, marginTop:8 }} />

          {err && (
            <div style={{
              color:"#FF8B72", fontSize:12, marginTop:10,
              background:"#2A1A1A", borderRadius:8, padding:"10px 12px",
              lineHeight:1.6,
            }}>{err}</div>
          )}
          <Btn label="加入房間" onClick={handleJoin} accent="#7C83FF" />
          <button onClick={() => { setStep("choose"); setErr(""); }} style={{
            width:"100%", background:"none", border:"none", color:"#8889B0",
            fontSize:13, cursor:"pointer", marginTop:10, padding:8,
          }}>← 返回</button>
        </div>
      )}
    </div>
  );
}

// ─── PIN Lock Screen ──────────────────────────────────────────────
function PinScreen({ role, onUnlock, onReset }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const tryUnlock = () => {
    const s = LS.get("session");
    if (pin === s?.pin) onUnlock();
    else { setErr("PIN 碼錯誤"); setPin(""); }
  };

  return (
    <div style={{
      minHeight:"100vh", background:"#1A1B2E", color:"#E8E9F3",
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:24,
      fontFamily:"'Noto Sans TC','PingFang TC',sans-serif",
    }}>
      <div style={{ fontSize:56, marginBottom:12 }}>{role === "doer" ? "🙋" : "🎁"}</div>
      <div style={{ fontSize:18, fontWeight:700 }}>{role === "doer" ? "任務執行者" : "獎勵發放者"}</div>
      <div style={{ fontSize:13, color:"#8889B0", marginBottom:32 }}>輸入 PIN 碼解鎖</div>
      <div style={{ width:"100%", maxWidth:280 }}>
        <input type="password" value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && tryUnlock()}
          placeholder="●●●●" autoFocus
          style={{ ...inputStyle, textAlign:"center", fontSize:28, letterSpacing:10 }} />
        {err && <div style={{ color:"#FF8B72", fontSize:12, marginTop:8, textAlign:"center" }}>{err}</div>}
        <button onClick={tryUnlock} style={{
          width:"100%", marginTop:14, padding:"13px 0", borderRadius:12,
          background:"#F4C842", color:"#1A1B2E", border:"none",
          fontSize:15, fontWeight:700, cursor:"pointer",
        }}>解鎖</button>

        <div style={{
          marginTop:32, padding:16, background:"#222340",
          borderRadius:12, border:"1px solid #2D2E4A",
        }}>
          <div style={{ fontSize:12, color:"#8889B0", marginBottom:4 }}>🔄 重新選擇角色</div>
          <div style={{ fontSize:11, color:"#555577", marginBottom:10 }}>
            清除裝置上的身份綁定。房間資料不會消失，可用相同代碼重新加入並選擇新角色。
          </div>
          <button onClick={onReset} style={{
            width:"100%", background:"none",
            border:"1px solid #FF8B7260", color:"#FF8B72",
            borderRadius:8, padding:"8px 0", fontSize:12, cursor:"pointer",
          }}>清除身份綁定，重新選擇角色</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [session,       setSession]       = useState(null);
  const [unlocked,      setUnlocked]      = useState(false);
  const [roomData,      setRoomData]      = useState(null);
  const [page,          setPage]          = useState("tasks");
  const [toast,         setToast]         = useState(null);
  const [confetti,      setConfetti]      = useState(false);
  const [newTask,       setNewTask]       = useState("");
  const [newTaskPts,    setNewTaskPts]    = useState(10);
  const [newReward,     setNewReward]     = useState("");
  const [newRewardCost, setNewRewardCost] = useState(20);
  const [historyDate,   setHistoryDate]   = useState(null);
  const [editingTaskId,   setEditingTaskId]   = useState(null);
  const [editTaskText,    setEditTaskText]    = useState("");
  const [editTaskPoints,  setEditTaskPoints]  = useState(10);
  const [editingRewardId, setEditingRewardId] = useState(null);
  const [editRewardText,  setEditRewardText]  = useState("");
  const [editRewardCost,  setEditRewardCost]  = useState(20);
  const unsubRef = useRef(null);

  // Boot
  useEffect(() => {
    signInAnonymously(auth).catch(() => {});
    const s = LS.get("session");
    if (s) setSession(s);
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

  // Daily reset
  useEffect(() => {
    if (!roomData || !session) return;
    const today = todayKey();
    if (roomData.lastDate === today) return;
    const completed = roomData.tasks.filter(t => t.done);
    const updated = {
      ...roomData,
      tasks:   roomData.tasks.map(t   => ({ ...t,   done:    false })),
      rewards: roomData.rewards.map(r => ({ ...r,   claimed: false })),
      history: {
        ...roomData.history,
        [roomData.lastDate]: {
          tasks: roomData.tasks, rewards: roomData.rewards,
          points: roomData.points,
          completedCount: completed.length, totalCount: roomData.tasks.length,
        },
      },
      notifications: [...(roomData.notifications || []), {
        id: Date.now(),
        msg: `📅 新的一天開始！昨天完成了 ${completed.length}/${roomData.tasks.length} 個任務`,
        read: false, time: Date.now(),
      }],
      lastDate: today,
    };
    saveRoom(session.roomCode, updated);
  }, [roomData, session]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const boom = () => { setConfetti(true); setTimeout(() => setConfetti(false), 3000); };
  const unreadCount = (roomData?.notifications || []).filter(n => !n.read).length;

  const markAllRead = async () => {
    if (!roomData) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      notifications: (roomData.notifications || []).map(n => ({ ...n, read: true })),
    });
  };

  const toggleTask = async (id) => {
    if (session.role !== "doer") return showToast("只有任務執行者可以勾選任務 🙋");
    const task = roomData.tasks.find(t => t.id === id);
    const next = !task.done;
    const updated = {
      ...roomData,
      points: roomData.points + (next ? task.points : -task.points),
      tasks:  roomData.tasks.map(t => t.id === id ? { ...t, done: next } : t),
    };
    if (next) {
      updated.notifications = [...(roomData.notifications || []), {
        id: Date.now(), msg: `✅ 完成「${task.text}」+${task.points} 積分`, read: false, time: Date.now(),
      }];
      if (updated.tasks.every(t => t.done)) { boom(); showToast("🎉 所有任務都完成了！"); }
      else showToast(`+${task.points} 積分 ✨`);
    }
    await saveRoom(session.roomCode, updated);
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      tasks: [...roomData.tasks, { id:"t"+Date.now(), text:newTask.trim(), points:newTaskPts, done:false }],
    });
    setNewTask(""); showToast("任務已加入！");
  };

  const claimReward = async (id) => {
    if (session.role !== "giver") return showToast("只有獎勵發放者可以兌換 🎁");
    const reward = roomData.rewards.find(r => r.id === id);
    if (!reward || reward.claimed) return;
    if (roomData.points < reward.cost) return showToast(`積分不足，還差 ${reward.cost - roomData.points} 分`);
    boom();
    await saveRoom(session.roomCode, {
      ...roomData,
      points:  roomData.points - reward.cost,
      rewards: roomData.rewards.map(r => r.id === id ? { ...r, claimed:true } : r),
      notifications: [...(roomData.notifications || []), {
        id: Date.now(), msg: `🎁 兌換了「${reward.text}」-${reward.cost} 積分`, read:false, time:Date.now(),
      }],
    });
    showToast(`🎁 「${reward.text}」兌換成功！`);
  };

  const addReward = async () => {
    if (!newReward.trim()) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      rewards: [...roomData.rewards, { id:"r"+Date.now(), text:newReward.trim(), cost:newRewardCost, claimed:false }],
    });
    setNewReward(""); showToast("獎勵已加入！");
  };

  // ── Edit / Delete: Tasks ────────────────────────────────────────
  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditTaskText(task.text);
    setEditTaskPoints(task.points);
  };

  const cancelEditTask = () => setEditingTaskId(null);

  const saveEditTask = async () => {
    if (!editTaskText.trim()) return;
    await saveRoom(session.roomCode, {
      ...roomData,
      tasks: roomData.tasks.map(t =>
        t.id === editingTaskId ? { ...t, text: editTaskText.trim(), points: editTaskPoints } : t
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

  // ── Edit / Delete: Rewards ───────────────────────────────────────
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
        r.id === editingRewardId ? { ...r, text: editRewardText.trim(), cost: editRewardCost } : r
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

  const resetSession = () => { LS.del("session"); setSession(null); setUnlocked(false); setRoomData(null); };

  // ── Screens ───────────────────────────────────────────────────
  if (!session) return <SetupScreen onDone={({ roomCode, role, roomData: rd }) => {
    setSession({ roomCode, role }); setRoomData(rd); setUnlocked(true);
  }} />;
  if (!unlocked) return <PinScreen role={session.role} onUnlock={() => setUnlocked(true)} onReset={resetSession} />;
  if (!roomData) return (
    <div style={{ minHeight:"100vh", background:"#1A1B2E", display:"flex", alignItems:"center",
      justifyContent:"center", color:"#8889B0", fontFamily:"sans-serif", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:32 }}>⏳</div><div>連接房間中…</div>
    </div>
  );

  const isDoer         = session.role === "doer";
  const completedCount = roomData.tasks.filter(t => t.done).length;
  const historyDates   = Object.keys(roomData.history || {}).sort().reverse();

  return (
    <div style={{
      minHeight:"100vh", background:"#1A1B2E",
      fontFamily:"'Noto Sans TC','PingFang TC',sans-serif",
      color:"#E8E9F3", display:"flex", flexDirection:"column",
      maxWidth:430, margin:"0 auto",
    }}>
      <Confetti active={confetti} />
      <Toast msg={toast} />

      {/* Header */}
      <div style={{ padding:"24px 20px 0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <div style={{ fontSize:11, color:"#8889B0", letterSpacing:2 }}>{fmtDate(new Date())}</div>
            <div style={{ fontSize:20, fontWeight:700, marginTop:2 }}>
              {page==="tasks"?"今日任務":page==="rewards"?"獎勵兌換":page==="history"?"歷史紀錄":"通知"}
            </div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <button onClick={() => { setPage("notif"); markAllRead(); }} style={{
              position:"relative", background:"none", border:"none",
              cursor:"pointer", fontSize:20, padding:4,
            }}>
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position:"absolute", top:0, right:0,
                  background:"#FF8B72", color:"white", borderRadius:"50%",
                  width:16, height:16, fontSize:9, fontWeight:700,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>{unreadCount}</span>
              )}
            </button>
            <div style={{
              background:"linear-gradient(135deg,#F4C842,#F4A842)",
              borderRadius:14, padding:"6px 14px", textAlign:"center",
            }}>
              <div style={{ fontSize:20, fontWeight:800, color:"#1A1B2E", lineHeight:1 }}>{roomData.points}</div>
              <div style={{ fontSize:9, color:"#1A1B2E99", letterSpacing:1 }}>積分</div>
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div style={{
          display:"inline-flex", alignItems:"center", gap:6, marginTop:10,
          background: isDoer ? "#1E2A3A" : "#2A1E3A",
          border:`1px solid ${isDoer ? "#F4C84240" : "#FF8B7240"}`,
          borderRadius:20, padding:"4px 12px",
        }}>
          <span style={{ fontSize:13 }}>{isDoer ? "🙋" : "🎁"}</span>
          <span style={{ fontSize:12, fontWeight:600, color: isDoer ? "#F4C842" : "#FF8B72" }}>
            {isDoer ? "任務執行者" : "獎勵發放者"}
          </span>
          <span style={{ fontSize:10, color:"#555577", marginLeft:4 }}>#{session.roomCode}</span>
        </div>

        {page === "tasks" && (
          <div style={{ marginTop:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#8889B0", marginBottom:5 }}>
              <span>今日進度</span><span>{completedCount} / {roomData.tasks.length}</span>
            </div>
            <div style={{ background:"#2D2E4A", borderRadius:6, height:6, overflow:"hidden" }}>
              <div style={{
                height:"100%", borderRadius:6, transition:"width .5s ease",
                width: roomData.tasks.length ? `${(completedCount/roomData.tasks.length)*100}%` : "0%",
                background:"linear-gradient(90deg,#F4C842,#FF8B72)",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex:1, padding:"16px 20px 100px", overflowY:"auto" }}>

        {/* TASKS */}
        {page === "tasks" && (<>
          {roomData.tasks.length === 0 && (
            <div style={{ textAlign:"center", color:"#555577", marginTop:40 }}>
              <div style={{ fontSize:36 }}>📋</div>
              <div style={{ marginTop:8 }}>還沒有任務，在下方新增吧！</div>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {roomData.tasks.map(task => (
              editingTaskId === task.id ? (
                <div key={task.id} style={{
                  background:"#222340", border:"1px solid #F4C84260",
                  borderRadius:14, padding:14,
                }}>
                  <input value={editTaskText} onChange={e => setEditTaskText(e.target.value)}
                    onKeyDown={e => e.key==="Enter" && saveEditTask()}
                    style={inputStyle} />
                  <div style={{ display:"flex", gap:8, marginTop:8 }}>
                    <select value={editTaskPoints} onChange={e => setEditTaskPoints(Number(e.target.value))}
                      style={{ background:"#1A1B2E", border:"1px solid #2D2E4A", color:"#F4C842", borderRadius:8, padding:"6px 10px", fontSize:12 }}>
                      {[5,10,15,20,30,50].map(v => <option key={v} value={v}>{v} 積分</option>)}
                    </select>
                    <button onClick={saveEditTask} style={{
                      flex:1, background:"#F4C842", color:"#1A1B2E",
                      border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer",
                    }}>儲存</button>
                    <button onClick={cancelEditTask} style={{
                      background:"#2D2E4A", color:"#8889B0",
                      border:"none", borderRadius:8, padding:"0 14px", fontSize:13, cursor:"pointer",
                    }}>取消</button>
                  </div>
                </div>
              ) : (
                <div key={task.id} onClick={() => toggleTask(task.id)} style={{
                  display:"flex", alignItems:"center", gap:12,
                  background: task.done ? "#1E2A1E" : "#222340",
                  border:`1px solid ${task.done ? "#2E4A2E" : "#2D2E4A"}`,
                  borderRadius:14, padding:"14px 16px",
                  cursor: isDoer ? "pointer" : "default",
                  transition:"all .2s", opacity: task.done ? 0.72 : 1,
                }}>
                  <div style={{
                    width:22, height:22, borderRadius:6, flexShrink:0,
                    border:`2px solid ${task.done ? "#4CAF50" : "#444566"}`,
                    background: task.done ? "#4CAF50" : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center",
                  }}>
                    {task.done && <span style={{ color:"white", fontSize:13 }}>✓</span>}
                  </div>
                  <span style={{
                    flex:1, fontSize:14, fontWeight:500,
                    textDecoration: task.done ? "line-through" : "none",
                    color: task.done ? "#8889B0" : "#E8E9F3",
                  }}>{task.text}</span>
                  <span style={{
                    fontSize:12, fontWeight:700, padding:"3px 8px", borderRadius:8,
                    color:      task.done ? "#4CAF50" : "#F4C842",
                    background: task.done ? "#4CAF5018" : "#F4C84215",
                  }}>+{task.points}</span>
                  <button onClick={(e) => { e.stopPropagation(); startEditTask(task); }} style={{
                    background:"none", border:"none", color:"#8889B0",
                    fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                  }}>✏️</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} style={{
                    background:"none", border:"none", color:"#8889B0",
                    fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                  }}>🗑️</button>
                </div>
              )
            ))}
          </div>
          <div style={{ marginTop:20, background:"#222340", border:"1px dashed #444566", borderRadius:14, padding:14 }}>
            <div style={{ fontSize:12, color:"#8889B0", marginBottom:8 }}>新增任務</div>
            <input value={newTask} onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addTask()}
              placeholder="輸入任務內容…" style={inputStyle} />
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <select value={newTaskPts} onChange={e => setNewTaskPts(Number(e.target.value))}
                style={{ background:"#1A1B2E", border:"1px solid #2D2E4A", color:"#F4C842", borderRadius:8, padding:"6px 10px", fontSize:12 }}>
                {[5,10,15,20,30,50].map(v => <option key={v} value={v}>{v} 積分</option>)}
              </select>
              <button onClick={addTask} style={{
                flex:1, background:"#F4C842", color:"#1A1B2E",
                border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer",
              }}>＋ 加入</button>
            </div>
          </div>
        </>)}

        {/* REWARDS */}
        {page === "rewards" && (<>
          {roomData.rewards.length === 0 && (
            <div style={{ textAlign:"center", color:"#555577", marginTop:40 }}>
              <div style={{ fontSize:36 }}>🎁</div>
              <div style={{ marginTop:8 }}>還沒有獎勵，等待發放者新增！</div>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {roomData.rewards.map(reward => {
              const canAfford = roomData.points >= reward.cost;
              if (editingRewardId === reward.id) {
                return (
                  <div key={reward.id} style={{
                    background:"#222340", border:"1px solid #FF8B7260",
                    borderRadius:14, padding:14,
                  }}>
                    <input value={editRewardText} onChange={e => setEditRewardText(e.target.value)}
                      onKeyDown={e => e.key==="Enter" && saveEditReward()}
                      style={inputStyle} />
                    <div style={{ display:"flex", gap:8, marginTop:8 }}>
                      <select value={editRewardCost} onChange={e => setEditRewardCost(Number(e.target.value))}
                        style={{ background:"#1A1B2E", border:"1px solid #2D2E4A", color:"#FF8B72", borderRadius:8, padding:"6px 10px", fontSize:12 }}>
                        {[10,15,20,30,40,50,60,80,100].map(v => <option key={v} value={v}>{v} 積分</option>)}
                      </select>
                      <button onClick={saveEditReward} style={{
                        flex:1, background:"#FF8B72", color:"white",
                        border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer",
                      }}>儲存</button>
                      <button onClick={cancelEditReward} style={{
                        background:"#2D2E4A", color:"#8889B0",
                        border:"none", borderRadius:8, padding:"0 14px", fontSize:13, cursor:"pointer",
                      }}>取消</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={reward.id} style={{
                  background: reward.claimed ? "#1E1E2E" : "#222340",
                  border:`1px solid ${reward.claimed ? "#2D2E4A" : canAfford ? "#FF8B7240" : "#2D2E4A"}`,
                  borderRadius:14, padding:"14px 16px",
                  opacity: reward.claimed ? 0.5 : 1,
                  display:"flex", alignItems:"center", gap:12,
                }}>
                  <div style={{ flex:1 }}>
                    <div style={{
                      fontSize:14, fontWeight:500,
                      textDecoration: reward.claimed ? "line-through" : "none",
                      color: reward.claimed ? "#8889B0" : "#E8E9F3",
                    }}>{reward.text}</div>
                    <div style={{ fontSize:11, color:"#FF8B72", marginTop:3 }}>
                      {reward.claimed ? "已兌換" : `需要 ${reward.cost} 積分`}
                    </div>
                  </div>
                  {!reward.claimed && (
                    <button onClick={() => claimReward(reward.id)} style={{
                      background: (!isDoer && canAfford) ? "linear-gradient(135deg,#FF8B72,#FF6B52)" : "#2D2E4A",
                      color: (!isDoer && canAfford) ? "white" : "#555577",
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
                        background:"none", border:"none", color:"#8889B0",
                        fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                      }}>✏️</button>
                      <button onClick={() => deleteReward(reward.id)} style={{
                        background:"none", border:"none", color:"#8889B0",
                        fontSize:14, cursor:"pointer", padding:2, lineHeight:1,
                      }}>🗑️</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:20, background:"#222340", border:"1px dashed #444566", borderRadius:14, padding:14 }}>
            <div style={{ fontSize:12, color:"#8889B0", marginBottom:8 }}>新增獎勵（發放者專用）</div>
            <input value={newReward} onChange={e => setNewReward(e.target.value)}
              onKeyDown={e => e.key==="Enter" && addReward()}
              placeholder="輸入獎勵內容…" style={inputStyle} />
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <select value={newRewardCost} onChange={e => setNewRewardCost(Number(e.target.value))}
                style={{ background:"#1A1B2E", border:"1px solid #2D2E4A", color:"#FF8B72", borderRadius:8, padding:"6px 10px", fontSize:12 }}>
                {[10,15,20,30,40,50,60,80,100].map(v => <option key={v} value={v}>{v} 積分</option>)}
              </select>
              <button onClick={addReward} disabled={isDoer} style={{
                flex:1, background: isDoer ? "#2D2E4A" : "#FF8B72",
                color: isDoer ? "#555577" : "white",
                border:"none", borderRadius:8, fontSize:13, fontWeight:700,
                cursor: isDoer ? "not-allowed" : "pointer",
              }}>＋ 加入</button>
            </div>
            {isDoer && <div style={{ fontSize:11, color:"#555577", marginTop:6 }}>只有獎勵發放者可以新增獎勵</div>}
          </div>
        </>)}

        {/* HISTORY */}
        {page === "history" && (<>
          {historyDates.length === 0 && (
            <div style={{ textAlign:"center", color:"#555577", marginTop:40 }}>
              <div style={{ fontSize:36 }}>📅</div>
              <div style={{ marginTop:8 }}>還沒有歷史紀錄</div>
              <div style={{ fontSize:12, marginTop:4 }}>每天過了午夜後自動記錄</div>
            </div>
          )}
          {historyDate ? (() => {
            const h = roomData.history[historyDate];
            return (
              <div>
                <button onClick={() => setHistoryDate(null)} style={{
                  background:"none", border:"none", color:"#8889B0",
                  fontSize:13, cursor:"pointer", marginBottom:12, padding:0,
                }}>← 返回</button>
                <div style={{ fontSize:16, fontWeight:700 }}>{fmtDate(historyDate)}</div>
                <div style={{ fontSize:12, color:"#8889B0", marginBottom:16, marginTop:2 }}>
                  完成 {h.completedCount}/{h.totalCount}・剩餘 {h.points} 積分
                </div>
                {["tasks","rewards"].map(type => (
                  <div key={type}>
                    <div style={{ fontSize:12, color:"#8889B0", fontWeight:600, marginBottom:8 }}>
                      {type==="tasks"?"任務":"獎勵"}
                    </div>
                    {(type==="tasks" ? h.tasks : h.rewards).map(item => (
                      <div key={item.id} style={{
                        display:"flex", alignItems:"center", gap:10,
                        padding:"10px 14px", background:"#222340",
                        borderRadius:10, marginBottom:8,
                        opacity:(item.done||item.claimed)?1:0.45,
                      }}>
                        <span>{(item.done||item.claimed)?(type==="tasks"?"✅":"🎁"):"⬜"}</span>
                        <span style={{ flex:1, fontSize:13 }}>{item.text}</span>
                        <span style={{ fontSize:11, color:type==="tasks"?"#F4C842":"#FF8B72" }}>
                          {type==="tasks"?`+${item.points}`:`${item.cost} 分`}
                        </span>
                      </div>
                    ))}
                    <div style={{ marginBottom:16 }} />
                  </div>
                ))}
              </div>
            );
          })() : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {historyDates.map(date => {
                const h   = roomData.history[date];
                const pct = h.totalCount ? Math.round((h.completedCount/h.totalCount)*100) : 0;
                return (
                  <div key={date} onClick={() => setHistoryDate(date)} style={{
                    background:"#222340", border:"1px solid #2D2E4A",
                    borderRadius:14, padding:"14px 16px", cursor:"pointer",
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600 }}>{fmtDate(date)}</div>
                        <div style={{ fontSize:11, color:"#8889B0", marginTop:2 }}>
                          {h.completedCount}/{h.totalCount} 任務完成
                        </div>
                      </div>
                      <div style={{
                        fontSize:20, fontWeight:800,
                        color: pct===100?"#4CAF50":pct>=50?"#F4C842":"#FF8B72",
                      }}>{pct}%</div>
                    </div>
                    <div style={{ background:"#2D2E4A", borderRadius:4, height:4, marginTop:10, overflow:"hidden" }}>
                      <div style={{
                        width:`${pct}%`, height:"100%", borderRadius:4,
                        background: pct===100?"#4CAF50":"linear-gradient(90deg,#F4C842,#FF8B72)",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}

        {/* NOTIFICATIONS */}
        {page === "notif" && (<>
          {(roomData.notifications||[]).length === 0 && (
            <div style={{ textAlign:"center", color:"#555577", marginTop:40 }}>
              <div style={{ fontSize:36 }}>🔔</div>
              <div style={{ marginTop:8 }}>目前沒有通知</div>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[...(roomData.notifications||[])].reverse().map(n => (
              <div key={n.id} style={{
                background: n.read ? "#1E1E2E" : "#222340",
                border:`1px solid ${n.read ? "#2D2E4A" : "#444566"}`,
                borderRadius:12, padding:"12px 14px",
              }}>
                <div style={{ fontSize:13 }}>{n.msg}</div>
                <div style={{ fontSize:10, color:"#555577", marginTop:4 }}>
                  {new Date(n.time).toLocaleString("zh-TW")}
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430,
        background:"#13142299", backdropFilter:"blur(20px)",
        borderTop:"1px solid #2D2E4A",
        display:"flex", padding:"10px 8px 20px", gap:4,
      }}>
        {[["tasks","☑️","任務"],["rewards","🎁","獎勵"],["history","📅","歷史"],["notif","🔔","通知"]].map(([key,icon,label]) => (
          <button key={key} onClick={() => { setPage(key); if(key==="notif") markAllRead(); }} style={{
            flex:1, display:"flex", flexDirection:"column", alignItems:"center",
            gap:3, padding:"8px 0", border:"none",
            background: page===key ? "#2D2E4A" : "transparent",
            borderRadius:12, cursor:"pointer", position:"relative",
          }}>
            <span style={{ fontSize:18 }}>{icon}</span>
            {key==="notif" && unreadCount>0 && (
              <span style={{
                position:"absolute", top:4, right:"calc(50% - 18px)",
                background:"#FF8B72", color:"white", borderRadius:"50%",
                width:14, height:14, fontSize:9, fontWeight:700,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>{unreadCount}</span>
            )}
            <span style={{ fontSize:10, fontWeight:600, color: page===key ? "#F4C842" : "#8889B0" }}>
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
             }
