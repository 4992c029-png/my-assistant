import { NextResponse } from 'next/server';

function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

export async function POST(req: Request) {
  try {
    const { text, lang = 'zh' } = await req.json();

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ refinedText: '' });
    }

    const groqApiKey = sanitizeAscii(process.env.GROQ_API_KEY);
    if (!groqApiKey) {
      return NextResponse.json({ refinedText: text });
    }

    // 使用超快速模型 llama-3.1-8b-instant 進行 <300ms 語意校正
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
            content: `你是一個專業的語音辨識文本校正專家。
請修正以下語音轉文字草稿中的：
1. 同音錯別字與不通順詞彙。
2. 自動加上正確的標點符號。
3. 保持原始語意與人稱不變，務必簡潔自然。
4. 絕對禁止輸出任何解釋、問候或引號，直接輸出修正後的最終文字。語詞語言維持為 ${lang === 'en' ? '英文' : '繁體中文'}。`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ refinedText: text });
    }

    const data = await response.json();
    const refinedText = data.choices?.[0]?.message?.content?.trim() || text;

    return NextResponse.json({ refinedText });
  } catch (err) {
    console.error('語音潤飾失敗:', err);
    return NextResponse.json({ refinedText: text });
  }
}
