// 2025v5.7
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, YAxis, ResponsiveContainer, ComposedChart, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Trophy, Loader2, Zap, Database, Smartphone, AlertTriangle, RefreshCw, Hand, X, Calendar } from 'lucide-react';

import { db } from '../config/firebase'; 
import { doc, setDoc, deleteDoc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
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
  const [startDay, setStartDay] = useState(0); 
  const [timeOffset, setTimeOffset] = useState(0);
  const [fundName, setFundName] = useState('');
  const [showIndicators, setShowIndicators] = useState({ ma20: false, ma60: false, river: false });
  
  const [cash, setCash] = useState(() => getSavedState('battle_cash', 1000000));
  const [units, setUnits] = useState(() => getSavedState('battle_units', 0));
  const [avgCost, setAvgCost] = useState(() => getSavedState('battle_avgCost', 0));
  const [initialCapital] = useState(1000000);
  const [resetCount, setResetCount] = useState(() => getSavedState('battle_resetCount', 0));

  const [inputAmount, setInputAmount] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  
  const lastReportTime = useRef(0);

  useEffect(() => {
    if (urlRoomId) { 
        setRoomId(urlRoomId);
        const savedRoom = localStorage.getItem('battle_roomId');
        if (savedRoom && savedRoom !== urlRoomId) {
            localStorage.clear();
            setCash(1000000); setUnits(0); setAvgCost(0); setNickname(''); setResetCount(0); setIsTrading(false);
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
      localStorage.setItem('battle_resetCount', resetCount);
  }, [cash, units, avgCost, roomId, userId, nickname, phoneNumber, resetCount]);

  // ★★★ 核心修正：移除 currentDay 依賴，並修正同步邏輯 ★★★
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

      // ★★★ 修正點 1：無條件同步天數，解決卡頓與重置不同步問題 ★★★
      if (roomData.currentDay !== undefined) setCurrentDay(roomData.currentDay);
      
      if (roomData.startDay) setStartDay(roomData.startDay);
      if (roomData.indicators) setShowIndicators(roomData.indicators);
      if (roomData.timeOffset) setTimeOffset(roomData.timeOffset);

      if (fullData.length === 0 && roomData.fundId) {
         const targetFund = FUNDS_LIBRARY.find(f => f.id === roomData.fundId);
         if (targetFund) {
             setFundName(targetFund.name);
             const res = await fetch(targetFund.file);
             setFullData(processRealData(await res.json()));
         }
      }
    });
    return () => unsubscribe();
  }, [roomId, status, fullData.length]); // ★★★ 修正點 2：移除 currentDay，避免重複訂閱導致效能問題 ★★★

  const currentNav = fullData[currentDay]?.nav || 10;
  const totalAssets = cash + (units * currentNav);
  const rawRoi = ((totalAssets - initialCapital) / initialCapital) * 100;
  const displayRoi = rawRoi - (resetCount * 50); 

  useEffect(() => {
      if ((status === 'playing' || status === 'waiting') && userId) {
          const now = Date.now();
          if (now - lastReportTime.current > 1500) {
              updateDoc(doc(db, "battle_rooms", roomId, "players", userId), {
                  roi: displayRoi, 
                  assets: totalAssets, 
                  units: units, 
                  lastUpdate: serverTimestamp()
              }).catch(e => console.log(e));
              lastReportTime.current = now;
          }
      }
  }, [currentDay]); 

  useEffect(() => {
      if ((status === 'playing' || status === 'waiting') && userId) {
          updateDoc(doc(db, "battle_rooms", roomId, "players", userId), {
              roi: displayRoi, 
              assets: totalAssets, 
              units: units, 
              lastUpdate: serverTimestamp()
          }).catch(e => console.log(e));
          lastReportTime.current = Date.now(); 
      }
  }, [cash, units, resetCount]); 

  const handleConfirmRoom = () => {
      if (!inputRoomId.trim()) return;
      setRoomId(inputRoomId); setStatus('login'); setSearchParams({ room: inputRoomId });
  };

  const handleJoinGame = async () => {
      if (!nickname.trim()) { alert("請輸入暱稱"); return; }
      if (!phoneNumber.trim()) { alert("請輸入手機號碼"); return; }

      setIsJoining(true);
      try {
        await setDoc(doc(db, "battle_rooms", roomId, "players", userId), {
            nickname, phone: phoneNumber, roi: 0, assets: initialCapital, units: 0, isOut: false, joinedAt: serverTimestamp()
        });
        setStatus('waiting');
      } catch (err) { alert("加入失敗: " + err.message); } finally { setIsJoining(false); }
  };

  const handleBankruptcyReset = () => {
      if (window.confirm("確定申請紓困？\n\n您的資產將重置為 $1,000,000\n但總成績將扣除 50%！")) {
          setCash(1000000); setUnits(0); setAvgCost(0); setResetCount(prev => prev + 1);
      }
  };

  const handleRequestTrade = async () => {
      setIsTrading(true);
      try {
          await setDoc(doc(db, "battle_rooms", roomId, "requests", userId), {
              nickname: nickname,
              timestamp: serverTimestamp()
          });
      } catch (e) { console.error(e); }
  };

  const handleCancelTrade = async () => {
      setIsTrading(false);
      try {
          await deleteDoc(doc(db, "battle_rooms", roomId, "requests", userId));
      } catch (e) { console.error(e); }
  };

  const handleQuickAmount = (type, percent) => {
      if (type === 'buy') {
          const amount = Math.round(cash * percent);
          setInputAmount(amount.toString());
      } else if (type === 'sell') {
          const assetValue = units * currentNav;
          const amount = Math.round(assetValue * percent);
          setInputAmount(amount.toString());
      }
  };

  const executeTrade = async (type) => {
      const amount = parseFloat(inputAmount);
      if (!amount || amount <= 0) return;

      if (type === 'buy') {
          if (amount > Math.round(cash)) { alert('現金不足'); return; }
          const buyUnits = amount / currentNav;
          const newUnits = units + buyUnits;
          setAvgCost((units * avgCost + amount) / newUnits);
          setUnits(newUnits);
          setCash(prev => {
              const remains = prev - amount;
              return Math.abs(remains) < 1 ? 0 : remains; 
          });
      } else {
          const currentAssetValue = units * currentNav;
          if (amount >= Math.round(currentAssetValue)) { 
              setCash(prev => prev + amount); 
              setUnits(0);
              setAvgCost(0);
          } else {
              const sellUnits = amount / currentNav;
              if (sellUnits > units * 1.0001) { alert('單位不足'); return; }
              setUnits(prev => Math.max(0, prev - sellUnits));
              setCash(prev => prev + amount);
          }
      }
      setInputAmount(''); 
      if (navigator.vibrate) navigator.vibrate(50);
      handleCancelTrade();
  };

  const setAmountByPercent = (percent) => {};

  const getDisplayDate = (dateStr) => {
      if (!dateStr) return '---';
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) return dateStr;
      const newYear = dateObj.getFullYear() + timeOffset;
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${newYear}-${month}-${day}`;
  };

  const getRealDate = (dateStr) => {
      if (!dateStr) return '---';
      const dateObj = new Date(dateStr);
      if (isNaN(dateObj.getTime())) return dateStr;
      const year = dateObj.getFullYear(); 
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
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

  const currentDisplayDate = fullData[currentDay] ? getDisplayDate(fullData[currentDay].date) : "";

  // --- UI Render ---

  if (status === 'input_room') return (
      <div className="h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <Zap size={64} className="text-emerald-500 mb-6"/>
          <h1 className="text-3xl font-bold mb-2 text-slate-800">加入現場對戰</h1>
          <input type="number" value={inputRoomId} onChange={e => setInputRoomId(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 text-center text-3xl font-mono text-slate-800 mb-6 tracking-widest outline-none focus:border-emerald-500 shadow-sm" placeholder="0000" />
          <button onClick={handleConfirmRoom} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-lg transition-colors">下一步</button>
      </div>
  );

  if (status === 'login') return (
      <div className="h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <div className="bg-white p-4 rounded-lg mb-8 text-center border border-slate-200 shadow-sm w-full">
              <div className="text-xs text-slate-400 mb-1">ROOM ID</div>
              <div className="text-2xl font-mono font-bold text-emerald-600">{roomId}</div>
          </div>
          <h1 className="text-2xl font-bold mb-6">建立玩家檔案</h1>
          <div className="w-full space-y-4 relative z-10">
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 text-center text-xl text-slate-800 outline-none focus:border-emerald-500 shadow-sm" placeholder="您的暱稱" />
              <div className="relative">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20}/>
                  <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 pl-12 text-center text-xl text-slate-800 outline-none focus:border-emerald-500 shadow-sm" placeholder="手機號碼" />
              </div>
              <button onClick={handleJoinGame} disabled={isJoining} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-70">{isJoining ? <Loader2 className="animate-spin" /> : '加入房間'}</button>
          </div>
      </div>
  );

  if (status === 'waiting') return (
      <div className="h-[100dvh] bg-slate-50 flex flex-col items-center justify-center text-slate-800 p-6">
          <Loader2 size={48} className="text-emerald-500 animate-spin mb-4"/>
          <h2 className="text-xl font-bold">等待主持人開始...</h2>
          <div className="mt-8 px-6 py-2 bg-white rounded-full border border-slate-200 shadow-sm flex flex-col items-center">
             <span className="text-xs text-slate-400 mb-1">已登入</span>
             <span className="text-emerald-600 font-bold text-lg">{nickname}</span>
          </div>
      </div>
  );

  if (status === 'playing') return (
      <div className="h-[100dvh] bg-slate-50 text-slate-800 flex flex-col font-sans relative overflow-hidden">
          {totalAssets < 100000 && (
              <div className="absolute inset-0 bg-slate-900/90 z-50 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm animate-in fade-in">
                  <AlertTriangle size={64} className="text-red-500 mb-4 animate-bounce"/>
                  <h2 className="text-3xl font-bold text-white mb-2">瀕臨破產！</h2>
                  <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-8 w-full">
                      <div className="text-xs text-slate-500 mb-1">紓困代價</div>
                      <div className="text-red-400 font-bold text-lg">總成績扣除 50%</div>
                  </div>
                  <button onClick={handleBankruptcyReset} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xl shadow-lg flex items-center justify-center gap-2"><RefreshCw size={24}/> 申請紓困重整</button>
              </div>
          )}
          <div className="px-3 py-1 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
              <div className="flex flex-col">
                  <div className="flex items-center gap-1 text-slate-800 text-base font-black tracking-tight">{fundName} <span className="text-slate-300">|</span> {currentDisplayDate}</div>
                  <div className={`text-4xl font-mono font-bold ${displayRoi >= 0 ? 'text-red-500' : 'text-green-600'} leading-none mt-1`}>{displayRoi > 0 ? '+' : ''}{displayRoi.toFixed(2)}%</div>
              </div>
              <div className="text-right">
                  <div className="text-[10px] text-slate-400">總資產</div>
                  <div className={`text-2xl font-mono font-bold ${displayRoi >= 0 ? 'text-red-500' : 'text-green-600'}`}>${Math.round(totalAssets).toLocaleString()}</div>
              </div>
          </div>
          <div className="flex-1 relative bg-white min-h-0">
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
          <div className="bg-white border-t border-slate-200 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] pb-3 pt-1 safe-area-pb">
              <div className="flex justify-between px-4 py-2 border-b border-slate-100 mb-2">
                  <div className="flex flex-col items-start"><span className="text-xs text-slate-400 font-bold mb-0.5">現金餘額</span><span className="font-mono text-emerald-600 font-black text-3xl leading-none tracking-tight">${Math.round(cash).toLocaleString()}</span></div>
                  <div className="flex flex-col items-end"><span className="text-xs text-slate-400 font-bold mb-0.5">持有單位</span><span className="font-mono text-slate-800 font-black text-3xl leading-none tracking-tight">{Math.round(units).toLocaleString()}</span></div>
              </div>
              {!isTrading ? (
                  <div className="px-4 pb-2">
                      <button onClick={handleRequestTrade} className="w-full py-6 bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-white rounded-xl font-black text-3xl shadow-lg flex items-center justify-center gap-3 animate-pulse"><Hand size={32} className="text-yellow-400"/> 請求交易</button>
                      <p className="text-center text-xs text-slate-400 mt-2">按下後行情將暫停，供您思考決策</p>
                  </div>
              ) : (
                  <>
                      <div className="px-2 grid grid-cols-5 gap-1 mb-1">
                          <button onClick={() => handleQuickAmount('buy', 1.0)} className="col-span-1 bg-rose-500 active:bg-rose-700 text-white rounded-md font-bold text-xs flex flex-col items-center justify-center py-2 active:scale-95 shadow-sm leading-tight"><span>買入</span><span>All In</span></button>
                          <input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} placeholder="輸入金額" className="col-span-3 bg-slate-100 border border-slate-300 rounded-md px-1 py-2 text-xl font-bold text-slate-800 outline-none focus:border-slate-500 text-center placeholder:text-slate-300"/>
                          <button onClick={() => handleQuickAmount('sell', 1.0)} className="col-span-1 bg-emerald-500 active:bg-emerald-700 text-white rounded-md font-bold text-xs flex flex-col items-center justify-center py-2 active:scale-95 shadow-sm leading-tight"><span>賣出</span><span>All In</span></button>
                      </div>
                      <div className="px-2 flex gap-2 mb-2">
                          <button onClick={() => handleQuickAmount('buy', 0.5)} className="flex-1 py-2 bg-rose-100 text-rose-700 rounded-md font-black text-lg hover:bg-rose-200 active:bg-rose-300 transition-colors">買入 50%</button>
                          <button onClick={() => handleQuickAmount('sell', 0.5)} className="flex-1 py-2 bg-emerald-100 text-emerald-700 rounded-md font-black text-lg hover:bg-emerald-200 active:bg-emerald-300 transition-colors">賣出 50%</button>
                      </div>
                      <div className="px-2 grid grid-cols-2 gap-2">
                          <button onClick={() => executeTrade('buy')} className="bg-rose-500 active:bg-rose-600 text-white py-3 rounded-lg font-bold text-2xl shadow-md active:scale-95 flex items-center justify-center gap-2"><TrendingUp size={24}/> 買入</button>
                          <button onClick={() => executeTrade('sell')} className="bg-emerald-500 active:bg-emerald-600 text-white py-3 rounded-lg font-bold text-2xl shadow-md active:scale-95 flex items-center justify-center gap-2"><TrendingDown size={24}/> 賣出</button>
                      </div>
                      <div className="px-2 mt-2">
                          <button onClick={handleCancelTrade} className="w-full py-2 bg-slate-200 text-slate-500 rounded-lg font-bold text-sm flex items-center justify-center gap-1"><X size={16}/> 取消交易 (恢復行情)</button>
                      </div>
                  </>
              )}
          </div>
      </div>
  );

  return (
    <div className="h-[100dvh] bg-slate-50 text-slate-800 flex flex-col items-center justify-center p-6 text-center">
        <Trophy size={80} className="text-amber-500 mb-6 animate-bounce"/>
        <h2 className="text-3xl font-bold mb-2">比賽結束</h2>
        <div className="bg-white p-6 rounded-2xl w-full max-w-xs border border-slate-200 shadow-xl">
            <div className="text-sm text-slate-400 mb-1">最終成績 (ROI)</div>
            <div className={`text-5xl font-mono font-bold ${displayRoi >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                {displayRoi > 0 ? '+' : ''}{displayRoi.toFixed(2)}%
            </div>
        </div>

        {fullData.length > 0 && (
            <div className="mt-6 bg-slate-100 p-4 rounded-xl w-full max-w-xs border border-slate-200">
                <div className="flex items-center justify-center gap-2 text-slate-500 font-bold mb-2 text-xs">
                    <Calendar size={14}/> 真實歷史區間
                </div>
                <div className="text-lg font-mono font-bold text-slate-700">
                    {getRealDate(fullData[startDay]?.date)} 
                    <span className="text-slate-400 mx-1">~</span> 
                    {getRealDate(fullData[currentDay]?.date)}
                </div>
            </div>
        )}

        <button onClick={() => { localStorage.clear(); setStatus('input_room'); setRoomId(''); }} className="mt-8 text-slate-400 underline hover:text-slate-600">離開房間</button>
    </div>
  );
}