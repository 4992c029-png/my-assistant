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

    // 取得今天的日期字串 (格式: YYYY-MM-DD)
    const todayStr = new Date().toISOString().split('T')[0];
    const userMsg = { role: 'user', content: message, created_at: new Date().toISOString() };

    // --- 1. 先寫入/追加使用者的對話到「今天的歸檔檔案」中 ---
    let todayMessages = [];
    let rowId = null;

    const { data: todayRows } = await supabase
      .from('daily_chat_history')
      .select('id, messages')
      .eq('user_id', userId)
      .eq('chat_date', todayStr);

    if (todayRows && todayRows.length > 0) {
      rowId = todayRows[0].id;
      todayMessages = [...todayRows[0].messages, userMsg];
      await supabase
        .from('daily_chat_history')
        .update({ messages: todayMessages, updated_at: new Date().toISOString() })
        .eq('id', rowId);
    } else {
      todayMessages = [userMsg];
      const { data: newRow } = await supabase
        .from('daily_chat_history')
        .insert({ user_id: userId, chat_date: todayStr, messages: todayMessages })
        .select('id')
        .single();
      rowId = newRow?.id;
    }

    // --- 2. 撈取大腦偏好規則 ---
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
    const { data: recentDays } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: false })
      .limit(3);

    // 反轉陣列（讓舊的日子排在前面）並打平成單一的對話歷史陣列
    const historyData = recentDays
      ? recentDays.reverse().flatMap((day: any) => day.messages)
      : [];

    // 轉換成 Gemini 格式 (最多傳送最近 20 筆對話，防 Token 爆量)
    const contents = historyData.slice(-20).map((h: any) => ({
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
;

    // --- 5. 呼叫 Gemini 取得回答 ---
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite', 
      contents: contents, 
      config: { systemInstruction: systemPrompt },
    });

    const replyText = response.text || "我不太明白...";
    const modelMsg = { role: 'model', content: replyText, created_at: new Date().toISOString() };

    // --- 6. 將 AI 回應追加到今天的歸檔檔案中 ---
    const { data: updatedTodayRows } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('id', rowId)
      .single();

    const finalMessages = [...(updatedTodayRows?.messages || todayMessages), modelMsg];
    await supabase
      .from('daily_chat_history')
      .update({ messages: finalMessages, updated_at: new Date().toISOString() })
      .eq('id', rowId);

    return Response.json({ reply: replyText });

  } catch (error: any) {
    console.error('API 錯誤:', error);
    return Response.json({ error: error.message || '伺服器內部錯誤' }, { status: 500 });
  }
}
