// 2025v5.5
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react'; 
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ComposedChart } from 'recharts';
import { 
  Trophy, Users, Play, Pause, FastForward, RotateCcw, 
  Crown, Activity, Monitor, TrendingUp, MousePointer2, Zap, DollarSign, QrCode, X, TrendingDown, Calendar, Hand, Clock, Lock, AlertTriangle, Radio
} from 'lucide-react';

import { db } from './config/firebase'; 
import { 
  doc, setDoc, onSnapshot, updateDoc, collection, 
  serverTimestamp, increment, deleteDoc, getDocs 
} from 'firebase/firestore';

import { FUNDS_LIBRARY } from './config/funds';

const processRealData = (rawData) => {
    if (!rawData || !Array.isArray(rawData)) return [];
    return rawData.map((item, index) => ({ id: index, date: item.date, nav: parseFloat(item.nav) }));
};

const calculateIndicators = (data, days, currentIndex) => {
  if (!data || currentIndex < days) return { ma: null, stdDev: null };
  let sum = 0;
  const values = [];
  for (let i = 0; i < days; i++) { 
      const val = data[currentIndex - i]?.nav;
      if (val && !isNaN(val)) { sum += val; values.push(val); }
  }
  const ma = sum / days;
  return { ma: parseFloat(ma.toFixed(2)) };
};

