import { NextResponse } from 'next/server';

function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

export async function POST(req: Request) {
  // 在 try 外部宣告 text，確保在 catch 區塊中也能作為 fallback 存取
  let text = '';

  try {
    const body = await req.json();
    text = body.text || '';
    const lang = body.lang || 'zh';

    // 若傳入內容空白或非字串，直接回傳空字串
    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ refinedText: '' });
    }

    const groqApiKey = sanitizeAscii(process.env.GROQ_API_KEY);
    
    // 若未設定 API Key，回傳原始文字
    if (!groqApiKey) {
      return NextResponse.json({ refinedText: text });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            content: `Correct this voice transcript. Maintain language as ${
              lang === 'en' ? 'English' : 'Traditional Chinese'
            }. Output only corrected text.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API 呼叫失敗: ${response.statusText}`);
    }

    const data = await response.json();
    const refinedText = data.choices?.[0]?.message?.content?.trim();

    // 成功取得校正結果則回傳，若解析空值則回退原始文字
    return NextResponse.json({ refinedText: refinedText || text });
  } catch (err) {
    console.error('語音潤飾失敗:', err);
    // 發生例外時安全回退原始輸入文字
    return NextResponse.json({ refinedText: text });
  }
}
