import { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: '專屬 AI 助理',
  description: '客製化 AI 聊天機器人',
  // 🔍 讓 Android / iOS 識別為可全螢幕執行的網頁 APP
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent', // 🌟 讓 iOS 頂部狀態列變為透明/沉浸式
    title: 'AI 助理',
  },
};

// 🌟 Next.js 推薦將 viewport 獨立設定，這是消除網址列與填滿螢幕的關鍵
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // 🌟 填滿包括手機瀏海、安全區域在內的所有區塊
  themeColor: '#4f46e5', // 🌟 設定與 App 頂部 Gradient 相同的紫色，讓尚未隱藏的網址列條跟主色融合
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
