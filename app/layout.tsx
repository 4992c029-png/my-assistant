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
    <html lang="zh-TW" translate="no" className="notranslate">
      <head>
        {/* 徹底禁用瀏覽器主動跳出翻譯懸浮框 */}
        <meta name="google" content="notranslate" />
        
        {/* PWA 關聯設定 */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* 即使在一般瀏覽器，也強制將上方網址列染色為 App 紫色，達成視覺一體化 */}
        <meta name="theme-color" content="#7c3aed" />
        
        {/* iOS WebApp 滿版全螢幕支援 */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        
        {/* 鎖定視窗大小，防止手機端拉扯變形 */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
