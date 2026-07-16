import './globals.css'; // 確保你的全域樣式有載入

export const metadata = {
  title: '專屬 AI 助理',
  description: '客製化 AI 聊天機器人',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AI 助理',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 1. 強制宣告繁體中文語系 (zh-TW)
    // 2. 加上 notranslate 屬性，通知所有瀏覽器「此網頁絕對不要翻譯」
    <html lang="zh-TW" className="notranslate" google="notranslate">
      <head>
        {/* 徹底阻擋 Google 翻譯的 Meta 標籤 */}
        <meta name="google" content="notranslate" />
        
        {/* 強制手機以 Web App Standalone (無網址列) 模式開啟 */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        
        {/* 完美適應劉海屏與安全區域的 Viewport 設定 */}
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" 
        />
      </head>
      <body className="notranslate">{children}</body>
    </html>
  );
}
