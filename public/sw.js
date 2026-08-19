// public/sw.js
const CACHE_NAME = 'ai-assistant-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// 安裝時強制寫入快取
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// 激活時清理舊快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 實質處理 Fetch 請求（破解 no-op 警告的關鍵）
self.addEventListener('fetch', (event) => {
  // 只處理同源的 GET 請求
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 網路正常，正常回傳
        return response;
      })
      .catch(() => {
        // 網路斷線或失敗時，嘗試從快取拿取資料
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // 若快取也沒有，回傳自訂離線訊息
          return new Response('目前處於離線狀態，請檢查網路連線。', {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});

// 提醒事項
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 🌟 強制背景推播接收器 (手機螢幕鎖定/App關閉時也會強制觸發)
self.addEventListener('push', (event) => {
  let data = { title: '⏰ 提醒通知', body: '您的提醒時間到了！' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [500, 250, 500, 250, 500], // 強制震動節奏
    tag: data.tag || 'reminder-tag',
    renotify: true,
    data: { url: '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 點擊通知開啟 App
self.addEventListener('notificationclick', (event) => {
  const reminderId = event.notification.data?.reminderId;
  event.notification.close();

  const targetUrl = reminderId ? `/?alarmReminderId=${reminderId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          // APP 已經開著：直接傳訊息叫它顯示全螢幕鬧鐘，不用整個換網址
          if (reminderId && 'postMessage' in client) {
            client.postMessage({ type: 'SHOW_ALARM', reminderId });
          }
          return client.focus();
        }
      }
      // APP 完全沒開：開新分頁並帶上 reminderId
      return clients.openWindow(targetUrl);
    })
  );
});

// =========================================================
// Phase 2 - Step 2：加入 public/sw.js
// 這段程式碼「加入」到你現有的 public/sw.js 檔案最下方即可，
// 不需要整個檔案重寫，前面原本的 install/fetch 事件監聽保留不動。
// =========================================================

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: '⏰ 提醒通知', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || '⏰ 提醒通知';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    requireInteraction: true, // 通知不會自動消失，使用者要手動點掉
  };

  event.waitUntil(self.registration.showNotification(title, options));
});


