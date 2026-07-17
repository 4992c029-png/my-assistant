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
        <meta name="google" content="notranslate" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7c3aed" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
