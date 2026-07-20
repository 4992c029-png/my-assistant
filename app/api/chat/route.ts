import { NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  Tool,
  SchemaType,
} from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// 🛠️ 將 SchemaType 映射為 Type
const Type = SchemaType;

// 初始化 Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 🛠️ Function Calling 工具定義 (新增 cancel_reminder)
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'set_reminder',
    description: '幫使用者設定鬧鐘或提醒事項。當使用者要求新增提醒、設定鬧鐘或叫我做某事時呼叫此工具。',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: {
          type: Type.STRING,
          description: '提醒事項的標題或內容',
        },
        remind_at: {
          type: Type.STRING,
          description: '提醒時間 (請轉為 ISO 格式字串，例如: 2026-07-20T15:30:00.000Z)',
        },
        repeat_type: {
          type: Type.STRING,
          description: '重複類型：none (不重複), daily (每天), weekly (每週), monthly (每月)',
        },
        reminder_type: {
          type: Type.STRING,
          description: '提醒方式：both (視窗+鬧鐘), alert (僅視窗), audio (僅鬧鐘)',
        },
      },
      required: ['title', 'remind_at'],
    },
  },
  {
    name: 'cancel_reminder',
    description: '幫使用者取消或刪除已設定的提醒事項/鬧鐘。當使用者要求「取消提醒」、「刪除鬧鐘」時呼叫此工具。',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keyword: {
          type: Type.STRING,
          description: '要取消的提醒關鍵字或內容標題，若使用者要求取消全部可傳入 "all"',
        },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'save_instruction',
    description: '當使用者要求記住個人偏好、習慣或規則時，儲存為大腦記憶規則。',
    parameters: {
      type: Type.OBJECT,
      properties: {
        instruction: {
          type: Type.STRING,
          description: '要記憶的個人偏好或規則內容',
        },
      },
      required: ['instruction'],
    },
  },
];

const tools: Tool[] = [{ functionDeclarations }];

/**
 * 🔄 自動重試輔助函式 (處理 503 / 429 暫時性過載)
 */
