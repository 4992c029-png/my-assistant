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

// 🌟 定義 Gemini 工具：自動【設定】與【關閉/取消】鬧鐘
const reminderTools = {
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
            description: '提醒時間，請根據當前時間計算並格式化為完整的 ISO 8601 字串 (例如：2026-07-20T15:00:00+08:00)' 
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
    },
    {
      name: 'cancel_reminder',
      description: '當使用者要求關閉、取消、刪除或關掉已設定的鬧鐘或提醒事項時呼叫此工具。',
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { 
            type: Type.STRING, 
            description: '要取消或關閉的提醒標題關鍵字（例如：喝水、開會）。若使用者說「取消所有提醒」請帶入 "all"' 
          }
        },
        required: ['title']
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

    if (fetchHistoryError) console.error("❌ 撈取歷史紀錄失敗:", fetchHistoryError);

    const todayRow = allHistory?.find((h: any) => h.chat_date === todayStr);
    const existingTodayMessages = todayRow ? (todayRow.messages || []) : [];
    const historyData = allHistory ? allHistory.flatMap((day: any) => day.messages || []) : [];
    const geminiHistory = [...historyData, userMsg];

    // 2. 讀取偏好規則
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

    // 3. 設計 System Prompt
    const systemPrompt = `
你是一個客製化的專屬 AI 助理。現在的台北精確時間是：${now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} (ISO: ${now.toISOString()})。

【最高指導偏好大腦】
${userPreferences}

所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。

【Execution Rules 防止幻覺硬性規定】
1.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！

【提醒與鬧鐘指令操作規範】
1. 若使用者要求「設定/提醒/鬧鐘」，請呼叫 set_reminder 工具。
2. 若使用者要求「關閉/取消/刪除/不用提醒了」，請呼叫 cancel_reminder 工具。
`;

    // 4. 呼叫 Gemini API
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite', 
      contents: contents, 
      config: { 
        systemInstruction: systemPrompt,
        tools: [reminderTools]
      },
    });

    let replyText = '';

    // 🌟 5. 解析與執行 Tool Call (設定與取消)
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];

      // ----------------- 功能 A: 新增/設定提醒 -----------------
      if (call.name === 'set_reminder') {
        const args: any = call.args;
        
        // 修正時間解析，防止 PostgreSQL 格式報錯
        let parsedDate = new Date(args.remind_at);
        if (isNaN(parsedDate.getTime())) {
          parsedDate = new Date(Date.now() + 10 * 60 * 1000); // 防呆 fallback 10分鐘後
        }

        const { data: insertData, error: insertError } = await supabase
          .from('user_reminders')
          .insert([{
            user_id: userId,
            title: args.title,
            remind_at: parsedDate.toISOString(),
            repeat_type: args.repeat_type || 'none',
            reminder_type: args.reminder_type || 'both',
            is_triggered: false
          }])
          .select();

        if (insertError) {
          console.error("❌ 寫入資料庫失敗:", insertError);
          replyText = `⚠️ 抱歉，設定提醒時資料庫發生錯誤：${insertError.message}`;
        } else {
          const formattedTime = parsedDate.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          const repeatDesc = args.repeat_type === 'daily' ? ' (每天重複)' : args.repeat_type === 'weekly' ? ' (每週重複)' : args.repeat_type === 'monthly' ? ' (每月重複)' : '';
          replyText = `⏰ 已成功為您設定提醒！\n\n📌 內容：${args.title}\n📅 時間：${formattedTime}${repeatDesc}`;
        }
      } 
      // ----------------- 功能 B: 關閉/取消提醒 -----------------
      else if (call.name === 'cancel_reminder') {
        const args: any = call.args;
        const targetTitle = args.title;

        if (targetTitle === 'all' || targetTitle === '所有') {
          // 清除該使用者的所有待觸發提醒
          const { error: delError } = await supabase
            .from('user_reminders')
            .delete()
            .eq('user_id', userId);

          if (delError) {
            replyText = `⚠️ 關閉所有提醒時發生錯誤：${delError.message}`;
          } else {
            replyText = `🔕 已為您關閉並刪除所有未觸發的鬧鐘與提醒囉！`;
          }
        } else {
          // 模糊搜尋並刪除對應提醒
          const { data: matched, error: searchError } = await supabase
            .from('user_reminders')
            .select('*')
            .eq('user_id', userId)
            .ilike('title', `%${targetTitle}%`);

          if (searchError) {
            replyText = `⚠️ 查詢要關閉的提醒時發生錯誤：${searchError.message}`;
          } else if (!matched || matched.length === 0) {
            replyText = `🔍 找不到包含「${targetTitle}」的未觸發提醒。`;
          } else {
            const idsToDelete = matched.map(m => m.id);
            await supabase.from('user_reminders').delete().in('id', idsToDelete);
            
            const deletedNames = matched.map(m => m.title).join('、');
            replyText = `🔕 已為您關閉並刪除提醒：「${deletedNames}」！`;
          }
        }
      }
    } else {
      replyText = response.text || "我不太明白...";
    }

    const modelMsg = { role: 'model', content: replyText, created_at: new Date().toISOString() };

    // 6. 儲存對話歷史
    const finalMessages = [...existingTodayMessages, userMsg, modelMsg];
    await supabase.from('daily_chat_history').upsert({ 
      user_id: userId, 
      chat_date: todayStr, 
      messages: finalMessages, 
      updated_at: new Date().toISOString() 
    }, { onConflict: 'user_id,chat_date' });

    return Response.json({ reply: replyText });

  } catch (error: any) {
    console.error('API 錯誤:', error);
    return Response.json({ error: error.message || '伺服器內部錯誤' }, { status: 500 });
  }
}
