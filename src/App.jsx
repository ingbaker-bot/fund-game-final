import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// 引用頁面
import AppFull from './pages/AppFull.jsx';
import AppRanked from './pages/AppRanked.jsx';
import AppCompetition from './pages/AppCompetition.jsx';
import AppTrial from './pages/AppTrial.jsx';

// 引用新功能
import SpectatorView from './SpectatorView';
import AppBattle from './pages/AppBattle'; // ★★★ 這裡必須是亮的 (沒有 //)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 首頁 */}
        <Route path="/" element={<AppRanked />} />
        
        {/* 舊頁面 */}
        <Route path="/full" element={<AppFull />} />
        <Route path="/ranked" element={<AppRanked />} />
        <Route path="/competition" element={<AppCompetition />} />
        <Route path="/trial" element={<AppTrial />} />

        {/* 新功能 */}
        <Route path="/spectator" element={<SpectatorView />} />
        <Route path="/battle" element={<AppBattle />} /> {/* ★★★ 這裡也必須是亮的 */}

        {/* 萬用路由 (找不到路徑時回首頁) */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}