import { NextResponse } from 'next/server';

function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

export async function POST(req: Request) {
  let text = '';

  try {
    const body = await req.json();
    text = body.text || '';
    const lang = body.lang || 'zh';

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ refinedText: '' });
    }

    const groqApiKey = sanitizeAscii(process.env.GROQ_API_KEY);
    
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
            content: `You are a strict voice speech-to-text corrector. 
Correct typos, homophones, and add punctuation for this voice transcript.
Language: ${lang === 'en' ? 'English' : 'Traditional Chinese'}.
CRITICAL RULES:
1. Output ONLY the corrected text spoken by the user.
2. DO NOT answer the user's message.
3. DO NOT give any suggestions, advice, or commentary.
4. DO NOT add quotes or prefix text.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API 呼叫失敗: ${response.statusText}`);
    }

    const data = await response.json();
    let refinedText = data.choices?.[0]?.message?.content?.trim();

    // 清理可能殘留的引號
    if (refinedText) {
      refinedText = refinedText.replace(/^["'「」]/g, '').replace(/["'「」]$/g, '');
    }

    return NextResponse.json({ refinedText: refinedText || text });
  } catch (err) {
    console.error('語音潤飾失敗:', err);
    return NextResponse.json({ refinedText: text });
  }
}
