import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, YAxis, ResponsiveContainer, ComposedChart, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Trophy, Loader2, Zap, Database } from 'lucide-react';

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
  
  const [roomId, setRoomId] = useState(searchParams.get('room') || '');
  const [inputRoomId, setInputRoomId] = useState('');
  const [status, setStatus] = useState('input_room');
  const [nickname, setNickname] = useState('');
  const [userId, setUserId] = useState(''); 
  const [fullData, setFullData] = useState([]);
  // ★★★ 修正：起始日改為 400，確保左側有足夠數據畫線 ★★★
  const [currentDay, setCurrentDay] = useState(400);
  const [timeOffset, setTimeOffset] = useState(0);
  const [fundName, setFundName] = useState('');
  const [showIndicators, setShowIndicators] = useState({ ma20: false, ma60: false, river: false });
  
  const [cash, setCash] = useState(1000000);
  const [units, setUnits] = useState(0);
  const [avgCost, setAvgCost] = useState(0);
  const [initialCapital] = useState(1000000);

  const [inputAmount, setInputAmount] = useState('');

  useEffect(() => {
    const urlRoom = searchParams.get('room');
    if (urlRoom) { setRoomId(urlRoom); setStatus('login'); } else { setStatus('input_room'); }
    setUserId('user_' + Math.floor(Math.random() * 100000));
  }, []);

  useEffect(() => {
    if (!roomId || status === 'input_room') return;
    const unsubscribe = onSnapshot(doc(db, "battle_rooms", roomId), async (docSnap) => {
      if (!docSnap.exists()) { alert("找不到此房間"); setStatus('input_room'); setRoomId(''); return; }
      const roomData = docSnap.data();
      if (roomData.status === 'playing' && status === 'waiting') setStatus('playing');
      if (roomData.status === 'ended') setStatus('ended');
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

  useEffect(() => {
      if (status !== 'playing' || !userId) return;
      updateDoc(doc(db, "battle_rooms", roomId, "players", userId), {
          roi, assets: totalAssets, lastUpdate: serverTimestamp()
      }).catch(e => console.log(e));
  }, [currentDay, cash, units, userId, roomId, status, roi, totalAssets]);

  const handleConfirmRoom = () => {
      if (!inputRoomId.trim()) return;
      setRoomId(inputRoomId); setStatus('login'); setSearchParams({ room: inputRoomId });
  };

  const handleJoinGame = async () => {
      if (!nickname.trim()) return;
      try {
        await setDoc(doc(db, "battle_rooms", roomId, "players", userId), {
            nickname, roi: 0, assets: initialCapital, isOut: false, joinedAt: serverTimestamp()
        });
        setStatus('waiting');
      } catch (err) { alert("加入失敗"); }
  };

  // ★★★ 新增：買入 All In (填入現金) ★★★
  const handleBuyAllIn = () => {
      setInputAmount(Math.floor(cash).toString());
  };

  // ★★★ 新增：賣出 All In (填入持倉市值) ★★★
  const handleSellAllIn = () => {
      const assetValue = Math.floor(units * currentNav);
      setInputAmount(assetValue.toString());
  };

  // ★★★ 修改：一般百分比設定 (基於現金) ★★★
  const setAmountByPercent = (percent) => {
      const amount = Math.floor(cash * percent);
      setInputAmount(amount.toString());
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
          // 如果輸入金額 >= 99% 的市值，視為清空 (避免浮點數誤差殘留)
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
      // 保持 330 天視窗
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

  if (status === 'input_room') return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <Zap size={64} className="text-emerald-500 mb-6"/>
          <h1 className="text-3xl font-bold mb-2 text-slate-800">加入現場對戰</h1>
          <input type="number" value={inputRoomId} onChange={e => setInputRoomId(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 text-center text-3xl font-mono text-slate-800 mb-6 tracking-widest outline-none focus:border-emerald-500 shadow-sm" placeholder="0000" />
          <button onClick={handleConfirmRoom} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-lg transition-colors">下一步</button>
      </div>
  );

  if (status === 'login') return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-800">
          <div className="bg-white p-4 rounded-lg mb-8 text-center border border-slate-200 shadow-sm w-full">
              <div className="text-xs text-slate-400 mb-1">ROOM ID</div>
              <div className="text-2xl font-mono font-bold text-emerald-600">{roomId}</div>
          </div>
          <h1 className="text-2xl font-bold mb-6">您的暱稱是？</h1>
          <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} className="w-full bg-white border border-slate-300 rounded-xl p-4 text-center text-xl text-slate-800 mb-4 outline-none focus:border-emerald-500 shadow-sm" placeholder="例如：股神" />
          <button onClick={handleJoinGame} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-emerald-100">加入房間</button>
      </div>
  );

  if (status === 'waiting') return (
      <div className="h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-800 p-6">
          <Loader2 size={48} className="text-emerald-500 animate-spin mb-4"/>
          <h2 className="text-xl font-bold">等待主持人開始...</h2>
          <div className="mt-8 px-6 py-2 bg-white rounded-full border border-slate-200 shadow-sm">我是：<span className="text-emerald-600 font-bold">{nickname}</span></div>
      </div>
  );

  if (status === 'playing') return (
      <div className="h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
          
          <div className="p-3 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-10 shrink-0">
              <div className="flex flex-col">
                  <div className="flex items-center gap-1 text-slate-500 text-[10px] font-bold uppercase"><Database size={10}/> {fundName}</div>
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

              {/* ★★★ 核心修改：Grid 5 欄位佈局 ★★★ */}
              <div className="px-4 grid grid-cols-5 gap-2 mb-2">
                  {/* 左 1/5: 買入 All In (紅) */}
                  <button 
                      onClick={handleBuyAllIn} 
                      className="col-span-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg font-bold text-xs flex flex-col items-center justify-center p-1 active:scale-95 shadow-md leading-tight"
                  >
                      <span>買入</span>
                      <span>All In</span>
                  </button>

                  {/* 中 3/5: 輸入框 */}
                  <input 
                      type="number" 
                      value={inputAmount} 
                      onChange={(e) => setInputAmount(e.target.value)} 
                      placeholder="輸入金額" 
                      className="col-span-3 bg-slate-100 border border-slate-300 rounded-lg px-2 py-3 text-2xl font-bold text-slate-800 outline-none focus:border-slate-500 text-center placeholder:text-slate-300"
                  />

                  {/* 右 1/5: 賣出 All In (綠) */}
                  <button 
                      onClick={handleSellAllIn} 
                      className="col-span-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs flex flex-col items-center justify-center p-1 active:scale-95 shadow-md leading-tight"
                  >
                      <span>賣出</span>
                      <span>All In</span>
                  </button>
              </div>

              <div className="px-4 flex gap-2 mb-3">
                  <button onClick={() => setAmountByPercent(0.2)} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-300">20%</button>
                  <button onClick={() => setAmountByPercent(0.5)} className="flex-1 py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-sm hover:bg-slate-300">50%</button>
              </div>

              <div className="px-4 grid grid-cols-2 gap-3">
                  <button onClick={() => executeTrade('buy')} className="bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-bold text-2xl shadow-md active:scale-95 flex items-center justify-center gap-2">
                      <TrendingUp size={28}/> 買入
                  </button>
                  <button onClick={() => executeTrade('sell')} className="bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold text-2xl shadow-md active:scale-95 flex items-center justify-center gap-2">
                      <TrendingDown size={28}/> 賣出
                  </button>
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
        <button onClick={() => { setStatus('input_room'); setRoomId(''); }} className="mt-8 text-slate-400 underline hover:text-slate-600">離開房間</button>
    </div>
  );
}