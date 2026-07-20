// app/api/chat/route.ts
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

export const preferredRegion = 'sfo1'; // 強制指定 Vercel 伺服器在美西執行
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// 🌟 定義 Gemini 工具：自動寫入鬧鐘/提醒事項
const reminderTool = {
  functionDeclarations: [
    {
      name: 'set_reminder',
      description: '當使用者想要設定備忘錄、鬧鐘、日程提醒或週期性提醒時呼叫此工具。',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { 
            type: Type.STRING, 
            description: '提醒事項的內容或主題，例如：喝水、開會、吃藥' 
          },
          remind_at: { 
            type: Type.STRING, 
            description: '提醒時間，請根據當前時間計算並格式化為 ISO 8601 字串 (例如 2026-07-20T15:00:00.000Z)' 
          },
          repeat_type: { 
            type: Type.STRING, 
            description: '週期重複類型: none (不重複), daily (每天), weekly (每週), monthly (每月)',
            enum: ['none', 'daily', 'weekly', 'monthly']
          },
          reminder_type: { 
            type: Type.STRING, 
            description: '提醒方式: both (視窗+鬧鐘), alert (僅視窗), audio (僅鬧鐘)',
            enum: ['both', 'alert', 'audio']
          }
        },
        required: ['title', 'remind_at']
      }
    }
  ]
};

export async function POST(req: Request) {
  try {
    const { message, userId } = await req.json();

    if (!message || !userId) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const userMsg = { role: 'user', content: message, created_at: now.toISOString() };

    // 1. 獲取歷史紀錄
    const { data: allHistory, error: fetchHistoryError } = await supabase
      .from('daily_chat_history')
      .select('chat_date, messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: true })
      .limit(180); 

    if (fetchHistoryError) {
      console.error("❌ 撈取歷史紀錄失敗:", fetchHistoryError);
    }

    const todayRow = allHistory?.find((h: any) => h.chat_date === todayStr);
    const existingTodayMessages = todayRow ? (todayRow.messages || []) : [];

    const historyData = allHistory 
      ? allHistory.flatMap((day: any) => day.messages || []) 
      : [];

    const geminiHistory = [...historyData, userMsg];

    // 2. 讀取偏好規則
    const { data: instructionsData, error: instError } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    if (instError) {
      console.error("❌ 讀取使用者偏好失敗:", instError);
    }

    const userPreferences = instructionsData && instructionsData.length > 0
      ? instructionsData.map((i: any) => `- ${i.instruction}`).join('\n')
      : '無特定偏好。請以親切、專業、溫暖的態度回答。';

    const contents = geminiHistory.slice(-500).map((h: any) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    // 3. 設計 System Prompt（加入目前精確的時間上下文）
    const systemPrompt = `
你是一個客製化的專屬 AI 助理。現在的精確時間是：${now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} (ISO: ${now.toISOString()})。

請字字句句嚴格遵守以下使用者的個人偏好大腦規則：
---
【使用者的最高指導大腦規則】
${userPreferences}

所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。

【提醒與鬧鐘設定指令】
當使用者要求設定提醒、備忘錄、鬧鐘或週期提醒時，請務必呼叫 set_reminder 工具。請依據目前的精確時間推算相對時間（例如「明天下午3點」或「每天早上8點」）。

【Execution Rules 防止幻覺硬性規定】
1.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！
---
`;

    // 4. 呼叫 Gemini 2.0 / 2.5 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite', 
      contents: contents, 
      config: { 
        systemInstruction: systemPrompt,
        tools: [reminderTool]
      },
    });

    let replyText = '';

    // 🌟 檢查 Gemini 是否觸發了自動設定鬧鐘的 Function Call
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      if (call.name === 'set_reminder') {
        const args: any = call.args;
        
        // 將鬧鐘寫入 Supabase
        const { error: insertError } = await supabase
          .from('user_reminders')
          .insert([{
            user_id: userId,
            title: args.title,
            remind_at: args.remind_at,
            repeat_type: args.repeat_type || 'none',
            reminder_type: args.reminder_type || 'both',
            is_triggered: false
          }]);

        if (!insertError) {
          const formattedTime = new Date(args.remind_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          const repeatDesc = args.repeat_type === 'daily' ? ' (每天重複)' : args.repeat_type === 'weekly' ? ' (每週重複)' : args.repeat_type === 'monthly' ? ' (每月重複)' : '';
          replyText = `⏰ 已為您設定好提醒囉！\n\n📌 內容：${args.title}\n📅 時間：${formattedTime}${repeatDesc}`;
        } else {
          console.error("❌ 寫入提醒失敗:", insertError);
          replyText = `嘗試為您設定提醒「${args.title}」時發生資料庫錯誤，請稍後再試。`;
        }
      }
    } else {
      replyText = response.text || "我不太明白...";
    }

    const modelMsg = { role: 'model', content: replyText, created_at: new Date().toISOString() };

    // 5. 儲存對話歷史
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
