import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore"; // 1. 引入 Firestore

// 請確認這裡的 Config 資訊是您原本正確的設定
// (如果原本檔案裡有 API Key，請記得填回去，或者複製您原本的 Config 物件)
const firebaseConfig = {
  apiKey: "AIzaSyC_qeSkCDUmO9sUZyEZzmYcJMsbXxNdTdE",
  authDomain: "fund-game-auth.firebaseapp.com",
  projectId: "fund-game-auth",
  storageBucket: "fund-game-auth.firebasestorage.app",
  messagingSenderId: "258679475684",
  appId: "1:258679475684:web:2868f2980a5c86ef970bf1",
  measurementId: "G-D40GK45RC7"
};

// 初始化 Firebase
// 注意：這裡不需要包 try...catch，如果有錯讓它直接報錯我們才知道
const app = initializeApp(firebaseConfig);

// 2. 輸出 Auth (登入用)
export const auth = getAuth(app);

// 3. 輸出 Firestore (資料庫用) - 這是 V30 新增的關鍵
export const db = getFirestore(app);