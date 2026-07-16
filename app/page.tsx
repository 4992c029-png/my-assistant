'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 初始化客戶端 Supabase：強制啟用 LocalStorage 永久持久化登入狀態
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // 永久記憶登入狀態
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// UUID 驗證防呆機制
const isValidUUID = (id: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState('');

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // 紀錄哪些訊息已經給過反饋
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'like' | 'dislike'>>({});

  // 字體大小狀態
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  // 彈窗與系統選單控制
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDislikeModal, setShowDislikeModal] = useState(false);
  
  // 反饋緩存
  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState('');
  const [activeFeedbackContent, setActiveFeedbackContent] = useState('');
  const [dislikeCorrection, setDislikeCorrection] = useState('');

  // 大腦偏好規則
  const [instructions, setInstructions] = useState<any[]>([]);
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // 比例縮放樣式表
  const sizeStyles = {
    small: {
      bubble: 'text-base p-3 px-4 rounded-2xl',           
      input: 'text-base py-2 px-4',
      sendBtn: 'text-base px-4 py-2',
      feedbackBtn: 'text-xs mt-1 pl-1 space-x-2',
      modalTitle: 'text-lg font-bold',
      modalText: 'text-base',
      modalBtn: 'text-sm py-2 px-4 w-24'
    },
    medium: {
      bubble: 'text-lg p-3.5 px-5 rounded-[1.25rem]',             
      input: 'text-lg py-2.5 px-5',
      sendBtn: 'text-lg px-6 py-2.5',
      feedbackBtn: 'text-xs mt-1.5 pl-1.5 space-x-3',
      modalTitle: 'text-xl font-bold',
      modalText: 'text-base',
      modalBtn: 'text-sm py-2.5 px-5 w-28'
    },
    large: {
      bubble: 'text-2xl p-4 px-6 rounded-3xl',    
      input: 'text-xl py-3 px-6',                    
      sendBtn: 'text-xl px-6 py-3',                  
      feedbackBtn: 'text-sm mt-1.5 pl-2 space-x-4',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-lg',
      modalBtn: 'text-base py-2.5 px-5 w-28'
    }
  };

  const currentStyle = sizeStyles[fontSize];

  // 處理強制隱藏手機網址列與 PWA Meta 注入
  useEffect(() => {
    const hideAddressBar = () => {
      window.scrollTo(0, 1);
    };

    window.addEventListener('load', hideAddressBar);
    window.addEventListener('orientationchange', hideAddressBar);
    document.addEventListener('touchstart', hideAddressBar, { passive: true });
    hideAddressBar();

    // 注入全螢幕 Meta 標籤
    const metas = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover' }
    ];
    metas.forEach(({ name, content }) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    });

    return () => {
      window.removeEventListener('load', hideAddressBar);
      window.removeEventListener('orientationchange', hideAddressBar);
      document.removeEventListener('touchstart', hideAddressBar);
    };
  }, []);

  // 異步穩固恢復與監聽登入狀態
  useEffect(() => {
    let isMounted = true;

    const restoreUserSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        const currentUser = session?.user ?? null;
        if (currentUser) {
          if (isValidUUID(currentUser.id)) {
            setUser(currentUser);
            setUserId(currentUser.id);
            fetchInstructions(currentUser.id);
          } else {
            await supabase.auth.signOut();
            setUser(null);
            setUserId('');
          }
        }
      } catch (err) {
        console.error("❌ Session 恢復失敗:", err);
      } finally {
        if (isMounted) setAuthLoading(false);
      }
    };

    restoreUserSession();

    // 監聽後續所有 auth 狀態變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      const currentUser = session?.user ?? null;
      if (currentUser) {
        if (isValidUUID(currentUser.id)) {
          setUser(currentUser);
          setUserId(currentUser.id);
          fetchInstructions(currentUser.id);
        } else {
          await supabase.auth.signOut();
          setUser(null);
          setUserId('');
          setInstructions([]);
          setMessages([]);
        }
      } else {
        setUser(null);
        setUserId('');
        setInstructions([]);
        setMessages([]);
      }
      setAuthLoading(false);
    });

    // 載入本地字體大小偏好
    const savedSize = localStorage.getItem('app_font_size') as 'small' | 'medium' | 'large';
    if (savedSize) {
      setFontSize(savedSize);
    }

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 獲取大腦偏好規則
  const fetchInstructions = async (uid: string) => {
    if (!uid || !isValidUUID(uid)) return;
    const { data, error } = await supabase
      .from('user_instructions')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInstructions(data);
    }
  };

  // Google 登入
  const handleGoogleLogin = async () => {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
    } catch (err) {
      console.error("❌ Google 登入失敗:", err);
    }
  };

  // 登出
  const handleLogout = async () => {
    if (!confirm('確認登出並切換不同 Google 帳號嗎？')) return;
    try {
      await supabase.auth.signOut();
      setShowSettingsModal(false);
    } catch (err) {
      console.error("❌ 登出失敗:", err);
    }
  };

  // 變更字體大小
  const handleFontSizeChange = (size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
    localStorage.setItem('app_font_size', size);
  };

  // 載入極致對話歷史紀錄 (串接新版 180天/500筆 後端)
  useEffect(() => {
    if (!userId || !isValidUUID(userId)) return;
    
    fetch(`/api/history?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (data.history) {
          const formatted = data.history.map((h: any, index: number) => ({
            id: `msg_${index}_${h.created_at || Date.now()}`,
            role: h.role,
            content: h.content
          }));
          setMessages(formatted);
        }
      })
      .catch(err => console.error("❌ 載入歷史訊息失敗:", err));
  }, [userId]);

  // 傳送訊息
  const handleSendMessage = async () => {
    if (!input.trim() || loading || !isValidUUID(userId)) return;
    setLoading(true);
    
    const userMsg = { id: `msg_user_${Date.now()}`, role: 'user', content: input };
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
        const replyId = `msg_model_${Date.now()}`;
        setMessages(prev => [...prev, { id: replyId, role: 'model', content: data.reply }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 👍 反饋
  const handleLike = async (msgId: string, content: string) => {
    if (feedbackStatus[msgId] || !isValidUUID(userId)) return;

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'like', replyContent: content })
      });
      if (res.ok) {
        setFeedbackStatus(prev => ({ ...prev, [msgId]: 'like' }));
        fetchInstructions(userId); 
      }
    } catch (err) {
      console.error("👍 反饋寫入失敗:", err);
    }
  };

  // 👎 反饋
  const handleDislikeClick = (msgId: string, content: string) => {
    if (feedbackStatus[msgId]) return;
    setActiveFeedbackMsgId(msgId);
    setActiveFeedbackContent(content);
    setDislikeCorrection('');
    setShowDislikeModal(true);
  };

  // 確定送出 👎 意見
  const confirmDislikeFeedback = async () => {
    if (!isValidUUID(userId)) return;
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'dislike',
          replyContent: activeFeedbackContent,
          correction: dislikeCorrection
        })
      });
      if (res.ok) {
        setFeedbackStatus(prev => ({ ...prev, [activeFeedbackMsgId]: 'dislike' }));
        setShowDislikeModal(false);
        fetchInstructions(userId); 
      }
    } catch (err) {
      console.error("👎 反饋寫入失敗:", err);
    }
  };

  // 執行重置
  const confirmResetHistory = async () => {
    if (!isValidUUID(userId)) return;
    try {
      await fetch(`/api/history?userId=${userId}`, { method: 'DELETE' });
      setMessages([]);
      setFeedbackStatus({});
      setShowResetModal(false);
      setShowSettingsModal(false); 
      alert('已清除當前所有對話記憶！🗑️');
    } catch (err) {
      console.error(err);
    }
  };

  // 刪除大腦偏好
  const handleDeleteInstruction = async (id: string) => {
    if (!confirm('確認刪除這筆大腦規則嗎？') || !isValidUUID(userId)) return;
    try {
      const { error } = await supabase
        .from('user_instructions')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      setInstructions(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      alert('刪除失敗，請再試一次');
      console.error(err);
    }
  };

  // 就地啟用編輯
  const handleEditClick = (id: string, text: string) => {
    setEditingInstructionId(id);
    setEditingText(text);
  };

  // 儲存大腦偏好修改
  const handleSaveInstruction = async (id: string) => {
    if (!editingText.trim() || !isValidUUID(userId)) return;
    try {
      const { error } = await supabase
        .from('user_instructions')
        .update({ instruction: editingText })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
      setInstructions(prev => prev.map(item => item.id === id ? { ...item, instruction: editingText } : item));
      setEditingInstructionId(null);
    } catch (err) {
      alert('修改失敗，請再試一次');
      console.error(err);
    }
  };

  // 渲染：安全載入
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 mb-4"></div>
        <p className="text-slate-400 font-medium tracking-wide">正在準備您的專屬神經元空間...</p>
      </div>
    );
  }

  // 1. 登入前畫面：極致美化、無外部圖片
  if (!user) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
        {/* 背景大霓虹光暈 (純 CSS / 無圖片) */}
        <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-violet-600/15 blur-[120px] pointer-events-none animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] rounded-full bg-indigo-600/15 blur-[120px] pointer-events-none animate-pulse duration-5000"></div>

        {/* 玻璃感光影登入卡片 */}
        <div className="relative backdrop-blur-2xl bg-slate-900/50 border border-slate-800 rounded-[2.5rem] p-8 w-full max-w-md text-center shadow-[0_0_80px_rgba(0,0,0,0.8)] z-10">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-5xl shadow-[0_8px_32px_rgba(124,58,237,0.3)]">
            🧠
          </div>
          
          <div className="mt-14 mb-8">
            <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-fuchsia-300 to-cyan-400 tracking-tight mb-3">
              Neural Assistant
            </h1>
            <p className="text-slate-400 text-base leading-relaxed max-w-xs mx-auto">
              專屬客製化 AI 助理。登入後自動同步您的大腦偏好設定與跨設備對話紀錄。
            </p>
          </div>

          {/* 3D 質感神經元網絡 SVG 元件 */}
          <div className="w-full flex justify-center mb-10 pointer-events-none">
            <svg className="w-28 h-28 text-violet-500/80 animate-pulse" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="10" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2" />
              <circle cx="20" cy="30" r="6" fill="currentColor" />
              <circle cx="80" cy="30" r="6" fill="currentColor" />
              <circle cx="20" cy="70" r="6" fill="currentColor" />
              <circle cx="80" cy="70" r="6" fill="currentColor" />
              <line x1="26" y1="33" x2="42" y2="44" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="74" y1="33" x2="58" y2="44" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="26" y1="67" x2="42" y2="56" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
              <line x1="74" y1="67" x2="58" y2="56" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
              <path d="M50 20 L50 40 M50 60 L50 80" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white text-slate-950 hover:bg-slate-100 hover:shadow-[0_0_24px_rgba(255,255,255,0.25)] font-bold py-4 px-6 rounded-full flex items-center justify-center gap-3 active:scale-[0.98] transition-all text-base shadow-md"
          >
            <svg className="w-5.5 h-5.5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            使用 Google 帳號快速登入
          </button>
        </div>
      </div>
    );
  }

  // 2. 主功能對話頁面：隱藏網址列極致版 UI
  return (
    <div 
      className="fixed inset-0 w-full flex flex-col bg-slate-950 text-white overflow-hidden select-none"
      style={{ height: '100dvh', maxHeight: '100dvh' }}
    >
      <style>{`
        /* 徹底防止網頁橡皮筋滾動，鎖定網址列 */
        html, body {
          margin: 0 !important; padding: 0 !important;
          width: 100% !important; height: 100% !important;
          overflow: hidden !important; position: fixed !important;
          top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          background-color: #020617 !important;
        }
        #vercel-live-feedback, vercel-live-feedback, .vercel-live-feedback {
          display: none !important;
        }
        /* 隱藏滾動條但保持滾動 */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      
      {/* 頂部導覽列 */}
      <header className="flex-shrink-0 backdrop-blur-md bg-slate-900/60 border-b border-slate-800/80 p-4 flex items-center justify-between gap-2 z-10">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-lg border border-white/10 flex-shrink-0">
            🐱
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">專屬 Neural 助理</h1>
            <span className="text-xs text-emerald-400 flex items-center mt-0.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
              在線中 (180D Max)
            </span>
          </div>
        </div>

        {/* 下拉字體 */}
        <div className="relative flex-shrink-0">
          <select
            value={fontSize}
            onChange={(e) => handleFontSizeChange(e.target.value as 'small' | 'medium' | 'large')}
            className="bg-slate-800/80 text-white border border-slate-700/80 rounded-full px-4 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-500/50 appearance-none pr-9 cursor-pointer"
          >
            <option value="small" className="bg-slate-900">字體: 小</option>
            <option value="medium" className="bg-slate-900">字體: 中</option>
            <option value="large" className="bg-slate-900">字體: 大</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
            <svg className="fill-current h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>
        
        {/* 系統設定齒輪 */}
        <button 
          onClick={() => setShowSettingsModal(true)}
          className="text-slate-300 hover:text-white bg-slate-800/80 p-2.5 rounded-full border border-slate-700/80 active:scale-95 transition-all flex-shrink-0 flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </button>
      </header>

      {/* 聊天對話區 */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-5 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-8">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
            <span className="text-5xl">⚡</span>
            <p className="text-base font-semibold tracking-wider">神經網絡就緒。請輸入任意命令開始對話！</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              <div className="flex flex-col max-w-[85%] space-y-1">
                <div className={`shadow-xl break-words leading-relaxed ${currentStyle.bubble} ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl rounded-tr-none' 
                    : 'bg-slate-900/80 text-slate-100 rounded-2xl rounded-tl-none border border-slate-800 backdrop-blur-sm'
                }`}>
                  {msg.content}
                </div>
                
                {msg.role === 'model' && (
                  <div className={`flex items-center text-slate-500 font-semibold ${currentStyle.feedbackBtn}`}>
                    {!feedbackStatus[msg.id] ? (
                      <>
                        <button 
                          onClick={() => handleLike(msg.id, msg.content)}
                          className="hover:text-emerald-400 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          👍 滿意
                        </button>
                        <span className="text-slate-800">|</span>
                        <button 
                          onClick={() => handleDislikeClick(msg.id, msg.content)}
                          className="hover:text-rose-400 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          👎 修正
                        </button>
                      </>
                    ) : feedbackStatus[msg.id] === 'like' ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        💚 已記錄回饋，助理學起來了！
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        💔 已記錄不滿意回饋，助理會改進！
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 底部輸入 Dock 艙 */}
      <div className="flex-shrink-0 w-full px-4 py-3 border-t border-slate-900 bg-slate-950/90 flex items-center gap-2.5 box-border pb-[calc(env(safe-area-inset-bottom)+14px)] z-10">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="對助理下達命令吧..."
          className={`flex-1 w-0 bg-slate-900 text-white rounded-full border border-slate-800 focus:outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20 transition-all box-border ${currentStyle.input}`}
        />
        <button 
          onClick={handleSendMessage}
          disabled={loading}
          className={`flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-full font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center box-border ${currentStyle.sendBtn}`}
        >
          {loading ? '...' : '發送'}
        </button>
      </div>

      {/* ⚙️ 系統設定面板 (Modal) */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh] overflow-hidden">
            {/* 標題列 */}
            <div className="flex-shrink-0 p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/45">
              <h3 className={`${currentStyle.modalTitle} text-violet-400 flex items-center gap-2 font-black`}>
                ⚙️ 系統控制中心
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-full bg-slate-800/80"
              >
                <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* 可滾動設定區 */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8">
              {/* 帳號狀態與登出 */}
              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 flex flex-col gap-3">
                <div className="flex items-center gap-3.5">
                  {user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="avatar" className="w-12 h-12 rounded-full border border-violet-500/40" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center text-xl font-bold border border-violet-500/20">
                      👤
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-200 font-bold truncate leading-snug">{user?.user_metadata?.full_name || 'Google 使用者'}</p>
                    <p className="text-slate-400 text-xs truncate leading-normal">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/50 text-rose-300 font-bold py-2.5 rounded-xl active:scale-98 transition-all text-xs tracking-wider"
                >
                  🚪 登出並切換 Google 帳號
                </button>
              </div>

              {/* 大腦規則管理 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-300 flex items-center gap-2 tracking-wide uppercase">
                  🧠 當前記憶大腦規則 ({instructions.length})
                </h4>
                <div className="space-y-3 max-h-[30vh] overflow-y-auto no-scrollbar pr-1">
                  {instructions.length === 0 ? (
                    <p className="text-slate-500 text-xs py-5 text-center">尚無大腦規則。在對話中點擊 👍 / 👎 將自動學習！</p>
                  ) : (
                    instructions.map((inst) => (
                      <div key={inst.id} className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-2.5">
                        {editingInstructionId === inst.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full bg-slate-900 border border-violet-600/50 rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-600/20 resize-none"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button 
                                onClick={() => setEditingInstructionId(null)}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg font-medium"
                              >
                                取消
                              </button>
                              <button 
                                onClick={() => handleSaveInstruction(inst.id)}
                                className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-lg font-bold"
                              >
                                儲存修改
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{inst.instruction}</p>
                            <div className="flex justify-end gap-4 text-xs border-t border-slate-900 pt-2.5 text-slate-400">
                              <button 
                                onClick={() => handleEditClick(inst.id, inst.instruction)}
                                className="hover:text-violet-400 flex items-center gap-1 font-semibold"
                              >
                                📝 編輯
                              </button>
                              <button 
                                onClick={() => handleDeleteInstruction(inst.id)}
                                className="hover:text-rose-400 flex items-center gap-1 font-semibold"
                              >
                                🗑️ 刪除
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 清除對話記憶 */}
              <div className="pt-4 border-t border-slate-800/80">
                <button
                  onClick={() => setShowResetModal(true)}
                  className="w-full bg-amber-950/30 hover:bg-amber-950/50 border border-amber-900/50 text-amber-300 font-bold py-3 rounded-xl active:scale-98 transition-all text-xs tracking-wider"
                >
                  🗑️ 清空所有歷史聊天紀錄 (保留大腦)
                </button>
              </div>
            </div>
            
            <div className="flex-shrink-0 p-4 border-t border-slate-800 bg-slate-950/30 flex justify-end">
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-full font-bold text-xs tracking-wider active:scale-95 transition-all"
              >
                關閉設定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 彈窗 A：清空確認 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-white mb-2 font-bold`}>確認清除記憶</h3>
            <p className={`${currentStyle.modalText} text-slate-400 mb-6 leading-relaxed`}>是否要清除該使用者的所有對話記憶？（注意：這會清空所有的歷史聊天，但不會影響您的大腦規則喔！）</p>
            <div className="flex space-x-3 justify-center">
              <button 
                onClick={() => setShowResetModal(false)}
                className={`bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full font-bold ${currentStyle.modalBtn}`}
              >
                取消
              </button>
              <button 
                onClick={confirmResetHistory}
                className={`bg-rose-600 hover:bg-rose-500 text-white rounded-full font-bold ${currentStyle.modalBtn}`}
              >
                確認清除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 彈窗 B：不滿意 (Dislike) 修正面板 */}
      {showDislikeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-rose-400 mb-2 font-bold`}>幫助助理改進</h3>
            <p className="text-slate-400 text-xs mb-4 leading-relaxed">這段回覆哪裡不對呢？（例如：語氣太冷淡、請回答得更簡短...）</p>
            
            <textarea
              value={dislikeCorrection}
              onChange={(e) => setDislikeCorrection(e.target.value)}
              placeholder="例如：請記得加上尾音、對話內容太冗長..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-white text-sm focus:outline-none focus:border-violet-600 mb-5 resize-none"
            />
            
            <div className="flex space-x-3 justify-center">
              <button 
                onClick={() => setShowDislikeModal(false)}
                className={`bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full font-bold ${currentStyle.modalBtn}`}
              >
                取消
              </button>
              <button 
                onClick={confirmDislikeFeedback}
                className={`bg-rose-600 hover:bg-rose-500 text-white rounded-full font-bold ${currentStyle.modalBtn}`}
              >
                送出修正
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
