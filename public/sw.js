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

// 🌟 強制背景推播：手機鎖屏/App關閉時由系統喚醒並彈出鬧鐘
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || '⏰ 鬧鐘提醒';
    const options = {
      body: data.body || '您的提醒時間到了！',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [500, 250, 500, 250, 500, 250, 500],
      tag: data.id || 'alarm-notification',
      renotify: true,
      requireInteraction: true, // 強制保持在螢幕上，使用者不點擊不消失
      data: data
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error("Push 事件處理失敗:", err);
  }
});

// 點擊推播開啟 App
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            return clientList[i];
          }
        }
        return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
