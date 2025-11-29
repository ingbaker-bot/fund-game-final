import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, ComposedChart } from 'recharts';
// 2025v1.0: 修復按鈕在禁用狀態下文字看不見的問題
import { Play, Pause, TrendingUp, TrendingDown, Activity, RotateCcw, AlertCircle, X, Check, MousePointer2, Flag, Download, Copy, Maximize, LogOut, Power, Lock, Database, UserCheck, Loader2, Waves, Crown, Info, ExternalLink, FileSpreadsheet, Share2, Mail, MessageCircle, Monitor, Sword, Trophy } from 'lucide-react';

import { FUNDS_LIBRARY } from '../config/funds';

const generateRandomData = (years = 30) => {
  const data = [];
  let price = 100.0; 
  const startDate = new Date('1995-01-01');
  const totalDays = years * 250;
  let trend = 0; let volatility = 0.015; 
  for (let i = 0; i < totalDays; i++) {
    const change = (Math.random() - 0.48 + trend) * volatility; 
    price = price * (1 + change);
    if (price < 5) price = 5 + Math.random(); 
    if (i % 200 === 0) { trend = (Math.random() - 0.5) * 0.003; volatility = 0.01 + Math.random() * 0.02; }
    const date = new Date(startDate); date.setDate(startDate.getDate() + (i * 1.4));
    data.push({ id: i, date: date.toISOString().split('T')[0], nav: parseFloat(price.toFixed(2)) });
  }
  return data;
};

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

