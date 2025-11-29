import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // ★★★ 關鍵：這裡把 App.jsx 叫進來了
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App /> 
  </React.StrictMode>,
)