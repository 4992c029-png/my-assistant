import { NextResponse } from 'next/server';

function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

// ── 在 app/api/generate-image/route.ts 建議用更嚴格的限制 ─────────

   const { data: allowed } = await supabase.rpc('check_rate_limit', {
     p_user_id: userIdStr,
     p_endpoint: 'generate-image',
     p_limit: 5,           // 圖片生成比較耗資源，60 秒內最多 5 次
     p_window_seconds: 60,
   });
//

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: '請提供有效的圖片描述 Prompt' }, { status: 400 });
    }

    const cleanPrompt = prompt.trim();
    let enhancedPrompt = cleanPrompt;

    // 利用 Groq 將中文 Prompt 強化擴充為極緻英文圖片 Prompt
    const groqApiKey = sanitizeAscii(process.env.GROQ_API_KEY);
    if (groqApiKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert AI image prompt engineer. Translate and enhance the given description into a detailed, vibrant, highly descriptive English prompt suitable for high-quality text-to-image AI generation. Output ONLY the refined English prompt text. Do NOT add preamble or quotes.',
              },
              { role: 'user', content: cleanPrompt },
            ],
            temperature: 0.7,
            max_tokens: 150,
          }),
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const translated = groqData.choices?.[0]?.message?.content?.trim();
          if (translated) {
            enhancedPrompt = translated;
          }
        }
      } catch (err) {
        console.warn('Groq 圖片 Prompt 優化跳過，退回原始輸入:', err);
      }
    }

    // 採用高可靠 Pollinations AI 圖片引擎 (FLUX/Diffusion)
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      enhancedPrompt
    )}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;

    return NextResponse.json({ imageUrl, enhancedPrompt });
  } catch (error: any) {
    console.error('圖片生成錯誤:', error);
    return NextResponse.json({ error: '圖片生成服務異常，請稍後再試' }, { status: 500 });
  }
}
