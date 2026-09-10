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

// 🌟 背景推播接收器 (手機螢幕鎖定/App關閉時也會觸發)
// 注意：這支檔案原本重複註冊了兩次 'push' 監聽器，導致同一則推播會
// 同時觸發兩個處理常式、可能顯示兩則通知，而且較舊的那個沒有把
// reminderId 帶進 data，點擊時就無法正確開啟全螢幕鬧鐘畫面。
// 這裡合併成唯一一個正確版本。
self.addEventListener('push', (event) => {
  let payload = { title: '⏰ 提醒通知', body: '您的提醒時間到了！' };

  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      payload.body = event.data.text();
    }
  }

  const title = payload.title || '⏰ 提醒通知';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [500, 250, 500, 250, 500],
    tag: payload.data?.reminderId || 'reminder-tag',
    renotify: true,
    requireInteraction: true, // 通知不會自動消失，使用者要手動點掉
    data: payload.data || {}, // 🔑 關鍵：務必把 reminderId 透過 data 帶給點擊事件
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 點擊通知開啟 App，並帶上 reminderId 讓前端顯示對應的鬧鐘懸浮框/全螢幕畫面
self.addEventListener('notificationclick', (event) => {
  const reminderId = event.notification.data?.reminderId;
  event.notification.close();

  const targetUrl = reminderId ? `/?alarmReminderId=${reminderId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          // APP 已經開著：直接傳訊息叫它顯示鬧鐘，不用整個換網址
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
