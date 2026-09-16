import { NextResponse } from 'next/server';

function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

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
            model: 'openai/gpt-oss-20b',
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert AI image prompt engineer. Translate the given description into English and enrich it with vivid visual detail for a text-to-image model. ' +
                  'CRITICAL RULE: The main subject and content of your output MUST exactly match the input — never change, replace, remove, or add an unrelated subject (e.g. if the input says "dog", the output must clearly depict a dog, not a person, cat, or anything else). ' +
                  'Only add descriptive detail such as lighting, art style, composition, color palette, breed/appearance, and atmosphere — do not invent a different scene. ' +
                  'Output ONLY the refined English prompt text. Do NOT add preamble or quotes.',
              },
              { role: 'user', content: cleanPrompt },
            ],
            temperature: 0.3,
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

    // 採用 Pollinations.ai 新版統一端點 gen.pollinations.ai（舊版 image.pollinations.ai
    // 匿名端點已被官方降級，不穩定甚至可能生成不相關內容，新版需要 API Key 才能穩定使用）。
    // 這裡用 sk_ 密鑰，必須放在 Authorization header 由後端直接呼叫，絕不能讓瀏覽器看到，
    // 所以改成後端把圖片抓下來、轉成 base64 再回傳，前端完全不會接觸到金鑰或原始網址。
    const pollinationsKey = process.env.POLLINATIONS_API_KEY;
    if (!pollinationsKey) {
      return NextResponse.json({ error: '尚未設定 POLLINATIONS_API_KEY 環境變數' }, { status: 500 });
    }

    const seed = Math.floor(Math.random() * 2147483647);
    const params = new URLSearchParams({
      model: 'nanobanana',
      width: '1024',
      height: '1024',
      seed: String(seed),
      safe: 'nsfw', // 內建安全過濾，阻擋明顯色情/暴力內容
    });

    const imgRes = await fetch(
      `https://gen.pollinations.ai/image/${encodeURIComponent(enhancedPrompt)}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${pollinationsKey}` },
      }
    );

    if (!imgRes.ok) {
      const errText = await imgRes.text().catch(() => '');
      console.error('Pollinations 圖片生成失敗:', imgRes.status, errText);
      return NextResponse.json({ error: '圖片生成服務異常，請稍後再試' }, { status: 502 });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const imageUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ imageUrl, enhancedPrompt });
  } catch (error: any) {
    console.error('圖片生成錯誤:', error);
    return NextResponse.json({ error: '圖片生成服務異常，請稍後再試' }, { status: 500 });
  }
}
