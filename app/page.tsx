// app/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 輔助函式：Cookie 讀寫 (用來作為 Session 的雙重物理備份)
const setSessionCookie = (sessionData: any) => {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000); // 保持 30 天
  document.cookie = `sb-backup-session=${encodeURIComponent(JSON.stringify(sessionData))};expires=${expires.toUTCString()};path=/;SameSite=Lax;Secure`;
};

const getSessionCookie = (): any | null => {
  if (typeof document === 'undefined') return null;
  const nameEQ = "sb-backup-session=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      try {
        return JSON.parse(decodeURIComponent(c.substring(nameEQ.length, c.length)));
      } catch (e) {
        return null;
      }
    }
  }
  return null;
};

const eraseSessionCookie = () => {
  if (typeof document === 'undefined') return;
  document.cookie = "sb-backup-session=; Max-Age=-99999999;path=/;";
};

// 僅在客戶端安全初始化 Supabase
const supabase = typeof window !== 'undefined' 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storageKey: 'sb-assistant-session',
        storage: window.localStorage,
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

  // 帳號密碼登入專用 State (防止 Google 導頁產生網址列的完美方案)
  const [loginMethod, setLoginMethod] = useState<'email' | 'google'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState('');

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

  const clearUrlParams = () => {
    if (typeof window !== 'undefined' && (window.location.search || window.location.hash)) {
      setTimeout(() => {
        window.history.replaceState(null, '', window.location.pathname);
      }, 150);
    }
  };

  // 1. 🌟 核心修正點 2：啟動時防止「異步搶快競爭」的重構初始化邏輯
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let isInitialLoad = true; // 鎖定標記：防止初始化時誤判登出而抹除 Cookie

    const restoreAndListen = async () => {
      try {
        // 先嘗試從 Supabase 內建 LocalStorage 讀取
        let { data: { session } } = await supabase.auth.getSession();
        
        // 如果 LocalStorage 沒有，立即嘗試從安全備份 Cookie 還原
        if (!session) {
          const backup = getSessionCookie();
          if (backup && backup.access_token && backup.refresh_token) {
            console.log("🔄 正在從 Cookie 還原 Session...");
            const { data, error } = await supabase.auth.setSession({
              access_token: backup.access_token,
              refresh_token: backup.refresh_token
            });
            if (!error && data.session) {
              session = data.session;
            }
          }
        }

        const currentUser = session?.user ?? null;
        if (currentUser) {
          if (isValidUUID(currentUser.id)) {
            setUser(currentUser);
            setUserId(currentUser.id);
            fetchInstructions(currentUser.id);
            // 同步寫入雙重憑證
            setSessionCookie({
              access_token: session?.access_token,
              refresh_token: session?.refresh_token
            });
            clearUrlParams(); 
          } else {
            await supabase.auth.signOut();
            eraseSessionCookie();
          }
        }
      } catch (err) {
        console.error("❌ 初始化 Session 失敗:", err);
      } finally {
        isInitialLoad = false; // 解除鎖定，開始允許監聽器處理後續事件
        setAuthLoading(false);
      }

      // 註冊動態監聽
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (isInitialLoad) return; // 鎖定期間拒絕任何重置操作，防範 initialization bug!

        const currentUser = session?.user ?? null;
        if (currentUser) {
          if (isValidUUID(currentUser.id)) {
            setUser(currentUser);
            setUserId(currentUser.id);
            fetchInstructions(currentUser.id);
            setSessionCookie({
              access_token: session?.access_token,
              refresh_token: session?.refresh_token
            });
            clearUrlParams(); 
          } else {
            await supabase.auth.signOut();
            eraseSessionCookie();
            setUser(null);
            setUserId('');
          }
        } else {
          // 僅在明確發送登出事件時才清除憑證
          if (event === 'SIGNED_OUT') {
            eraseSessionCookie();
            setUser(null);
            setUserId('');
            setInstructions([]);
            setMessages([]);
          }
        }
      });

      return subscription;
    };

    const subPromise = restoreAndListen();

    const savedSize = localStorage.getItem('app_font_size') as 'small' | 'medium' | 'large';
    if (savedSize) {
      setFontSize(savedSize);
    }

    return () => {
      subPromise.then(sub => sub?.unsubscribe());
    };
  }, []);

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

  // Google 登入 (可能產生網址列)
  const handleGoogleLogin = async () => {
    if (!supabase) return;
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

  // 🌟 修正點 1 的核心方案：無跳轉帳密驗證，100% 守護全螢幕不產生網址列
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // 註冊帳號
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('註冊成功！已為您自動登入。');
      } else {
        // 登入帳號
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message || '認證失敗，請檢查輸入');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    if (!confirm('確認要登出帳號嗎？')) return;
    try {
      eraseSessionCookie(); 
      await supabase.auth.signOut();
      setShowSettingsModal(false);
    } catch (err) {
      console.error("❌ 登出失敗:", err);
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
      .catch(err => console.error("❌ 載入歷史訊息失敗:", err));
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
        <p className="text-slate-400">正在準備您的專屬空間...</p>
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
        #vercel-live-feedback, vercel-live-feedback, .vercel-live-feedback,
        [id^="vercel-"], [class^="vercel-"] {
          display: none !important; visibility: hidden !important;
          opacity: 0 !important; pointer-events: none !important;
        }
      `}</style>
      
      {!user ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-violet-600/20 flex items-center justify-center text-3xl border border-violet-500/30 mx-auto mb-4">
              🐱
            </div>
            <h1 className="text-2xl font-extrabold text-white text-center mb-1">專屬 AI 助理</h1>
            <p className="text-slate-400 text-sm text-center mb-6">即時同步您的大腦偏好規則與跨裝置對話記憶</p>
            
            {/* 登入管道切換按鈕 */}
            <div className="flex bg-slate-900/80 p-1 rounded-xl mb-4 border border-slate-700">
              <button 
                type="button"
                onClick={() => { setLoginMethod('email'); setAuthError(''); }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginMethod === 'email' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                🔒 帳密登入 (推薦・無網址列)
              </button>
              <button 
                type="button"
                onClick={() => { setLoginMethod('google'); setAuthError(''); }}
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginMethod === 'google' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                🌐 Google 登入
              </button>
            </div>

            {/* A. 帳密登入表單 (無導頁，能 100% 隱藏網址列) */}
            {loginMethod === 'email' ? (
              <form onSubmit={handleEmailAuth} className="space-y-3">
                {authError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs p-3 rounded-xl text-center">
                    ⚠️ {authError}
                  </div>
                )}
                <div>
                  <label className="block text-slate-400 text-xs font-bold mb-1 pl-1">電子信箱</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full bg-slate-900 text-white text-sm border border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-bold mb-1 pl-1">密碼 (至少 6 位數)</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="請輸入密碼"
                    className="w-full bg-slate-900 text-white text-sm border border-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-500 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 px-4 rounded-full active:scale-95 transition-all text-base mt-2 flex items-center justify-center shadow-md"
                >
                  {loading ? '驗證中...' : (isSignUp ? '✨ 立即註冊並登入' : '🔑 登入助理')}
                </button>
                <div className="text-center mt-3">
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-xs text-violet-400 hover:text-violet-300 underline font-medium"
                  >
                    {isSignUp ? '已經有帳號了？點此登入' : '還沒有帳號？點此免費註冊'}
                  </button>
                </div>
              </form>
            ) : (
              /* B. Google 登入 */
              <div className="py-6">
                <button
                  onClick={handleGoogleLogin}
                  className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold py-3.5 px-6 rounded-full flex items-center justify-center gap-3 active:scale-95 transition-all shadow-md text-base"
                >
                  <svg className="w-5.5 h-5.5 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  使用 Google 帳號登入
                </button>
                <p className="text-slate-500 text-center text-xs mt-4 leading-relaxed">
                  * 提示：若您使用包殼 App，Google 登入導頁可能會被系統判定為外部開啟而強制顯示網址列。
                </p>
              </div>
            )}
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
            
            {/* 🌟 修正點 3：符合 SVG 1.1 的高相容性、高解析齒輪圖案 (完美解決圓點縮水問題) */}
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="text-white hover:text-violet-200 hover:bg-white/20 bg-white/10 p-2 rounded-xl border border-white/20 active:scale-95 transition-all flex-shrink-0 flex items-center justify-center group"
              style={{ width: '40px', height: '40px' }}
              title="系統設定"
            >
              <svg 
                style={{ width: '24px', height: '24px', display: 'block', color: 'currentColor' }}
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.0" 
                viewBox="0 0 24 24" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
                          <span className="text-emerald-400 flex items-center gap-1 animate-pulse">
                            💚 已記錄滿意回饋，助理學起來了！
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1 animate-pulse">
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-40 animate-fade-in">
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
                    <p className="text-slate-200 font-bold truncate leading-snug">{user?.user_metadata?.full_name || '助理使用者'}</p>
                    <p className="text-slate-400 text-xs truncate leading-normal">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/30 text-rose-300 font-semibold py-2.5 rounded-lg active:scale-98 transition-all text-sm"
                >
                  🚪 登出並切換帳號
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
