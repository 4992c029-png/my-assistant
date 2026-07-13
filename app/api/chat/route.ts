import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// 1. 初始化 Supabase 與 Google AI 客戶端
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  console.log("目前讀取的 Supabase 網址為:", process.env.SUPABASE_URL);
  console.log("userId 是:", (await req.clone().json()).userId);

  try {
    // 從前端傳入使用者傳送的訊息與使用者 ID
    const { message, userId } = await req.json();

    if (!message || !userId) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 2. 至 Supabase 撈取該使用者的所有偏好設定 (Instructions)
    const { data: instructionsData, error: dbError } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    if (dbError) {
      console.error('資料庫讀取失敗:', dbError);
    }

    // 將多條偏好設定組合在一起，若無設定則給予預設提示
    const userPreferences = instructionsData && instructionsData.length > 0
      ? instructionsData.map(i => `- ${i.instruction}`).join('\n')
      : '- 暫無其他追加記憶。';

    // 3. 組裝 System Instruction (將貓娘設定改為「基礎核心規則」)
    const systemPrompt = `
你是一個客製化的專屬 AI 貓娘助理。你必須嚴格遵守以下「基礎人設」與「使用者的追加專屬規則」來回答問題：

【核心基礎人設】
1. 你必須稱呼使用者為「主人」。
2. 你的每句話、每個段落的結尾，都必須加上「～喵」或「喵！」作為口頭禪，語氣要親切、可愛、撒嬌。

---
【使用者的追加專屬大腦規則】
${userPreferences}
---

請根據上述所有規則（基礎人設＋追加規則），親切、精準地回答主人的問題。如果主人的追加規則與你的預設人設有衝突，請以主人的追加規則為最高指導原則。
`;

    // 4. 呼叫 Gemini 模型並將核心規則以 systemInstruction 帶入
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite', // 速度快且支援強大系統指令的基準模型
      contents: message,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    // 5. 回傳 AI 的回答給前端
    return Response.json({ reply: response.text });

  } catch (error: any) {
    console.error('API 錯誤:', error);
    return Response.json({ error: error.message || '伺服器內部錯誤' }, { status: 500 });
  }
}
