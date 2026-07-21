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

// 🍪 雙重儲存機制 (Cookie + LocalStorage) 支援 PWA 跨頁與離線 Session
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

// 本地 datetime-local 輸入框時間轉換格式化函式
const getLocalDateTimeString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// 🔊 系統內建電子鬧鐘嗶嗶聲 (Base64 WAV)
const BEEP_AUDIO_BASE64 =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

// 🌐 多國語言 (i18n) 字典對照表
const i18n = {
  zh: {
    assistantName: '專屬助理',
    online: '在線中',
    fontSmall: '字體：小',
    fontMedium: '字體：中',
    fontLarge: '字體：大',
    inputPlaceholder: '對助理下達命令吧...',
    send: '發送',
    sending: '...',
    noMessages: '暫無對話紀錄，和助理聊聊天吧！',
    copied: '✓ 已複製對話內容',
    like: '👍 滿意',
    dislike: '👎 不滿意',
    likeRecorded: '💚 已記錄滿意回饋',
    dislikeRecorded: '💔 已記錄不滿意回饋',
    settingsTitle: '⚙️ 系統設定中心',
    logout: '🚪 登出帳號',
    reminderSettings: '⏰ 提醒與鬧鐘設定',
    brainRules: '🧠 編輯大腦指導偏好',
    noBrainRules: '尚無大腦規則。',
    clearHistory: '🗑️ 清空對話（保留大腦與提醒）',
    edit: '📝 編輯',
    delete: '🗑️ 刪除',
    cancel: '取消',
    save: '儲存',
    done: '完成',
    alarmTitle: '時間到了！提醒通知',
    stopAlarm: '🔕 關閉鬧鐘 / 停止提醒',
    imageModalTitle: '🎨 AI 圖片生成',
    imagePromptPlaceholder: '描述你想生成的圖片內容...',
    generateImage: '生成圖片',
    generating: '生成中...',
    downloadImage: '📥 下載圖片',
    voiceNotSupported: '您的瀏覽器不支援語音識別功能',
    addReminder: '➕ 新增提醒 / 鬧鐘',
    reminderTitlePlaceholder: '例如：下午3點出發去開會',
    remindTime: '設定時間',
    repeatCycle: '週期重複',
    reminderMode: '提醒模式',
    noneRepeat: '單次 (不重複)',
    dailyRepeat: '🔄 每天重複',
    weeklyRepeat: '📅 每週重複',
    monthlyRepeat: '📆 每月重複',
    modeBoth: '🔔 視窗 + 鬧鐘音效',
    modeAlert: '💬 僅彈出視窗',
    modeAudio: '🎵 僅播放鬧鐘',
    addReminderBtn: '新增提醒事項',
    pendingReminders: '📋 待觸發提醒與鬧鐘',
    noReminders: '目前沒有設定任何待觸發的提醒。',
    close: '關閉',
    resetConfirmTitle: '系統提示',
    resetConfirmMsg: '是否要清除該使用者的所有對話記憶？',
    confirmClear: '確認清除',
    dislikeModalTitle: '幫助助理改進',
    dislikePrompt: '這段回覆哪裡不對呢？',
    dislikePlaceholder: '例如：請記得加上尾音、對話內容太冗長...',
    submitCorrection: '送出修正',
    enablePushPermission: '開啟手機推播權限，使用手機時能獲得系統提示！',
    enablePushBtn: '開啟推播',
  },
  en: {
    assistantName: 'AI Assistant',
    online: 'Online',
    fontSmall: 'Font: Small',
    fontMedium: 'Font: Medium',
    fontLarge: 'Font: Large',
    inputPlaceholder: 'Type your message...',
    send: 'Send',
    sending: '...',
    noMessages: 'No message history yet. Start chatting!',
    copied: '✓ Copied to clipboard',
    like: '👍 Like',
    dislike: '👎 Dislike',
    likeRecorded: '💚 Feedback recorded',
    dislikeRecorded: '💔 Feedback recorded',
    settingsTitle: '⚙️ Settings Center',
    logout: '🚪 Sign Out',
    reminderSettings: '⏰ Reminders & Alarms',
    brainRules: '🧠 Edit Brain Rules',
    noBrainRules: 'No brain rules configured.',
    clearHistory: '🗑️ Clear Chat History',
    edit: '📝 Edit',
    delete: '🗑️ Delete',
    cancel: 'Cancel',
    save: 'Save',
    done: 'Done',
    alarmTitle: "Time's up! Reminder",
    stopAlarm: '🔕 Stop Alarm',
    imageModalTitle: '🎨 AI Image Generator',
    imagePromptPlaceholder: 'Describe the image you want to generate...',
    generateImage: 'Generate Image',
    generating: 'Generating...',
    downloadImage: '📥 Download Image',
    voiceNotSupported: 'Voice recognition is not supported in this browser.',
    addReminder: '➕ Add Reminder / Alarm',
    reminderTitlePlaceholder: 'e.g. Meeting at 3 PM',
    remindTime: 'Set Time',
    repeatCycle: 'Repeat',
    reminderMode: 'Notification Mode',
    noneRepeat: 'Once (No repeat)',
    dailyRepeat: '🔄 Daily',
    weeklyRepeat: '📅 Weekly',
    monthlyRepeat: '📆 Monthly',
    modeBoth: '🔔 Popup + Alarm Sound',
    modeAlert: '💬 Popup Only',
    modeAudio: '🎵 Alarm Sound Only',
    addReminderBtn: 'Add Reminder',
    pendingReminders: '📋 Active Reminders & Alarms',
    noReminders: 'No active reminders configured.',
    close: 'Close',
    resetConfirmTitle: 'System Alert',
    resetConfirmMsg: 'Are you sure you want to clear all chat history for this user?',
    confirmClear: 'Confirm Clear',
    dislikeModalTitle: 'Help Us Improve',
    dislikePrompt: 'What went wrong with this response?',
    dislikePlaceholder: 'e.g., Tone was incorrect, too verbose...',
    submitCorrection: 'Submit Feedback',
    enablePushPermission: 'Enable push notifications to receive alerts on mobile!',
    enablePushBtn: 'Enable Push',
  },
};

