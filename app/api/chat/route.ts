import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const { message, userId } = await req.json();

    if (!message || !userId) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 1. 將「使用者的話」寫入歷史資料庫
    await supabase.from('chat_history').insert([
      { user_id: userId, role: 'user', content: message }
    ]);

    // 2. 撈取大腦規則
    let { data: instructionsData } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    if (!instructionsData || instructionsData.length === 0) {
      const { data: fallbackData } = await supabase.from('user_instructions').select('instruction').limit(1);
      if (fallbackData) instructionsData = fallbackData;
    }
    const userPreferences = instructionsData && instructionsData.length > 0
      ? instructionsData.map(i => `- ${i.instruction}`).join('\n')
      : '無特定偏好。';

    // 3. 撈取該使用者最新 20 筆對話歷史當作上下文
    const { data: historyData } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50);

    // 4. 轉換為 Gemini 官方的 Contents 上下文格式
    const contents = historyData && historyData.length > 0
      ? historyData.map(h => ({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.content }]
        }))
      : [{ role: 'user', parts: [{ text: message }] }];

    // 5. 洗腦 Prompt
    const systemPrompt = `
你是一個客製化的專屬 AI 助理。請字字句句嚴格遵守以下使用者的個人偏好大腦規則：
---
【使用者的最高指導大腦規則】
${userPreferences}
---
請根據上述規則，並參考先前的歷史對話上下文脈絡，親切地回答問題。
//⚠️ 死命令：如果規則有要求說話口頭禪（如：～喵）或稱呼（如：主人），你必須在回答的每一句話中 100% 徹底執行！
`;

    // 6. 送出對話（包含歷史紀錄）
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite', 
      contents: contents, 
      config: { systemInstruction: systemPrompt },
    });

    const replyText = response.text || "我不太明白...";

    // 7. 將「AI 的回應」寫入歷史資料庫
    await supabase.from('chat_history').insert([
      { user_id: userId, role: 'model', content: replyText }
    ]);

    return Response.json({ reply: replyText });

  } catch (error: any) {
    console.error('API 錯誤:', error);
    return Response.json({ error: error.message || '伺服器內部錯誤' }, { status: 500 });
  }
}
