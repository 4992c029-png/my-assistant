// app/manifest.ts
import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '專屬 AI 助理',
    short_name: 'AI 助理',
    description: '您的個人化大腦偏好助理',
    start_url: '/',
    display: 'standalone', // 👈 確保 PWA 以獨立無網址列的 App 模式運行
    background_color: '#0f172a',
    theme_color: '#4f46e5',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
