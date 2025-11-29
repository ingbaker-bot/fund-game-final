import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react'; 
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ComposedChart } from 'recharts';
import { 
  Trophy, Users, Play, Pause, FastForward, RotateCcw, 
  Crown, Activity, Monitor, TrendingUp, MousePointer2, Zap 
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
  
  // 起始日維持 400
  const [currentDay, setCurrentDay] = useState(400);
  
  const [selectedFundId, setSelectedFundId] = useState(FUNDS_LIBRARY[0]?.id || 'fund_A');
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(null);
  const [indicators, setIndicators] = useState({ ma20: false, ma60: false, river: false });
  const [fullData, setFullData] = useState([]);
  const [fundName, setFundName] = useState('');

  const roomIdRef = useRef(null);
  const autoPlayRef = useRef(null);

  // 1. 初始化
  useEffect(() => {
    const initRoom = async () => {
      const newRoomId = Math.floor(1000 + Math.random() * 9000).toString();
      roomIdRef.current = newRoomId;
      setRoomId(newRoomId);
      const randomTimeOffset = Math.floor(Math.random() * 50) + 10;
      
      try {
        await setDoc(doc(db, "battle_rooms", newRoomId), {
          status: 'waiting',
          currentDay: 400,
          fundId: selectedFundId,
          timeOffset: randomTimeOffset,
          indicators: { ma20: false, ma60: false, river: false },
          createdAt: serverTimestamp()
        });
        setGameStatus('waiting');
      } catch (error) {
        console.error("開房失敗:", error);
      }
    };
    initRoom();
    return () => clearInterval(autoPlayRef.current);
  }, []);

  // 2. 監聽玩家
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

  // 3. 載入數據
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

  // --- 控制邏輯 ---
  const handleStartGame = async () => {
    if (!roomId) return;
    await updateDoc(doc(db, "battle_rooms", roomId), { status: 'playing', fundId: selectedFundId });
    setGameStatus('playing');
  };

  const handleNextDay = async () => {
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
    setCurrentDay(400); // 重置為 400
    setIndicators({ ma20: false, ma60: false, river: false });
    clearInterval(autoPlayRef.current);
    setAutoPlaySpeed(null);

    await updateDoc(doc(db, "battle_rooms", roomId), { status: 'waiting', currentDay: 400, indicators: { ma20: false, ma60: false, river: false } });
    const snapshot = await getDocs(collection(db, "battle_rooms", roomId, "players"));
    snapshot.forEach(async (d) => await deleteDoc(doc(db, "battle_rooms", roomId, "players", d.id)));
  };

  const chartData = useMemo(() => {
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

  const topPlayers = players.slice(0, 10);
  const remainingCount = Math.max(0, players.length - 10);
  const joinUrl = `${window.location.origin}/battle?room=${roomId}`;

  return (
    <div className="h-screen bg-slate-50 text-slate-800 font-sans flex flex-col overflow-hidden">
      <header className="bg-white border-b border-slate-200 p-3 flex justify-between items-center shadow-sm z-20 shrink-0 h-16">
        <div className="flex items-center gap-3">
            <div className="bg-emerald-500 p-1.5 rounded"><Monitor size={24} className="text-white"/></div>
            <div><h1 className="text-lg font-bold tracking-wider text-slate-800">FUND BATTLE <span className="text-emerald-500 text-xs">LIVE</span></h1><p className="text-[10px] text-slate-400">Spectator View</p></div>
        </div>
        <div className="flex items-center gap-6">
            <div className="text-center"><span className="block text-[10px] text-slate-400 uppercase">Room ID</span><span className="text-2xl font-mono font-bold text-slate-800 tracking-widest">{roomId || '...'}</span></div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="text-center"><span className="block text-[10px] text-slate-400 uppercase">Day</span><span className="text-2xl font-mono font-bold text-amber-500">{currentDay}</span></div>
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
                             <button onClick={handleStartGame} disabled={players.length === 0} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-lg text-lg transition-all shadow-md flex items-center justify-center gap-2">
                                 <Play fill="currentColor"/> 開始比賽 ({players.length}人)
                             </button>
                         </div>
                     </div>
                     <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">{roomId && <QRCodeSVG value={joinUrl} size={350} />}</div>
                 </div>
                 <div className="absolute bottom-0 w-full bg-white py-3 overflow-hidden border-t border-slate-200">
                     <div className="flex justify-center gap-8 text-slate-400 font-mono">
                         {players.length === 0 ? "等待挑戰者連線..." : players.map(p => <span key={p.id} className="text-emerald-600 font-bold animate-pulse">★ {p.nickname}</span>)}
                     </div>
                 </div>
             </div>
        )}

        {(gameStatus === 'playing' || gameStatus === 'ended') && (
            <>
                <div className="w-2/3 h-full bg-white border-r border-slate-200 flex flex-col p-4 relative">
                    <div className="absolute top-6 left-6 z-10">
                        <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="text-emerald-500"/> {fundName}</h3>
                        <p className="text-slate-400 text-sm font-mono">LIVE MARKET DATA</p>
                    </div>
                    <div className="flex-1 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.8} />
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
                <div className="w-1/3 h-full bg-slate-50 flex flex-col border-l border-slate-200">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Trophy size={20} className="text-amber-500"/> 菁英榜 TOP 10</h2>
                        <div className="text-xs text-slate-400 mt-1 flex justify-between"><span>總參賽: {players.length} 人</span><span>即時戰況</span></div>
                    </div>
                    <div className="flex-1 overflow-hidden relative">
                        <div className="absolute inset-0 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                            {topPlayers.map((p, idx) => (
                                <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border transition-all duration-300 ${idx===0?'bg-amber-50 border-amber-200':idx===1?'bg-slate-200 border-slate-300':idx===2?'bg-orange-50 border-orange-200':'bg-white border-slate-200'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm ${idx===0?'bg-amber-400 text-white':idx===1?'bg-slate-400 text-white':idx===2?'bg-orange-600 text-white':'bg-slate-100 text-slate-500'}`}>{idx + 1}</div>
                                        <div className="flex flex-col"><span className="text-slate-800 font-bold text-sm truncate max-w-[120px]">{p.nickname}</span>{idx===0 && <span className="text-[10px] text-amber-500 flex items-center gap-1"><Crown size={10}/> 目前領先</span>}</div>
                                    </div>
                                    <div className={`font-mono font-bold text-lg ${(p.roi || 0)>=0?'text-red-500':'text-green-500'}`}>{(p.roi || 0)>0?'+':''}{(p.roi || 0).toFixed(1)}%</div>
                                </div>
                            ))}
                            {remainingCount > 0 && <div className="text-center py-4 text-slate-400 text-sm border-t border-slate-200 mt-2 border-dashed">... 還有 {remainingCount} 位挑戰者 ...</div>}
                        </div>
                    </div>
                </div>
            </>
        )}
      </main>

      {gameStatus === 'playing' && (
          <footer className="bg-white border-t border-slate-200 p-3 flex justify-between items-center z-30 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2"><Activity className="text-emerald-500 animate-pulse"/><span className="text-emerald-600 font-bold text-sm uppercase">連線中 ({players.length})</span></div>
                  <div className="h-6 w-px bg-slate-300"></div>
                  <button onClick={handleNextDay} className="px-3 py-2 bg-slate-800 text-white hover:bg-slate-700 rounded-lg font-bold text-xs flex items-center gap-1 active:scale-95 shadow-md">
                      <MousePointer2 size={14} /> 下一天
                  </button>
                  <div className="h-6 w-px bg-slate-300"></div>
                  <div className="flex gap-1">
                      <button onClick={() => toggleIndicator('ma20')} className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${indicators.ma20 ? 'bg-sky-50 border-sky-200 text-sky-600' : 'bg-white border-slate-300 text-slate-400'}`}>月線</button>
                      <button onClick={() => toggleIndicator('ma60')} className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${indicators.ma60 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-300 text-slate-400'}`}>季線</button>
                      <button onClick={() => toggleIndicator('river')} className={`px-2 py-1.5 rounded text-[10px] font-bold border transition-colors ${indicators.river ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-300 text-slate-400'}`}>河流</button>
                  </div>
              </div>

              {/* ★★★ 修正：完整播放速度 5,4,3,2,1 + 極速 ★★★ */}
              <div className="flex gap-1">
                  {[5, 4, 3, 2, 1].map(sec => (
                      <button key={sec} onClick={() => toggleAutoPlay(sec * 1000)} className={`px-2 py-2 rounded font-bold text-xs flex gap-1 ${autoPlaySpeed===sec*1000 ? 'bg-emerald-500 text-white shadow-md':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          {autoPlaySpeed===sec*1000?<Pause size={12}/>:<Play size={12}/>} {sec}s
                      </button>
                  ))}
                  <button onClick={() => toggleAutoPlay(200)} className={`px-2 py-2 rounded font-bold text-xs flex gap-1 ${autoPlaySpeed===200 ? 'bg-purple-600 text-white shadow-md':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {autoPlaySpeed===200?<Pause size={12}/>:<Zap size={12}/>} 極速
                  </button>
              </div>
              <button onClick={handleEndGame} className="px-3 py-2 bg-white border border-red-200 text-red-500 rounded text-xs hover:bg-red-50 font-bold ml-2">End</button>
          </footer>
      )}

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
                  <button onClick={handleResetRoom} className="mt-4 px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center gap-2 mx-auto relative z-10 shadow-lg"><RotateCcw size={20}/> 開啟新局</button>
              </div>
          </div>
      )}
    </div>
  );
}