'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客戶端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  showFeedback?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // 登入保持與加載狀態
  const [sessionLoading, setSessionLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  
  // 設定/重置彈出視窗狀態
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. 監聽與讀取 Supabase 登入狀態 (解決登入保持關鍵)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        // 登入成功後，加載歷史對話
        await loadChatHistory(session.user.id);
      }
      setSessionLoading(false);
    };

    checkSession();

    // 監聽 Auth 狀態改變
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadChatHistory(session.user.id);
      } else {
        setMessages([]);
      }
      setSessionLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 自動捲動到最底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 載入歷史對話
  const loadChatHistory = async (userId: string) => {
    try {
      const res = await fetch(`/api/history?userId=${userId}`);
      const data = await res.json();
      if (data.history && data.history.length > 0) {
        setMessages(data.history);
      } else {
        setMessages([{ id: 'welcome', role: 'model', content: '主人，您回來了～喵！今天有什麼吩咐嗎？' }]);
      }
    } catch (err) {
      console.error('無法載入歷史紀錄:', err);
    }
  };

  // 傳送訊息
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !user) return;

    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: input }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, userId: user.id })
      });
      const data = await res.json();
      
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        content: data.reply,
        showFeedback: true 
      }]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 清空對話記憶 (重置)
  const handleClearHistory = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/history?userId=${user.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setMessages([{ id: 'welcome', role: 'model', content: '對話記憶已重置，主人有什麼吩咐嗎？' }]);
        setShowSettingsModal(false);
        alert('記憶已成功清空！');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitCorrection = async () => {
    if (!correctionText.trim() || !feedbackId || !user) return;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, correction: correctionText })
      });
      alert('調整成功！大腦已記錄您的偏好。');
      setCorrectionText('');
      setFeedbackId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // 登入處理 (如果是 Inline 登入範例)
  const handleDemoLogin = async () => {
    setSessionLoading(true);
    // 這裡替換成你實際的登入邏輯，此處使用 Supabase 匿名或快速登入作為測試
    const { data, error } = await supabase.auth.signInWithOtp({
      email: 'testuser@example.com', // 替換為實際測試帳號
    });
    if (error) alert(error.message);
    setSessionLoading(false);
  };

  // ==================== 1. 載入中骨架屏 (解決開啟時排版亂掉) ====================
  if (sessionLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-violet-600 mb-3"></div>
        <p className="text-sm text-slate-500 font-medium">載入中，請稍候...</p>
      </div>
    );
  }

  // ==================== 2. 未登入畫面 (確保未登入時排版整齊) ====================
  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-[100dvh] max-w-md mx-auto bg-slate-50 px-6 border-x border-slate-200">
        <div className="text-6xl mb-4">🐱</div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">專屬 AI 助理</h2>
        <p className="text-sm text-slate-500 mb-8 text-center leading-relaxed">
          請登入以開啟你與貓娘助理的專屬大腦調教之旅
        </p>
        <button 
          onClick={handleDemoLogin}
          className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold py-3.5 rounded-2xl shadow-lg shadow-violet-200 active:scale-95 transition-transform"
        >
          快速進入測試
        </button>
      </div>
    );
  }

  // ==================== 3. 主對話畫面 (使用 dvh 解決行動端高度錯亂) ====================
  return (
    <div className="flex flex-col h-[100dvh] max-w-md mx-auto bg-slate-50 border-x border-slate-200 shadow-2xl relative overflow-hidden pb-[env(safe-area-inset-bottom)]">
      
      {/* 頂部 APP 導覽列 */}
      <header className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-4 shadow-md flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg border border-white/30">🐱</div>
          <div>
            <h1 className="font-semibold text-base leading-tight">專屬貓娘助理</h1>
            <span className="text-xs text-emerald-300 flex items-center">● 在線調教中</span>
          </div>
        </div>
        
        {/* 齒輪圖標按鈕 (問題 3) */}
        <button 
          className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          onClick={() => setShowSettingsModal(true)}
          title="系統設定"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </header>

      {/* 對話內容展示區 */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-br-none' 
                : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'
            }`}>
              <p className="whitespace-pre-line">{msg.content}</p>
              {msg.showFeedback && (
                <div className="notranslate mt-2 pt-2 border-t border-slate-100 flex items-center space-x-3 text-xs text-slate-400">
                  <span>滿意嗎？</span>
                  <button className="hover:text-emerald-500 p-1" onClick={() => alert('謝謝主人！')}>👍 滿意</button>
                  <button className="hover:text-rose-500 p-1" onClick={() => setFeedbackId(msg.id)}>👎 不滿意</button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* 彈出式設定選單 (清空確認視窗) */}
      {showSettingsModal && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-slate-800 mb-2 text-base">⚙️ 系統設定</h3>
            <p className="text-sm text-slate-500 mb-6">
              點擊下方按鈕將徹底刪除與此助理的所有聊天紀錄。
            </p>
            <div className="flex flex-col space-y-2">
              <button 
                onClick={() => {
                  if (confirm('是否清空對話記憶？此動作無法復原。')) {
                    handleClearHistory();
                  }
                }}
                className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-medium rounded-xl text-sm transition-colors shadow-md shadow-rose-100"
              >
                清空對話記憶
              </button>
              <button 
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-sm transition-colors" 
                onClick={() => setShowSettingsModal(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 彈出式：負評修正輸入框 */}
      {feedbackId && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-slate-800 mb-2 text-base">🧠 告訴大腦你想怎麼調整？</h3>
            <textarea 
              className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4 h-24 resize-none text-slate-800"
              placeholder="例如：請回答得更簡短一點..."
              value={correctionText}
              onChange={(e) => setCorrectionText(e.target.value)}
            />
            <div className="flex space-x-3 justify-end text-sm font-medium">
              <button className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl" onClick={() => setFeedbackId(null)}>取消</button>
              <button className="px-4 py-2 bg-violet-600 text-white hover:bg-violet-700 rounded-xl shadow-md" onClick={submitCorrection}>寫入記憶</button>
            </div>
          </div>
        </div>
      )}

      {/* 置底輸入欄位 */}
      <footer className="p-3 bg-white/90 backdrop-blur-md border-t border-slate-100 sticky bottom-0 left-0 right-0 z-10">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input 
            type="text" 
            className="flex-1 bg-slate-100 border-0 rounded-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all"
            placeholder="跟專屬助理說點話..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button 
            type="submit" 
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-all ${loading ? 'bg-slate-300' : 'bg-gradient-to-r from-violet-600 to-indigo-600 shadow-md shadow-violet-100'}`}
            disabled={loading}
          >
            {loading ? '⏳' : '➔'}
          </button>
        </form>
      </footer>

    </div>
  );
}
