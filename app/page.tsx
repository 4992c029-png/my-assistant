'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);

  // 彈窗控制狀態
  const [showResetModal, setShowResetModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedText, setSelectedText] = useState(''); // 被選中要記錄到大腦的對話內容

  // 1. 初始化唯一使用者 ID
  useEffect(() => {
    let id = localStorage.getItem('assistant_user_id');
    if (!id) {
      id = 'usr_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem('assistant_user_id', id);
    }
    setUserId(id);
    console.log("💡 [前端] 目前的使用者 ID 為:", id);
  }, []);

  // 2. 使用者 ID 準備好後，自動從資料庫載入舊的歷史對話 (帶有前端 Console Log 排查)
  useEffect(() => {
    if (!userId) return;
    
    console.log(`🔄 [前端] 開始請求讀取歷史對話... userId: ${userId}`);
    
    fetch(`/api/history?userId=${userId}`)
      .then(res => {
        console.log("🔄 [前端] 歷史 API 回應狀態:", res.status);
        return res.json();
      })
      .then(data => {
        console.log("🎯 [前端] 拿到歷史對話原始資料:", data);
        if (data.history) {
          const formatted = data.history.map((h: any, index: number) => ({
            id: index.toString(),
            role: h.role,
            content: h.content
          }));
          setMessages(formatted);
          console.log(`✅ [前端] 成功將 ${formatted.length} 筆歷史紀錄載入至畫面上！`);
        }
      })
      .catch(err => {
        console.error("❌ [前端] 載入歷史訊息時發生網路或程式錯誤:", err);
      });
  }, [userId]);

  // 傳送訊息
  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    
    const userMsg = { id: Date.now().toString(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, userId })
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'model', content: data.reply }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 執行重置 (清空資料庫歷史與前端狀態)
  const confirmResetHistory = async () => {
    try {
      await fetch(`/api/history?userId=${userId}`, { method: 'DELETE' });
      setMessages([]);
      setShowResetModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // 執行將選中的對話寫入個人偏好大腦
  const confirmRecordToBrain = async () => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, correction: selectedText })
      });
      setShowRecordModal(false);
      alert('成功將此對話寫入大腦規則！🧠');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white relative">
      {/* 頂部導覽列 (加大) */}
      <header className="bg-gradient-to-r from-violet-600 to-indigo-600 p-6 shadow-lg flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center font-bold text-3xl border border-white/30">
            🐱
          </div>
          <div>
            <h1 className="font-bold text-3xl leading-tight">專屬助理</h1>
            <span className="text-lg text-emerald-300 flex items-center mt-1">● 在線中</span>
          </div>
        </div>
        
        {/* 右上角重製按鈕 (大按鈕) */}
        <button 
          onClick={() => setShowResetModal(true)}
          className="text-white hover:text-white bg-white/10 px-6 py-3 rounded-full border-2 border-white/20 text-xl font-medium active:scale-95 transition-all"
        >
          重置
        </button>
      </header>

      {/* 聊天對話區 (加大間距與內容) */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 py-20 text-xl">
            暫無對話紀錄，和助理聊聊天吧！
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="flex flex-col max-w-[85%] space-y-2">
                {/* 對話氣泡：字體放大至 24px (text-2xl)，Padding 放大 */}
                <div className={`p-5 px-6 rounded-3xl text-2xl leading-relaxed shadow-md ${
                  msg.role === 'user' 
                    ? 'bg-violet-600 text-white rounded-tr-none' 
                    : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                }`}>
                  {msg.content}
                </div>
                
                {/* 記錄按鈕：加大為 text-lg 好點擊 */}
                <button 
                  onClick={() => {
                    setSelectedText(msg.content);
                    setShowRecordModal(true);
                  }}
                  className="text-lg text-slate-400 self-start hover:text-violet-400 mt-2 pl-2 transition-colors font-medium"
                >
                  📝 記錄至大腦
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 輸入區 (全面放大) */}
      <div className="p-6 border-t border-slate-800 bg-slate-900 flex space-x-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="對助理下達命令吧..."
          className="flex-1 bg-slate-800 text-white rounded-full px-6 py-5 text-2xl border-2 border-slate-700 focus:outline-none focus:border-violet-500"
        />
        <button 
          onClick={handleSendMessage}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 text-white px-8 py-5 rounded-full text-2xl font-bold transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? '...' : '發送'}
        </button>
      </div>

      {/* 🚨 彈窗 A：右上角重置確認視窗 (超大版) */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 w-full max-w-lg text-center shadow-2xl">
            <h3 className="text-3xl font-bold text-white mb-4">系統提示</h3>
            <p className="text-slate-300 text-2xl mb-8">是否清空對話記憶？</p>
            <div className="flex space-x-4 justify-center">
              <button 
                onClick={() => setShowResetModal(false)}
                className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-xl w-36 font-semibold"
              >
                取消
              </button>
              <button 
                onClick={confirmResetHistory}
                className="px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-full text-xl w-36 font-bold"
              >
                確認清除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🧠 彈窗 B：記錄大腦確認視窗 (超大版) */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-6 z-50">
          <div className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 w-full max-w-lg text-center shadow-2xl">
            <h3 className="text-3xl font-bold text-violet-400 mb-4">大腦記憶同步</h3>
            <div className="text-slate-300 text-xl mb-6 max-h-40 overflow-y-auto bg-slate-900/50 p-4 rounded-2xl italic border border-slate-700 text-left">
              「{selectedText}」
            </div>
            <p className="text-slate-100 text-2xl mb-8 font-semibold">是否將此內容記錄為您的大腦指導規則？</p>
            <div className="flex space-x-4 justify-center">
              <button 
                onClick={() => setShowRecordModal(false)}
                className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-xl w-36 font-semibold"
              >
                不用了
              </button>
              <button 
                onClick={confirmRecordToBrain}
                className="px-8 py-4 bg-violet-600 hover:bg-violet-500 text-white rounded-full text-xl w-36 font-bold"
              >
                確認記錄
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
