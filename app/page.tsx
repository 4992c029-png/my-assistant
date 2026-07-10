'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  showFeedback?: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'model', content: '今天有什麼吩咐嗎？' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const testUserId = '11111111-1111-1111-1111-111111111111';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: input }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, userId: testUserId })
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

  const submitCorrection = async () => {
    if (!correctionText.trim() || !feedbackId) return;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: testUserId, correction: correctionText })
      });
      alert('調整成功！大腦已記錄您的偏好。');
      setCorrectionText('');
      setFeedbackId(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-50 border-x border-slate-200 shadow-2xl relative">
      
      {/* 頂部 APP 導覽列 (確保所有標籤完整) */}
      <header className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white p-4 shadow-md flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg border border-white/30"> </div>
          <div>
            <h1 className="font-semibold text-base leading-tight">專屬助理</h1>
            <span className="text-xs text-emerald-300 flex items-center">● 在線中</span>
          </div>
        </div>
        <button 
          className="text-white/80 hover:text-white text-sm bg-white/10 px-3 py-1 rounded-full border border-white/10"
          onClick={() => setMessages([{ id: 'welcome', role: 'model', content: '記憶已重置，有什麼吩咐嗎？' }])}
        >
          重置
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
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center space-x-3 text-xs text-slate-400">
                  <span>滿意嗎？</span>
                  <button className="hover:text-emerald-500 p-1" onClick={() => alert('謝謝！')}>👍 滿意</button>
                  <button className="hover:text-rose-500 p-1" onClick={() => setFeedbackId(msg.id)}>👎 不滿意</button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

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
      <footer className="p-3 bg-white border-t border-slate-100 sticky bottom-0 left-0 right-0">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input 
            type="text" 
            className="flex-1 bg-slate-100 border-0 rounded-full px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white"
            placeholder="跟專屬助理說點話..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button 
            type="submit" 
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${loading ? 'bg-slate-300' : 'bg-gradient-to-r from-violet-600 to-indigo-600'}`}
            disabled={loading}
          >
            {loading ? '⏳' : '➔'}
          </button>
        </form>
      </footer>

    </div>
  );
}