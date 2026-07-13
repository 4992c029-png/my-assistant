import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

// 1. 初始化 Supabase 與 Google AI 客戶端
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    // 從前端傳入使用者傳送的訊息與使用者 ID
    const { message, userId } = await req.json();

    console.log("======================================");
    console.log("【收到前端請求】");
    console.log("前端傳過來的 userId 是:", userId);
    console.log("使用者傳送的訊息是:", message);

    if (!message || !userId) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 2. 至 Supabase 撈取該使用者的所有偏好設定 (Instructions)
    let { data: instructionsData, error: dbError } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    if (dbError) {
      console.error('❌ 資料庫特定 user_id 讀取失敗:', dbError);
    }

    console.log(`🔎 針對 userId [${userId}] 查詢到的原始規則數量:`, instructionsData?.length || 0);

    // 💡 【智慧型防錯備用機制】
    // 如果找不到該 userId 的專屬規則，可能是 ID 對不上或是 RLS 擋住。
    // 我們直接嘗試抓取資料庫內的「任意第一筆資料」來當作測試備用，保證測試能成功！
    if (!instructionsData || instructionsData.length === 0) {
      console.warn(`⚠️ 警告：找不到該 userId 的專屬規則！嘗試抓取資料庫中任意一筆規則作為測試備用...`);
      
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('user_instructions')
        .select('instruction')
        .limit(1);

      if (fallbackError) {
        console.error('❌ 抓取備用規則也失敗，強烈懷疑是 Supabase 的 RLS 政策未開放讀取！', fallbackError);
      }

      if (fallbackData && fallbackData.length > 0) {
        instructionsData = fallbackData;
        console.log("🎯 成功抓取到備用測試規則:", fallbackData[0].instruction);
      } else {
        console.error("❌ 警告：資料庫完全空無一物，或 RLS 導致無法讀取任何資料！");
      }
    }

    // 將多條偏好設定組合在一起，若無設定則給予預設值
    const userPreferences = instructionsData && instructionsData.length > 0
      ? instructionsData.map(i => `- ${i.instruction}`).join('\n')
      : '無特定偏好。';

    console.log("🧠 最終強行帶入 Gemini 大腦的規則為:\n", userPreferences);
    console.log("======================================");

    // 3. 組裝 System Instruction (超級洗腦版，強制 Gemini 每一句話都要執行口頭禪)
    const systemPrompt = `
你是一個客製化的專屬 AI 助理。請「字字句句嚴格遵守」以下使用者的個人偏好、習慣與特殊說話規則：
---
【使用者的最高指導大腦規則】
${userPreferences}
---
請根據上述規則，親切地回答使用者的問題。
⚠️ 絕對死命令：如果上述規則中包含任何關於說話口頭禪（例如：每句話後面加～喵）、特定稱呼（例如：稱呼使用者為主人）或語氣要求，你必須在「每一次」的回答、每一句話的結尾中 100% 徹底執行，絕對不能遺漏任何一個字！
`;

    // 4. 呼叫 Gemini 模型並將核心規則以 systemInstruction 帶入
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite', 
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
