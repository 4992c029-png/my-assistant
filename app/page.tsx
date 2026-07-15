'use client';
import { useState, useEffect } from 'react';

export default function Home() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);

  // 紀錄哪些訊息已經給過反饋 (格式: { messageId: 'like' | 'dislike' })
  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'like' | 'dislike'>>({});

  // 字體大小狀態 (預設為 'medium' 中)
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  // 彈窗控制狀態
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDislikeModal, setShowDislikeModal] = useState(false);
  
  // 正在進行反饋的訊息資料
  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState('');
  const [activeFeedbackContent, setActiveFeedbackContent] = useState('');
  const [dislikeCorrection, setDislikeCorrection] = useState('');

  // 比例縮放樣式表
  const sizeStyles = {
    small: {
      bubble: 'text-base p-2.5 px-4 rounded-2xl',           // ~16px
      input: 'text-base py-2 px-4',
      sendBtn: 'text-base px-4 py-2',
      feedbackBtn: 'text-xs mt-1 pl-1 space-x-2',
      modalTitle: 'text-lg font-bold',
      modalText: 'text-base',
      modalBtn: 'text-sm py-2 px-4 w-24'
    },
    medium: {
      bubble: 'text-xl p-3 px-5 rounded-3xl',             // ~20px
      input: 'text-xl py-2 px-4',
      sendBtn: 'text-xl px-5 py-2',
      feedbackBtn: 'text-sm mt-1.5 pl-1.5 space-x-3',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-xl',
      modalBtn: 'text-base py-2.5 px-5 w-28'
    },
    large: {
      bubble: 'text-[26px] p-3 px-5 rounded-[1.8rem]',    // ~26px
      input: 'text-[22px] py-1.5 px-4',                   
      sendBtn: 'text-[22px] px-5 py-1.5',                 
      feedbackBtn: 'text-base mt-1.5 pl-2 space-x-4',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-lg',
      modalBtn: 'text-base py-2 px-4 w-28'
    }
  };

  const currentStyle = sizeStyles[fontSize];

  // 初始化：使用者 ID 與本地字體偏好
  useEffect(() => {
    let id = localStorage.getItem('assistant_user_id');
    if (!id) {
      id = 'usr_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
      localStorage.setItem('assistant_user_id', id);
    }
    setUserId(id);

    const savedSize = localStorage.getItem('app_font_size') as 'small' | 'medium' | 'large';
    if (savedSize) {
      setFontSize(savedSize);
    }
  }, []);

  // 變更字體大小並保存
  const handleFontSizeChange = (size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
    localStorage.setItem('app_font_size', size);
  };

  // 載入舊的歷史對話
  useEffect(() => {
    if (!userId) return;
    
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
    if (!input.trim() || loading) return;
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

  // 處理 讚 (Like)
  const handleLike = async (msgId: string, content: string) => {
    if (feedbackStatus[msgId]) return; // 已評價過則不重複執行

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, type: 'like', replyContent: content })
      });
      if (res.ok) {
        setFeedbackStatus(prev => ({ ...prev, [msgId]: 'like' }));
      }
    } catch (err) {
      console.error("👍 反饋寫入失敗:", err);
    }
  };

  // 點擊 踩 (Dislike) - 先開啟彈窗收集意見
  const handleDislikeClick = (msgId: string, content: string) => {
    if (feedbackStatus[msgId]) return;
    setActiveFeedbackMsgId(msgId);
    setActiveFeedbackContent(content);
    setDislikeCorrection('');
    setShowDislikeModal(true);
  };

  // 確認送出 踩 (Dislike) 意見
  const confirmDislikeFeedback = async () => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type: 'dislike',
          replyContent: activeFeedbackContent,
          correction: dislikeCorrection
        });
      });
      if (res.ok) {
        setFeedbackStatus(prev => ({ ...prev, [activeFeedbackMsgId]: 'dislike' }));
        setShowDislikeModal(false);
      }
    } catch (err) {
      console.error("👎 反饋寫入失敗:", err);
    }
  };

  // 執行重置對話
  const confirmResetHistory = async () => {
    try {
      await fetch(`/api/history?userId=${userId}`, { method: 'DELETE' });
      setMessages([]);
      setFeedbackStatus({});
      setShowResetModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div 
      className="fixed inset-0 w-full flex flex-col bg-slate-900 text-white overflow-hidden select-none"
      style={{ height: '100dvh', maxHeight: '100dvh' }}
    >
      {/* ⚠️ 強制全域注入：徹底屏蔽 Vercel 懸浮工具列，並設定盒子模型 */}
      <style>{`
        * {
          box-sizing: border-box !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: 100% !important;
          overflow: hidden !important;
          position: fixed !important;
        }
        #vercel-live-feedback,
        vercel-live-feedback,
        .vercel-live-feedback,
        [id^="vercel-"],
        [class^="vercel-"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
      
      {/* 1. 頂部導覽列 */}
      <header className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 p-4 shadow-md flex items-center justify-between gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl border border-white/30 flex-shrink-0">
            🐱
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg leading-tight truncate">專屬助理</h1>
            <span className="text-xs text-emerald-300 flex items-center mt-0.5">● 在線中</span>
          </div>
        </div>

        {/* 下拉式字體選擇選單 */}
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
        
        {/* 重置對話按鈕 */}
        <button 
          onClick={() => setShowResetModal(true)}
          className="text-white hover:text-white bg-white/10 px-3.5 py-1.5 rounded-xl border border-white/20 text-sm font-semibold active:scale-95 transition-all flex-shrink-0"
        >
          重置對話
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
                
                {/* 🌟 只有 AI (model) 的回覆會顯示大腦反饋按鈕 */}
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

      {/* 3. 底部輸入區 (w-0 flex-1 防止大字體擠壓，適配手機安全區域) */}
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

      {/* 🚨 彈窗 A：右上角重置確認視窗 */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-white mb-3`}>系統提示</h3>
            <p className={`${currentStyle.modalText} text-slate-300 mb-6`}>是否清空對話記憶？</p>
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

      {/* 🧠 彈窗 B：不滿意 (Dislike) 意見收集視窗 */}
      {showDislikeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-rose-400 mb-2`}>幫助助理改進</h3>
            <p className="text-slate-400 text-sm mb-4">這段回覆哪裡不對呢？（例如：語氣不佳、有錯字、忘記加上特定結尾...）</p>
            
            <textarea
              value={dislikeCorrection}
              onChange={(e) => setDislikeCorrection(e.target.value)}
              placeholder="例如：你忘記在結尾加上喵了、請回答得更簡短一點..."
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
