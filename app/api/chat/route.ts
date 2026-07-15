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

    const todayStr = new Date().toISOString().split('T')[0];
    const userMsg = { role: 'user', content: message, created_at: new Date().toISOString() };

    // --- 1. 讀取今天「已存在」的對話檔案紀錄 ---
    let existingTodayMessages: any[] = [];
    const { data: todayRows, error: fetchTodayError } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .eq('chat_date', todayStr);

    if (fetchTodayError) {
      console.error("❌ 讀取今日對話檔案失敗:", fetchTodayError);
    }

    if (todayRows && todayRows.length > 0) {
      existingTodayMessages = todayRows[0].messages || [];
    }

    // --- 2. 撈取使用者的大腦偏好規則 ---
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

    // --- 3. 撈取該使用者最近 3 天的歸檔，當作 Gemini 的上下文 ---
    const { data: recentDays, error: fetchHistoryError } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: false })
      .limit(3);

    if (fetchHistoryError) {
      console.error("❌ 撈取歷史歸檔失敗:", fetchHistoryError);
    }

    // 歷史日子反轉（舊的在前），並打平成單一歷史陣列
    let historyData = recentDays
      ? [...recentDays].reverse().flatMap((day: any) => day.messages || [])
      : [];

    // ⚠️ 把當前最新話語 userMsg 疊加到上下文的最後面送給 Gemini
    const geminiHistory = [...historyData, userMsg];

    // 轉換成 Gemini 格式 (最多傳送最近 20 筆對話，防 Token 爆量)
    const contents = geminiHistory.slice(-20).map((h: any) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    // --- 4. 設計 System Prompt ---
    const systemPrompt = `
你是一個客製化的專屬 AI 助理。請字字句句嚴格遵守以下使用者的個人偏好大腦規則：
---
【使用者的最高指導大腦規則】
${userPreferences}
---
請根據上述規則，並參考先前按天歸檔的歷史對話上下文脈絡，親切地回答問題。
`;

    // --- 5. 呼叫 Gemini 取得回答 ---
    // 使用目前最穩定快速的商業模型 gemini-2.5-flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', 
      contents: contents, 
      config: { systemInstruction: systemPrompt },
    });

    const replyText = response.text || "我不太明白...";
    const modelMsg = { role: 'model', content: replyText, created_at: new Date().toISOString() };

    // --- 6. 一氣呵成：將「使用者訊息」與「AI 回應」打包，單次寫入/更新至資料庫 ---
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
    return Response.json({ error: error.message || '伺服器內部錯誤' }, { status: 500 });
  }
}