export default function AppTrial() {
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
  const [customStopLossInput, setCustomStopLossInput] = useState(10);
  const [chartPeriod, setChartPeriod] = useState(250);
  const [dataSourceType, setDataSourceType] = useState('random');
  
  const [selectedFundId, setSelectedFundId] = useState('fund_A');
  
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
  const [showCsvCopyToast, setShowCsvCopyToast] = useState(false);

  const autoPlayRef = useRef(null);

  const handleExit = () => { 
      setGameStatus('shutdown'); 
      setTimeout(() => window.location.reload(), 500); 
  };

  useEffect(() => {
    const data = generateRandomData(30);
    setFullData(data);
    setCurrentDay(260);
    setIsReady(true);
    
    const ua = (navigator.userAgent || navigator.vendor || window.opera || "").toLowerCase();
    if (ua.indexOf('line') > -1) {
        setDetectedEnv('Line');
    } else if (ua.indexOf('fban') > -1 || ua.indexOf('fbav') > -1) {
        setDetectedEnv('Facebook');
    } else if (ua.indexOf('instagram') > -1) {
        setDetectedEnv('Instagram');
    } else {
        setDetectedEnv('Standard Browser');
    }
  }, []);

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

  const startGame = async () => {
    let data; 
    let startDay = 0; 
    let fundName = "模擬基金";

    if (dataSourceType === 'real') {
        const FREE_FUNDS = ['fund_A', 'fund_B', 'fund_C'];
        
        if (!FREE_FUNDS.includes(selectedFundId)) {
            setConfirmModal({ show: true, type: 'premium_fund' }); 
            return; 
        }

        const selectedFund = FUNDS_LIBRARY.find(f => f.id === selectedFundId);
        setGameStatus('loading_data');
        try {
            const response = await fetch(selectedFund.file);
            if (!response.ok) throw new Error("找不到數據檔案");
            const rawData = await response.json();
            if (rawData && rawData.length > 5) {
                 data = processRealData(rawData);
                 startDay = data.length > 60 ? 60 : 0;
                 fundName = selectedFund.name;
            } else {
                 throw new Error("數據過少");
            }
        } catch (error) {
             alert(`讀取基金數據失敗：${error.message}\n將切換為隨機模式。`);
             data = generateRandomData(30);
             startDay = 260;
             fundName = "隨機模擬基金";
        }
    } else {
        data = generateRandomData(30);
        startDay = 260;
        fundName = "隨機模擬基金";
    }
    
    setTransactions([]);
    setUnits(0);
    setAvgCost(0);
    setHighestNavSinceBuy(0);
    
    setFullData(data); 
    setCash(initialCapital); 
    setCurrentDay(startDay); 
    setCurrentFundName(fundName); 
    setGameStatus('playing');
  };

  const executeReset = () => { setConfirmModal({ show: false, type: null }); setShowShareMenu(false); clearInterval(autoPlayRef.current); setIsAutoPlaying(false); setTradeMode(null); setShowRiver(false); setUnits(0); setAvgCost(0); setTransactions([]); setHighestNavSinceBuy(0); setGameStatus('setup'); };
  const triggerReset = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } setConfirmModal({ show: true, type: 'reset' }); };
  const triggerEndGame = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } setConfirmModal({ show: true, type: 'end' }); };
  const executeEndGame = () => { setConfirmModal({ show: false, type: null }); setGameStatus('ended'); };
  const triggerExit = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } setConfirmModal({ show: true, type: 'exit' }); };
  const executeExit = () => { setConfirmModal({ show: false, type: null }); setGameStatus('shutdown'); };
  const advanceDay = () => { if (currentDay >= fullData.length - 1) { setGameStatus('ended'); return; } setCurrentDay(prev => prev + 1); };
  const openTrade = (mode) => { if (isAutoPlaying) toggleAutoPlay(); setTradeMode(mode); setInputAmount(''); };
  const closeTrade = () => { setTradeMode(null); setInputAmount(''); };
  const executeBuy = () => { const amount = parseFloat(inputAmount); if (!amount || amount <= 0 || amount > cash) return; const buyUnits = amount / currentNav; const newTotalUnits = units + buyUnits; const newAvgCost = (units * avgCost + amount) / newTotalUnits; setAvgCost(newAvgCost); setUnits(newTotalUnits); setCash(prev => prev - amount); setTransactions(prev => [{ id: Date.now(), day: currentDay, type: 'BUY', price: currentNav, units: buyUnits, amount: amount, balance: cash - amount }, ...prev]); if (units === 0) setHighestNavSinceBuy(currentNav); closeTrade(); advanceDay(); };
  const executeSell = () => { let unitsToSell = parseFloat(inputAmount); if (!unitsToSell || unitsToSell <= 0) return; if (unitsToSell > units) { if (unitsToSell - units < 0.1) unitsToSell = units; else return; } const sellAmount = unitsToSell * currentNav; const costOfSoldUnits = unitsToSell * avgCost; const pnl = sellAmount - costOfSoldUnits; setCash(prev => prev + sellAmount); setUnits(prev => { const remaining = prev - unitsToSell; return remaining < 0.0001 ? 0 : remaining; }); setTransactions(prev => [{ id: Date.now(), day: currentDay, type: 'SELL', price: currentNav, units: unitsToSell, amount: sellAmount, balance: cash + sellAmount, pnl }, ...prev]); if (Math.abs(units - unitsToSell) < 0.0001) { setHighestNavSinceBuy(0); setWarningActive(false); setAvgCost(0); setUnits(0); } closeTrade(); advanceDay(); };
  const toggleAutoPlay = () => { if (isAutoPlaying) { clearInterval(autoPlayRef.current); setIsAutoPlaying(false); } else { setTradeMode(null); setIsAutoPlaying(true); autoPlayRef.current = setInterval(() => { setCurrentDay(prev => prev + 1); }, 100); } };
  
  const getSafeDate = (dayIndex) => { if (dataSourceType === 'random') return `D${dayIndex}`; if (fullData && fullData[dayIndex]) return fullData[dayIndex].date; return 'N/A'; };
  const fmt = (val, dec) => { if (val === null || val === undefined || isNaN(val)) return '-'; const s = val.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); return `"${s}"`; };

  const getCSVContent = () => {
    let durationStr = "0年 0個月";
    if (transactions.length > 0) {
        const firstTx = transactions[transactions.length - 1]; const startData = fullData[firstTx.day]; const endData = fullData[currentDay];
        if (startData && endData) { const s = new Date(startData.date); const e = new Date(endData.date); let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()); const years = Math.floor(months / 12); const remainingMonths = months % 12; durationStr = `${years}年 ${remainingMonths}個月`; }
    }
    let csvContent = `基金名稱,${currentFundName}\n總報酬率,${roi > 0 ? '+' : ''}${roi.toFixed(2)}%\n總交易時間,${durationStr}\n最終資產,${fmt(totalAssets, 0)}\n\n交易日期,天數,類型,單價,單位數,交易金額,帳戶餘額,損益(賣出才有)\n`;
    transactions.forEach(t => { const dateStr = getSafeDate(t.day); const typeStr = t.type === 'BUY' ? '買入' : '賣出'; const row = `${dateStr},${fmt(t.day, 2)},${typeStr},${fmt(t.price, 2)},${fmt(t.units, 2)},${fmt(t.amount, 0)},${fmt(t.balance, 0)},${t.type === 'SELL' ? fmt(t.pnl, 0) : '-'}`; csvContent += row + "\n"; });
    return csvContent;
  };

  const handleShareAction = async (method) => {
    const shareText = `📊 Fund 手遊戰報\n基金: ${currentFundName}\n最終資產: $${Math.round(totalAssets).toLocaleString()}\n報酬率: ${roi.toFixed(2)}%\n\n#Fund手遊 #投資模擬`;
    const subject = encodeURIComponent(`[Fund 手遊戰報] ${currentFundName}`); const body = encodeURIComponent(shareText); const encodedText = encodeURIComponent(shareText);
    if (method === 'line') window.open(`https://line.me/R/msg/text/?${encodedText}`, '_blank');
    else if (method === 'gmail') window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
    else if (method === 'outlook') window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${subject}&body=${body}`, '_blank');
    else if (method === 'download') { const csvContent = getCSVContent(); const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.setAttribute("href", url); link.setAttribute("download", `fund_game_${currentFundName}_${new Date().toISOString().slice(0,10)}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
  };

  const triggerSmartShare = async () => {
    if (transactions.length === 0) { alert("尚無交易紀錄，無法匯出！"); return; }
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile && navigator.share && navigator.canShare) {
        const csvContent = getCSVContent(); const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); const file = new File([blob], `fund_game.csv`, { type: 'text/csv' }); const shareData = { files: [file], title: 'Fund 手遊戰報', text: `這是我的 Fund 手遊戰報：${currentFundName}` };
        if (navigator.canShare(shareData)) { try { await navigator.share(shareData); return; } catch (err) { console.warn('Share cancelled or failed', err); } }
    }
    setShowShareMenu(true);
  };

  const copyCSVToClipboard = () => { if (transactions.length === 0) { alert("尚無交易紀錄！"); return; } const csvContent = getCSVContent(); navigator.clipboard.writeText(csvContent).then(() => { setShowCsvCopyToast(true); setTimeout(() => setShowCsvCopyToast(false), 2000); }); };
  const copyToClipboard = () => { let text = `📊 Fund 手遊戰報\n基金: ${currentFundName}\n最終資產: $${Math.round(totalAssets).toLocaleString()}\n報酬率: ${roi.toFixed(2)}%\n`; navigator.clipboard.writeText(text).then(() => { setShowCopyToast(true); setTimeout(() => setShowCopyToast(false), 2000); }); };
  const setBuyPercent = (pct) => setInputAmount(Math.floor(cash * pct).toString());
  const setSellPercent = (pct) => { if (pct === 1) setInputAmount(units.toString()); else setInputAmount((units * pct).toFixed(2)); };
  const containerStyle = isCssFullscreen ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, width: '100vw', height: '100vh' } : { position: 'relative', height: '100vh', width: '100%' };

  if (gameStatus === 'shutdown') return ( <div className="h-screen w-screen bg-slate-50 flex flex-col items-center justify-center text-slate-600 font-sans"><Power size={48} className="mb-4 opacity-50" /><p className="text-lg">系統已關閉</p><button onClick={() => window.location.reload()} className="mt-8 px-6 py-2 border border-slate-300 rounded hover:bg-white hover:text-slate-800 transition-colors">重啟電源</button></div> );
  
  if (gameStatus === 'setup') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 p-6 flex flex-col items-center justify-center font-sans">
        <div className="w-full max-w-sm bg-white rounded-xl p-6 shadow-xl border border-slate-200 relative">
            <button onClick={handleExit} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors" title="離開"><LogOut size={24} /></button>
            <div className="flex justify-center mb-4 text-emerald-500"><Activity size={64} strokeWidth={1.5} /></div>
            <h1 className="text-3xl font-bold text-center mb-2 tracking-tight text-slate-800">Fund 手遊</h1>
            
            <div className="mb-6 mt-4">
                <button 
                    onClick={() => window.open('https://forms.gle/DKAiELnqwPndZNcC8', '_blank')}
                    className="w-full flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold py-3.5 rounded-xl border border-amber-200 transition-all group text-sm shadow-sm"
                >
                    <Sword size={20} className="group-hover:rotate-12 transition-transform"/> 前往 S1 賽季競技場 (會員限定)
                </button>
                <p className="text-xs text-slate-500 text-center mt-2">已有數百位玩家加入戰局</p>
            </div>

            <div className="flex items-center justify-center gap-2 mb-6"><UserCheck size={16} className="text-slate-400"/><span className="text-slate-500 text-sm">訪客 (Guest)</span></div>
            
            <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">初始資金</label>
            <input type="number" value={initialCapital} onChange={(e) => setInitialCapital(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 mb-4 text-2xl font-mono text-slate-800 focus:border-emerald-500 outline-none shadow-inner" />
            
            <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">選擇挑戰項目</label>
            <div className="flex gap-3 mb-4 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                <button onClick={() => setDataSourceType('random')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${dataSourceType === 'random' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>🎲 隨機</button>
                <button onClick={() => setDataSourceType('real')} className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${dataSourceType === 'real' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>📉 真實</button>
            </div>

            {dataSourceType === 'real' && (
                <div className="mb-4 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 shadow-sm">
                        <Database size={20} className="text-blue-500" />
                        <select value={selectedFundId} onChange={(e) => setSelectedFundId(e.target.value)} className="w-full bg-transparent text-slate-700 outline-none text-sm font-bold">
                            {FUNDS_LIBRARY.map(fund => (<option key={fund.id} value={fund.id} className="bg-white">{fund.name}</option>))}
                        </select>
                    </div>
                </div>
            )}

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                <div className="flex items-center justify-between mb-3 text-blue-600">
                    <div className="flex items-center gap-2"><Waves size={18} /><span className="text-sm font-bold uppercase tracking-wider">河流圖參數</span></div>
                    <span className="text-xs bg-blue-100 px-2 py-0.5 rounded text-blue-600 border border-blue-200">N=60 (季線)</span>
                </div>
                <div className="flex gap-2 mb-3">
                    <button onClick={() => setRiverMode('fixed')} className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${riverMode === 'fixed' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>固定 %</button>
                    <button onClick={() => setRiverMode('dynamic')} className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${riverMode === 'dynamic' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>動態標準差</button>
                </div>
                <div className="flex items-center bg-white border border-slate-300 rounded-lg px-4 py-2 shadow-sm">
                    {riverMode === 'fixed' ? (
                        <><span className="text-sm text-slate-500 mr-3 font-bold">寬度</span><input type="number" value={riverWidthInput} onChange={(e) => setRiverWidthInput(Number(e.target.value))} className="flex-1 bg-transparent text-center text-slate-800 outline-none font-mono text-lg"/><span className="text-sm text-slate-500 ml-3 font-bold">%</span></>
                    ) : (
                        <><span className="text-sm text-slate-500 mr-3 font-bold" title="標準差倍數">K 值</span><input type="number" step="0.1" min="1" max="5" value={riverSDMultiplier} onChange={(e) => setRiverSDMultiplier(Number(e.target.value))} className="flex-1 bg-transparent text-center text-emerald-600 font-bold outline-none font-mono text-lg"/><span className="text-sm text-slate-500 ml-3 font-bold">SD</span></>
                    )}
                </div>
                {riverMode === 'dynamic' && (<div className="text-xs text-slate-400 mt-2 text-center">* 試試將 K 改為 2.5 或 3，河流會變寬</div>)}
            </div>

            <label className="block text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">停損設定 (%)</label>
            <div className="flex items-center bg-slate-50 border border-slate-300 rounded-xl p-3 mb-8 shadow-inner">
                <input type="number" value={customStopLossInput} onChange={(e) => setCustomStopLossInput(Number(e.target.value))} className="flex-1 bg-transparent text-2xl font-mono text-center text-slate-800 focus:outline-none"/>
                <span className="text-slate-400 font-bold px-4 text-lg">%</span>
            </div>

            <button onClick={startGame} className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold py-4 rounded-xl text-xl shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <Play size={24} fill="currentColor" /> 開始挑戰
            </button>
            
            <div className="mt-6 text-center">
                <span className="bg-slate-100 text-slate-500 text-xs px-3 py-1.5 rounded-full border border-slate-200 font-mono">
                    2025v1.0 體驗版 NBS-奈AI團隊
                </span>
            </div>
        </div>
      </div>
    );
  }

  if (gameStatus === 'loading_data') return ( <div className="h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 gap-4"><Loader2 size={48} className="animate-spin text-emerald-500" /><p className="text-slate-500">正在載入數據...</p></div> );

  return (
    <div style={containerStyle} className="bg-slate-50 text-slate-800 font-sans flex flex-col overflow-hidden transition-all duration-300">
        <header className="bg-white px-4 py-2 border-b border-slate-200 flex justify-between items-center shrink-0 h-14 z-30 relative shadow-sm">
            <button onClick={triggerExit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 active:scale-95 transition-all font-bold">
                <LogOut size={14} /> 離開
            </button>
            <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-400 max-w-[140px] truncate font-bold">{currentFundName}</span>
                <span className={`text-base font-bold font-mono ${roi >= 0 ? 'text-red-500' : 'text-green-600'}`}>{roi > 0 ? '+' : ''}{roi.toFixed(2)}%</span>
            </div>
            <div className="flex gap-2">
                <button onClick={toggleFullscreen} className="p-2 rounded hover:bg-slate-100 text-slate-500"><Maximize size={18} /></button>
                <button onClick={triggerEndGame} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 text-sm hover:bg-emerald-100 active:scale-95 transition-all font-bold">
                    <Flag size={14} /> 結算
                </button>
            </div>
        </header>

        <div className="relative w-full bg-white border-b border-slate-200 shrink-0 z-0" style={{ height: '50%' }}>
            <div className="absolute top-3 left-4 z-0 pointer-events-none">
                <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold text-slate-800 tracking-tight shadow-white drop-shadow-sm font-mono">${currentNav.toFixed(2)}</span>
                    <span className="text-sm text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{getSafeDate(currentDay)}</span>
                </div>
                {avgCost > 0 && (<div className="text-xs text-slate-400 mt-1 font-mono font-bold ml-1">均價 ${avgCost.toFixed(2)}</div>)}
            </div>
            
            <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
                <div className="flex gap-1 bg-white/90 p-1 rounded-lg backdrop-blur-sm border border-slate-200 shadow-sm">
                    <button onClick={() => setShowMA20(!showMA20)} className={`px-2 py-1 rounded text-[10px] font-bold border ${showMA20 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-transparent text-slate-400 border-transparent hover:text-slate-600'}`}>月線</button>
                    <button onClick={() => setShowMA60(!showMA60)} className={`px-2 py-1 rounded text-[10px] font-bold border ${showMA60 ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-transparent text-slate-400 border-transparent hover:text-slate-600'}`}>季線</button>
                    <button onClick={() => setShowRiver(!showRiver)} className={`px-2 py-1 rounded text-[10px] font-bold border ${showRiver ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-transparent text-slate-400 border-slate-200 hover:text-slate-600'}`}>河流</button>
                </div>
                <div className="flex bg-white/90 rounded-lg border border-slate-200 p-1 backdrop-blur-sm shadow-sm">
                    {[125, 250, 500].map(days => (
                        <button key={days} onClick={() => setChartPeriod(days)} className={`px-2.5 py-1 text-[10px] font-bold rounded transition-colors ${chartPeriod === days ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                            {days === 125 ? '半年' : (days === 250 ? '1年' : '2年')}
                        </button>
                    ))}
                </div>
            </div>
            
            <button onClick={triggerReset} className="absolute bottom-4 left-4 z-10 p-2.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors shadow-lg" title="重置">
                <RotateCcw size={18} />
            </button>
            
            {warningActive && gameStatus === 'playing' && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 bg-red-500 text-white px-4 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-2 backdrop-blur-sm border-2 border-red-200">
                    <AlertCircle size={16} strokeWidth={2.5} />
                    <span className="text-sm font-extrabold tracking-wide">觸及停損 ({customStopLossInput}%)</span>
                </div>
            )}
            
            {isReady && chartDataInfo.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartDataInfo.data} margin={{ top: 80, right: 5, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} opacity={0.8} />
                        <YAxis domain={chartDataInfo.domain} orientation="right" tick={{fill: '#64748b', fontSize: 11, fontWeight: 'bold'}} width={40} tickFormatter={(v) => Math.round(v)} interval="preserveStartEnd" />
                        {showRiver && (<><Line type="monotone" dataKey="riverTop" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.3} /><Line type="monotone" dataKey="riverBottom" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.3} /></>)}
                        
                        {/* 修改處開始：線條顏色調整 */}
                        {/* 月線 (MA20): 淺藍色 */}
                        {showMA20 && <Line type="monotone" dataKey="ma20" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.9} />}
                        {/* 季線 (MA60): 藍色 */}
                        {showMA60 && <Line type="monotone" dataKey="ma60" stroke="#1d4ed8" strokeWidth={2} dot={false} isAnimationActive={false} opacity={0.9} />}
                        {/* 淨值 (NAV): 黑色 (陰影也改為黑色) */}
                        <Line type="monotone" dataKey="nav" stroke="#000000" strokeWidth={2.5} dot={false} isAnimationActive={false} shadow="0 0 10px rgba(0, 0, 0, 0.2)" />
                        {/* 修改處結束 */}

                        {units > 0 && chartDataInfo.stopLossPrice && (<ReferenceLine y={chartDataInfo.stopLossPrice} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={2} label={{ position: 'insideBottomLeft', value: `Stop ${chartDataInfo.stopLossPrice.toFixed(1)}`, fill: '#ef4444', fontSize: 11, fontWeight: 'bold', dy: -8 }} />)}
                    </ComposedChart>
                </ResponsiveContainer>
            ) : <div className="flex items-center justify-center h-full text-slate-400">載入中...</div>}
        </div>

        {/* Control Panel - 2025v1.0 修正：禁用狀態下文字可見 */}
        <div className="bg-white shrink-0 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] border-t border-slate-200">
            <div className="flex justify-between px-5 py-2 bg-slate-50 border-b border-slate-200 text-xs">
                <div className="flex gap-2 items-center"><span className="text-slate-500">總資產</span><span className={`font-mono font-bold text-base ${roi>=0?'text-red-500':'text-green-600'}`}>${Math.round(totalAssets).toLocaleString()}</span></div>
                <div className="flex gap-2 items-center"><span className="text-slate-500">現金</span><span className="text-emerald-600 font-mono font-bold text-base">${Math.round(cash).toLocaleString()}</span></div>
            </div>
            
            <div className="grid grid-cols-4 gap-2 p-3 bg-white">
                <button onClick={advanceDay} disabled={isAutoPlaying || tradeMode} className="bg-white active:bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-sm flex flex-col items-center gap-1 border-b-4 border-slate-200 active:border-b-0 active:translate-y-[2px] disabled:opacity-40 disabled:text-slate-400 transition-all shadow-sm hover:bg-slate-50">
                    <MousePointer2 size={20} className="text-slate-400"/> 觀望
                </button>
                {/* 買進按鈕 */}
                <button onClick={() => openTrade('buy')} disabled={isAutoPlaying || cash < 10 || tradeMode} className="bg-rose-600 active:bg-rose-700 text-white py-3 rounded-xl font-bold text-sm flex flex-col items-center gap-1 border-b-4 border-rose-800 active:border-b-0 active:translate-y-[2px] disabled:opacity-40 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-300 transition-all shadow-md shadow-rose-100">
                    <TrendingUp size={20} /> 買進
                </button>
                {/* 賣出按鈕 */}
                <button onClick={() => openTrade('sell')} disabled={isAutoPlaying || units <= 0 || tradeMode} className="bg-emerald-600 active:bg-emerald-700 text-white py-3 rounded-xl font-bold text-sm flex flex-col items-center gap-1 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-[2px] disabled:opacity-40 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-300 transition-all shadow-md shadow-emerald-100">
                    <TrendingDown size={20} /> 賣出
                </button>
                <button onClick={toggleAutoPlay} disabled={tradeMode} className={`flex flex-col items-center justify-center gap-1 rounded-xl font-bold text-sm border-b-4 active:border-b-0 active:translate-y-[2px] transition-all shadow-sm py-3 ${isAutoPlaying ? 'bg-amber-500 border-amber-700 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 disabled:text-slate-400'}`}>
                    {isAutoPlaying ? <Pause size={20} /> : <Play size={20} />} {isAutoPlaying ? '暫停' : '自動'}
                </button>
            </div>
        </div>

        <div className="flex-1 bg-slate-50 overflow-y-auto p-2 custom-scrollbar">
            {transactions.length === 0 && <div className="text-center text-slate-400 text-sm mt-12 flex flex-col items-center gap-2"><Info size={32} opacity={0.5}/>尚未進行任何交易</div>}
            {transactions.map(t => (
                <div key={t.id} className="flex justify-between items-center p-3 mb-2 bg-white rounded-xl border border-slate-200 text-xs shadow-sm">
                    <div className="flex items-center gap-3">
                        <span className={`w-10 text-center py-1 rounded-md font-bold text-xs ${t.type === 'BUY' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                            {t.type === 'BUY' ? '買進' : '賣出'}
                        </span>
                        <div className="flex flex-col">
                            <span className="text-slate-700 font-mono font-bold">{getSafeDate(t.day)}</span>
                            <span className="text-slate-400 text-[10px]">{t.type === 'BUY' ? `$${t.amount.toLocaleString()}` : `${parseFloat(t.units).toFixed(2)} 單位`}</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-slate-800 font-mono text-sm font-bold">${t.price.toFixed(2)}</div>
                        {t.type === 'SELL' && (<span className={`font-bold font-mono ${t.pnl >= 0 ? 'text-red-500' : 'text-green-600'}`}>{t.pnl >= 0 ? '+' : ''}{Math.round(t.pnl)}</span>)}
                    </div>
                </div>
            ))}
        </div>

        {tradeMode && (
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-5 pb-8 shadow-[0_-10px_50px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom duration-200 rounded-t-3xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className={`text-2xl font-bold flex items-center gap-2 ${tradeMode === 'buy' ? 'text-red-500' : 'text-green-600'}`}>
                        {tradeMode === 'buy' ? <TrendingUp size={28} /> : <TrendingDown size={28} />} 
                        {tradeMode === 'buy' ? '買進資金' : '賣出單位'}
                    </h3>
                    <button onClick={closeTrade} className="bg-slate-100 p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"><X size={24} /></button>
                </div>
                <div className="space-y-5">
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex items-center shadow-inner">
                        <span className="text-slate-400 font-mono mr-3 text-2xl font-bold">{tradeMode === 'buy' ? '$' : 'U'}</span>
                        <input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} placeholder={tradeMode === 'buy' ? "輸入金額" : "輸入單位"} className="w-full bg-transparent text-3xl font-mono text-slate-800 outline-none font-bold" autoFocus />
                    </div>
                    <div className="flex gap-3">
                        {[0.25, 0.5, 1].map((pct) => (
                            <button key={pct} onClick={() => tradeMode === 'buy' ? setBuyPercent(pct) : setSellPercent(pct)} className="flex-1 py-4 bg-white hover:bg-slate-50 rounded-xl text-sm font-mono font-bold text-slate-500 border border-slate-300 transition-colors shadow-sm">
                                {pct === 1 ? '全部 (All In)' : `${pct*100}%`}
                            </button>
                        ))}
                    </div>
                    <button onClick={tradeMode === 'buy' ? executeBuy : executeSell} className={`w-full py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] transition-all ${tradeMode === 'buy' ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-100' : 'bg-green-700 hover:bg-green-700 text-white shadow-green-100'}`}>
                        <Check size={24} strokeWidth={3} /> 確認交易
                    </button>
                </div>
            </div>
        )}
        
        {gameStatus === 'ended' && (
            <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300 backdrop-blur-md">
                <div className="bg-emerald-50 p-4 rounded-full mb-4 ring-4 ring-emerald-100">
                    <Activity size={56} className="text-emerald-500" />
                </div>
                <h2 className="text-4xl font-bold text-slate-800 mb-1 tracking-tight">結算成績單</h2>
                <p className="text-sm text-slate-500 mb-8 font-medium">(2025v1.0 體驗版結算)</p>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg">
                        <div className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">最終資產</div>
                        <div className={`text-2xl font-mono font-bold ${roi >= 0 ? 'text-red-500' : 'text-green-600'}`}>${Math.round(totalAssets).toLocaleString()}</div>
                    </div>
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg">
                        <div className="text-xs text-slate-400 mb-1 uppercase tracking-wider font-bold">總報酬率</div>
                        <div className={`text-2xl font-mono font-bold ${roi >= 0 ? 'text-red-500' : 'text-green-600'}`}>{roi > 0 ? '+' : ''}{roi.toFixed(2)}%</div>
                    </div>
                </div>
                
                <div className="flex flex-col w-full max-w-xs gap-3">
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200 mb-4 animate-pulse shadow-lg">
                        <p className="text-sm text-amber-600 text-center mb-3 font-bold">想挑戰更多真實基金數據？</p>
                        <a 
                            href="https://forms.gle/DKAiELnqwPndZNcC8" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white py-3.5 rounded-xl font-bold shadow-md text-base transition-all transform hover:-translate-y-0.5"
                            style={{ textDecoration: 'none' }}
                        >
                            <Crown size={18} fill="currentColor" /> 申請進階會員 (解鎖 20 檔)
                        </a>
                    </div>
                    
                    <button onClick={triggerSmartShare} className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-600 py-4 rounded-xl font-bold border border-slate-200 transition-colors text-sm shadow-sm">
                        <Share2 size={18} className="text-blue-500"/> 匯出 Excel / 分享
                    </button>
                    
                    <button onClick={executeReset} className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-100 active:scale-[0.98] transition-all mt-2">
                        <RotateCcw size={20} /> 重新開始挑戰
                    </button>
                    
                    <div className="mt-6 text-center text-[10px] text-slate-400">
                        Environment: {detectedEnv} | 2025v1.0 NBS-奈AI團隊
                    </div>
                </div>
            </div>
        )}

        {confirmModal.show && (
            <div className="absolute inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-2xl w-full max-w-xs text-center transform scale-100">
                    <div className="flex justify-center mb-4">
                        {confirmModal.type === 'exit' ? <LogOut size={48} className="text-slate-400"/> : 
                         confirmModal.type === 'reset' ? <RotateCcw size={48} className="text-slate-400"/> : 
                         confirmModal.type === 'premium' || confirmModal.type === 'premium_fund' ? <Crown size={48} className="text-amber-400" fill="currentColor"/> : 
                         <Flag size={48} className="text-emerald-500"/>}
                    </div>
                    <h3 className={`text-2xl font-bold mb-3 ${confirmModal.type.includes('premium') ? 'text-amber-500' : 'text-slate-800'}`}>
                        {confirmModal.type === 'exit' ? '離開遊戲' : 
                         confirmModal.type === 'reset' ? '重置遊戲' : 
                         confirmModal.type === 'premium' ? '進階會員專屬' : 
                         confirmModal.type === 'premium_fund' ? '解鎖真實基金' : 
                         '結算遊戲'}
                    </h3>
                    <p className="text-slate-500 text-base mb-8 leading-relaxed">
                        {confirmModal.type === 'exit' ? '確定要離開體驗版嗎？' : 
                         confirmModal.type === 'reset' ? '確定要重新開始嗎？' : 
                         confirmModal.type === 'premium' ? '體驗版僅開放前 3 檔基金，解鎖全部 20 檔真實歷史數據請升級進階會員。' : 
                         confirmModal.type === 'premium_fund' ? '此為付費會員專屬基金，請申請會員以解鎖挑戰權限。' : 
                         '確定要現在結束並查看成績？'}
                    </p>
                    <div className="flex gap-3 justify-center">
                        {(confirmModal.type.includes('premium')) ? (
                             <a 
                                href="https://forms.gle/DKAiELnqwPndZNcC8" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex-1 py-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-lg flex items-center justify-center text-base"
                                style={{ textDecoration: 'none' }}
                                onClick={() => setConfirmModal({show:false, type:null})}
                            >
                                立即申請
                            </a>
                        ) : (
                            <>
                                <button onClick={() => setConfirmModal({show:false, type:null})} className="flex-1 py-4 rounded-xl bg-white text-slate-500 font-bold hover:bg-slate-50 border border-slate-200">取消</button>
                                <button onClick={confirmModal.type === 'exit' ? executeExit : (confirmModal.type === 'reset' ? executeReset : executeEndGame)} className={`flex-1 py-4 rounded-xl font-bold text-white text-lg shadow-lg ${confirmModal.type === 'exit' ? 'bg-red-500 hover:bg-red-600' : (confirmModal.type === 'reset' ? 'bg-slate-500 hover:bg-slate-600' : 'bg-emerald-500 hover:bg-emerald-600')}`}>確定</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}

        {showShareMenu && (
            <div className="absolute inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-2xl w-full max-w-sm text-center relative">
                    <button onClick={() => setShowShareMenu(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2"><X size={24}/></button>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">分享戰報</h3>
                    <p className="text-sm text-slate-500 mb-8">請選擇您習慣的分享方式</p>
                    <div className="flex flex-col gap-3">
                        <button onClick={() => handleShareAction('line')} className="flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05b54d] text-white py-4 rounded-xl font-bold transition-colors text-base shadow-lg">
                            <MessageCircle size={22} /> 分享至 Line (文字)
                        </button>
                        <button onClick={() => handleShareAction('gmail')} className="flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-red-600 py-4 rounded-xl font-bold transition-colors border border-slate-200 text-base shadow-sm">
                            <Mail size={22} /> 分享至 Gmail (寫信)
                        </button>
                        <button onClick={() => handleShareAction('download')} className="flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-600 py-4 rounded-xl font-bold transition-colors border border-slate-200 text-base shadow-sm">
                            <Download size={22} /> 僅下載 Excel 檔案
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}