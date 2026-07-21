'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    google?: any;
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 🌐 多語言字典 (i18n)
const I18N_TEXTS = {
  zh: {
    title: '專屬 AI 助理',
    online: '在線中',
    fontSmall: '字體：小',
    fontMedium: '字體：中',
    fontLarge: '字體：大',
    inputPlaceholder: '對助理下達命令或輸入提示詞...',
    send: '發送',
    sending: '...',
    voiceBtn: '🎤 語音',
    voiceListening: '🎙️ 聆聽中...',
    imageGenBtn: '🎨 畫圖',
    imageGenTitle: '🎨 AI 圖片生成器',
    imagePromptPlaceholder: '請描述您想生成的圖片內容...',
    generate: '開始生成圖片',
    generating: '圖片繪製中...',
    downloadImage: '📥 下載圖片',
    close: '關閉',
    settings: '系統設定',
    settingsTitle: '⚙️ 系統設定中心',
    logout: '🚪 登出帳號',
    remindersSetting: '⏰ 提醒與鬧鐘設定',
    brainInstructions: '🧠 編輯大腦指導偏好',
    clearHistory: '🗑️ 清空對話記憶',
    copiedNotice: '✓ 已複製對話內容',
    like: '👍 滿意',
    dislike: '👎 不滿意',
    likeFeedback: '💚 已記錄滿意回饋',
    dislikeFeedback: '💔 已記錄不滿意回饋',
    alarmTitle: '⏰ 時間到了！提醒通知',
    stopAlarm: '🔕 關閉鬧鐘 / 停止提醒',
    voiceNotSupported: '您的瀏覽器不支援語音辨識功能',
  },
  en: {
    title: 'AI Assistant',
    online: 'Online',
    fontSmall: 'Font: Small',
    fontMedium: 'Font: Medium',
    fontLarge: 'Font: Large',
    inputPlaceholder: 'Type a command or text...',
    send: 'Send',
    sending: '...',
    voiceBtn: '🎤 Voice',
    voiceListening: '🎙️ Listening...',
    imageGenBtn: '🎨 Draw',
    imageGenTitle: '🎨 AI Image Generator',
    imagePromptPlaceholder: 'Describe the image you want to generate...',
    generate: 'Generate Image',
    generating: 'Generating Image...',
    downloadImage: '📥 Download Image',
    close: 'Close',
    settings: 'Settings',
    settingsTitle: '⚙️ System Settings',
    logout: '🚪 Sign Out',
    remindersSetting: '⏰ Reminders & Alarms',
    brainInstructions: '🧠 Brain Instructions',
    clearHistory: '🗑️ Clear Chat History',
    copiedNotice: '✓ Copied to clipboard',
    like: '👍 Like',
    dislike: '👎 Dislike',
    likeFeedback: '💚 Liked',
    dislikeFeedback: '💔 Disliked',
    alarmTitle: '⏰ Alarm Triggered!',
    stopAlarm: '🔕 Stop Alarm',
    voiceNotSupported: 'Speech recognition is not supported in your browser.',
  },
};

// 🍪 雙重儲存機制 (Cookie + LocalStorage)
const dualStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    let value = null;
    const name = key + '=';
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
    date.setTime(date.getTime() + 365 * 24 * 60 * 60 * 1000);
    const expires = '; expires=' + date.toUTCString();
    document.cookie =
      key + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax; Secure';
    localStorage.setItem(key, value);
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    document.cookie =
      key + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax; Secure';
    localStorage.removeItem(key);
  },
};

const supabase =
  typeof window !== 'undefined'
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          storageKey: 'sb-pwa-dual-session',
          storage: dualStorage,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