// 💬 長按可複製對話氣泡組件
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
        navigator.vibrate(40); // 微感震動
      }
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      copyToClipboard();
    }, 500); // 長按 500ms 觸發
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
            {t.copied}
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
          title="長按可複製文字"
        >
          {msg.imageUrl ? (
            <div className="space-y-2">
              <p>{msg.content}</p>
              <img
                src={msg.imageUrl}
                alt="Generated AI"
                className="rounded-xl max-w-full h-auto border border-slate-700 shadow-md"
              />
            </div>
          ) : (
            msg.content
          )}
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
              <span className="text-emerald-400 flex items-center gap-1">{t.likeRecorded}</span>
            ) : (
              <span className="text-rose-400 flex items-center gap-1">{t.dislikeRecorded}</span>
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

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [feedbackStatus, setFeedbackStatus] = useState<Record<string, 'like' | 'dislike'>>({});
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [lang, setLang] = useState<'zh' | 'en'>('zh');

  // Modals 控制
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDislikeModal, setShowDislikeModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);

  // 🎨 AI 圖片生成狀態
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [imageLoading, setImageLoading] = useState(false);

  // 🎤 語音輸入狀態
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [activeFeedbackMsgId, setActiveFeedbackMsgId] = useState('');
  const [activeFeedbackContent, setActiveFeedbackContent] = useState('');
  const [dislikeCorrection, setDislikeCorrection] = useState('');

  const [instructions, setInstructions] = useState<any[]>([]);
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  // ⏰ 提醒與鬧鐘狀態
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

  const t = i18n[lang];

  const sizeStyles = {
    small: {
      bubble: 'text-base p-2.5 px-4 rounded-2xl',
      input: 'text-base py-2 px-4',
      sendBtn: 'text-base px-4 py-2',
      feedbackBtn: 'text-xs mt-1 pl-1 space-x-2',
      modalTitle: 'text-lg font-bold',
      modalText: 'text-base',
      modalBtn: 'text-sm py-2 px-4 w-24',
    },
    medium: {
      bubble: 'text-xl p-3 px-5 rounded-3xl',
      input: 'text-xl py-2 px-4',
      sendBtn: 'text-xl px-5 py-2',
      feedbackBtn: 'text-sm mt-1.5 pl-1.5 space-x-3',
      modalTitle: 'text-2xl font-bold',
      modalText: 'text-xl',
      modalBtn: 'text-base py-2.5 px-5 w-28',
    },
    large: {
      bubble: 'text-[26px] p-3 px-5 rounded-[1.8rem]',
      input: 'text-[22px] py-1.5 px-4',
      sendBtn: 'text-[22px] px-5 py-1.5',
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

  // 音效解鎖與 SW 註冊
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const audio = new Audio(BEEP_AUDIO_BASE64);
      audio.loop = true;
      audioRef.current = audio;

      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js')
          .catch((err) => console.error('SW 註冊失敗:', err));
      }

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

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        alert('推播通知權限已開啟！');
      }
    }
  };

  // ⏰ 核心提醒檢查邏輯 (支援亮屏即時與休眠喚醒自動補發)
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
      if (repeatType === 'daily') {
        current.setDate(current.getDate() + 1);
      } else if (repeatType === 'weekly') {
        current.setDate(current.getDate() + 7);
      } else if (repeatType === 'monthly') {
        current.setMonth(current.getMonth() + 1);
      }
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

    if (Notification.permission === 'granted') {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(`⏰ 提醒：${reminder.title}`, {
            body: `預定時間：${new Date(reminder.remind_at).toLocaleTimeString()}`,
            icon: '/icon-192.png',
            tag: reminder.id,
          });
        });
      } else {
        new Notification(`⏰ 提醒：${reminder.title}`, {
          body: `預定時間：${new Date(reminder.remind_at).toLocaleTimeString()}`,
        });
      }
    }

    if (typeof window !== 'undefined' && window.navigator.vibrate) {
      window.navigator.vibrate([500, 250, 500, 250, 500]);
    }
  };

  // ⚡ 螢幕亮起與應用程式復甦事件監聽
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

    if (!error && data) {
      setReminders(data);
    }
  };

  const handleAddReminder = async () => {
    if (!newReminderTitle.trim() || !newReminderTime || !supabase || !isValidUUID(userId)) {
      alert('請填寫完整提醒內容與時間！');
      return;
    }

    const targetDate = new Date(newReminderTime);
    if (isNaN(targetDate.getTime())) {
      alert('請選擇有效的日期時間！');
      return;
    }

    const { data, error } = await supabase
      .from('user_reminders')
      .insert([
        {
          user_id: userId,
          title: newReminderTitle,
          remind_at: targetDate.toISOString(),
          repeat_type: newReminderRepeat,
          reminder_type: newReminderType,
          is_triggered: false,
        },
      ])
      .select();

    if (!error && data) {
      setReminders((prev) =>
        [...prev, data[0]].sort(
          (a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()
        )
      );
      setNewReminderTitle('');
      setNewReminderTime(getLocalDateTimeString());
      setNewReminderRepeat('none');
      alert('提醒設定成功！⏰');
    } else {
      alert('設定失敗，請確認格式');
    }
  };

  const handleDeleteReminder = async (id: string) => {
    if (!supabase || !isValidUUID(userId)) return;
    const { error } = await supabase
      .from('user_reminders')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (!error) {
      setReminders((prev) => prev.filter((r) => r.id !== id));
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const metaTags = [
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: '專屬 AI 助理' },
      { name: 'mobile-web-app-capable', content: 'yes' },
    ];

    metaTags.forEach((tag) => {
      let el = document.querySelector(`meta[name="${tag.name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', tag.name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', tag.content);
    });
  }, []);

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
        console.error('Session 恢復失敗:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'SIGNED_IN' && currentSession?.user) {
        setUser(currentSession.user);
        setUserId(currentSession.user.id);
        fetchInstructions(currentSession.user.id);
        fetchReminders(currentSession.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserId('');
        setInstructions([]);
        setReminders([]);
        setMessages([]);
      }
    });

    const savedSize = localStorage.getItem('app_font_size') as 'small' | 'medium' | 'large';
    if (savedSize) {
      setFontSize(savedSize);
    }

    const savedLang = localStorage.getItem('app_lang') as 'zh' | 'en';
    if (savedLang) {
      setLang(savedLang);
    }

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !supabase || user) return;

    const initGoogleGSI = () => {
      if (!window.google) return;
      try {
        window.google.accounts.id.initialize({
          client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
          callback: async (response: any) => {
            setAuthLoading(true);
            const { data, error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: response.credential,
            });
            if (!error && data?.user) {
              setUser(data.user);
              setUserId(data.user.id);
              fetchInstructions(data.user.id);
              fetchReminders(data.user.id);
            } else if (error) {
              alert(`Google 認證失敗: ${error.message}`);
            }
            setAuthLoading(false);
          },
          ux_mode: 'popup',
        });

        const btnContainer = document.getElementById('google-signin-btn');
        if (btnContainer) {
          window.google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            width: 280,
          });
        }
      } catch (err) {
        console.error('GSI 初始化失敗:', err);
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
      console.error('登出失敗:', err);
    }
  };

  const handleFontSizeChange = (size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
    localStorage.setItem('app_font_size', size);
  };

  const handleLangChange = (l: 'zh' | 'en') => {
    setLang(l);
    localStorage.setItem('app_lang', l);
  };

  useEffect(() => {
    if (!userId || !isValidUUID(userId)) return;

    fetch(`/api/history?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.history) {
          const formatted = data.history.map((h: any, index: number) => ({
            id: `msg_${index}_${h.created_at || Date.now()}`,
            role: h.role,
            content: h.content,
            imageUrl: h.imageUrl || null,
          }));
          setMessages(formatted);
        }
      })
      .catch((err) => console.error('載入歷史訊息失敗:', err));
  }, [userId]);

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
        const replyId = `msg_model_${Date.now()}`;
        setMessages((prev) => [...prev, { id: replyId, role: 'model', content: data.reply }]);

        fetchReminders(userId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 🎤 語音輸入切換
  const toggleVoiceInput = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(t.voiceNotSupported);
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = lang === 'en' ? 'en-US' : 'zh-TW';

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('');
          setInput(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error('語音辨識錯誤:', event.error);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
        recognitionRef.current = recognition;
        setIsListening(true);
      } catch (err) {
        console.error('語音啟動失敗:', err);
        setIsListening(false);
      }
    }
  };

  // 🎨 AI 圖片生成處理
  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || imageLoading || !isValidUUID(userId)) return;
    setImageLoading(true);
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

        // 同步寫入當前對話紀錄
        const userMsg = {
          id: `msg_user_${Date.now()}`,
          role: 'user',
          content: `🎨 [生成圖片] ${imagePrompt}`,
        };
        const modelMsg = {
          id: `msg_model_${Date.now()}`,
          role: 'model',
          content: `已為您生成圖片：「${imagePrompt}」`,
          imageUrl: data.imageUrl,
        };

        setMessages((prev) => [...prev, userMsg, modelMsg]);
      } else {
        alert(data.error || '圖片生成失敗，請再試一次');
      }
    } catch (err) {
      console.error('圖片生成請求錯誤:', err);
      alert('連線失敗，請檢查網路設定');
    } finally {
      setImageLoading(false);
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
      if (res.ok) {
        setFeedbackStatus((prev) => ({ ...prev, [msgId]: 'like' }));
        fetchInstructions(userId);
      }
    } catch (err) {
      console.error('👍 反饋寫入失敗:', err);
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
          correction: dislikeCorrection,
        }),
      });
      if (res.ok) {
        setFeedbackStatus((prev) => ({ ...prev, [activeFeedbackMsgId]: 'dislike' }));
        setShowDislikeModal(false);
        fetchInstructions(userId);
      }
    } catch (err) {
      console.error('👎 反饋寫入失敗:', err);
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
      setInstructions((prev) => prev.filter((item) => item.id !== id));
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
      setInstructions((prev) =>
        prev.map((item) => (item.id === id ? { ...item, instruction: editingText } : item))
      );
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
            <h1 className="text-2xl font-extrabold text-white mb-2">{t.assistantName}</h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              安全且無縫地同步您的大腦偏好設定
            </p>
            <div className="flex flex-col items-center justify-center space-y-4">
              <div id="google-signin-btn" className="min-h-[50px]"></div>
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
                <h1 className="font-bold text-lg leading-tight truncate">{t.assistantName}</h1>
                <span className="text-xs text-emerald-300 flex items-center mt-0.5">● {t.online}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 中英文切換 */}
              <select
                value={lang}
                onChange={(e) => handleLangChange(e.target.value as 'zh' | 'en')}
                className="bg-white/10 text-white border border-white/20 rounded-xl px-2 py-1.5 text-xs font-semibold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="zh" className="bg-slate-800 text-white">
                  繁中
                </option>
                <option value="en" className="bg-slate-800 text-white">
                  EN
                </option>
              </select>

              {/* 字體大小切換 */}
              <div className="relative">
                <select
                  value={fontSize}
                  onChange={(e) =>
                    handleFontSizeChange(e.target.value as 'small' | 'medium' | 'large')
                  }
                  className="bg-white/10 text-white border border-white/20 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-white/50 appearance-none pr-7 cursor-pointer"
                >
                  <option value="small" className="bg-slate-800 text-white">
                    {t.fontSmall}
                  </option>
                  <option value="medium" className="bg-slate-800 text-white">
                    {t.fontMedium}
                  </option>
                  <option value="large" className="bg-slate-800 text-white">
                    {t.fontLarge}
                  </option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-white/70">
                  <svg className="fill-current h-3.5 w-3.5" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>

              {/* 設定齒輪按鈕 */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="text-white/80 hover:text-white active:scale-90 transition-all flex items-center justify-center bg-transparent border-0"
                style={{ width: '38px', height: '38px' }}
                title={t.settingsTitle}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-7 h-7"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.078 2.25c-.288 0-.538.188-.612.466l-.5 1.865c-.172.643-.82 1.05-1.479.887l-1.865-.46a.625.625 0 00-.73.34l-.994 1.722a.625.625 0 00.16.782l1.503 1.155c.522.4.636 1.135.253 1.666l-.01.014c-.384.532-1.12.651-1.644.275l-1.502-1.155a.625.625 0 00-.782.16l-.994 1.722a.625.625 0 00.34.73l1.865.5c.643.172 1.05.82.887 1.479l-.46 1.865a.625.625 0 00.466.612h1.988c.288 0 .538-.188.612-.466l.5-1.865c.172-.643.82-1.05 1.479-.887l1.865.46c.264.066.545-.058.67-.297l.994-1.722a.625.625 0 00-.16-.782l-1.503-1.155c-.522-.4-.636-1.135-.253-1.666l.01-.014c.384-.532-1.12-.651 1.644-.275l1.502 1.155c.241.185.578.12.742-.11l.994-1.722a.625.625 0 00-.34-.73l-1.865-.5a1.25 1.25 0 01-.887-1.479l.46-1.865a.625.625 0 00-.466-.612h-1.988zM12 15a3 3 0 100-6 3 3 0 000 6z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </header>

          {/* 2. 聊天對話區 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 ? (
              <div className="text-center text-slate-500 py-20 text-lg">{t.noMessages}</div>
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

          {/* 3. 底部輸入與功能按鈕列 */}
          <div className="flex-shrink-0 w-full px-3 py-2 border-t border-slate-800 bg-slate-900/95 flex items-center gap-2 box-border pb-[calc(env(safe-area-inset-bottom)+12px)]">
            {/* 🎨 AI 圖片生成按鈕 */}
            <button
              onClick={() => setShowImageModal(true)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-xl rounded-full border border-slate-700 active:scale-95 transition-all flex-shrink-0"
              title={t.imageModalTitle}
            >
              🎨
            </button>

            {/* 🎤 語音輸入按鈕 */}
            <button
              onClick={toggleVoiceInput}
              className={`p-2.5 text-xl rounded-full border active:scale-95 transition-all flex-shrink-0 ${
                isListening
                  ? 'bg-rose-600 border-rose-500 text-white animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
              }`}
              title={isListening ? '點擊停止聆聽' : '點擊語音輸入'}
            >
              {isListening ? '🎙️' : '🎤'}
            </button>

            {/* 文字輸入框 */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={isListening ? '正聆聽您的聲音...' : t.inputPlaceholder}
              className={`flex-1 w-0 bg-slate-800 text-white rounded-full border border-slate-700 focus:outline-none focus:border-violet-500 transition-all box-border ${currentStyle.input}`}
            />

            {/* 發送按鈕 */}
            <button
              onClick={handleSendMessage}
              disabled={loading}
              className={`flex-shrink-0 bg-violet-600 hover:bg-violet-500 text-white rounded-full font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center box-border ${currentStyle.sendBtn}`}
            >
              {loading ? t.sending : t.send}
            </button>
          </div>
        </>
      )}

      {/* 🌟 AI 圖片生成 Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h3 className="text-xl font-bold text-violet-400 flex items-center gap-2">
                {t.imageModalTitle}
              </h3>
              <button
                onClick={() => setShowImageModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-full bg-slate-700/50"
              >
                ✕
              </button>
            </div>

            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder={t.imagePromptPlaceholder}
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-violet-500 resize-none"
            />

            <button
              onClick={handleGenerateImage}
              disabled={imageLoading || !imagePrompt.trim()}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-98"
            >
              {imageLoading ? t.generating : t.generateImage}
            </button>

            {generatedImageUrl && (
              <div className="mt-4 space-y-3">
                <img
                  src={generatedImageUrl}
                  alt="Generated"
                  className="rounded-xl border border-slate-700 w-full max-h-60 object-cover shadow-lg"
                />
                <a
                  href={generatedImageUrl}
                  download="ai-generated-image.png"
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition-all text-sm"
                >
                  {t.downloadImage}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 🌟 鬧鐘/提醒觸發 Modal */}
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
              <p className="text-sm text-slate-400 mt-2">
                設定時間：{new Date(activeAlarm.remind_at).toLocaleTimeString()}
                {activeAlarm.repeat_type !== 'none' && (
                  <span className="ml-2 text-rose-300">
                    (
                    {activeAlarm.repeat_type === 'daily'
                      ? '每天'
                      : activeAlarm.repeat_type === 'weekly'
                      ? '每週'
                      : '每月'}
                    週期)
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={handleStopAlarm}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xl py-4 rounded-full shadow-lg shadow-rose-600/30 transition-all active:scale-95"
            >
              {t.stopAlarm}
            </button>
          </div>
        </div>
      )}

      {/* 主設定 Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex-shrink-0 p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h3 className={`${currentStyle.modalTitle} text-violet-400 flex items-center gap-2`}>
                {t.settingsTitle}
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-full bg-slate-700/50"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {user?.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt="avatar"
                      className="w-12 h-12 rounded-full border border-violet-500/50"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-violet-600/30 flex items-center justify-center text-xl font-bold border border-violet-500/30">
                      👤
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-200 font-bold truncate leading-snug">
                      {user?.user_metadata?.full_name || user?.email?.split('@')[0] || '使用者'}
                    </p>
                    <p className="text-slate-400 text-xs truncate leading-normal">
                      {user?.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/30 text-rose-300 font-semibold py-2.5 rounded-lg active:scale-98 transition-all text-sm"
                >
                  {t.logout}
                </button>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowReminderModal(true);
                  }}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg flex items-center justify-between transition-all active:scale-98"
                >
                  <span className="flex items-center gap-2 text-base">
                    {t.reminderSettings}
                    {reminders.length > 0 && (
                      <span className="bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full font-black">
                        {reminders.length}
                      </span>
                    )}
                  </span>
                  <span className="text-violet-200 text-xl">➔</span>
                </button>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-700/50">
                <h4 className="text-base font-bold text-slate-300 flex items-center gap-1.5">
                  {t.brainRules} ({instructions.length})
                </h4>
                <div className="space-y-3 max-h-[25vh] overflow-y-auto pr-1">
                  {instructions.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4 text-center">{t.noBrainRules}</p>
                  ) : (
                    instructions.map((inst) => (
                      <div
                        key={inst.id}
                        className="bg-slate-900/40 border border-slate-700/80 rounded-xl p-3 flex flex-col gap-2"
                      >
                        {editingInstructionId === inst.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full bg-slate-950 border border-violet-500/50 rounded-lg p-2 text-white text-sm focus:outline-none resize-none"
                              rows={3}
                            />
                            <div className="flex justify-end gap-2 text-xs">
                              <button
                                onClick={() => setEditingInstructionId(null)}
                                className="bg-slate-700 text-slate-300 px-3 py-1.5 rounded-md"
                              >
                                {t.cancel}
                              </button>
                              <button
                                onClick={() => handleSaveInstruction(inst.id)}
                                className="bg-violet-600 text-white px-3 py-1.5 rounded-md"
                              >
                                {t.save}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                              {inst.instruction}
                            </p>
                            <div className="flex justify-end gap-3 text-xs border-t border-slate-800/60 pt-2 text-slate-400">
                              <button
                                onClick={() => handleEditClick(inst.id, inst.instruction)}
                                className="hover:text-violet-400"
                              >
                                {t.edit}
                              </button>
                              <button
                                onClick={() => handleDeleteInstruction(inst.id)}
                                className="hover:text-rose-400"
                              >
                                {t.delete}
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
                  {t.clearHistory}
                </button>
              </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-slate-700 bg-slate-900/20 flex justify-end">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2.5 rounded-full font-bold text-sm active:scale-95 transition-all"
              >
                {t.done}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 獨立提醒設定 Modal */}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex-shrink-0 p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h3 className="text-xl font-bold text-violet-400 flex items-center gap-2">
                {t.reminderSettings}
              </h3>
              <button
                onClick={() => setShowReminderModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-full bg-slate-700/50"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {notificationPermission !== 'granted' && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-amber-200">{t.enablePushPermission}</p>
                  <button
                    onClick={requestNotificationPermission}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
                  >
                    {t.enablePushBtn}
                  </button>
                </div>
              )}

              <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-200">{t.addReminder}</h4>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">提醒內容/備忘標題</label>
                  <input
                    type="text"
                    placeholder={t.reminderTitlePlaceholder}
                    value={newReminderTitle}
                    onChange={(e) => setNewReminderTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t.remindTime}</label>
                    <input
                      type="datetime-local"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{t.repeatCycle}</label>
                    <select
                      value={newReminderRepeat}
                      onChange={(e) => setNewReminderRepeat(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="none">{t.noneRepeat}</option>
                      <option value="daily">{t.dailyRepeat}</option>
                      <option value="weekly">{t.weeklyRepeat}</option>
                      <option value="monthly">{t.monthlyRepeat}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t.reminderMode}</label>
                  <select
                    value={newReminderType}
                    onChange={(e) => setNewReminderType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="both">{t.modeBoth}</option>
                    <option value="alert">{t.modeAlert}</option>
                    <option value="audio">{t.modeAudio}</option>
                  </select>
                </div>

                <button
                  onClick={handleAddReminder}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white py-2.5 rounded-lg font-bold text-sm transition-all shadow-md active:scale-98 mt-2"
                >
                  {t.addReminderBtn}
                </button>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-bold text-slate-300">
                  {t.pendingReminders} ({reminders.length})
                </h4>
                <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                  {reminders.length === 0 ? (
                    <p className="text-slate-500 text-xs py-4 text-center">{t.noReminders}</p>
                  ) : (
                    reminders.map((r) => (
                      <div
                        key={r.id}
                        className="bg-slate-900/40 border border-slate-700/60 rounded-xl p-3.5 flex justify-between items-center gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-slate-100 text-sm font-bold truncate">{r.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-400 text-xs">
                              ⏰ {new Date(r.remind_at).toLocaleString()}
                            </span>
                            {r.repeat_type !== 'none' && (
                              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                                🔄{' '}
                                {r.repeat_type === 'daily'
                                  ? '每天'
                                  : r.repeat_type === 'weekly'
                                  ? '每週'
                                  : '每月'}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteReminder(r.id)}
                          className="text-rose-400 hover:text-rose-300 p-1.5 flex-shrink-0"
                          title="刪除提醒"
                        >
                          🗑️
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-slate-700 bg-slate-900/20 flex justify-end">
              <button
                onClick={() => setShowReminderModal(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-full font-bold text-sm transition-all"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清空對話確認 Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-white mb-3`}>{t.resetConfirmTitle}</h3>
            <p className={`${currentStyle.modalText} text-slate-300 mb-6`}>{t.resetConfirmMsg}</p>
            <div className="flex space-x-3 justify-center">
              <button
                onClick={() => setShowResetModal(false)}
                className={`bg-slate-700 text-slate-200 rounded-full font-semibold ${currentStyle.modalBtn}`}
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmResetHistory}
                className={`bg-rose-600 text-white rounded-full font-bold ${currentStyle.modalBtn}`}
              >
                {t.confirmClear}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 不滿意反饋 Modal */}
      {showDislikeModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <h3 className={`${currentStyle.modalTitle} text-rose-400 mb-2`}>
              {t.dislikeModalTitle}
            </h3>
            <p className="text-slate-400 text-sm mb-4">{t.dislikePrompt}</p>
            <textarea
              value={dislikeCorrection}
              onChange={(e) => setDislikeCorrection(e.target.value)}
              placeholder={t.dislikePlaceholder}
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-base focus:outline-none focus:border-violet-500 mb-5 resize-none"
            />
            <div className="flex space-x-3 justify-center">
              <button
                onClick={() => setShowDislikeModal(false)}
                className={`bg-slate-700 text-slate-200 rounded-full font-semibold ${currentStyle.modalBtn}`}
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmDislikeFeedback}
                className={`bg-rose-600 text-white rounded-full font-bold ${currentStyle.modalBtn}`}
              >
                {t.submitCorrection}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
