import { Metadata } from 'next';

// 🌟 匯出 metadata 讓 Next.js 自動生成 head 標籤
export const metadata: Metadata = {
  title: 'AI 助理',
  description: '個人專屬 AI 助理',
  appleWebApp: {
    capable: true, // 🌟 允許 iOS Safari「加入主畫面」時全螢幕執行 (隱藏網址列)
    statusBarStyle: 'black-translucent', // 狀態列設定為黑半透明，融入 App 背景
    title: 'AI 助理',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <head>
        {/* iOS 網址列防護 Meta */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>{children}</body>
    </html>
  );
}