const isValidUUID = (id: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const getLocalDateTimeString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const BEEP_AUDIO_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

// 💬 對話氣泡組件（長按複製）
function MessageBubbleItem({
  msg,
  currentStyle,
  feedbackStatus,
  handleLike,
  handleDislikeClick,
  t,
}: {
  msg: any;
  currentStyle: any;
  feedbackStatus: Record<string, 'like' | 'dislike'>;
  handleLike: (msgId: string, content: string) => void;
  handleDislikeClick: (msgId: string, content: string) => void;
  t: any;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const copyToClipboard = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg.content);
      setCopied(true);
      if (typeof window !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(40);
      }
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      copyToClipboard();
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className="flex flex-col max-w-[85%] space-y-1 relative group">
        {copied && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-emerald-400 border border-emerald-500/40 text-xs px-3 py-1 rounded-full shadow-xl z-20 whitespace-nowrap animate-bounce font-medium">
            {t.copiedNotice}
          </div>
        )}

        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          className={`shadow-md transition-all duration-200 break-words select-text active:opacity-90 ${
            currentStyle.bubble
          } ${
            msg.role === 'user'
              ? 'bg-violet-600 text-white rounded-tr-none'
              : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
          }`}
        >
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
                  {t.like}
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => handleDislikeClick(msg.id, msg.content)}
                  className="hover:text-rose-400 active:scale-95 transition-all flex items-center gap-1"
                >
                  {t.dislike}
                </button>
              </>
            ) : feedbackStatus[msg.id] === 'like' ? (
              <span className="text-emerald-400 flex items-center gap-1">{t.likeFeedback}</span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">{t.dislikeFeedback}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState('');

  // 🌐 語言設定 ('zh' | 'en')
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const t = I18N_TEXTS[lang];

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // 🎤 語音辨識狀態
  const [isListening, setIsListening] = useState(false);

  // 🎨 圖片生成 Modal 狀態
  const [showImageGenModal, setShowImageGenModal] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'like' | 'dislike'>>({});
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDislikeModal, setShowDislikeModal] = useState(false);

  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState('');
  const [activeFeedbackContent, setActiveFeedbackContent] = useState('');
  const [dislikeCorrection, setDislikeCorrection] = useState('');

  const [instructions, setInstructions] = useState<any[]>([]);
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // ⏰ 提醒狀態
  const [reminders, setReminders] = useState<any[]>([]);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderTime, setNewReminderTime] = useState(getLocalDateTimeString());
  const [newReminderRepeat, setNewReminderRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [newReminderType, setNewReminderType] = useState<'alert' | 'audio' | 'both'>('both');
  const [activeAlarm, setActiveAlarm] = useState<any | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processingIdsRef = useRef<Set<string>>(new Set());
  const audioUnlockedRef = useRef<boolean>(false);

  const sizeStyles = {
    small: {
      bubble: 'text-base p-2.5 px-4 rounded-2xl',
      input: 'text-base py-2 px-3',
      sendBtn: 'text-base px-3 py-2',
      feedbackBtn: 'text-xs mt-1 pl-1 space-x-2',
      modalTitle: 'text-lg font-bold',
      modalText: 'text-base',
      modalBtn: 'text-sm py-2 px-4 w-24',
    },
    medium: {
      bubble: 'text-xl p-3 px-5 rounded-3xl',
      input: 'text-xl py-2 px-4',
      sendBtn: 'text-xl px-4 py-2',
      feedbackBtn: 'text-sm mt-1.5 pl-1.5 space-x-3',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-xl',
      modalBtn: 'text-base py-2.5 px-5 w-28',
    },
    large: {
      bubble: 'text-[26px] p-3 px-5 rounded-[1.8rem]',
      input: 'text-[22px] py-1.5 px-4',
      sendBtn: 'text-[22px] px-4 py-1.5',
      feedbackBtn: 'text-base mt-1.5 pl-2 space-x-4',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-lg',
      modalBtn: 'text-base py-2 px-4 w-28',
    },
  };

  const currentStyle = sizeStyles[fontSize];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 🎤 語音辨識觸發邏輯
  const handleVoiceInput = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(t.voiceNotSupported);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'zh' ? 'zh-TW' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };

    recognition.start();
  };

  // 🎨 圖片生成提交邏輯
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;
    setIsGeneratingImage(true);
    setGeneratedImageUrl('');

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt, userId }),
      });
      const data = await res.json();
      if (data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
      } else {
        alert(data.error || '圖片生成失敗，請再試一次');
      }
    } catch (err) {
      console.error('生成圖片失敗:', err);
      alert('網路錯誤，無法生成圖片');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // 音效解鎖與 SW
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const audio = new Audio(BEEP_AUDIO_BASE64);
      audio.loop = true;
      audioRef.current = audio;

      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }

      const savedLang = localStorage.getItem('app_lang') as 'zh' | 'en';
      if (savedLang) setLang(savedLang);

      const savedSize = localStorage.getItem('app_font_size') as 'small' | 'medium' | 'large';
      if (savedSize) setFontSize(savedSize);

      const unlockAudio = () => {
        if (!audioUnlockedRef.current && audioRef.current) {
          audioRef.current
            .play()
            .then(() => {
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              }
              audioUnlockedRef.current = true;
            })
            .catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };

      window.addEventListener('click', unlockAudio);
      window.addEventListener('touchstart', unlockAudio);

      return () => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      };
    }
  }, []);

  const toggleLanguage = () => {
    const nextLang = lang === 'zh' ? 'en' : 'zh';
    setLang(nextLang);
    localStorage.setItem('app_lang', nextLang);
  };

  // ⏰ 提醒檢查與非休眠喚醒補發機制
  const checkAndTriggerReminders = async () => {
    if (!userId || reminders.length === 0) return;

    const now = new Date();
    for (const reminder of reminders) {
      if (reminder.is_triggered || processingIdsRef.current.has(reminder.id)) continue;

      const remindTime = new Date(reminder.remind_at);
      if (now >= remindTime) {
        processingIdsRef.current.add(reminder.id);
        await processTriggeredReminder(reminder);
        processingIdsRef.current.delete(reminder.id);
      }
    }
  };

  const processTriggeredReminder = async (reminder: any) => {
    if (!supabase || !isValidUUID(userId)) return;

    const repeatType = reminder.repeat_type || 'none';
    let nextRemindAt: string | null = null;

    if (repeatType !== 'none') {
      const current = new Date(reminder.remind_at);
      if (repeatType === 'daily') current.setDate(current.getDate() + 1);
      else if (repeatType === 'weekly') current.setDate(current.getDate() + 7);
      else if (repeatType === 'monthly') current.setMonth(current.getMonth() + 1);
      nextRemindAt = current.toISOString();
    }

    if (nextRemindAt) {
      await supabase
        .from('user_reminders')
        .update({ remind_at: nextRemindAt, is_triggered: false })
        .eq('id', reminder.id);
    } else {
      await supabase
        .from('user_reminders')
        .update({ is_triggered: true })
        .eq('id', reminder.id);
    }

    fetchReminders(userId);
    setActiveAlarm(reminder);

    if (reminder.reminder_type === 'audio' || reminder.reminder_type === 'both') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => console.log('音訊播放受限:', err));
      }
    }

    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate([500, 250, 500, 250, 500]);
    }
  };

  useEffect(() => {
    const interval = setInterval(checkAndTriggerReminders, 1000);

    const handleWakeUp = () => {
      if (document.visibilityState === 'visible') {
        checkAndTriggerReminders();
      }
    };

    document.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);
    window.addEventListener('pageshow', handleWakeUp);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
      window.removeEventListener('pageshow', handleWakeUp);
    };
  }, [reminders, userId]);

  const handleStopAlarm = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setActiveAlarm(null);
  };

  const fetchReminders = async (uid: string) => {
    if (!uid || !isValidUUID(uid) || !supabase) return;
    const { data, error } = await supabase
      .from('user_reminders')
      .select('*')
      .eq('user_id', uid)
      .eq('is_triggered', false)
      .order('remind_at', { ascending: true });

    if (!error && data) setReminders(data);
  };

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    const restoreSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user && isValidUUID(session.user.id)) {
          setUser(session.user);
          setUserId(session.user.id);
          fetchInstructions(session.user.id);
          fetchReminders(session.user.id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();
  }, []);

  const fetchInstructions = async (uid: string) => {
    if (!uid || !isValidUUID(uid) || !supabase) return;
    const { data, error } = await supabase
      .from('user_instructions')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (!error && data) setInstructions(data);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || loading || !isValidUUID(userId)) return;
    setLoading(true);

    const userMsg = { id: `msg_user_${Date.now()}`, role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, userId }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { id: `msg_model_${Date.now()}`, role: 'model', content: data.reply }]);
        fetchReminders(userId);
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
        body: JSON.stringify({ userId, type: 'like', replyContent: content }),
      });
      if (res.ok) setFeedbackStatus((prev) => ({ ...prev, [msgId]: 'like' }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDislikeClick = (msgId: string, content: string) => {
    if (feedbackStatus[msgId]) return;
    setActiveFeedbackMsgId(msgId);
    setActiveFeedbackContent(content);
    setDislikeCorrection('');
    setShowDislikeModal(true);
  };

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 mb-4"></div>
        <p className="text-slate-400">Loading...</p>
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
        }
      `}</style>

      {/* 1. 頂部導覽列 */}
      <header className="flex-shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 p-3.5 shadow-md flex items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <div className="flex items-center space-x-2 min-w-0">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl border border-white/30 flex-shrink-0">
            🐱
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-lg leading-tight truncate">{t.title}</h1>
            <span className="text-xs text-emerald-300 flex items-center mt-0.5">● {t.online}</span>
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* 🌐 中英文切換按鈕 */}
          <button
            onClick={toggleLanguage}
            className="bg-white/10 hover:bg-white/20 text-white font-bold border border-white/20 rounded-xl px-2.5 py-1 text-xs transition-all active:scale-95"
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>

          {/* 字體大小切換 */}
          <select
            value={fontSize}
            onChange={(e) => {
              const size = e.target.value as any;
              setFontSize(size);
              localStorage.setItem('app_font_size', size);
            }}
            className="bg-white/10 text-white border border-white/20 rounded-xl px-2 py-1 text-xs font-semibold focus:outline-none appearance-none cursor-pointer"
          >
            <option value="small" className="bg-slate-800 text-white">{t.fontSmall}</option>
            <option value="medium" className="bg-slate-800 text-white">{t.fontMedium}</option>
            <option value="large" className="bg-slate-800 text-white">{t.fontLarge}</option>
          </select>

          {/* 設定按鈕 */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="text-white/80 hover:text-white active:scale-90 transition-all p-1"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* 2. 對話聊天區 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 py-20 text-lg">
            {lang === 'zh' ? '開始與專屬 AI 助理對話吧！' : 'Start chatting with your AI assistant!'}
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubbleItem
              key={msg.id}
              msg={msg}
              currentStyle={currentStyle}
              feedbackStatus={feedbackStatus}
              handleLike={handleLike}
              handleDislikeClick={handleDislikeClick}
              t={t}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 3. 底部輸入區 (含語音辨識與繪圖按鈕) */}
      <div className="flex-shrink-0 w-full px-3 py-3 border-t border-slate-800 bg-slate-900/95 flex items-center gap-1.5 box-border pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {/* 🎨 圖片生成視窗按鈕 */}
        <button
          onClick={() => setShowImageGenModal(true)}
          className="bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-full px-3 py-2 text-xs font-bold transition-all active:scale-95 flex-shrink-0"
          title={t.imageGenBtn}
        >
          {t.imageGenBtn}
        </button>

        {/* 🎤 語音辨識按鈕 */}
        <button
          onClick={handleVoiceInput}
          className={`${
            isListening ? 'bg-rose-600 animate-pulse' : 'bg-slate-800 hover:bg-slate-700'
          } text-white rounded-full px-3 py-2 text-xs font-bold border border-slate-700 transition-all active:scale-95 flex-shrink-0`}
          title={t.voiceBtn}
        >
          {isListening ? t.voiceListening : t.voiceBtn}
        </button>

        {/* 輸入框 */}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder={t.inputPlaceholder}
          className={`flex-1 w-0 bg-slate-800 text-white rounded-full border border-slate-700 focus:outline-none focus:border-violet-500 transition-all box-border ${currentStyle.input}`}
        />

        {/* 送出按鈕 */}
        <button
          onClick={handleSendMessage}
          disabled={loading}
          className={`flex-shrink-0 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center box-border ${currentStyle.sendBtn}`}
        >
          {loading ? t.sending : t.send}
        </button>
      </div>

      {/* 🎨 圖片生成獨立視窗 Modal */}
      {showImageGenModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/80">
              <h3 className="text-lg font-bold text-violet-400 flex items-center gap-2">
                {t.imageGenTitle}
              </h3>
              <button
                onClick={() => setShowImageGenModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-full bg-slate-700/50"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder={t.imagePromptPlaceholder}
                rows={3}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-violet-500 resize-none"
              />

              <button
                onClick={handleGenerateImage}
                disabled={isGeneratingImage || !imagePrompt.trim()}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all active:scale-98 disabled:opacity-50"
              >
                {isGeneratingImage ? t.generating : t.generate}
              </button>

              {/* 圖片繪製中 Loading 狀態 */}
              {isGeneratingImage && (
                <div className="py-10 flex flex-col items-center justify-center space-y-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-violet-400"></div>
                  <p className="text-xs text-slate-400">{t.generating}</p>
                </div>
              )}

              {/* 圖片生成結果與下載選項 */}
              {generatedImageUrl && !isGeneratingImage && (
                <div className="space-y-3 pt-2">
                  <div className="rounded-xl overflow-hidden border border-slate-700 shadow-xl bg-slate-950">
                    <img
                      src={generatedImageUrl}
                      alt="AI Generated"
                      className="w-full h-auto object-contain max-h-[50vh]"
                    />
                  </div>
                  <a
                    href={generatedImageUrl}
                    target="_blank"
                    download="ai-generated-image.png"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm transition-all shadow-md"
                  >
                    {t.downloadImage}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ⏰ 鬧鐘喚醒 Modal */}
      {activeAlarm && (
        <div className="fixed inset-0 bg-rose-950/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 z-50 animate-pulse">
          <div className="text-center max-w-md space-y-6">
            <div className="w-24 h-24 rounded-full bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center text-5xl mx-auto animate-bounce">
              ⏰
            </div>
            <h2 className="text-3xl font-black text-rose-300">{t.alarmTitle}</h2>
            <div className="bg-slate-900/80 border border-rose-500/30 p-6 rounded-2xl">
              <p className="text-2xl font-bold text-white leading-relaxed break-words">
                {activeAlarm.title}
              </p>
            </div>
            <button
              onClick={handleStopAlarm}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xl py-4 rounded-full shadow-lg transition-all active:scale-95"
            >
              {t.stopAlarm}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
