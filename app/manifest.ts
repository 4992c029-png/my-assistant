import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '我的專屬 AI 助理',
    short_name: 'AI 助理',
    description: '具備長期記憶與偏好設定的個人 AI 助理',
    start_url: '/',
    display: 'standalone', // 🌟 這是隱藏網址列、全螢幕運作的關鍵！
    background_color: '#ffffff',
    theme_color: '#4F46E5',
    icons: [
      {
        // 🌟 使用內嵌的 SVG 代碼，完全不需要額外的圖片檔案！
        src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%234F46E5"/><text x="50" y="62" font-size="45" fill="white" font-family="sans-serif" font-weight="bold" text-anchor="middle">AI</text></svg>',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
