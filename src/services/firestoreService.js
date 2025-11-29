import { 
    collection, 
    doc, 
    getDoc, 
    setDoc, 
    addDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs,
    serverTimestamp 
} from "firebase/firestore";
import { db } from "../config/firebase"; 

// ==================================================================
// 1. 暱稱系統 (User Nickname System)
// ==================================================================
export const checkUserNickname = async (uid) => {
    if (!uid) return null;
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data().nickname : null;
    } catch (error) {
        console.error("讀取暱稱失敗:", error);
        return null;
    }
};

export const registerNickname = async (uid, nickname) => {
    if (!uid || !nickname) return false;
    try {
        await setDoc(doc(db, "users", uid), { nickname: nickname }, { merge: true });
        return true;
    } catch (error) {
        console.error("註冊暱稱失敗:", error);
        throw error;
    }
};

// ==================================================================
// 2. 賽季設定系統 (Season Config) - V31 新增的核心函式
// ==================================================================
export const getSeasonConfig = async () => {
    try {
        const docRef = doc(db, "seasons", "current_season");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().active) {
            return docSnap.data();
        }
        return null; // 賽季未開啟
    } catch (error) {
        console.error("讀取賽季設定失敗:", error);
        return null;
    }
};

// ==================================================================
// 3. 排行榜系統 (Leaderboard System) - V31 升級版
// ==================================================================

/**
 * 上傳成績
 * V31 update: 增加 seasonId 參數
 */
export const saveGameResult = async (data) => {
    try {
        const payload = {
            ...data,
            // 如果前端沒傳 seasonId，就當作是練習模式
            seasonId: data.seasonId || 'practice', 
            timestamp: serverTimestamp()
        };
        await addDoc(collection(db, "game_results"), payload);
        return true;
    } catch (error) {
        console.error("上傳成績失敗:", error);
        throw error;
    }
};

/**
 * 讀取排行榜
 * V31 update: 支援依照 seasonId 篩選
 */
export const getLeaderboard = async (fundId, seasonId = null) => {
    try {
        let q;
        
        if (seasonId && seasonId !== 'practice') {
            // V31: 比賽模式
            q = query(
                collection(db, "game_results"),
                where("seasonId", "==", seasonId),
                orderBy("roi", "desc"),
                limit(20) 
            );
        } else {
            // V30: 練習模式
            q = query(
                collection(db, "game_results"),
                where("fundId", "==", fundId),
                where("seasonId", "==", "practice"),
                orderBy("roi", "desc"),
                limit(20)
            );
        }

        const querySnapshot = await getDocs(q);
        const leaderboard = [];
        querySnapshot.forEach((doc) => {
            leaderboard.push({ id: doc.id, ...doc.data() });
        });
        return leaderboard;
    } catch (error) {
        console.error("讀取排行榜失敗:", error);
        return [];
    }
};

export const getTickerData = async () => {
    try {
        const q = query(
            collection(db, "game_results"),
            orderBy("timestamp", "desc"),
            limit(10)
        );
        const querySnapshot = await getDocs(q);
        const tickerData = [];
        querySnapshot.forEach((doc) => {
            tickerData.push({ id: doc.id, ...doc.data() });
        });
        return tickerData;
    } catch (error) {
        console.error("讀取跑馬燈失敗:", error);
        return [];
    }
};