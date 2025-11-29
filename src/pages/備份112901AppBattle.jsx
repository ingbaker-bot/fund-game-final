import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, YAxis, ResponsiveContainer, ComposedChart, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Trophy, Loader2, Zap, Database, Smartphone } from 'lucide-react';

import { db } from '../config/firebase'; 
import { doc, setDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { FUNDS_LIBRARY } from '../config/funds';

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

export default function AppBattle() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const urlRoomId = searchParams.get('room');

  // 讀取存檔
  const getSavedState = (key, defaultValue, type = 'number') => {
      const savedRoom = localStorage.getItem('battle_roomId');
      if (!urlRoomId || savedRoom === urlRoomId) {
          const savedValue = localStorage.getItem(key);
          if (savedValue !== null && savedValue !== undefined) {
              return type === 'number' ? parseFloat(savedValue) : savedValue;
          }
      }
      return defaultValue;
  };

  const [roomId, setRoomId] = useState(urlRoomId || '');
  const [inputRoomId, setInputRoomId] = useState('');
  
  const [status, setStatus] = useState(() => {
      const savedRoom = localStorage.getItem('battle_roomId');
      const savedNick = localStorage.getItem('battle_nickname');
      if (urlRoomId && savedRoom === urlRoomId && savedNick) return 'waiting';
      return urlRoomId ? 'login' : 'input_room';
  });

  const [nickname, setNickname] = useState(() => getSavedState('battle_nickname', '', 'string'));
  const [phoneNumber, setPhoneNumber] = useState(() => getSavedState('battle_phone', '', 'string'));
  
  const [userId, setUserId] = useState(() => {
      const savedUid = getSavedState('battle_userId', '', 'string');
      return savedUid || 'user_' + Math.floor(Math.random() * 100000);
  });

  const [fullData, setFullData] = useState([]);
  const [currentDay, setCurrentDay] = useState(400);
  const [timeOffset, setTimeOffset] = useState(0);
  const [fundName, setFundName] = useState('');
  const [showIndicators, setShowIndicators] = useState({ ma20: false, ma60: false, river: false });
  
  const [cash, setCash] = useState(() => getSavedState('battle_cash', 1000000));
  const [units, setUnits] = useState(() => getSavedState('battle_units', 0));
  const [avgCost, setAvgCost] = useState(() => getSavedState('battle_avgCost', 0));
  const [initialCapital] = useState(1000000);

  const [inputAmount, setInputAmount] = useState('');

  // ★★★ 效能優化：紀錄上次回報時間 ★★★
  const lastReportTime = useRef(0);

  useEffect(() => {
    if (urlRoomId) { 
        setRoomId(urlRoomId);
        const savedRoom = localStorage.getItem('battle_roomId');
        if (savedRoom && savedRoom !== urlRoomId) {
            localStorage.clear();
            setCash(1000000); setUnits(0); setAvgCost(0); setNickname('');
            setStatus('login');
        }
    } else { 
        setStatus('input_room'); 
    }
  }, [urlRoomId]);

  useEffect(() => {
      if (roomId) localStorage.setItem('battle_roomId', roomId);
      if (userId) localStorage.setItem('battle_userId', userId);
      if (nickname) localStorage.setItem('battle_nickname', nickname);
      if (phoneNumber) localStorage.setItem('battle_phone', phoneNumber);
      localStorage.setItem('battle_cash', cash);
      localStorage.setItem('battle_units', units);
      localStorage.setItem('battle_avgCost', avgCost);
  }, [cash, units, avgCost, roomId, userId, nickname, phoneNumber]);

  useEffect(() => {
    if (!roomId || status === 'input_room') return;
    const unsubscribe = onSnapshot(doc(db, "battle_rooms", roomId), async (docSnap) => {
      if (!docSnap.exists()) { 
          alert("找不到此房間"); 
          localStorage.clear();
          setStatus('input_room'); 
          setRoomId(''); 
          return; 
      }
      const roomData = docSnap.data();
      
      if (roomData.status === 'playing') setStatus('playing');
      else if (roomData.status === 'ended') setStatus('ended');
      else if (roomData.status === 'waiting' && status !== 'login') setStatus('waiting');

      if (roomData.currentDay > currentDay) setCurrentDay(roomData.currentDay);
      if (roomData.indicators) setShowIndicators(roomData.indicators);
      if (fullData.length === 0 && roomData.fundId) {
         setTimeOffset(roomData.timeOffset || 0);
         const targetFund = FUNDS_LIBRARY.find(f => f.id === roomData.fundId);
         if (targetFund) {
             setFundName(targetFund.name);
             const res = await fetch(targetFund.file);
             setFullData(processRealData(await res.json()));
         }
      }
    });
    return () => unsubscribe();
  }, [roomId, status, currentDay, fullData.length]);

  const currentNav = fullData[currentDay]?.nav || 10;
  const totalAssets = cash + (units * currentNav);
  const roi = ((totalAssets - initialCapital) / initialCapital) * 100;

  // ★★★ 核心修正：加入節流閥 (Throttle) ★★★
  useEffect(() => {
      if ((status === 'playing' || status === 'waiting') && userId) {
          const now = Date.now();
          // 只有當「距離上次回報超過 1.5 秒」或者「資產有重大變動(例如剛交易)」才回報
          // 這裡為了簡化，針對 currentDay 變動造成的資產跳動進行節流
          if (now - lastReportTime.current > 1500) {
              updateDoc(doc(db, "battle_rooms", roomId, "players", userId), {
                  roi, assets: totalAssets, lastUpdate: serverTimestamp()
              }).catch(e => console.log(e));
              lastReportTime.current = now;
          }
      }
  }, [currentDay]); // 只依賴 currentDay (隨時間變動)

  // 交易時強制回報 (不節流)
  useEffect(() => {
      if ((status === 'playing' || status === 'waiting') && userId) {
          updateDoc(doc(db, "battle_rooms", roomId, "players", userId), {
              roi, assets: totalAssets, lastUpdate: serverTimestamp()
          }).catch(e => console.log(e));
          lastReportTime.current = Date.now(); // 重置計時器
      }
  }, [cash, units]); // 依賴資金變動

  const handleConfirmRoom = () => {
      if (!inputRoomId.trim()) return;
      setRoomId(inputRoomId); setStatus('login'); setSearchParams({ room: inputRoomId });
  };

  const handleJoinGame = async () => {
      if (!nickname.trim()) { alert("請輸入暱稱"); return; }
      if (!phoneNumber.trim() || phoneNumber.length < 9) { alert("請輸入有效的手機號碼"); return; }

      try {
        await setDoc(doc(db, "battle_rooms", roomId, "players", userId), {
            nickname, phone: phoneNumber, roi: 0, assets: initialCapital, isOut: false, joinedAt: serverTimestamp()
        });
        setStatus('waiting');
      } catch (err) { alert("加入失敗"); }
  };

  const setAmountByPercent = (percent) => {
      if (percent === 1.0) {
          const assetValue = units * currentNav;
          const maxVal = Math.max(cash, assetValue);
          setInputAmount(Math.floor(maxVal).toString());
      } else {
          const amount = Math.floor(cash * percent);
          setInputAmount(amount.toString());
      }
  };

  const executeTrade = (type) => {
      const amount = parseFloat(inputAmount);
      if (!amount || amount <= 0) return;

      if (type === 'buy') {
          if (amount > cash) { alert('現金不足'); return; }
          const buyUnits = amount / currentNav;
          const newUnits = units + buyUnits;
          setAvgCost((units * avgCost + amount) / newUnits);
          setUnits(newUnits);
          setCash(prev => prev - amount);
      } else {
          const currentAssetValue = units * currentNav;
          if (amount >= currentAssetValue * 0.99) { 
              setCash(prev => prev + currentAssetValue);
              setUnits(0);
              setAvgCost(0);
          } else {
              const sellUnits = amount / currentNav;
              setUnits(prev => prev - sellUnits);
              setCash(prev => prev + amount);
          }
      }
      setInputAmount(''); 
      if (navigator.vibrate) navigator.vibrate(30);
  };

  const chartData = useMemo(() => {
      const start = Math.max(0, currentDay - 330);
      const end = currentDay + 1;
      return fullData.slice(start, end).map((d, idx) => {
          const realIdx = start + idx;
          const ind20 = calculateIndicators(fullData, 20, realIdx);
          const ind60 = calculateIndicators(fullData, 60, realIdx);
          let riverTop = null; let riverBottom = null;
          if (ind60.ma) { riverTop = ind60.ma * 1.1; riverBottom = ind60.ma * 0.9; }
          return { ...d, ma20: ind20.ma, ma60: ind60.ma, riverTop, riverBottom };
      });
  }, [fullData, currentDay]);

  // --- UI Render ---

  if (status === 'input_room') return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <img src="/logo.jpg" alt="Logo" className="h-16 mb-6 rounded-lg shadow-sm" />
          <h1 className="text-3xl font-bold mb-2 text-slate-800">加入現場對戰</h1>
          <input type="number" value={inputRoomId} onChange={e => setInputRoomId(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 text-center text-3xl font-mono text-slate-800 mb-6 tracking-widest outline-none focus:border-emerald-500 shadow-sm" placeholder="0000" />
          <button onClick={handleConfirmRoom} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-lg transition-colors">下一步</button>
      </div>
  );

  if (status === 'login') return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <img src="/logo.jpg" alt="Logo" className="h-12 mb-4 rounded-lg shadow-sm" />
          <div className="bg-white p-4 rounded-lg mb-4 text-center border border-slate-200 shadow-sm w-full">
              <div className="text-xs text-slate-400 mb-1">ROOM ID</div>
              <div className="text-2xl font-mono font-bold text-emerald-600">{roomId}</div>
          </div>
          <h1 className="text-2xl font-bold mb-6">建立玩家檔案</h1>
          <div className="w-full space-y-4">
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 text-center text-xl text-slate-800 outline-none focus:border-emerald-500 shadow-sm" placeholder="您的暱稱" />
              <div className="relative">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                  <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 pl-12 text-center text-xl text-slate-800 outline-none focus:border-emerald-500 shadow-sm" placeholder="手機號碼" />
              </div>
              <button onClick={handleJoinGame} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-emerald-100">加入房間</button>
          </div>
      </div>
  );

  if (status === 'waiting') return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 p-6">
          <Loader2 size={48} className="text-emerald-500 animate-spin mb-4"/>
          <h2 className="text-xl font-bold">等待主持人開始...</h2>
          <div className="mt-8 px-6 py-2 bg-white rounded-full border border-slate-200 shadow-sm flex flex-col items-center">
             <span className="text-xs text-slate-400 mb-1">已登入</span>
             <span className="text-emerald-600 font-bold text-lg">{nickname}</span>
          </div>
      </div>
  );

  if (status === 'playing') return (
      <div className="h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
          
          <div className="p-3 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
              <div className="flex flex-col">
                  {/* ★★★ 頂部 Logo (小) ★★★ */}
                  <div className="flex items-center gap-1 text-slate-500 text-[10px] font-bold uppercase">
                      <img src="/logo.jpg" className="h-4 mr-1 rounded-sm"/> {fundName}
                  </div>
                  <div className={`text-4xl font-mono font-bold ${roi >= 0 ? 'text-red-500' : 'text-green-600'}`}>{roi > 0 ? '+' : ''}{roi.toFixed(2)}%</div>
              </div>
              <div className="text-right">
                  <div className="text-[10px] text-slate-400">總資產</div>
                  <div className={`text-2xl font-mono font-bold ${roi >= 0 ? 'text-red-500' : 'text-green-600'}`}>${Math.round(totalAssets).toLocaleString()}</div>
              </div>
          </div>

          <div className="flex-1 relative bg-white">
             <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.8} />
                    {showIndicators.river && <Line type="monotone" dataKey="riverTop" stroke="#3b82f6" strokeWidth={1} dot={false} isAnimationActive={false} opacity={0.3} />}
                    {showIndicators.river && <Line type="monotone" dataKey="riverBottom" stroke="#3b82f6" strokeWidth={1} dot={false} isAnimationActive={false} opacity={0.3} />}
                    {showIndicators.ma20 && <Line type="monotone" dataKey="ma20" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.8} />}
                    {showIndicators.ma60 && <Line type="monotone" dataKey="ma60" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.8} />}
                    <Line type="monotone" dataKey="nav" stroke="#000000" strokeWidth={2.5} dot={false} isAnimationActive={false} shadow="0 0 10px rgba(0,0,0,0.1)" />
                    <YAxis domain={['auto', 'auto']} hide />
                </ComposedChart>
             </ResponsiveContainer>
          </div>

          <div className="bg-white border-t border-slate-200 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] pb-6 pt-2">
              <div className="flex justify-between px-4 py-1 text-slate-500 border-b border-slate-100 mb-2">
                  <div className="flex flex-col">
                      <span className="text-[10px]">現金餘額</span>
                      <span className="font-mono text-emerald-600 font-bold text-3xl">${Math.round(cash).toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col text-right">
                      <span className="text-[10px]">持有單位</span>
                      <span className="font-mono text-slate-800 font-bold text-3xl">{Math.round(units).toLocaleString()}</span>
                  </div>
              </div>

              <div className="px-4 grid grid-cols-5 gap-2 mb-2">
                  <button onClick={() => setAmountByPercent(1.0)} className="col-span-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold text-xs flex flex-col items-center justify-center p-1 active:scale-95 shadow-md leading-tight"><span>買入</span><span>All In</span></button>
                  <input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} placeholder="輸入金額" className="col-span-3 bg-slate-100 border border-slate-300 rounded-lg px-2 py-3 text-2xl font-bold text-slate-800 outline-none focus:border-slate-500 text-center placeholder:text-slate-300"/>
                  <button onClick={() => setAmountByPercent(1.0)} className="col-span-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs flex flex-col items-center justify-center p-1 active:scale-95 shadow-md leading-tight"><span>賣出</span><span>All In</span></button>
              </div>

              <div className="px-4 flex gap-2 mb-3">
                  <button onClick={() => setAmountByPercent(0.2)} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-300">20%</button>
                  <button onClick={() => setAmountByPercent(0.5)} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-300">50%</button>
              </div>

              <div className="px-4 grid grid-cols-2 gap-3">
                  <button onClick={() => executeTrade('buy')} className="bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-bold text-2xl shadow-md active:scale-95 flex items-center justify-center gap-2"><TrendingUp size={28}/> 買入</button>
                  <button onClick={() => executeTrade('sell')} className="bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold text-2xl shadow-md active:scale-95 flex items-center justify-center gap-2"><TrendingDown size={28}/> 賣出</button>
              </div>
          </div>
      </div>
  );

  return (
    <div className="h-screen bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6 text-center">
        <Trophy size={80} className="text-amber-500 mb-6 animate-bounce"/>
        <h2 className="text-3xl font-bold mb-2">比賽結束</h2>
        <div className="bg-white p-6 rounded-2xl w-full max-w-xs border border-slate-200 shadow-xl">
            <div className="text-sm text-slate-400 mb-1">最終成績 (ROI)</div>
            <div className={`text-5xl font-mono font-bold ${roi >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                {roi > 0 ? '+' : ''}{roi.toFixed(2)}%
            </div>
        </div>
        <button onClick={() => { localStorage.clear(); setStatus('input_room'); setRoomId(''); }} className="mt-8 text-slate-400 underline hover:text-slate-600">離開房間</button>
    </div>
  );
}