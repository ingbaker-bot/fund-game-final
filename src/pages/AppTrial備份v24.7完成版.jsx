import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, ComposedChart } from 'recharts';
import { Play, Pause, TrendingUp, TrendingDown, Activity, RotateCcw, AlertCircle, X, Check, MousePointer2, Flag, Download, Copy, Maximize, LogOut, Power, Lock, Database, UserCheck, Loader2, Waves, Crown, Info, ExternalLink, FileSpreadsheet, Share2, Mail, MessageCircle, Monitor } from 'lucide-react';

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
            setConfirmModal({ show: true, type: 'premium' }); 
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
    
    // V24.7 FIX: 強制清空舊交易紀錄，防止狀態污染
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
  
  // V24.7 FIX: 安全獲取日期，防止崩潰
  const getSafeDate = (dayIndex) => {
      if (dataSourceType === 'random') return `D${dayIndex}`;
      // 強制檢查 fullData 是否存在
      if (fullData && fullData[dayIndex]) return fullData[dayIndex].date;
      return 'N/A';
  };

  const getCSVContent = () => {
    let durationStr = "0年 0個月";
    if (transactions.length > 0) {
        const firstTx = transactions[transactions.length - 1]; 
        const startData = fullData[firstTx.day];
        const endData = fullData[currentDay];
        
        if (startData && endData) {
            const s = new Date(startData.date);
            const e = new Date(endData.date);
            let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
            const years = Math.floor(months / 12);
            const remainingMonths = months % 12;
            durationStr = `${years}年 ${remainingMonths}個月`;
        }
    }

    const fmt = (val, dec, useFormula = false) => {
        if (val === null || val === undefined || isNaN(val)) return '-';
        const s = val.toLocaleString('en-US', {
            minimumFractionDigits: dec,
            maximumFractionDigits: dec
        });
        return useFormula ? `="${s}"` : `"${s}"`;
    };

    let csvContent = `基金名稱,${currentFundName}\n`;
    csvContent += `總報酬率,${roi > 0 ? '+' : ''}${roi.toFixed(2)}%\n`;
    csvContent += `總交易時間,${durationStr}\n`;
    csvContent += `最終資產,${fmt(totalAssets, 0, true)}\n`; 
    csvContent += `\n`; 

    csvContent += "交易日期,天數,類型,單價,單位數,交易金額,帳戶餘額,損益(賣出才有)\n";

    transactions.forEach(t => {
        const dateStr = getSafeDate(t.day);
        const typeStr = t.type === 'BUY' ? '買入' : '賣出';
        const row = `${dateStr},${fmt(t.day, 2, true)},${typeStr},${fmt(t.price, 2, true)},${fmt(t.units, 2, true)},${fmt(t.amount, 0, true)},${fmt(t.balance, 0, true)},${t.type === 'SELL' ? fmt(t.pnl, 0, true) : '-'}`;
        csvContent += row + "\n";
    });
    return csvContent;
  };

  // V24.7: 優化分享功能 (Line, Gmail, Outlook)
  const handleShareAction = async (method) => {
    const shareText = `📊 Fund 手遊戰報\n基金: ${currentFundName}\n最終資產: $${Math.round(totalAssets).toLocaleString()}\n報酬率: ${roi.toFixed(2)}%\n\n#Fund手遊 #投資模擬`;
    const subject = encodeURIComponent(`[Fund 手遊戰報] ${currentFundName}`);
    const body = encodeURIComponent(shareText);
    const encodedText = encodeURIComponent(shareText);
    
    if (method === 'line') {
        window.open(`https://line.me/R/msg/text/?${encodedText}`, '_blank');
    } else if (method === 'gmail') {
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
    } else if (method === 'outlook') {
        window.open(`https://outlook.live.com/mail/0/deeplink/compose?subject=${subject}&body=${body}`, '_blank');
    } else if (method === 'download') {
        const csvContent = getCSVContent();
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `fund_game_${currentFundName}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  const triggerSmartShare = async () => {
    if (transactions.length === 0) { alert("尚無交易紀錄，無法匯出！"); return; }

    if (navigator.share && navigator.canShare) {
        const csvContent = getCSVContent();
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const file = new File([blob], `fund_game.csv`, { type: 'text/csv' });
        const shareData = {
            files: [file],
            title: 'Fund 手遊戰報',
            text: `這是我的 Fund 手遊戰報：${currentFundName}`
        };
        if (navigator.canShare(shareData)) {
            try { await navigator.share(shareData); return; } 
            catch (err) { console.warn('Share cancelled or failed', err); }
        }
    }
    setShowShareMenu(true);
  };

  const copyCSVToClipboard = () => {
      if (transactions.length === 0) { alert("尚無交易紀錄！"); return; }
      const csvContent = getCSVContent();
      navigator.clipboard.writeText(csvContent).then(() => { 
          setShowCsvCopyToast(true); 
          setTimeout(() => setShowCsvCopyToast(false), 2000); 
      });
  };

  const copyToClipboard = () => { let text = `📊 Fund 手遊戰報\n基金: ${currentFundName}\n最終資產: $${Math.round(totalAssets).toLocaleString()}\n報酬率: ${roi.toFixed(2)}%\n`; navigator.clipboard.writeText(text).then(() => { setShowCopyToast(true); setTimeout(() => setShowCopyToast(false), 2000); }); };
  const setBuyPercent = (pct) => setInputAmount(Math.floor(cash * pct).toString());
  const setSellPercent = (pct) => { if (pct === 1) setInputAmount(units.toString()); else setInputAmount((units * pct).toFixed(2)); };
  const containerStyle = isCssFullscreen ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, width: '100vw', height: '100vh' } : { position: 'relative', height: '100vh', width: '100%' };

  if (gameStatus === 'shutdown') return ( <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-slate-600 font-sans"><Power size={48} className="mb-4 opacity-50" /><p className="text-lg">系統已關閉</p><button onClick={() => window.location.reload()} className="mt-8 px-6 py-2 border border-slate-800 rounded hover:bg-slate-900 hover:text-slate-400 transition-colors">重啟電源</button></div> );
  
  if (gameStatus === 'setup') {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center justify-center font-sans">
        <div className="w-full max-w-sm bg-slate-900 rounded-xl p-6 shadow-2xl border border-slate-800 relative">
            <button onClick={handleExit} className="absolute top-4 right-4 text-slate-600 hover:text-red-400 transition-colors" title="離開"><LogOut size={20} /></button>
            <div className="flex justify-center mb-4 text-emerald-400"><Activity size={56} strokeWidth={1.5} /></div>
            <h1 className="text-3xl font-bold text-center mb-2 tracking-tight">Fund 手遊</h1>
            
            <div className="text-center mb-6">
                <span className="bg-slate-800 text-slate-400 text-xs px-2 py-1 rounded border border-slate-700">
                    v24.7 體驗版 (Native Share)
                </span>
            </div>
            <div className="flex items-center justify-center gap-2 mb-4"><UserCheck size={14} className="text-slate-500"/><span className="text-slate-500 text-xs">訪客 (Guest)</span></div>
            
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">初始資金</label>
            <input type="number" value={initialCapital} onChange={(e) => setInitialCapital(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 mb-3 text-xl font-mono text-white focus:border-emerald-500 outline-none" />
            
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">選擇挑戰項目</label>
            <div className="flex gap-2 mb-3 bg-slate-950 p-1 rounded-lg border border-slate-700">
                <button onClick={() => setDataSourceType('random')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${dataSourceType === 'random' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>🎲 隨機</button>
                <button onClick={() => setDataSourceType('real')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${dataSourceType === 'real' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>📉 真實</button>
            </div>

            {dataSourceType === 'real' && (
                <div className="mb-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2">
                        <Database size={18} className="text-blue-400" />
                        <select value={selectedFundId} onChange={(e) => setSelectedFundId(e.target.value)} className="w-full bg-transparent text-white outline-none text-sm">
                            {FUNDS_LIBRARY.map(fund => (<option key={fund.id} value={fund.id} className="bg-slate-900">{fund.name}</option>))}
                        </select>
                    </div>
                </div>
            )}

            <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 mb-6">
                <div className="flex items-center justify-between mb-2 text-blue-400">
                    <div className="flex items-center gap-2"><Waves size={16} /><span className="text-xs font-bold uppercase tracking-wider">河流圖參數</span></div>
                    <span className="text-[10px] bg-blue-900/30 px-1.5 py-0.5 rounded text-blue-300">N=60 (季線)</span>
                </div>
                <div className="flex gap-2 mb-2">
                    <button onClick={() => setRiverMode('fixed')} className={`flex-1 py-1.5 text-xs rounded transition-colors ${riverMode === 'fixed' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>固定 %</button>
                    <button onClick={() => setRiverMode('dynamic')} className={`flex-1 py-1.5 text-xs rounded transition-colors ${riverMode === 'dynamic' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>動態標準差</button>
                </div>
                <div className="flex items-center bg-slate-800 border border-slate-600 rounded px-3 py-1">
                    {riverMode === 'fixed' ? (
                        <><span className="text-xs text-slate-400 mr-2">寬度</span><input type="number" value={riverWidthInput} onChange={(e) => setRiverWidthInput(Number(e.target.value))} className="flex-1 bg-transparent text-center text-white outline-none font-mono"/><span className="text-xs text-slate-400 ml-2">%</span></>
                    ) : (
                        <><span className="text-xs text-slate-400 mr-2" title="標準差倍數">K 值</span><input type="number" step="0.1" min="1" max="5" value={riverSDMultiplier} onChange={(e) => setRiverSDMultiplier(Number(e.target.value))} className="flex-1 bg-transparent text-center text-emerald-400 font-bold outline-none font-mono"/><span className="text-xs text-slate-400 ml-2">SD</span></>
                    )}
                </div>
                {riverMode === 'dynamic' && (<div className="text-[10px] text-slate-500 mt-2 text-center">* 試試將 K 改為 2.5 或 3，河流會變寬</div>)}
            </div>

            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">停損設定 (%)</label>
            <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-2 mb-6">
                <input type="number" value={customStopLossInput} onChange={(e) => setCustomStopLossInput(Number(e.target.value))} className="flex-1 bg-transparent text-xl font-mono text-center text-white focus:outline-none"/>
                <span className="text-slate-500 font-bold px-4">%</span>
            </div>
            <button onClick={startGame} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 rounded-xl text-lg shadow-xl active:scale-[0.98] transition-all">開始挑戰</button>
            
            <div className="mt-4 text-center text-[10px] text-slate-600">
               本系統採邀請制，如無帳號請洽ingbaker@gmail.com<br/>
               Fund 手遊 v24.7 版權所有 NBS-奈AI團隊
              </div>
        </div>
      </div>
    );
  }

  if (gameStatus === 'loading_data') return ( <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4"><Loader2 size={48} className="animate-spin text-emerald-500" /><p className="text-slate-400">正在載入數據...</p></div> );

  return (
    <div style={containerStyle} className="bg-slate-950 text-slate-200 font-sans flex flex-col overflow-hidden transition-all duration-300">
        <header className="bg-slate-900 px-3 py-1 border-b border-slate-800 flex justify-between items-center shrink-0 h-12 z-30 relative shadow-md">
            <button onClick={triggerExit} className="flex items-center gap-1 px-2 py-1.5 rounded bg-slate-800/50 border border-slate-700 text-slate-400 text-xs hover:text-white active:scale-95 transition-all"><LogOut size={12} /> 離開</button>
            <div className="flex flex-col items-center"><span className="text-[10px] text-slate-500 max-w-[120px] truncate">{currentFundName}</span><span className={`text-sm font-bold font-mono ${roi >= 0 ? 'text-red-400' : 'text-green-400'}`}>{roi > 0 ? '+' : ''}{roi.toFixed(2)}%</span></div>
            <div className="flex gap-2"><button onClick={toggleFullscreen} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><Maximize size={14} /></button><button onClick={triggerEndGame} className="flex items-center gap-1 px-2 py-1.5 rounded bg-red-900/20 border border-red-900/40 text-red-400 text-xs hover:bg-red-900/40 active:scale-95 transition-all"><Flag size={12} /> 結算</button></div>
        </header>

        <div className="relative w-full bg-slate-900/30 border-b border-slate-800 shrink-0 z-0" style={{ height: '50%' }}>
            <div className="absolute top-3 left-4 z-0 pointer-events-none"><div className="flex items-baseline gap-2"><span className="text-3xl font-bold text-white tracking-tight shadow-black drop-shadow-md">${currentNav.toFixed(2)}</span><span className="text-xs text-slate-500 font-mono">{dataSourceType==='real' ? fullData[currentDay]?.date : `Day ${currentDay}`}</span></div>{avgCost > 0 && (<div className="text-[10px] text-slate-400 mt-1 font-mono">均價 ${avgCost.toFixed(2)}</div>)}</div>
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

        <div className="flex-1 bg-slate-950 overflow-y-auto p-1 custom-scrollbar">{transactions.length === 0 && <div className="text-center text-slate-700 text-xs mt-8">尚未進行任何交易</div>}{transactions.map(t => (<div key={t.id} className="flex justify-between items-center p-2 mb-1 bg-slate-900 rounded border border-slate-800 text-[10px]"><div className="flex items-center gap-2"><span className={`w-8 text-center py-0.5 rounded font-bold ${t.type === 'BUY' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{t.type === 'BUY' ? '買' : '賣'}</span><span className="text-slate-500 font-mono">{getSafeDate(t.day)}</span><span className="text-slate-300 pl-1">{t.type === 'BUY' ? `$${t.amount.toLocaleString()}` : `${parseFloat(t.units).toFixed(2)}U`}</span></div><div className="text-right text-slate-400"><span className="mr-2 font-mono">${t.price.toFixed(2)}</span>{t.type === 'SELL' && (<span className={`font-bold ${t.pnl >= 0 ? 'text-red-400' : 'text-green-400'}`}>{t.pnl >= 0 ? '+' : ''}{Math.round(t.pnl)}</span>)}</div></div>))}</div>

        {confirmModal.show && (
            <div className="absolute inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-xs text-center">
                    <div className="flex justify-center mb-4">
                        {confirmModal.type === 'exit' ? <LogOut size={40} className="text-slate-400"/> : 
                         confirmModal.type === 'reset' ? <RotateCcw size={40} className="text-slate-400"/> : 
                         confirmModal.type === 'premium' ? <Crown size={40} className="text-amber-400"/> : 
                         <Flag size={40} className="text-emerald-500"/>}
                    </div>
                    
                    <h3 className={`text-xl font-bold mb-2 ${confirmModal.type === 'premium' ? 'text-amber-400' : 'text-white'}`}>
                        {confirmModal.type === 'exit' ? '離開遊戲' : 
                         confirmModal.type === 'reset' ? '重置遊戲' : 
                         confirmModal.type === 'premium' ? '進階會員專屬' : 
                         '結算遊戲'}
                    </h3>
                    
                    <div className="flex gap-3 justify-center">
                        {confirmModal.type === 'premium' ? (
                            <button onClick={() => setConfirmModal({show:false, type:null})} className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold shadow-lg">
                                了解，繼續體驗
                            </button>
                        ) : (
                            <>
                                <button onClick={() => setConfirmModal({show:false, type:null})} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700">取消</button>
                                <button onClick={confirmModal.type === 'exit' ? executeExit : (confirmModal.type === 'reset' ? executeReset : executeEndGame)} className={`flex-1 py-3 rounded-xl font-bold text-white ${confirmModal.type === 'exit' ? 'bg-red-600 hover:bg-red-500' : (confirmModal.type === 'reset' ? 'bg-slate-600 hover:bg-slate-500' : 'bg-emerald-600 hover:bg-emerald-500')}`}>確定</button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* V24.7 新增：分享選單 (含 Gmail/Outlook) */}
        {showShareMenu && (
            <div className="absolute inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-2xl w-full max-w-sm text-center relative">
                    <button onClick={() => setShowShareMenu(false)} className="absolute top-3 right-3 text-slate-500 hover:text-white"><X size={20}/></button>
                    <h3 className="text-xl font-bold text-white mb-2">分享戰報</h3>
                    <p className="text-xs text-slate-400 mb-6">請選擇您習慣的分享方式</p>
                    
                    <div className="flex flex-col gap-3">
                        <button onClick={() => handleShareAction('line')} className="flex items-center justify-center gap-3 bg-[#06C755] hover:bg-[#05b54d] text-white py-3 rounded-xl font-bold transition-colors">
                            <MessageCircle size={20} /> 分享至 Line (文字)
                        </button>
                        <button onClick={() => handleShareAction('gmail')} className="flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-red-600 py-3 rounded-xl font-bold transition-colors border border-slate-200">
                            <Mail size={20} /> 分享至 Gmail (寫信)
                        </button>
                        <button onClick={() => handleShareAction('outlook')} className="flex items-center justify-center gap-3 bg-[#0078D4] hover:bg-[#006cbd] text-white py-3 rounded-xl font-bold transition-colors border border-slate-200">
                            <Monitor size={20} /> 分享至 Outlook (寫信)
                        </button>
                        <div className="border-t border-slate-800 my-1"></div>
                        <button onClick={() => handleShareAction('download')} className="flex items-center justify-center gap-3 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-xl font-bold transition-colors border border-slate-700">
                            <Download size={20} /> 僅下載 Excel 檔案
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-4 text-center px-4">
                        * 電腦版瀏覽器會以彈出視窗開啟，請確保未封鎖彈跳視窗。
                    </p>
                </div>
            </div>
        )}

        {tradeMode && (<div className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 pb-8 shadow-[0_-10px_50px_rgba(0,0,0,0.9)] z-50 animate-in slide-in-from-bottom duration-200 rounded-t-2xl"><div className="flex justify-between items-center mb-5"><h3 className={`text-lg font-bold flex items-center gap-2 ${tradeMode === 'buy' ? 'text-red-400' : 'text-green-400'}`}>{tradeMode === 'buy' ? <TrendingUp size={20} /> : <TrendingDown size={20} />} {tradeMode === 'buy' ? '買入' : '賣出'}</h3><button onClick={closeTrade} className="bg-slate-800 p-1.5 rounded-full text-slate-400 hover:text-white"><X size={20} /></button></div><div className="space-y-4"><div className="bg-slate-800 rounded-lg p-3 border border-slate-600 flex items-center"><span className="text-slate-400 font-mono mr-3 text-lg">{tradeMode === 'buy' ? '$' : 'U'}</span><input type="number" value={inputAmount} onChange={(e) => setInputAmount(e.target.value)} placeholder={tradeMode === 'buy' ? "輸入金額" : "輸入單位"} className="w-full bg-transparent text-2xl font-mono text-white outline-none" autoFocus /></div><div className="flex gap-2">{[0.25, 0.5, 1].map((pct) => (<button key={pct} onClick={() => tradeMode === 'buy' ? setBuyPercent(pct) : setSellPercent(pct)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono text-slate-300 border border-slate-700 transition-colors">{pct === 1 ? 'All In' : `${pct*100}%`}</button>))}</div><button onClick={tradeMode === 'buy' ? executeBuy : executeSell} className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all ${tradeMode === 'buy' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}><Check size={20} /> 確認</button></div></div>)}
        
        {gameStatus === 'ended' && (
            <div className="absolute inset-0 bg-slate-950/95 z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                <Activity size={48} className="text-emerald-500 mb-4" />
                <h2 className="text-3xl font-bold text-white mb-8 tracking-tight">結算成績單</h2>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-xs mb-8">
                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                        <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">最終資產</div>
                        <div className={`text-xl font-mono font-bold ${roi >= 0 ? 'text-red-400' : 'text-green-400'}`}>${Math.round(totalAssets).toLocaleString()}</div>
                    </div>
                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                        <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">總報酬率</div>
                        <div className={`text-xl font-mono font-bold ${roi >= 0 ? 'text-red-400' : 'text-green-400'}`}>{roi > 0 ? '+' : ''}{roi.toFixed(2)}%</div>
                    </div>
                </div>
                
                <div className="flex flex-col w-full max-w-xs gap-3">
                    <div className="bg-slate-800/50 p-3 rounded-xl border border-amber-500/30 mb-2">
                        <p className="text-xs text-amber-400 text-center mb-2">想挑戰更多真實基金數據？</p>
                        <button onClick={() => window.location.href = '/full'} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white py-3 rounded-lg font-bold shadow-lg text-sm transition-all">
                            <Crown size={16} /> 免費註冊解鎖 20 檔基金
                        </button>
                    </div>
                    
                    {(detectedEnv === 'Line' || detectedEnv === 'Facebook' || detectedEnv === 'Instagram') && (
                        <div className="bg-amber-900/30 border border-amber-600/50 rounded-xl p-3 text-center animate-pulse">
                            <div className="flex items-center justify-center gap-2 text-amber-400 font-bold mb-1">
                                <ExternalLink size={16} /> 
                                <span>分享與下載</span>
                            </div>
                            <p className="text-xs text-amber-200/80">點擊「匯出/分享」可直接傳到 LINE<br/>若沒反應，請點下方複製 CSV</p>
                        </div>
                    )}

                    <button onClick={triggerSmartShare} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3.5 rounded-xl font-bold border border-slate-700 transition-colors text-sm">
                        <Share2 size={16} className="text-blue-400"/> 匯出 Excel / 分享
                    </button>
                    
                    <button onClick={copyCSVToClipboard} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3.5 rounded-xl font-bold border border-slate-700 transition-colors text-sm">
                        {showCsvCopyToast ? <Check size={16} className="text-green-400"/> : <FileSpreadsheet size={16} />} {showCsvCopyToast ? '已複製原始碼' : '📋 複製 CSV 原始碼 (備用)'}
                    </button>

                    <button onClick={copyToClipboard} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3.5 rounded-xl font-bold border border-slate-700 transition-colors text-sm">
                        {showCopyToast ? <Check size={16} className="text-green-400"/> : <Copy size={16} />} {showCopyToast ? '已複製' : '複製純文字戰報'}
                    </button>
                    
                    <div className="h-6"></div>
                    
                    <button onClick={executeReset} className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-emerald-900/20 active:scale-[0.98] transition-all">
                        <RotateCcw size={18} /> 重新開始挑戰
                    </button>
                    
                    <div className="mt-4 text-center text-[9px] text-slate-700">
                        Environment: {detectedEnv}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}