// app/layout.tsx
import './globals.css';

export const metadata = {
  title: '專屬 AI 助理',
  description: '您的專屬 AI 助理',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 🌟 修正點 4 & 1：宣告繁體中文、全面禁用翻譯、支援手機滿版全螢幕
    <html lang="zh-TW" translate="no" className="notranslate">
      <head>
        {/* 徹底禁用瀏覽器主動跳出翻譯懸浮框 */}
        <meta name="google" content="notranslate" />
        
        {/* 隱藏手機瀏覽器頂部網址列與網頁資訊（PWA 滿版設定） */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
