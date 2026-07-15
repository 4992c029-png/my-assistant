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
      // 生成簡易隨機 UUID 區分使用者
      id = 'usr_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem('assistant_user_id', id);
    }
    setUserId(id);
  }, []);

  // 2. 使用者 ID 準備好後，自動從資料庫載入舊的歷史對話
  useEffect(() => {
    if (!userId) return;
    
    fetch(`/api/history?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (data.history) {
          const formatted = data.history.map((h: any, index: number) => ({
            id: index.toString(),
            role: h.role,
            content: h.content
          }));
          setMessages(formatted);
        }
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

  // 執行將選中的對話寫入個人偏好大腦 (user_instructions)
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
      {/* 頂部導覽列 */}
      <header className="bg-gradient-to-r from-violet-600 to-indigo-600 p-4 shadow-md flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg border border-white/30">
            🐱
          </div>
          <div>
            <h1 className="font-semibold text-base leading-tight">專屬助理</h1>
            <span className="text-xs text-emerald-300 flex items-center">● 在線中</span>
          </div>
        </div>
        
        {/* 右上角重製按鈕：點擊開啟確認彈窗 */}
        <button 
          onClick={() => setShowResetModal(true)}
          className="text-white/80 hover:text-white bg-white/10 px-3 py-1 rounded-full border border-white/10 text-sm active:scale-95 transition-all"
        >
          重置
        </button>
      </header>

      {/* 聊天對話區 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className="flex flex-col max-w-[80%] space-y-1">
              <div className={`p-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-violet-600 text-white rounded-tr-none' 
                  : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
              }`}>
                {msg.content}
              </div>
              
              {/* 對話氣泡下方的小功能鍵：點擊跳出紀錄彈窗 */}
              <button 
                onClick={() => {
                  setSelectedText(msg.content);
                  setShowRecordModal(true);
                }}
                className="text-[10px] text-slate-400 self-start hover:text-violet-400 mt-1 pl-1 transition-colors"
              >
                📝 記錄至大腦
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 輸入區 */}
      <div className="p-4 border-t border-slate-800 bg-slate-900 flex space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="對助理下達命令吧..."
          className="flex-1 bg-slate-800 text-white rounded-full px-4 py-2 border border-slate-700 focus:outline-none focus:border-violet-500"
        />
        <button 
          onClick={handleSendMessage}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-full font-medium"
        >
          {loading ? '...' : '發送'}
        </button>
      </div>

      {/* 🚨 彈窗 A：右上角重置確認視窗 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">系統提示</h3>
            <p className="text-slate-300 text-sm mb-6">是否清空對話記憶？</p>
            <div className="flex space-x-3 justify-center">
              <button 
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-sm w-24"
              >
                取消
              </button>
              <button 
                onClick={confirmResetHistory}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full text-sm w-24 font-medium"
              >
                確認清除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🧠 彈窗 B：點擊對話記錄大腦確認視窗 */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-xl">
            <h3 className="text-lg font-semibold text-violet-400 mb-2">大腦記憶同步</h3>
            <p className="text-slate-300 text-xs mb-4 max-h-20 overflow-y-auto bg-slate-900/50 p-2 rounded italic">
              「{selectedText}」
            </p>
            <p className="text-slate-100 text-sm mb-6 font-medium">是否將此內容記錄為您的大腦指導規則？</p>
            <div className="flex space-x-3 justify-center">
              <button 
                onClick={() => setShowRecordModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full text-sm w-24"
              >
                不用了
              </button>
              <button 
                onClick={confirmRecordToBrain}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-full text-sm w-24 font-medium"
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
