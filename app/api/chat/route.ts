import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
export const preferredRegion = 'sfo1'; // 👈 強制指定 Vercel 伺服器在美西執行
export const dynamic = 'force-dynamic';

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

    const todayStr = new Date().toISOString().split('T')[0];
    const userMsg = { role: 'user', content: message, created_at: new Date().toISOString() };

    // 🌟 1. 單次查詢：獲取該使用者「所有歷史與今天」的歸檔紀錄（極致擴充至最近 180 天）
    const { data: allHistory, error: fetchHistoryError } = await supabase
      .from('daily_chat_history')
      .select('chat_date, messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: true })
      .limit(180); 

    if (fetchHistoryError) {
      console.error("❌ 撈取歷史紀錄失敗:", fetchHistoryError);
    }

    // 🌟 2. 從歷史紀錄中找出「今天」已存在的對話（避免重複查詢）
    const todayRow = allHistory?.find((h: any) => h.chat_date === todayStr);
    const existingTodayMessages = todayRow ? (todayRow.messages || []) : [];

    // 🌟 3. 打平成單一歷史陣列，作為 Gemini 的上下文（包含之前所有的對話）
    const historyData = allHistory 
      ? allHistory.flatMap((day: any) => day.messages || []) 
      : [];

    // ⚠️ 把當前最新話語 userMsg 疊加到上下文的最後面送給 Gemini
    const geminiHistory = [...historyData, userMsg];

    // 🌟 4. 撈取「專屬該使用者」的大腦偏好規則（❌ 徹底移除會洩漏他人規則的 Fallback）
    const { data: instructionsData, error: instError } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    if (instError) {
      console.error("❌ 讀取使用者偏好失敗:", instError);
    }

    // 如果該使用者還沒有設定大腦，使用內建的基礎溫和預設，絕不撈取別人的資料
    const userPreferences = instructionsData && instructionsData.length > 0
      ? instructionsData.map((i: any) => `- ${i.instruction}`).join('\n')
      : '無特定偏好。請以親切、專業、溫暖的態度回答。';

    // 🌟 5. 轉換成 Gemini 格式 (極致放大：最多傳送最近 500 筆對話，善用 2.0-flash 超大上下文能力)
    const contents = geminiHistory.slice(-500).map((h: any) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    // 🌟 6. 設計 System Prompt
    const systemPrompt = `
你是一個客製化的專屬 AI 助理。請字字句句嚴格遵守以下使用者的個人偏好大腦規則：
---
【使用者的最高指導大腦規則】
${userPreferences}

所有回覆都須經過深度思考。

【Execution Rules 防止幻覺硬性規定】
1.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！
---

請根據上述規則，並參考先前的歷史對話上下文脈絡，親切地回答問題。
`;

    // 🌟 7. 呼叫 Gemini 取得回答 (升級為 gemini-2.0-flash)
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-lite', 
      contents: contents, 
      config: { systemInstruction: systemPrompt },
    });

    const replyText = response.text || "我不太明白...";
    const modelMsg = { role: 'model', content: replyText, created_at: new Date().toISOString() };

    // 🌟 8. 將今天的新訊息合併，一氣呵成寫入/更新至資料庫
    const finalMessages = [...existingTodayMessages, userMsg, modelMsg];
    
    const { error: upsertError } = await supabase
      .from('daily_chat_history')
      .upsert(
        { 
          user_id: userId, 
          chat_date: todayStr, 
          messages: finalMessages, 
          updated_at: new Date().toISOString() 
        },
        { onConflict: 'user_id,chat_date' }
      );

    if (upsertError) {
      console.error("❌ 寫入/更新今日歸檔歷史失敗:", upsertError);
      return Response.json({ error: "資料庫寫入失敗" }, { status: 500 });
    }

    return Response.json({ reply: replyText });

  } catch (error: any) {
    console.error('API 錯誤:', error);

    const errorMsg = error.message || '';
    const isQuotaError = 
      error.status === 429 || 
      errorMsg.includes('quota') || 
      errorMsg.includes('Quota exceeded') ||
      errorMsg.includes('RESOURCE_EXHAUSTED');

    if (isQuotaError) {
      return Response.json(
        { 
          error: 'QUOTA_EXCEEDED', 
          reply: '⚠️ 抱歉！助理今天工作太過賣力，已經達到 Gemini 免費 API 的每日使用上限。請稍後再試，或聯絡管理員升級為隨用隨付方案。' 
        }, 
        { status: 429 }
      );
    }

    return Response.json({ error: errorMsg || '伺服器內部錯誤' }, { status: 500 });
  }
}
