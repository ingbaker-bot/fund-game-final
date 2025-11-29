import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, ComposedChart } from 'recharts';
import { Play, Pause, TrendingUp, TrendingDown, Activity, RotateCcw, AlertCircle, X, Check, MousePointer2, Flag, Download, Copy, Maximize, LogOut, Power, Lock, Database, UserCheck, Loader2, Waves, Trophy, Globe, User, Share2, Mail, MessageCircle, Monitor, Sword, Crown } from 'lucide-react';

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

import { auth } from '../config/firebase'; 
import { FUNDS_LIBRARY } from '../config/funds';

import { 
  checkUserNickname, 
  registerNickname, 
  saveGameResult, 
  getLeaderboard,
  getSeasonConfig 
} from '../services/firestoreService';

// --- 輔助函式 ---
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
  let sumDiffSq = 0;
  values.forEach(v => { const diff = v - ma; sumDiffSq += diff * diff; });
  const stdDev = Math.sqrt(sumDiffSq / days);
  return { ma: parseFloat(ma.toFixed(2)), stdDev: parseFloat(stdDev.toFixed(2)) };
};

// ============================================
// V31: 賽季爭霸版元件 AppCompetition
// ============================================
export default function AppCompetition() {
  const [user, setUser] = useState(null); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(true); 

  const [seasonConfig, setSeasonConfig] = useState(null);
  const [loadingSeason, setLoadingSeason] = useState(true);

  const [myNickname, setMyNickname] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [showRankModal, setShowRankModal] = useState(false);
  const [rankUploadStatus, setRankUploadStatus] = useState('idle'); 
  const [inputNickname, setInputNickname] = useState('');

  const [fullData, setFullData] = useState([]);
  const [currentDay, setCurrentDay] = useState(0);
  const [gameStatus, setGameStatus] = useState('setup'); 
  const [isReady, setIsReady] = useState(false);
  const [currentFundName, setCurrentFundName] = useState('');

  const [initialCapital, setInitialCapital] = useState(1000000);
  const [cash, setCash] = useState(1000000);
  const [units, setUnits] = useState(0);
  const [avgCost, setAvgCost] = useState(0);
  const [transactions, setTransactions] = useState([]);
  
  const [showMA20, setShowMA20] = useState(true);
  const [showMA60, setShowMA60] = useState(true);
  const [showRiver, setShowRiver] = useState(false);
  const [chartPeriod, setChartPeriod] = useState(250);
  
  const [customStopLossInput, setCustomStopLossInput] = useState(10);
  const [riverMode, setRiverMode] = useState('fixed'); 
  const [riverWidthInput, setRiverWidthInput] = useState(10); 
  const [riverSDMultiplier, setRiverSDMultiplier] = useState(2);

  const [tradeMode, setTradeMode] = useState(null); 
  const [inputAmount, setInputAmount] = useState(''); 
  const [highestNavSinceBuy, setHighestNavSinceBuy] = useState(0);
  const [warningActive, setWarningActive] = useState(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, type: null });
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [detectedEnv, setDetectedEnv] = useState('Browser');

  const autoPlayRef = useRef(null);

  useEffect(() => {
      if (!auth) { setAuthError("Firebase Config Error"); setAuthLoading(false); return; }
      const unsubscribe = onAuthStateChanged(auth, async (u) => { 
          setUser(u); 
          setAuthLoading(false);
          if (u) {
             const nick = await checkUserNickname(u.uid);
             if (nick) setMyNickname(nick);
             const config = await getSeasonConfig();
             if (config) setSeasonConfig(config);
             setLoadingSeason(false);
          }
      });
      return () => unsubscribe();
  }, []);

  const startGame = async () => {
    if (!seasonConfig) return;
    const targetFund = FUNDS_LIBRARY.find(f => f.id === seasonConfig.fundId);
    if (!targetFund) { alert("賽季指定基金不存在"); return; }

    setGameStatus('loading_data');
    try {
        const response = await fetch(targetFund.file);
        if (!response.ok) throw new Error("數據讀取失敗");
        const rawData = await response.json();
        let processedData = processRealData(rawData);
        
        const startIdx = seasonConfig.startDay || 0;
        const endIdx = seasonConfig.endDay || processedData.length;
        const gameData = processedData.slice(0, endIdx + 1);
        
        if (gameData.length < 100) throw new Error("賽季數據區間過短");

        setFullData(gameData);
        setCash(1000000);
        setInitialCapital(1000000);
        setCurrentDay(startIdx > 60 ? startIdx : 60);
        setCurrentFundName(seasonConfig.title || targetFund.name);
        
        setRankUploadStatus('idle');
        setGameStatus('playing');
        setIsReady(true);
    } catch (error) {
        alert(`賽季載入失敗：${error.message}`);
        setGameStatus('setup');
    }
  };

  useEffect(() => {
      if (gameStatus === 'playing' && fullData.length > 0) {
          if (currentDay >= fullData.length - 1) {
              if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); }
              setGameStatus('ended');
          }
      }
  }, [currentDay, fullData, gameStatus, isAutoPlaying]);

  const currentNav = fullData[currentDay]?.nav || 10;

  const chartDataInfo = useMemo(() => {
    if (!isReady || fullData.length === 0) return { data: [], domain: [0, 100] };
    const start = Math.max(0, currentDay - chartPeriod);
    const end = currentDay + 1;
    const slice = fullData.slice(start, end).map((d, idx) => {
        const realIdx = start + idx;
        const ind20 = calculateIndicators(fullData, 20, realIdx);
        const ind60 = calculateIndicators(fullData, 60, realIdx);
        const ma20 = ind20.ma; const ma60 = ind60.ma; const stdDev60 = ind60.stdDev;
        let riverTop = null; let riverBottom = null;
        if (ma60) {
            if (riverMode === 'fixed') { const ratio = riverWidthInput / 100; riverTop = ma60 * (1 + ratio); riverBottom = ma60 * (1 - ratio); } 
            else { if (stdDev60) { riverTop = ma60 + (stdDev60 * riverSDMultiplier); riverBottom = ma60 - (stdDev60 * riverSDMultiplier); } }
        }
        return { ...d, ma20, ma60, riverTop, riverBottom };
    });
    let min = Infinity, max = -Infinity;
    slice.forEach(d => {
        const values = [d.nav, showMA20 ? d.ma20 : null, showMA60 ? d.ma60 : null, showRiver ? d.riverTop : null, showRiver ? d.riverBottom : null];
        values.forEach(v => { if (v !== null && !isNaN(v)) { if (v < min) min = v; if (v > max) max = v; } });
    });
    if (min === Infinity) min = 0;
    const stopLossPrice = (units > 0 && highestNavSinceBuy > 0) ? highestNavSinceBuy * (1 - (customStopLossInput / 100)) : null;
    let finalMin = min, finalMax = max;
    if (stopLossPrice !== null) { if (stopLossPrice < finalMin) finalMin = stopLossPrice; if (highestNavSinceBuy > finalMax) finalMax = highestNavSinceBuy; }
    const padding = (finalMax - finalMin) * 0.1; 
    const domainMin = Math.max(0, Math.floor(finalMin - padding));
    const domainMax = Math.ceil(finalMax + padding);
    return { data: slice, domain: [domainMin, domainMax], stopLossPrice };
  }, [fullData, currentDay, isReady, units, highestNavSinceBuy, customStopLossInput, showMA20, showMA60, showRiver, chartPeriod, riverMode, riverWidthInput, riverSDMultiplier]);

  const totalAssets = cash + (units * currentNav);
  const roi = initialCapital > 0 ? ((totalAssets - initialCapital) / initialCapital) * 100 : 0;

  useEffect(() => {
    if (units > 0) {
      if (currentNav > highestNavSinceBuy) setHighestNavSinceBuy(currentNav);
      const stopPrice = highestNavSinceBuy * (1 - (customStopLossInput / 100));
      setWarningActive(highestNavSinceBuy > 0 && currentNav < stopPrice);
    } else { setHighestNavSinceBuy(0); setWarningActive(false); }
  }, [currentDay, units, currentNav, highestNavSinceBuy, customStopLossInput]);

  const toggleFullscreen = () => setIsCssFullscreen(!isCssFullscreen);
  const handleLogin = async (e) => { e.preventDefault(); setAuthError(''); try { await signInWithEmailAndPassword(auth, email, password); } catch (err) { setAuthError('登入失敗'); } };
  const handleLogout = async () => { await signOut(auth); setGameStatus('shutdown'); setTimeout(() => window.location.reload(), 500); };
  
  const advanceDay = () => { if (currentDay >= fullData.length - 1) { setGameStatus('ended'); return; } setCurrentDay(prev => prev + 1); };
  const openTrade = (mode) => { if (isAutoPlaying) toggleAutoPlay(); setTradeMode(mode); setInputAmount(''); };
  const closeTrade = () => { setTradeMode(null); setInputAmount(''); };
  const executeBuy = () => { const amount = parseFloat(inputAmount); if (!amount || amount <= 0 || amount > cash) return; const buyUnits = amount / currentNav; const newTotalUnits = units + buyUnits; const newAvgCost = (units * avgCost + amount) / newTotalUnits; setAvgCost(newAvgCost); setUnits(newTotalUnits); setCash(prev => prev - amount); setTransactions(prev => [{ id: Date.now(), day: currentDay, type: 'BUY', price: currentNav, units: buyUnits, amount: amount, balance: cash - amount }, ...prev]); if (units === 0) setHighestNavSinceBuy(currentNav); closeTrade(); advanceDay(); };
  const executeSell = () => { let unitsToSell = parseFloat(inputAmount); if (!unitsToSell || unitsToSell <= 0) return; if (unitsToSell > units) { if (unitsToSell - units < 0.1) unitsToSell = units; else return; } const sellAmount = unitsToSell * currentNav; const costOfSoldUnits = unitsToSell * avgCost; const pnl = sellAmount - costOfSoldUnits; setCash(prev => prev + sellAmount); setUnits(prev => { const remaining = prev - unitsToSell; return remaining < 0.0001 ? 0 : remaining; }); setTransactions(prev => [{ id: Date.now(), day: currentDay, type: 'SELL', price: currentNav, units: unitsToSell, amount: sellAmount, balance: cash + sellAmount, pnl }, ...prev]); if (Math.abs(units - unitsToSell) < 0.0001) { setHighestNavSinceBuy(0); setWarningActive(false); setAvgCost(0); setUnits(0); } closeTrade(); advanceDay(); };
  const toggleAutoPlay = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } else { setTradeMode(null); setIsAutoPlaying(true); autoPlayRef.current = setInterval(() => { setCurrentDay(prev => prev + 1); }, 100); } };
  
  const executeReset = () => { setConfirmModal({ show: false, type: null }); clearInterval(autoPlayRef.current); setIsAutoPlaying(false); setTradeMode(null); setUnits(0); setAvgCost(0); setTransactions([]); setHighestNavSinceBuy(0); setGameStatus('setup'); };
  const triggerReset = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } setConfirmModal({ show: true, type: 'reset' }); };
  const triggerEndGame = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } setConfirmModal({ show: true, type: 'end' }); };
  const executeEndGame = () => { setConfirmModal({ show: false, type: null }); setGameStatus('ended'); };
  const triggerExit = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } setConfirmModal({ show: true, type: 'exit' }); };
  const executeExit = () => { setConfirmModal({ show: false, type: null }); window.location.href = '/'; };

  const handleInitiateUpload = async () => {
    if (rankUploadStatus === 'uploaded') { fetchAndShowLeaderboard(); return; }
    if (!myNickname) { setRankUploadStatus('asking_nick'); setShowRankModal(true); } else { await executeUpload(myNickname); }
  };

  const handleRegisterAndUpload = async () => {
      if (!inputNickname || inputNickname.trim().length < 2) { alert("請輸入至少兩個字的暱稱"); return; }
      setRankUploadStatus('uploading');
      try { await registerNickname(user.uid, inputNickname); setMyNickname(inputNickname); await executeUpload(inputNickname); } catch (err) { alert("設定失敗"); setRankUploadStatus('asking_nick'); }
  };

  const executeUpload = async (nickname) => {
      setRankUploadStatus('uploading');
      setShowRankModal(true);
      try {
        let durationMonths = 0;
        if (transactions.length > 0) {
            const firstTx = transactions[transactions.length - 1];
            const startData = fullData[firstTx.day];
            const endData = fullData[currentDay];
            if (startData && endData) {
                const s = new Date(startData.date);
                const e = new Date(endData.date);
                durationMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
            }
        }
        const gameResult = {
            uid: user.uid, displayName: nickname, fundId: seasonConfig.fundId, fundName: seasonConfig.title,
            roi: parseFloat(roi.toFixed(2)), finalAssets: Math.round(totalAssets), durationMonths: durationMonths,
            seasonId: seasonConfig.seasonId, version: '31.0'
        };
        await saveGameResult(gameResult);
        setRankUploadStatus('uploaded');
        fetchAndShowLeaderboard();
      } catch (err) { console.error(err); setRankUploadStatus('error'); }
  };

  const fetchAndShowLeaderboard = async () => {
      if (!seasonConfig) return;
      const data = await getLeaderboard(null, seasonConfig.seasonId);
      setLeaderboardData(data);
      setShowRankModal(true);
  };

  const setBuyPercent = (pct) => setInputAmount(Math.floor(cash * pct).toString());
  const setSellPercent = (pct) => { if (pct === 1) setInputAmount(units.toString()); else setInputAmount((units * pct).toFixed(2)); };
  const containerStyle = isCssFullscreen ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, width: '100vw', height: '100vh' } : { position: 'relative', height: '100vh', width: '100%' };

  if (authLoading || loadingSeason) return <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4"><Loader2 size={48} className="animate-spin text-amber-500" /><p className="text-slate-400">正在連接賽事伺服器...</p></div>;

  if (!user) return ( <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center font-sans p-6"><div className="w-full max-w-sm bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl"><div className="flex justify-center mb-6 text-emerald-500"><Lock size={56} /></div><h2 className="text-2xl font-bold text-white text-center mb-2">Fund 手遊 V31</h2><p className="text-slate-400 text-center text-sm mb-6">賽季爭霸版 - 請先登入</p><form onSubmit={handleLogin} className="space-y-4"><div><label className="text-xs text-slate-500 ml-1">Email</label><input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"/></div><div><label className="text-xs text-slate-500 ml-1">密碼</label><input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-emerald-500 outline-none"/></div><button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-all active:scale-[0.98]">登入系統</button></form></div></div> );

  if (!seasonConfig) return ( <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-slate-500 gap-4"><Sword size={64} className="opacity-20" /><h2 className="text-xl font-bold text-slate-400">目前沒有進行中的賽事</h2><p className="text-sm">請等待下一季開打，或前往練習模式。</p><button onClick={() => window.location.href = '/'} className="px-6 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 text-white">返回首頁</button></div> );

  if (gameStatus === 'setup') {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center font-sans">
        <div className="w-full max-w-sm bg-slate-900 rounded-xl p-6 shadow-2xl border border-amber-500/30 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-600 to-orange-600"></div>
            <button onClick={() => window.location.href = '/'} className="absolute top-4 right-4 text-slate-600 hover:text-white transition-colors" title="離開"><X size={20} /></button>
            <div className="flex justify-center mb-4 text-amber-500 animate-pulse"><Crown size={56} strokeWidth={1.5} /></div>
            <h1 className="text-2xl font-bold text-center mb-1 tracking-tight text-amber-500">賽季爭霸戰</h1>
            <p className="text-center text-xs text-slate-400 mb-6 font-mono tracking-widest">{seasonConfig.seasonId}</p>
            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 mb-6 text-center"><p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">本季題目</p><p className="text-lg font-bold text-white mb-3">{seasonConfig.title}</p><div className="flex justify-center gap-4 text-xs text-slate-400 border-t border-slate-800 pt-3"><div><span className="block text-slate-600 mb-0.5">初始資金</span><span className="text-emerald-400 font-mono font-bold">$1,000,000</span></div><div><span className="block text-slate-600 mb-0.5">交易區間</span><span className="text-amber-400 font-mono font-bold">{(seasonConfig.endDay - seasonConfig.startDay)} 天</span></div></div></div>
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 mb-6"><div className="flex items-center justify-between mb-2 text-blue-400"><div className="flex items-center gap-2"><Waves size={16} /><span className="text-xs font-bold uppercase tracking-wider">你的策略參數</span></div></div><div className="flex gap-2 mb-2"><button onClick={() => setRiverMode('fixed')} className={`flex-1 py-1.5 text-xs rounded transition-colors ${riverMode === 'fixed' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>固定 %</button><button onClick={() => setRiverMode('dynamic')} className={`flex-1 py-1.5 text-xs rounded transition-colors ${riverMode === 'dynamic' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>動態標準差</button></div><div className="flex items-center bg-slate-800 border border-slate-600 rounded px-3 py-1">{riverMode === 'fixed' ? (<><span className="text-xs text-slate-400 mr-2">寬度</span><input type="number" value={riverWidthInput} onChange={(e) => setRiverWidthInput(Number(e.target.value))} className="flex-1 bg-transparent text-center text-white outline-none font-mono"/><span className="text-xs text-slate-400 ml-2">%</span></>) : (<><span className="text-xs text-slate-400 mr-2" title="標準差倍數">K 值</span><input type="number" step="0.1" min="1" max="5" value={riverSDMultiplier} onChange={(e) => setRiverSDMultiplier(Number(e.target.value))} className="flex-1 bg-transparent text-center text-emerald-400 font-bold outline-none font-mono"/><span className="text-xs text-slate-400 ml-2">SD</span></>)}</div><div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800"><span className="text-xs text-slate-400">風險停損</span><div className="flex items-center w-24 bg-slate-950 border border-slate-700 rounded px-2 py-0.5"><input type="number" value={customStopLossInput} onChange={(e) => setCustomStopLossInput(Number(e.target.value))} className="w-full bg-transparent text-right text-white text-sm outline-none font-mono" /><span className="text-xs text-slate-500 ml-1">%</span></div></div></div>
            <button onClick={startGame} className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 rounded-xl text-lg shadow-xl shadow-amber-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"><Sword size={20} /> 進入戰場</button>
        </div>
      </div>
    );
  }

  if (gameStatus === 'loading_data') return ( <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4"><Loader2 size={48} className="animate-spin text-amber-500" /><p className="text-slate-400">正在下載歷史行情...</p></div> );

  return (
    <div style={containerStyle} className="bg-slate-950 text-slate-200 font-sans flex flex-col overflow-hidden transition-all duration-300">
        <header className="bg-slate-900 px-3 py-1 border-b border-slate-800 flex justify-between items-center shrink-0 h-12 z-30 relative shadow-md">
            <button onClick={triggerExit} className="flex items-center gap-1 px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700 text-slate-400 text-xs hover:text-white active:scale-95 transition-all"><LogOut size={12} /> 棄權</button>
            <div className="flex flex-col items-center"><span className="text-[9px] text-amber-500 bg-amber-900/20 px-1.5 rounded border border-amber-900/50 mb-0.5">COMPETITION MODE</span><span className={`text-sm font-bold font-mono ${roi >= 0 ? 'text-red-400' : 'text-green-400'}`}>{roi > 0 ? '+' : ''}{roi.toFixed(2)}%</span></div>
            <div className="flex gap-2"><button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Maximize size={14} /></button><button onClick={triggerEndGame} className="flex items-center gap-1 px-2 py-1.5 rounded bg-red-900/20 border border-red-900/40 text-red-400 text-xs hover:bg-red-900/40 active:scale-95 transition-all"><Flag size={12} /> 結算</button></div>
        </header>

        <div className="relative w-full bg-slate-900/30 border-b border-slate-800 shrink-0 z-0" style={{ height: '50%' }}>
            <div className="absolute top-3 left-4 z-0 pointer-events-none"><div className="flex items-baseline gap-2"><span className="text-3xl font-bold text-white tracking-tight shadow-black drop-shadow-md">${currentNav.toFixed(2)}</span><span className="text-xs text-slate-500 font-mono">{fullData[currentDay]?.date}</span></div>{avgCost > 0 && (<div className="text-[10px] text-slate-400 mt-1 font-mono">均價 ${avgCost.toFixed(2)}</div>)}</div>
            <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                <div className="flex gap-1"><button onClick={() => setShowMA20(!showMA20)} className={`px-1.5 py-0.5 rounded text-[9px] border ${showMA20 ? 'bg-amber-500/20 text-amber-400 border-amber-500/50' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>月線</button><button onClick={() => setShowMA60(!showMA60)} className={`px-1.5 py-0.5 rounded text-[9px] border ${showMA60 ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>季線</button><button onClick={() => setShowRiver(!showRiver)} className={`px-1.5 py-0.5 rounded text-[9px] border ${showRiver ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>河流</button></div>
                <div className="flex bg-slate-800 rounded border border-slate-700 p-0.5">{[125, 250, 500].map(days => (<button key={days} onClick={() => setChartPeriod(days)} className={`px-2 py-0.5 text-[9px] rounded ${chartPeriod === days ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>{days === 125 ? '半年' : (days === 250 ? '1年' : '2年')}</button>))}</div>
            </div>
            <button onClick={triggerReset} className="absolute bottom-4 left-4 z-10 p-2 rounded-full bg-slate-800/80 border border-slate-700 text-slate-500 hover:text-white transition-colors" title="重置"><RotateCcw size={14} /></button>
            {warningActive && gameStatus === 'playing' && (<div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 bg-amber-500/90 text-black px-3 py-1 rounded-full shadow-lg animate-pulse flex items-center gap-1.5 backdrop-blur-sm"><AlertCircle size={14} strokeWidth={2.5} /><span className="text-xs font-extrabold">觸及停損 ({customStopLossInput}%)</span></div>)}
            {isReady && chartDataInfo.data.length > 0 ? (<ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartDataInfo.data} margin={{ top: 60, right: 5, left: 0, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} /><YAxis domain={chartDataInfo.domain} orientation="right" tick={{fill: '#64748b', fontSize: 10}} width={35} tickFormatter={(v) => Math.round(v)} interval="preserveStartEnd" />{showRiver && (<><Line type="monotone" dataKey="riverTop" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} /><Line type="monotone" dataKey="riverBottom" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} /></>)}{showMA20 && <Line type="monotone" dataKey="ma20" stroke="#fbbf24" strokeWidth={1} dot={false} isAnimationActive={false} opacity={0.8} />}{showMA60 && <Line type="monotone" dataKey="ma60" stroke="#a855f7" strokeWidth={1} dot={false} isAnimationActive={false} opacity={0.8} />}<Line type="monotone" dataKey="nav" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} shadow="0 0 10px rgba(52, 211, 153, 0.3)" />{units > 0 && chartDataInfo.stopLossPrice && (<ReferenceLine y={chartDataInfo.stopLossPrice} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={1.5} label={{ position: 'insideBottomLeft', value: `Stop ${chartDataInfo.stopLossPrice.toFixed(1)}`, fill: '#ef4444', fontSize: 10, dy: -5 }} />)}</ComposedChart></ResponsiveContainer>) : <div className="flex items-center justify-center h-full text-slate-500">載入中...</div>}
        </div>

        <div className="bg-slate-900 shrink-0 z-20 shadow-lg border-b border-slate-800">
            <div className="flex justify-between px-4 py-1.5 bg-slate-800/50 border-b border-slate-800 text-[10px]"><div className="flex gap-2 items-center"><span className="text-slate-400">資產</span><span className={`font-mono font-bold text-xs ${roi>=0?'text-red-400':'text-green-400'}`}>${Math.round(totalAssets).toLocaleString()}</span></div><div className="flex gap-2 items-center"><span className="text-slate-400">現金</span><span className="text-emerald-400 font-mono font-bold text-xs">${Math.round(cash).toLocaleString()}</span></div></div>
            <div className="grid grid-cols-4 gap-1 p-1.5 bg-slate-900"><button onClick={advanceDay} disabled={isAutoPlaying || tradeMode} className="bg-slate-800 active:bg-slate-700 text-slate-300 py-2 rounded-lg font-bold text-xs flex flex-col items-center gap-0.5 border-b-2 border-slate-900 active:border-b-0 active:translate-y-[1px] disabled:opacity-40 transition-all"><MousePointer2 size={16} /> 觀望</button><button onClick={() => openTrade('buy')} disabled={isAutoPlaying || cash < 10 || tradeMode} className="bg-red-600 active:bg-red-500 text-white py-2 rounded-lg font-bold text-xs flex flex-col items-center gap-0.5 border-b-2 border-red-800 active:border-b-0 active:translate-y-[1px] disabled:opacity-40 disabled:bg-slate-800 transition-all"><TrendingUp size={16} /> 買進</button><button onClick={() => openTrade('sell')} disabled={isAutoPlaying || units <= 0 || tradeMode} className="bg-green-600 active:bg-green-500 text-white py-2 rounded-lg font-bold text-xs flex flex-col items-center gap-0.5 border-b-2 border-green-800 active:border-b-0 active:translate-y-[1px] disabled:opacity-40 disabled:bg-slate-800 transition-all"><TrendingDown size={16} /> 賣出</button><button onClick={toggleAutoPlay} disabled={tradeMode} className={`flex flex-col items-center justify-center gap-0.5 rounded-lg font-bold text-xs border-b-2 active:border-b-0 active:translate-y-[1px] transition-all ${isAutoPlaying ? 'bg-amber-600 border-amber-800 text-white' : 'bg-slate-800 border-slate-900 text-slate-400'}`}>{isAutoPlaying ? <Pause size={16} /> : <Play size={16} />} {isAutoPlaying ? '暫停' : '自動'}</button></div>
        </div>

        <div className="flex-1 bg-slate-950 overflow-y-auto p-1 custom-scrollbar">{transactions.length === 0 && <div className="text-center text-slate-700 text-xs mt-8">尚未進行任何交易</div>}{transactions.map(t => (<div key={t.id} className="flex justify-between items-center p-2 mb-1 bg-slate-900 rounded border border-slate-800 text-[10px]"><div className="flex items-center gap-2"><span className={`w-8 text-center py-0.5 rounded font-bold ${t.type === 'BUY' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{t.type === 'BUY' ? '買' : '賣'}</span><span className="text-slate-500 font-mono">{fullData[t.day]?.date}</span><span className="text-slate-300 pl-1">{t.type === 'BUY' ? `$${t.amount.toLocaleString()}` : `${parseFloat(t.units).toFixed(2)}U`}</span></div><div className="text-right text-slate-400"><span className="mr-2 font-mono">${t.price.toFixed(2)}</span>{t.type === 'SELL' && (<span className={`font-bold ${t.pnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>{t.pnl >= 0 ? '+' : ''}{Math.round(t.pnl)}</span>)}</div></div>))}</div>

        {tradeMode && (<div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 pb-8 shadow-[0_-10px_50px_rgba(0,0,0,0.9)] z-50 animate-in slide-in-from-bottom duration-200 rounded-t-2xl"><div className="flex justify-between items-center mb-5"><h3 className={`text-lg font-bold flex items-center gap-2 ${tradeMode === 'buy' ? 'text-red-400' : 'text-green-400'}`}>{tradeMode === 'buy' ? <TrendingUp size={20} /> : <TrendingDown size={20} />} {tradeMode === 'buy' ? '買入' : '賣出'}</h3><button onClick={closeTrade} className="bg-slate-800 p-1.5 rounded-full text-slate-400 hover:text-white"><X size={20} /></button></div><div className="space-y-4"><div className="bg-slate-800 rounded-lg p-3 border border-slate-600 flex items-center"><span className="text-slate-400 font-mono mr-3 text-lg">{tradeMode === 'buy' ? '$' : 'U'}</span><input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} placeholder={tradeMode === 'buy' ? "輸入金額" : "輸入單位"} className="w-full bg-transparent text-2xl font-mono text-white outline-none" autoFocus /></div><div className="flex gap-2">{[0.25, 0.5, 1].map((pct) => (<button key={pct} onClick={() => tradeMode === 'buy' ? setBuyPercent(pct) : setSellPercent(pct)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono text-slate-300 border border-slate-700 transition-colors">{pct === 1 ? 'All In' : `${pct*100}%`}</button>))}</div><button onClick={tradeMode === 'buy' ? executeBuy : executeSell} className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all ${tradeMode === 'buy' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}><Check size={20} /> 確認</button></div></div>)}
        
        {showRankModal && (
             <div className="absolute inset-0 bg-slate-950/95 z-[70] flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="w-full max-w-md bg-slate-900 border border-amber-600/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Trophy size={18} className="text-amber-400"/> 賽季菁英榜</h3><button onClick={() => setShowRankModal(false)} className="text-slate-400 hover:text-white"><X size={20}/></button></div>
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {rankUploadStatus === 'asking_nick' && (<div className="text-center py-6"><User size={48} className="mx-auto text-emerald-500 mb-4"/><h4 className="text-xl font-bold text-white mb-2">參賽登記</h4><p className="text-slate-400 text-sm mb-6">請輸入您的比賽暱稱</p><input type="text" value={inputNickname} onChange={e => setInputNickname(e.target.value)} placeholder="例如：股海小童" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-center focus:border-emerald-500 outline-none mb-4" maxLength={12}/><button onClick={handleRegisterAndUpload} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold">確認並上傳</button></div>)}
                        {rankUploadStatus === 'uploading' && (<div className="flex flex-col items-center justify-center py-10"><Loader2 size={40} className="animate-spin text-amber-500 mb-4"/><p className="text-slate-400">正在同步賽事數據...</p></div>)}
                        {(rankUploadStatus === 'uploaded' || rankUploadStatus === 'idle') && (
                            <>
                                {leaderboardData.length < (seasonConfig?.minPlayers || 3) ? (
                                    <div className="text-center py-10 px-4"><div className="bg-slate-800/50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4"><UserCheck size={32} className="text-slate-600" /></div><h4 className="text-lg font-bold text-white mb-2">等待更多挑戰者</h4><p className="text-slate-400 text-sm">目前已有 <span className="text-amber-500 font-bold">{leaderboardData.length}</span> 位選手完賽。<br/>需滿 {seasonConfig?.minPlayers || 3} 人才會解鎖排行榜。</p></div>
                                ) : (
                                    <div className="space-y-2">
                                        {leaderboardData.slice(0, 3).map((entry, idx) => {
                                            const years = Math.floor(entry.durationMonths / 12);
                                            const months = entry.durationMonths % 12;
                                            const durationStr = years > 0 ? `${years}年${months}月` : `${months}個月`;
                                            return (
                                                <div key={entry.id} className={`relative flex justify-between items-center p-4 rounded-lg border ${idx===0 ? 'bg-amber-900/20 border-amber-500/50' : (idx===1 ? 'bg-slate-800/80 border-slate-600' : 'bg-slate-800/40 border-slate-800')}`}>
                                                    {idx===0 && <Crown size={16} className="absolute -top-2 -left-2 text-amber-400 transform -rotate-12" fill="currentColor"/>}
                                                    <div className="flex items-center gap-4"><div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${idx===0 ? 'bg-amber-400 text-black shadow-lg shadow-amber-500/50' : (idx===1 ? 'bg-slate-300 text-slate-900' : 'bg-orange-700 text-orange-100')}`}>{idx + 1}</div><div className="flex flex-col"><span className={`text-base font-bold ${entry.uid === user.uid ? 'text-emerald-400' : 'text-white'}`}>{entry.displayName}</span></div></div>
                                                    <div className="text-right"><div className={`text-lg font-mono font-bold ${entry.roi >= 0 ? 'text-red-400' : 'text-green-400'}`}>{entry.roi > 0 ? '+' : ''}{entry.roi}%</div><div className="text-xs text-slate-500">{durationStr}</div></div>
                                                </div>
                                            );
                                        })}
                                        <div className="text-center text-[10px] text-slate-600 mt-4 pt-4 border-t border-slate-800/50">僅顯示賽季前三名榮譽榜</div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
             </div>
        )}

        {gameStatus === 'ended' && (<div className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300"><Trophy size={64} className="text-amber-500 mb-4 animate-bounce" /><h2 className="text-3xl font-bold text-white mb-2 tracking-tight">挑戰完成</h2><p className="text-amber-500/80 text-sm mb-8 font-mono">{seasonConfig.title}</p><div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8"><div className="bg-slate-900 p-5 rounded-xl border border-slate-800"><div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">最終資產</div><div className={`text-xl font-mono font-bold ${roi >= 0 ? 'text-red-400' : 'text-green-400'}`}>${Math.round(totalAssets).toLocaleString()}</div></div><div className="bg-slate-900 p-5 rounded-xl border border-slate-800"><div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">總報酬率</div><div className={`text-xl font-mono font-bold ${roi >= 0 ? 'text-red-400' : 'text-green-400'}`}>{roi > 0 ? '+' : ''}{roi.toFixed(2)}%</div></div></div><div className="flex flex-col w-full max-w-xs gap-3"><button onClick={handleInitiateUpload} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-amber-900/20 active:scale-[0.98] transition-all mb-2 animate-pulse"><Sword size={18} /> {rankUploadStatus === 'uploaded' ? '查看目前戰況' : '上傳戰績'}</button><button onClick={executeReset} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-4 rounded-xl font-bold border border-slate-700 transition-colors"><RotateCcw size={18} /> 再挑戰一次</button><button onClick={executeExit} className="text-slate-500 text-xs mt-4 hover:text-white transition-colors">返回首頁</button></div></div>)}
        
        {confirmModal.show && (<div className="absolute inset-0 bg-slate-950/80 z-[60] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200"><div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-xs text-center"><h3 className="text-xl font-bold text-white mb-2">{confirmModal.type === 'exit' ? '放棄比賽？' : (confirmModal.type === 'reset' ? '重新挑戰？' : '結算成績')}</h3><div className="flex gap-3 justify-center mt-6"><button onClick={() => setConfirmModal({show:false, type:null})} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700">取消</button><button onClick={confirmModal.type === 'exit' ? executeExit : (confirmModal.type === 'reset' ? executeReset : executeEndGame)} className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-500">確定</button></div></div></div>)}
    </div>
  );
}