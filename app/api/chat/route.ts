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

    // 將多條偏好設定組合在一起，若無設定則給予預設值
    const userPreferences = instructionsData && instructionsData.length > 0
      ? instructionsData.map(i => `- ${i.instruction}`).join('\n')
      : '無特定偏好。';

    // 3. 組裝 System Instruction (系統指令，用來預先框架 AI 的大腦規則)
    const systemPrompt = `
你是一個客製化的專屬 AI 助理。請嚴格遵守以下使用者的個人偏好、習慣與規則來回答問題：
---
【使用者的專屬大腦規則】
${userPreferences}
---
請根據上述規則，親切、精準地回答使用者的問題。如果使用者的規則與你的預設人設有衝突，請以使用者的規則為最高指導原則。
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

//npm run dev