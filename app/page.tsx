// app/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 🌟 核心修正：告訴 TypeScript 編譯器 window 物件上存在 google 屬性，防止編譯失敗
declare global {
  interface Window {
    google?: any;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 🌟 雙重強固儲存引擎：確保 Token 在 PWA 沙盒重啟時不會被 iOS 隨機清除
const dualStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    let value = null;
    const name = key + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1);
      if (c.indexOf(name) === 0) {
        value = c.substring(name.length, c.length);
        break;
      }
    }
    if (!value) {
      value = localStorage.getItem(key);
    }
    return value;
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    const date = new Date();
    date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000)); // 365天超長效
    const expires = "; expires=" + date.toUTCString();
    document.cookie = key + "=" + encodeURIComponent(value) + expires + "; path=/; SameSite=Lax; Secure";
    localStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    document.cookie = key + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure";
    localStorage.removeItem(key);
  }
};

const supabase = typeof window !== 'undefined' 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storageKey: 'sb-pwa-dual-session',
        storage: dualStorage,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

const isValidUUID = (id: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState('');

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'like' | 'dislike'>>({});
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDislikeModal, setShowDislikeModal] = useState(false);
  
  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState('');
  const [activeFeedbackContent, setActiveFeedbackContent] = useState('');
  const [dislikeCorrection, setDislikeCorrection] = useState('');

  const [instructions, setInstructions] = useState<any[]>([]);
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const sizeStyles = {
    small: {
      bubble: 'text-base p-2.5 px-4 rounded-2xl',
      input: 'text-base py-2 px-4',
      sendBtn: 'text-base px-4 py-2',
      feedbackBtn: 'text-xs mt-1 pl-1 space-x-2',
      modalTitle: 'text-lg font-bold',
      modalText: 'text-base',
      modalBtn: 'text-sm py-2 px-4 w-24'
    },
    medium: {
      bubble: 'text-xl p-3 px-5 rounded-3xl',
      input: 'text-xl py-2 px-4',
      sendBtn: 'text-xl px-5 py-2',
      feedbackBtn: 'text-sm mt-1.5 pl-1.5 space-x-3',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-xl',
      modalBtn: 'text-base py-2.5 px-5 w-28'
    },
    large: {
      bubble: 'text-[26px] p-3 px-5 rounded-[1.8rem]',
      input: 'text-[22px] py-1.5 px-4',                    
      sendBtn: 'text-[22px] px-5 py-1.5',                  
      feedbackBtn: 'text-base mt-1.5 pl-2 space-x-4',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-lg',
      modalBtn: 'text-base py-2 px-4 w-28'
    }
  };

  const currentStyle = sizeStyles[fontSize];

  // 🌟 動態注入 iOS PWA 全螢幕（隱藏網址列）所需的所有關鍵 Meta 標籤
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const metaTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: '專屬 AI 助理' },
      { name: 'mobile-web-app-capable', content: 'yes' }
    ];

    metaTags.forEach(tag => {
      let el = document.querySelector(`meta[name="${tag.name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', tag.name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', tag.content);
    });
  }, []);

  // 🌟 初始化登入狀態與「無跳轉 Google GIS SDK」
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    // 恢復已有 Session
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && isValidUUID(session.user.id)) {
          setUser(session.user);
          setUserId(session.user.id);
          fetchInstructions(session.user.id);
        }
      } catch (err) {
        console.error("Session 恢復失敗:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();

    // 監聽 Auth 變化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' && currentSession?.user) {
        setUser(currentSession.user);
        setUserId(currentSession.user.id);
        fetchInstructions(currentSession.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserId('');
        setInstructions([]);
        setMessages([]);
      }
    });

    // 載入字型設定
    const savedSize = localStorage.getItem('app_font_size') as 'small' | 'medium' | 'large';
    if (savedSize) {
      setFontSize(savedSize);
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // 🌟 載入並渲染「一鍵無跳轉 Google 登入按鈕」
  useEffect(() => {
    if (typeof window === 'undefined' || !supabase || user) return;

    const initGoogleGSI = () => {
      if (!window.google) return;
      try {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '201360950604-12qii6qgfmg1b62kvpo5nb0khjljm7eh.apps.googleusercontent.com', // 請確保替換成您自己的 Web Client ID
          callback: async (response: any) => {
            setAuthLoading(true);
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential, // 獲取 JWT Token，直接在 PWA 內部登入，拒絕任何跳轉！
            });
            if (!error && data?.user) {
              setUser(data.user);
              setUserId(data.user.id);
              fetchInstructions(data.user.id);
            } else if (error) {
              alert(`Google 認證失敗: ${error.message}`);
            }
            setAuthLoading(false);
          },
          ux_mode: 'popup', // 👈 關鍵：強制使用彈窗模式，絕不離開當前 PWA 頁面！
        });

        // 渲染官方美化按鈕
        const btnContainer = document.getElementById('google-signin-btn');
        if (btnContainer) {
          window.google.accounts.id.renderButton(
            btnContainer,
            { theme: 'filled_blue', size: 'large', shape: 'pill', width: 280 }
          );
        }
      } catch (err) {
        console.error("GSI 初始化失敗:", err);
      }
    };

    if (window.google) {
      initGoogleGSI();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogleGSI;
      document.body.appendChild(script);
      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    }
  }, [user, authLoading]);

  const fetchInstructions = async (uid: string) => {
    if (!uid || !isValidUUID(uid) || !supabase) return;
    const { data, error } = await supabase
      .from('user_instructions')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInstructions(data);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    if (!confirm('確認要登出帳號嗎？')) return;
    try {
      await supabase.auth.signOut();
      setShowSettingsModal(false);
    } catch (err) {
      console.error("登出失敗:", err);
    }
  };

  const handleFontSizeChange = (size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
    localStorage.setItem('app_font_size', size);
  };

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
      .catch(err => console.error("載入歷史訊息失敗:", err));
  }, [userId]);

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

  const handleDislikeClick = (msgId: string, content: string) => {
    if (feedbackStatus[msgId]) return;
    setActiveFeedbackMsgId(msgId);
    setActiveFeedbackContent(content);
    setDislikeCorrection('');
    setShowDislikeModal(true);
  };

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

  const handleDeleteInstruction = async (id: string) => {
    if (!supabase) return;
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

  const handleEditClick = (id: string, text: string) => {
    setEditingInstructionId(id);
    setEditingText(text);
  };

  const handleSaveInstruction = async (id: string) => {
    if (!supabase) return;
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

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 mb-4"></div>
        <p className="text-slate-400">確認安全連線中...</p>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 w-full flex flex-col bg-slate-900 text-white overflow-hidden select-none notranslate"
      style={{ height: '100dvh', maxHeight: '100dvh' }}
    >
      <style>{`
        * { box-sizing: border-box !important; }
        html, body {
          margin: 0 !important; padding: 0 !important;
          width: 100% !important; height: 100% !important;
          overflow: hidden !important; position: fixed !important;
          overscroll-behavior-y: contain !important;
        }
      `}</style>
      
      {!user ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-8 w-full max-w-md shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-violet-600/20 flex items-center justify-center text-3xl border border-violet-500/30 mx-auto mb-4">
              🐱
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-2">專屬 AI 助理</h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">安全且無縫地同步您的大腦偏好設定</p>
            
            {/* 🌟 核心一鍵免帳密 Google 登入容器 */}
            <div className="flex flex-col items-center justify-center space-y-4">
              <div id="google-signin-btn" className="min-h-[50px]"></div>
              
              {!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
                <p className="text-amber-400/80 text-xs px-2 leading-relaxed text-left">
                  ⚠️ 系統提醒：請確認您已在專案的 <code>.env.local</code> 中配置 <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>，並已將其加到 Supabase 的 Authorized Client IDs，否則 Google 按鈕將無法渲染。
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 1. 頂部導覽列 */}
          <header className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 p-4 shadow-md flex items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+12px)]">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl border border-white/30 flex-shrink-0">
                🐱
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-lg leading-tight truncate">專屬助理</h1>
                <span className="text-xs text-emerald-300 flex items-center mt-0.5">● 在線中</span>
              </div>
            </div>

            <div className="relative flex-shrink-0">
              <select
                value={fontSize}
                onChange={(e) => handleFontSizeChange(e.target.value as 'small' | 'medium' | 'large')}
                className="bg-white/10 text-white border border-white/20 rounded-xl px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-white/50 appearance-none pr-8 cursor-pointer"
              >
                <option value="small" className="bg-slate-800 text-white">字體：小</option>
                <option value="medium" className="bg-slate-800 text-white">字體：中</option>
                <option value="large" className="bg-slate-800 text-white">字體：大</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white/70">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
            
            {/* 🌟 系統設定：徹底移除圓圈背景，換成 100% 齒輪形狀、高對比的 Heroicons Cog SVG */}
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="text-white/80 hover:text-white active:scale-90 transition-all flex items-center justify-center bg-transparent border-0"
              style={{ 
                width: '40px', 
                height: '40px', 
                minWidth: '40px', 
                minHeight: '40px', 
                flexShrink: 0
              }}
              title="系統設定"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="w-7 h-7"
                style={{ width: '28px', height: '28px', display: 'block' }}
              >
                <path fillRule="evenodd" d="M11.078 2.25c-.288 0-.538.188-.612.466l-.5 1.865c-.172.643-.82 1.05-1.479.887l-1.865-.46a.625.625 0 00-.73.34l-.994 1.722a.625.625 0 00.16.782l1.503 1.155c.522.4.636 1.135.253 1.666l-.01.014c-.384.532-1.12.651-1.644.275l-1.502-1.155a.625.625 0 00-.782.16l-.994 1.722a.625.625 0 00.34.73l1.865.5c.643.172 1.05.82.887 1.479l-.46 1.865a.625.625 0 00.466.612h1.988c.288 0 .538-.188.612-.466l.5-1.865c.172-.643.82-1.05 1.479-.887l1.865.46c.264.066.545-.058.67-.297l.994-1.722a.625.625 0 00-.16-.782l-1.503-1.155c-.522-.4-.636-1.135-.253-1.666l.01-.014c.384-.532 1.12-.651 1.644-.275l1.502 1.155c.241.185.578.12.742-.11l.994-1.722a.625.625 0 00-.34-.73l-1.865-.5a1.25 1.25 0 01-.887-1.479l.46-1.865a.625.625 0 00-.466-.612h-1.988zM12 15a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </button>
          </header>

          {/* 2. 聊天對話區 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 ? (
              <div className="text-center text-slate-500 py-20 text-lg">
                暫無對話紀錄，和助理聊聊天吧！
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="flex flex-col max-w-[85%] space-y-1">
                    <div className={`shadow-md transition-all duration-200 break-words ${currentStyle.bubble} ${
                      msg.role === 'user' 
                        ? 'bg-violet-600 text-white rounded-tr-none' 
                        : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                    }`}>
                      {msg.content}
                    </div>
                    
                    {msg.role === 'model' && (
                      <div className={`flex items-center text-slate-400 font-medium ${currentStyle.feedbackBtn}`}>
                        {!feedbackStatus[msg.id] ? (
                          <>
                            <button 
                              onClick={() => handleLike(msg.id, msg.content)}
                              className="hover:text-emerald-400 active:scale-95 transition-all flex items-center gap-1"
                            >
                              👍 滿意
                            </button>
                            <span className="text-slate-600">|</span>
                            <button 
                              onClick={() => handleDislikeClick(msg.id, msg.content)}
                              className="hover:text-rose-400 active:scale-95 transition-all flex items-center gap-1"
                            >
                              👎 不滿意
                            </button>
                          </>
                        ) : feedbackStatus[msg.id] === 'like' ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            💚 已記錄滿意回饋
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1">
                            💔 已記錄不滿意回饋
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 3. 底部輸入區 */}
          <div className="flex-shrink-0 w-full px-4 py-3 border-t border-slate-800 bg-slate-900/95 flex items-center gap-2 box-border pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="對助理下達命令吧..."
              className={`flex-1 w-0 bg-slate-800 text-white rounded-full border border-slate-700 focus:outline-none focus:border-violet-500 transition-all box-border ${currentStyle.input}`}
            />
            <button 
              onClick={handleSendMessage}
              disabled={loading}
              className={`flex-shrink-0 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center box-border ${currentStyle.sendBtn}`}
            >
              {loading ? '...' : '發送'}
            </button>
          </div>
        </>
      )}

      {/* 設定 Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex-shrink-0 p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h3 className={`${currentStyle.modalTitle} text-violet-400 flex items-center gap-2`}>
                ⚙️ 系統設定中心
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-full bg-slate-700/50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {user?.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="avatar" className="w-12 h-12 rounded-full border border-violet-500/50" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-violet-600/30 flex items-center justify-center text-xl font-bold border border-violet-500/30">
                      👤
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-200 font-bold truncate leading-snug">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || '使用者'}</p>
                    <p className="text-slate-400 text-xs truncate leading-normal">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/30 text-rose-300 font-semibold py-2.5 rounded-lg active:scale-98 transition-all text-sm"
                >
                  🚪 登出帳號
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-base font-bold text-slate-300 flex items-center gap-1.5">
                  🧠 編輯大腦指導偏好 ({instructions.length})
                </h4>
                <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-1">
                  {instructions.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4 text-center">尚無大腦規則。在對話中點擊 👍 / 👎 將自動產生規則！</p>
                  ) : (
                    instructions.map((inst) => (
                      <div key={inst.id} className="bg-slate-900/40 border border-slate-700/80 rounded-xl p-3 flex flex-col gap-2">
                        {editingInstructionId === inst.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full bg-slate-950 border border-violet-500/50 rounded-lg p-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button 
                                onClick={() => setEditingInstructionId(null)}
                                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 py-1.5 rounded-md font-medium"
                              >
                                取消
                              </button>
                              <button 
                                onClick={() => handleSaveInstruction(inst.id)}
                                className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-md font-semibold"
                              >
                                儲存修改
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{inst.instruction}</p>
                            <div className="flex justify-end gap-3 text-xs border-t border-slate-800/60 pt-2 text-slate-400">
                              <button 
                                onClick={() => handleEditClick(inst.id, inst.instruction)}
                                className="hover:text-violet-400 flex items-center gap-0.5"
                              >
                                📝 編輯
                              </button>
                              <button 
                                onClick={() => handleDeleteInstruction(inst.id)}
                                className="hover:text-rose-400 flex items-center gap-0.5"
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

              <div className="pt-4 border-t border-slate-700/50">
                <button
                  onClick={() => setShowResetModal(true)}
                  className="w-full bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/30 text-amber-300 font-semibold py-3 rounded-lg active:scale-98 transition-all text-sm"
                >
                  🗑️ 清空對話（保留大腦規則）
                </button>
              </div>
            </div>
            
            <div className="flex-shrink-0 p-4 border-t border-slate-700 bg-slate-900/20 flex justify-end">
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2.5 rounded-full font-bold text-sm active:scale-95 transition-all"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 彈窗 A：清空確認 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-white mb-3`}>系統提示</h3>
            <p className={`${currentStyle.modalText} text-slate-300 mb-6`}>是否要清除該使用者的所有對話記憶？（不會影響大腦規則喔！）</p>
            <div className="flex space-x-3 justify-center">
              <button 
                onClick={() => setShowResetModal(false)}
                className={`bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full font-semibold ${currentStyle.modalBtn}`}
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

      {/* 彈窗 B：不滿意 (Dislike) 反饋彈窗 */}
      {showDislikeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-rose-400 mb-2`}>幫助助理改進</h3>
            <p className="text-slate-400 text-sm mb-4">這段回覆哪裡不對呢？（例如：語氣太冷淡、請回答得更簡短...）</p>
            
            <textarea
              value={dislikeCorrection}
              onChange={(e) => setDislikeCorrection(e.target.value)}
              placeholder="例如：請記得加上尾音、對話內容太冗長..."
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-base focus:outline-none focus:border-violet-500 mb-5 resize-none"
            />
            
            <div className="flex space-x-3 justify-center">
              <button 
                onClick={() => setShowDislikeModal(false)}
                className={`bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-full font-semibold ${currentStyle.modalBtn}`}
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