async function sendMessageWithRetry(chatSession: any, payload: any, maxRetries = 3, initialDelay = 1000) {
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await chatSession.sendMessage(payload);
    } catch (error: any) {
      const isTransientError =
        error?.status === 503 ||
        error?.status === 429 ||
        String(error?.message).includes('503') ||
        String(error?.message).includes('high demand');

      if (isTransientError && attempt < maxRetries) {
        console.warn(`[Gemini API Warning] 遇到流量過載 (${error?.status})，等待 ${delay}ms 後重新嘗試...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw error;
      }
    }
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: '系統未設定 GEMINI_API_KEY，請至 Vercel 設定 Environment Variables。' },
        { status: 500 }
      );
    }

    const { message, userId } = await req.json();

    if (!message || !userId) {
      return NextResponse.json({ error: '缺少必要參數 (message 或 userId)' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // 1. 讀取使用者的記憶與偏好規則 (user_instructions)
    const { data: instructionsData } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    const userRules = instructionsData?.map((item) => item.instruction).join('\n') || '';

    // 2. 讀取使用者目前未觸發的提醒事項 (讓 AI 掌握當前提醒狀態)
    const { data: activeReminders } = await supabase
      .from('user_reminders')
      .select('id, title, remind_at, repeat_type')
      .eq('user_id', userId)
      .eq('is_triggered', false);

    const remindersText = activeReminders && activeReminders.length > 0
      ? activeReminders.map((r) => `- [標題: ${r.title}] (預定時間: ${r.remind_at}, 重複: ${r.repeat_type})`).join('\n')
      : '目前無任何未完成的提醒事項。';

    // 3. 讀取 daily_chat_history 近期 7 天對話紀錄
    const { data: dailyRecords } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: true })
      .limit(7);

    // 展平 JSONB 裡的所有對話訊息
    let allMessages: Array<{ role: string; content: string }> = [];
    if (dailyRecords && dailyRecords.length > 0) {
      for (const record of dailyRecords) {
        if (Array.isArray(record.messages)) {
          allMessages.push(...record.messages);
        }
      }
    }

    // 取最近的 20 則對話做為上下文
    const recentMessages = allMessages.slice(-20);
    const formattedHistory = recentMessages.map((item) => ({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.content || '' }],
    }));

    // 4. 設定系統 Prompt
    const systemInstruction = `你是一位貼心且專業的個人 AI 助理。
當前系統 UTC 時間為：${new Date().toISOString()}。

使用者設定的個人習慣與大腦規則：
${userRules ? userRules : '目前尚無特殊偏好設定。'}

使用者目前生效中的提醒事項清單：
${remindersText}

請嚴格遵守以下原則：
1. 當使用者要求新增「提醒」、「鬧鐘」或「叫我做某事」時，你必須呼叫 set_reminder 工具，絕對不能只用文字回答「已設定完成」。
2. 當使用者要求「取消」、「刪除」提醒事項或鬧鐘時，你必須呼叫 cancel_reminder 工具，絕對不能回答「無法取消」。
3. 當使用者要求「記住...」、「以後請...」時，你必須呼叫 save_instruction 工具。
4. 保持親切、簡潔且具效益的回答。
5. 所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。
6.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！`;

    // 5. 定義模型嘗試清單
    const candidateModels = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
    let responseText = '';
    let lastError: any = null;

    // 6. 嘗試與模型互動 (具備備援切換與過載重試機制)
    for (const modelName of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          tools: tools,
        });

        const chat = model.startChat({ history: formattedHistory });

        let result = await sendMessageWithRetry(chat, message);
        let response = await result.response;
        let functionCalls = response.functionCalls();

        // 7. 處理 Function Calling
        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];
          const { name, args } = call;

          if (name === 'set_reminder') {
            const { title, remind_at, repeat_type, reminder_type } = args as any;

            const { error: insertError } = await supabase.from('user_reminders').insert([
              {
                user_id: userId,
                title: title,
                remind_at: remind_at || new Date().toISOString(),
                repeat_type: repeat_type || 'none',
                reminder_type: reminder_type || 'both',
                is_triggered: false,
              },
            ]);

            if (insertError) {
              console.error('寫入 user_reminders 失敗:', insertError);
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'set_reminder',
                    response: { success: false, error: `資料庫寫入失敗: ${insertError.message}` },
                  },
                },
              ]);
            } else {
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'set_reminder',
                    response: { success: true, message: `已成功為您設定提醒：${title}` },
                  },
                },
              ]);
            }
            responseText = (await result.response).text();

          } else if (name === 'cancel_reminder') {
            const { keyword } = args as any;
            let deleteQuery = supabase.from('user_reminders').delete().eq('user_id', userId);

            if (keyword && keyword !== 'all' && keyword !== '全部') {
              deleteQuery = deleteQuery.ilike('title', `%${keyword}%`);
            }

            const { data: deletedData, error: deleteError } = await deleteQuery.select();

            if (deleteError) {
              console.error('刪除 user_reminders 失敗:', deleteError);
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'cancel_reminder',
                    response: { success: false, error: `刪除失敗: ${deleteError.message}` },
                  },
                },
              ]);
            } else {
              const count = deletedData ? deletedData.length : 0;
              const msg =
                count > 0
                  ? `已成功為您取消 ${count} 筆符合 "${keyword}" 的提醒事項`
                  : `資料庫中未找到符合關鍵字 "${keyword}" 的未完成提醒`;

              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'cancel_reminder',
                    response: { success: true, message: msg },
                  },
                },
              ]);
            }
            responseText = (await result.response).text();

          } else if (name === 'save_instruction') {
            const { instruction } = args as any;

            const { error: insertError } = await supabase.from('user_instructions').insert([
              {
                user_id: userId,
                instruction: instruction,
              },
            ]);

            if (insertError) {
              console.error('寫入 user_instructions 失敗:', insertError);
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'save_instruction',
                    response: { success: false, error: `儲存失敗: ${insertError.message}` },
                  },
                },
              ]);
            } else {
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'save_instruction',
                    response: { success: true, message: `已成功儲存偏好規則：${instruction}` },
                  },
                },
              ]);
            }
            responseText = (await result.response).text();
          }
        } else {
          responseText = response.text();
        }

        lastError = null;
        break; // 成功執行完畢，跳出模型嘗試循環
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini API Error] 模型 ${modelName} 失敗，嘗試備援模型... 錯誤:`, err?.message);
      }
    }

    if (lastError) {
      throw lastError;
    }

    // 8. 將本次對話追加寫入 daily_chat_history
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: todayRecord } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .eq('chat_date', todayStr)
      .maybeSingle();

    const rawMessages = todayRecord?.messages;
    const currentMessages = Array.isArray(rawMessages) ? rawMessages : [];

    const updatedMessages = [
      ...currentMessages,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'model', content: responseText, timestamp: new Date().toISOString() },
    ];

    const { error: upsertError } = await supabase
      .from('daily_chat_history')
      .upsert(
        {
          user_id: userId,
          chat_date: todayStr,
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,chat_date' }
      );

    if (upsertError) {
      console.error('寫入 daily_chat_history 失敗:', upsertError);
    }

    return NextResponse.json({ reply: responseText });
  } catch (err: any) {
    console.error('Chat API 錯誤:', err);

    if (err?.status === 503 || String(err?.message).includes('503')) {
      return NextResponse.json(
        { error: 'Google AI 服務目前流量過高，請稍後再試。' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: '伺服器處理失敗', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