export default function SpectatorView() {
  const [roomId, setRoomId] = useState(null);
  const [gameStatus, setGameStatus] = useState('initializing'); 
  const [players, setPlayers] = useState([]);
  
  const [currentDay, setCurrentDay] = useState(400);
  const [startDay, setStartDay] = useState(400); 
  const [timeOffset, setTimeOffset] = useState(0); 

  const [selectedFundId, setSelectedFundId] = useState(FUNDS_LIBRARY[0]?.id || 'fund_A');
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(null);
  const [indicators, setIndicators] = useState({ ma20: false, ma60: false, river: false });
  const [fullData, setFullData] = useState([]);
  const [fundName, setFundName] = useState('');
  
  const [showQrModal, setShowQrModal] = useState(false);
  
  // 交易請求相關狀態
  const [tradeRequests, setTradeRequests] = useState([]);
  const [countdown, setCountdown] = useState(30); 

  const roomIdRef = useRef(null);
  const autoPlayRef = useRef(null);

  // 初始化
  useEffect(() => {
    const initRoom = async () => {
      const newRoomId = Math.floor(1000 + Math.random() * 9000).toString();
      roomIdRef.current = newRoomId;
      setRoomId(newRoomId);
      const randomTimeOffset = Math.floor(Math.random() * 50) + 10;
      setTimeOffset(randomTimeOffset);
      
      try {
        await setDoc(doc(db, "battle_rooms", newRoomId), {
          status: 'waiting',
          currentDay: 400,
          startDay: 400,
          fundId: selectedFundId,
          timeOffset: randomTimeOffset,
          indicators: { ma20: false, ma60: false, river: false },
          createdAt: serverTimestamp()
        });
        setGameStatus('waiting');
      } catch (error) { console.error("開房失敗:", error); }
    };
    initRoom();
    return () => clearInterval(autoPlayRef.current);
  }, []);

  // 監聽玩家
  useEffect(() => {
    if (!roomId) return;
    const unsubscribe = onSnapshot(collection(db, "battle_rooms", roomId, "players"), (snapshot) => {
      const livePlayers = [];
      snapshot.forEach((doc) => livePlayers.push({ id: doc.id, ...doc.data() }));
      livePlayers.sort((a, b) => (b.roi || 0) - (a.roi || 0));
      setPlayers(livePlayers);
    });
    return () => unsubscribe();
  }, [roomId]);

  // 監聽交易請求
  useEffect(() => {
      if (!roomId) return;
      const unsubscribe = onSnapshot(collection(db, "battle_rooms", roomId, "requests"), (snapshot) => {
          const reqs = [];
          snapshot.forEach(doc => reqs.push(doc.data()));
          
          if (reqs.length > 0) {
              console.log("🔥 收到交易請求:", reqs);
          } 

          setTradeRequests(reqs);

          if (reqs.length > 0) {
              if (autoPlayRef.current) {
                  clearInterval(autoPlayRef.current);
                  autoPlayRef.current = null;
              }
              setAutoPlaySpeed(null); 
          }
      }, (error) => {
          console.error("❌ 監聽請求失敗:", error);
      });
      return () => unsubscribe();
  }, [roomId]);

  // 交易倒數計時器
  useEffect(() => {
      let timer;
      if (tradeRequests.length > 0 && countdown > 0) {
          timer = setInterval(() => {
              setCountdown((prev) => prev - 1);
          }, 1000);
      } else if (tradeRequests.length === 0) {
          setCountdown(30); 
      }
      return () => clearInterval(timer);
  }, [tradeRequests.length, countdown]);

  // 載入數據
  useEffect(() => {
      const loadData = async () => {
          const targetFund = FUNDS_LIBRARY.find(f => f.id === selectedFundId);
          if (!targetFund) return;
          setFundName(targetFund.name);
          try {
              const res = await fetch(targetFund.file);
              setFullData(processRealData(await res.json()));
          } catch (err) { console.error(err); }
      };
      loadData();
  }, [selectedFundId]);

  const handleStartGame = async () => {
    if (!roomId || fullData.length === 0) return;
    const minBuffer = 100;
    const requiredFuture = 250 * 5; 
    const maxStart = Math.max(minBuffer, fullData.length - requiredFuture);
    const randomStartDay = Math.floor(Math.random() * (maxStart - minBuffer)) + minBuffer;
    const randomOffset = Math.floor(Math.random() * 50) + 10;

    setCurrentDay(randomStartDay);
    setStartDay(randomStartDay);
    setTimeOffset(randomOffset);

    await updateDoc(doc(db, "battle_rooms", roomId), { 
        status: 'playing', 
        fundId: selectedFundId,
        currentDay: randomStartDay, 
        startDay: randomStartDay,   
        timeOffset: randomOffset
    });
    setGameStatus('playing');
  };

  const handleNextDay = async () => {
    if (tradeRequests.length > 0) return; 
    if (!roomId) return;
    await updateDoc(doc(db, "battle_rooms", roomId), { currentDay: increment(1) });
    setCurrentDay(prev => prev + 1);
  };

  const toggleIndicator = async (key) => {
      const newIndicators = { ...indicators, [key]: !indicators[key] };
      setIndicators(newIndicators); 
      if (roomId) await updateDoc(doc(db, "battle_rooms", roomId), { indicators: newIndicators }); 
  };

  const toggleAutoPlay = (speed) => {
    if (tradeRequests.length > 0) return;

    if (autoPlaySpeed === speed) {
      clearInterval(autoPlayRef.current);
      setAutoPlaySpeed(null);
    } else {
      clearInterval(autoPlayRef.current);
      setAutoPlaySpeed(speed);
      autoPlayRef.current = setInterval(async () => {
        if (roomIdRef.current) {
           await updateDoc(doc(db, "battle_rooms", roomIdRef.current), { currentDay: increment(1) });
           setCurrentDay(prev => prev + 1);
        }
      }, speed);
    }
  };

  const handleEndGame = async () => {
    clearInterval(autoPlayRef.current);
    setAutoPlaySpeed(null);
    if (roomId) await updateDoc(doc(db, "battle_rooms", roomId), { status: 'ended' });
    setGameStatus('ended');
  };

  const handleResetRoom = async () => {
    if (!roomId || !window.confirm("確定重置？")) return;
    setGameStatus('waiting');
    setCurrentDay(400); 
    setIndicators({ ma20: false, ma60: false, river: false });
    clearInterval(autoPlayRef.current);
    setAutoPlaySpeed(null);
    setTradeRequests([]); 
    setCountdown(30);

    await updateDoc(doc(db, "battle_rooms", roomId), { status: 'waiting', currentDay: 400, indicators: { ma20: false, ma60: false, river: false } });
    const snapshot = await getDocs(collection(db, "battle_rooms", roomId, "players"));
    snapshot.forEach(async (d) => await deleteDoc(doc(db, "battle_rooms", roomId, "players", d.id)));
    const reqSnap = await getDocs(collection(db, "battle_rooms", roomId, "requests"));
    reqSnap.forEach(async (d) => await deleteDoc(d.ref));
  };

  const handleForceClearRequests = async () => {
      if (!roomId) return;
      const reqSnap = await getDocs(collection(db, "battle_rooms", roomId, "requests"));
      reqSnap.forEach(async (d) => await deleteDoc(d.ref));
      setTradeRequests([]);
      setCountdown(30);
  };

  const getDisplayDate = (dateStr) => {
      if (!dateStr) return 'Loading...';
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) return dateStr;
      const newYear = dateObj.getFullYear() + timeOffset;
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${newYear}-${month}-${day}`;
  };

  const chartData = useMemo(() => {
      // ★★★ 修正確認：這裡嚴格設定為 330 天，與玩家端一致 ★★★
      const start = Math.max(0, currentDay - 330);
      const end = currentDay + 1;
      const slice = fullData.slice(start, end);
      return slice.map((d, idx) => {
          const realIdx = start + idx;
          const ind20 = calculateIndicators(fullData, 20, realIdx);
          const ind60 = calculateIndicators(fullData, 60, realIdx);
          let riverTop = null; let riverBottom = null;
          if (ind60.ma) { riverTop = ind60.ma * 1.1; riverBottom = ind60.ma * 0.9; }
          return { ...d, ma20: ind20.ma, ma60: ind60.ma, riverTop, riverBottom };
      });
  }, [fullData, currentDay]);

  const { totalInvestedAmount, positionRatio } = useMemo(() => {
      let totalAssets = 0;
      let invested = 0;
      players.forEach(p => {
          const pAssets = p.assets || 1000000;
          totalAssets += pAssets;
          const pUnits = p.units || 0;
          const currentNav = fullData[currentDay]?.nav || 0;
          invested += (pUnits * currentNav);
      });
      const ratio = totalAssets > 0 ? (invested / totalAssets) * 100 : 0;
      return { totalInvestedAmount: invested, positionRatio: ratio };
  }, [players, fullData, currentDay]);

  const topPlayers = players.slice(0, 10);
  const bottomPlayers = players.length > 13 ? players.slice(-3).reverse() : []; 
  const remainingCount = Math.max(0, players.length - 10 - bottomPlayers.length);
  const joinUrl = `${window.location.origin}/battle?room=${roomId}`;
  const currentNav = fullData[currentDay]?.nav || 0;
  const currentDisplayDate = fullData[currentDay] ? getDisplayDate(fullData[currentDay].date) : "---";
  const hasRequests = tradeRequests && tradeRequests.length > 0;

  return (
    <div className="h-screen bg-slate-50 text-slate-800 font-sans flex flex-col overflow-hidden relative">
      
      {/* Header (保持不變) */}
      <header className="bg-white border-b border-slate-200 p-3 flex justify-between items-center shadow-sm z-20 shrink-0 h-16">
        <div className="flex items-center gap-3 w-1/4">
            <img src="/logo.jpg" alt="Logo" className="h-10 object-contain rounded-sm" />
            <div className="hidden xl:block">
                <h1 className="text-lg font-bold tracking-wider text-slate-800">FUND BATTLE <span className="text-emerald-500 text-xs">LIVE</span></h1>
                <p className="text-[10px] text-slate-400">Spectator View (v5.5)</p>
            </div>
        </div>
        <div className="flex-1 flex justify-center items-center">
            {(gameStatus === 'playing' || gameStatus === 'ended') && (
                <div className="flex items-center gap-6 bg-slate-50 px-6 py-1 rounded-xl border border-slate-100 shadow-inner">
                    <div className="flex items-center gap-2"><span className="text-slate-500 font-bold text-sm">{fundName}</span></div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-xs text-amber-500 font-bold tracking-widest uppercase">{currentDisplayDate}</span>
                        <span className="text-3xl font-mono font-black text-slate-800 tracking-tight">${currentNav.toFixed(2)}</span>
                    </div>
                </div>
            )}
        </div>
        <div className="flex items-center gap-4 w-1/4 justify-end">
            {(gameStatus === 'playing' || gameStatus === 'ended') && (
                <div className="flex items-center gap-3 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg">
                     <div className="text-right">
                        <div className="text-[10px] text-slate-400 font-bold uppercase">買入總資金</div>
                        <div className="flex items-baseline gap-2 justify-end">
                            <span className="text-lg font-mono font-black text-slate-700 leading-none">${Math.round(totalInvestedAmount).toLocaleString()}</span>
                            <span className={`text-[10px] font-bold ${positionRatio >= 80 ? 'text-red-500' : 'text-slate-400'}`}>(水位 {positionRatio.toFixed(0)}%)</span>
                        </div>
                     </div>
                </div>
            )}
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                <div className="text-right"><span className="block text-[10px] text-slate-400 uppercase leading-none">Room ID</span><span className="text-xl font-mono font-bold text-slate-800 tracking-widest leading-none">{roomId || '...'}</span></div>
                <button onClick={() => setShowQrModal(true)} className="bg-white p-1.5 rounded-md border border-slate-300 hover:bg-slate-50 text-slate-600 transition-colors shadow-sm"><QrCode size={18}/></button>
            </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {gameStatus === 'waiting' && (
             <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 relative z-10">
                 <div className="flex gap-16 items-center">
                     <div className="text-left">
                         <h2 className="text-5xl font-bold text-slate-800 mb-4">加入戰局</h2>
                         <p className="text-slate-500 text-xl mb-8">拿出手機掃描，輸入暱稱即可參賽</p>
                         <div className="bg-white px-6 py-4 rounded-xl font-mono text-emerald-600 border border-slate-200 text-2xl inline-block mb-8 shadow-sm">{joinUrl}</div>
                         <div className="bg-white p-4 rounded-xl border border-slate-200 w-80 shadow-lg">
                             <label className="text-xs text-slate-400 block mb-2">本場戰役目標</label>
                             <select value={selectedFundId} onChange={(e) => setSelectedFundId(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded p-2 text-slate-800 mb-4 outline-none">
                                 {FUNDS_LIBRARY.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}
                             </select>
                             <button onClick={handleStartGame} disabled={players.length === 0} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-lg text-lg transition-all shadow-md flex items-center justify-center gap-2"><Play fill="currentColor"/> 開始比賽 ({players.length}人)</button>
                         </div>
                     </div>
                     <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">{roomId && <QRCodeSVG value={joinUrl} size={350} />}</div>
                 </div>
             </div>
        )}

        {(gameStatus === 'playing' || gameStatus === 'ended') && (
            <>
                <div className="w-2/3 h-full bg-white border-r border-slate-200 flex flex-col relative">
                    <div className="p-4 flex-1 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            {/* ★★★ 修正重點：調整 Margin 與 XAxis 設定，解決圖表壓縮問題 ★★★ */}
                            <ComposedChart data={chartData} margin={{ top: 10, right: 50, bottom: 0, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.8} />
                                {/* 雖然隱藏 X 軸，但保留 dataKey 確保映射正確 */}
                                <XAxis dataKey="date" hide />
                                <YAxis domain={['auto', 'auto']} orientation="right" tick={{fill:'#64748b', fontWeight:'bold'}} width={50} />
                                {indicators.river && <Line type="monotone" dataKey="riverTop" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.3} />}
                                {indicators.river && <Line type="monotone" dataKey="riverBottom" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.3} />}
                                {indicators.ma20 && <Line type="monotone" dataKey="ma20" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.9} />}
                                {indicators.ma60 && <Line type="monotone" dataKey="ma60" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.9} />}
                                <Line type="monotone" dataKey="nav" stroke="#000000" strokeWidth={2.5} dot={false} isAnimationActive={false} shadow="0 0 10px rgba(0, 0, 0, 0.1)" />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 右側玩家列表 (保持不變) */}
                <div className="w-1/3 h-full bg-slate-50 flex flex-col border-l border-slate-200">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Trophy size={20} className="text-amber-500"/> 菁英榜 TOP 10</h2>
                    </div>
                    <div className="flex-1 overflow-hidden relative flex flex-col">
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            {topPlayers.map((p, idx) => (
                                <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border transition-all duration-300 ${idx===0?'bg-amber-50 border-amber-200':idx===1?'bg-slate-200 border-slate-300':idx===2?'bg-orange-50 border-orange-200':'bg-white border-slate-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm ${idx===0?'bg-amber-400 text-white':idx===1?'bg-slate-400 text-white':idx===2?'bg-orange-600 text-white':'bg-slate-100 text-slate-500'}`}>{idx + 1}</div>
                                        <div className="flex flex-col"><span className="text-slate-800 font-bold text-sm truncate max-w-[120px]">{p.nickname}</span>{idx===0 && <span className="text-[10px] text-amber-500 flex items-center gap-1"><Crown size={10}/> 目前領先</span>}</div>
                                    </div>
                                    <div className={`font-mono font-bold text-lg ${(p.roi || 0)>=0?'text-red-500':'text-green-500'}`}>{(p.roi || 0)>0?'+':''}{(p.roi || 0).toFixed(1)}%</div>
                                </div>
                            ))}
                            {remainingCount > 0 && <div className="text-center py-2 text-slate-400 text-xs border-t border-slate-200 mt-1 border-dashed">... 中間還有 {remainingCount} 位 ...</div>}
                        </div>
                        {bottomPlayers.length > 0 && (
                            <div className="bg-slate-100 border-t border-slate-300 p-3 shrink-0">
                                <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-bold uppercase tracking-wider"><TrendingDown size={14}/> 逆風追趕中 (加油!)</div>
                                <div className="space-y-1">
                                    {bottomPlayers.map((p, idx) => (
                                        <div key={p.id} className="flex justify-between items-center p-2 bg-white/50 rounded border border-slate-200 text-xs opacity-70">
                                            <div className="flex items-center gap-2"><span className="text-slate-400 w-6 text-center">{players.length - idx}</span><span className="text-slate-700 font-bold truncate max-w-[80px]">{p.nickname}</span></div>
                                            <span className="font-mono text-green-600 font-bold">{(p.roi || 0).toFixed(1)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </>
        )}
      </main>

      {/* Footer (保持不變) */}
      {gameStatus === 'playing' && (
          <footer className="bg-white border-t border-slate-200 h-[72px] shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative flex items-center justify-center">
              <div className="absolute left-4 flex gap-1">
                  <button onClick={() => toggleIndicator('ma20')} className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${indicators.ma20 ? 'bg-sky-50 border-sky-200 text-sky-600' : 'bg-white border-slate-300 text-slate-400'}`}>月線</button>
                  <button onClick={() => toggleIndicator('ma60')} className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${indicators.ma60 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-300 text-slate-400'}`}>季線</button>
                  <button onClick={() => toggleIndicator('river')} className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${indicators.river ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-300 text-slate-400'}`}>河流</button>
              </div>
              <div className="absolute left-1/2 transform -translate-x-1/2 z-50 w-[400px] flex justify-center">
                 {hasRequests ? (
                     <div className="bg-yellow-400 text-slate-900 px-4 py-2 rounded-lg shadow-2xl flex items-center justify-between gap-4 w-full animate-in slide-in-from-bottom-2 duration-300 ring-4 ring-yellow-100">
                         <div className="flex items-center gap-3">
                             <div className="bg-white/30 p-1.5 rounded-full"><Clock size={18} className="animate-spin-slow"/></div>
                             <div className="flex flex-col leading-none">
                                 <div className="font-black text-sm flex items-center gap-2">市場暫停中 <span className="bg-black/10 px-1.5 rounded text-xs font-mono">{countdown}s</span></div>
                                 <div className="text-[10px] font-bold opacity-80 truncate max-w-[180px]">{tradeRequests.map(r => r.nickname).join(', ')}</div>
                             </div>
                         </div>
                         <button onClick={handleForceClearRequests} className="bg-slate-900 text-white px-3 py-1.5 rounded-md font-bold text-xs hover:bg-slate-700 shadow-sm whitespace-nowrap flex items-center gap-1"><FastForward size={12} fill="currentColor"/> 繼續</button>
                     </div>
                 ) : (
                     <div className="flex items-center gap-2 text-slate-600 text-sm font-bold border border-slate-200 bg-slate-100 px-6 py-2 rounded-full shadow-inner">
                         <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                         市場監控中...
                     </div>
                 )}
              </div>
              <div className="absolute right-4 flex gap-2 items-center">
                  <button onClick={handleNextDay} disabled={hasRequests} className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm transition-all border ${hasRequests ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700 active:scale-95'}`}>{hasRequests ? <Lock size={16}/> : <MousePointer2 size={16} />} 下一天</button>
                  <div className="h-8 w-px bg-slate-200 mx-1"></div>
                  <div className="flex gap-1">
                      {[5, 4, 3, 2, 1].map(sec => (
                          <button key={sec} onClick={() => toggleAutoPlay(sec * 1000)} disabled={hasRequests} className={`w-8 py-2 rounded font-bold text-xs flex justify-center transition-all ${hasRequests ? 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed' : (autoPlaySpeed===sec*1000 ? 'bg-emerald-500 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}`}>{sec}s</button>
                      ))}
                      <button onClick={() => toggleAutoPlay(200)} disabled={hasRequests} className={`px-2 py-2 rounded font-bold text-xs flex gap-1 transition-all ${hasRequests ? 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed' : (autoPlaySpeed===200 ? 'bg-purple-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}`}><Zap size={12}/> 極速</button>
                  </div>
                  <button onClick={handleEndGame} className="px-3 py-2 bg-white border border-red-200 text-red-500 rounded text-xs hover:bg-red-50 font-bold ml-2">End</button>
              </div>
          </footer>
      )}

      {/* 結算畫面與 QR Code Modal (略 - 保持不變) */}
      {gameStatus === 'ended' && (
          <div className="absolute inset-0 bg-slate-900/50 z-50 flex items-center justify-center backdrop-blur-sm">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center max-w-lg shadow-2xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-yellow-50/50 animate-pulse"></div>
                  <Crown size={80} className="text-amber-400 mx-auto mb-6 drop-shadow-sm relative z-10"/>
                  <h2 className="text-4xl font-bold text-slate-800 mb-2 relative z-10">WINNER</h2>
                  {players.length > 0 && (
                      <div className="py-8 relative z-10">
                          <div className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600 mb-4">{players[0].nickname}</div>
                          <div className={`text-3xl font-mono font-bold ${players[0].roi >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                              ROI: {players[0].roi > 0 ? '+' : ''}{players[0].roi.toFixed(2)}%
                          </div>
                      </div>
                  )}
                  {fullData.length > 0 && (
                      <div className="bg-slate-100 p-4 rounded-xl mb-6 relative z-10 border border-slate-200">
                          <div className="flex items-center justify-center gap-2 text-slate-500 font-bold mb-2 text-xs">
                              <Calendar size={14}/> 真實歷史區間
                          </div>
                          <div className="text-lg font-mono font-bold text-slate-700">
                              {fullData[startDay]?.date} <span className="text-slate-400">~</span> {fullData[currentDay]?.date}
                          </div>
                      </div>
                  )}
                  <button onClick={handleResetRoom} className="mt-2 px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center gap-2 mx-auto relative z-10 shadow-lg"><RotateCcw size={20}/> 開啟新局</button>
              </div>
          </div>
      )}

      {showQrModal && (
          <div className="absolute inset-0 bg-slate-900/80 z-[100] flex items-center justify-center backdrop-blur-sm">
              <div className="bg-white p-8 rounded-3xl border-2 border-slate-200 text-center shadow-2xl relative">
                  <button onClick={() => setShowQrModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  <h2 className="text-2xl font-bold text-slate-800 mb-4">掃描加入戰局</h2>
                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-inner inline-block">
                      <QRCodeSVG value={joinUrl} size={300} />
                  </div>
                  <div className="mt-6 text-xl font-mono font-bold text-slate-600 bg-slate-100 px-4 py-2 rounded-lg">
                      Room ID: {roomId}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}