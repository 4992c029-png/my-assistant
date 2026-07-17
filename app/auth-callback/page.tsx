// app/auth-callback/page.tsx
'use client';
import { useEffect } from 'react';

export default function AuthCallback() {
  useEffect(() => {
    // 1. 解析 Supabase 回傳的 Hash Token
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        // 2. 將憑證寫入共享 LocalStorage
        localStorage.setItem('pwa-oauth-session', JSON.stringify({
          access_token: accessToken,
          refresh_token: refreshToken,
          timestamp: Date.now()
        }));
      }
    }
    // 3. 登入成功後，在 0.5 秒內自動關閉此視窗
    setTimeout(() => {
      window.close();
    }, 500);
  }, []);

  return (
    <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center text-white p-4">
      <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-violet-500 mb-4"></div>
      <p className="text-slate-300 font-semibold">登入成功！正在返回應用程式...</p>
      <p className="text-slate-500 text-xs mt-2">此視窗將自動關閉</p>
    </div>
  );
}
