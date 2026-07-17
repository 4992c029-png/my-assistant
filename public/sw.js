// public/sw.js
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 必須有 fetch 監聽器，Chrome 才會判定為可安裝的 App
self.addEventListener('fetch', (event) => {
  // 保持空執行即可，不影響線上運作
});
