// app/api/chat/route.ts
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

export const preferredRegion = 'sfo1';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// 🌟 定義 Gemini 工具：自動設定與關閉鬧鐘
const reminderTools = {
  functionDeclarations: [
    {
      name: 'set_reminder',
      description: '當使用者要求設定提醒、備忘錄、鬧鐘或週期提醒時必須呼叫此工具。',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: '提醒事項內容或主題（例如：喝水、開會）' },
          remind_at: { type: Type.STRING, description: '標準 ISO 8601 時間字串 (例如 2026-07-20T15:00:00.000Z)' },
          repeat_type: { 
            type: Type.STRING, 
            description: '重複類型: none (單次), daily (每天), weekly (每週), monthly (每月)',
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
    },
    {
      name: 'cancel_reminder',
      description: '當使用者要求取消、關閉、刪除鬧鐘或提醒時必須呼叫此工具。',
      parameters: {
        type: Type.OBJECT,
        properties: {
          keyword: { type: Type.STRING, description: '想要關閉的提醒關鍵字（例如：喝水、開會，若使用者說全部關閉則傳入 "all"）' }
        },
        required: ['keyword']
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

    // 1. 讀取歷史對話
    const { data: allHistory } = await supabase
      .from('daily_chat_history')
      .select('chat_date, messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: true })
      .limit(180);

    const todayRow = allHistory?.find((h: any) => h.chat_date === todayStr);
    const existingTodayMessages = todayRow ? (todayRow.messages || []) : [];
    const historyData = allHistory ? allHistory.flatMap((day: any) => day.messages || []) : [];
    const geminiHistory = [...historyData, userMsg];

    // 2. 讀取大腦規則
    const { data: instructionsData } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    const userPreferences = instructionsData && instructionsData.length > 0
      ? instructionsData.map((i: any) => `- ${i.instruction}`).join('\n')
      : '無特定偏好。請以親切、專業、溫暖的態度回答。';

    const contents = geminiHistory.slice(-500).map((h: any) => ({
      role: h.role === 'model' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    // 精確傳遞台灣時間上下文 (UTC+8)
    const taipeiTimeStr = now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

    const systemPrompt = `
你是一個客製化的專屬 AI 助理。
當前精確時間是台灣時間 (Asia/Taipei)：${taipeiTimeStr} (UTC: ${now.toISOString()})。

【使用者的最高指導大腦規則】
${userPreferences}
所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。

【Execution Rules 防止幻覺硬性規定】
1.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！

【提醒與鬧鐘執行硬性規定】
1. 當使用者要求「設定」提醒/鬧鐘時，你【必須】呼叫 \`set_reminder\` 工具，絕對不允許在沒有呼叫工具的情況下假裝設定成功！
2. 當使用者要求「取消/關閉/刪除」提醒/鬧鐘時，你【必須】呼叫 \`cancel_reminder\` 工具，絕對不允許只用文字宣稱已關閉！
3. 請根據目前的台灣時間精確推算 ISO 8601 時間傳給工具。
`;

    // 3. 呼叫 Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite', 
      contents: contents, 
      config: { 
        systemInstruction: systemPrompt,
        tools: [reminderTools]
      },
    });

    let replyText = '';
    const functionCalls = response.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];

      // 🌟 1. 設定提醒
      if (call.name === 'set_reminder') {
        const args: any = call.args;
        
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
          replyText = `⏰ 已成功為您設定提醒囉！\n\n📌 內容：${args.title}\n📅 時間：${formattedTime}${repeatDesc}`;
        } else {
          console.error("❌ 寫入提醒失敗:", insertError);
          replyText = `抱歉，為您設定提醒「${args.title}」時資料庫寫入失敗，請確認時間格式。`;
        }
      } 
      // 🌟 2. 取消/關閉提醒 (API 後端判斷關閉)
      else if (call.name === 'cancel_reminder') {
        const args: any = call.args;
        const keyword = args.keyword;

        let query = supabase
          .from('user_reminders')
          .delete()
          .eq('user_id', userId)
          .eq('is_triggered', false);

        if (keyword !== 'all') {
          query = query.ilike('title', `%${keyword}%`);
        }

        const { data: deletedData, error: deleteError } = await query.select();

        if (!deleteError && deletedData && deletedData.length > 0) {
          const titles = deletedData.map(d => d.title).join('、');
          replyText = `🔕 已為您關閉並取消以下提醒：\n📌 ${titles}`;
        } else {
          replyText = `🔍 找不到包含關鍵字「${keyword}」的待觸發提醒事項喔！`;
        }
      }
    } else {
      replyText = response.text || "我不太明白...";
    }

    const modelMsg = { role: 'model', content: replyText, created_at: new Date().toISOString() };
    const finalMessages = [...existingTodayMessages, userMsg, modelMsg];

    await supabase
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

    return Response.json({ reply: replyText });

  } catch (error: any) {
    console.error('API 錯誤:', error);
    return Response.json({ error: error.message || '伺服器錯誤' }, { status: 500 });
  }
}
