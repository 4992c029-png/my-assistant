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

// 🛠️ Function Calling 工具定義
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
          description: '提醒時間 (必須為標準 ISO 8601 時間字串，例如: 2026-07-20T15:30:00.000Z)',
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
          description: '要取消的提醒關鍵字或內容標題，若使用者要求取消全部請傳入 "all"',
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

    const cleanUserId = String(userId).trim();
    const genAI = new GoogleGenerativeAI(apiKey);

    // 1. 讀取使用者的記憶與偏好規則 (user_instructions)
    const { data: instructionsData } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', cleanUserId);

    const userRules = instructionsData?.map((item) => item.instruction).join('\n') || '';

    // 2. 讀取使用者目前未觸發的提醒事項 (明確印出錯誤日誌)
    const { data: activeReminders, error: fetchRemindersErr } = await supabase
      .from('user_reminders')
      .select('id, title, remind_at, repeat_type')
      .eq('user_id', cleanUserId)
      .eq('is_triggered', false);

    if (fetchRemindersErr) {
      console.error('⚠️ [Supabase 查詢提醒失敗]:', fetchRemindersErr);
    }

    const remindersText = activeReminders && activeReminders.length > 0
      ? activeReminders.map((r) => `- [ID: ${r.id}] 標題: "${r.title}" (預定時間: ${r.remind_at}, 重複: ${r.repeat_type || 'none'})`).join('\n')
      : '目前無任何未完成的提醒事項。';

    // 3. 讀取 daily_chat_history 近期 7 天對話紀錄
    const { data: dailyRecords } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', cleanUserId)
      .order('chat_date', { ascending: true })
      .limit(7);

    let allMessages: Array<{ role: string; content: string }> = [];
    if (dailyRecords && dailyRecords.length > 0) {
      for (const record of dailyRecords) {
        if (Array.isArray(record.messages)) {
          allMessages.push(...record.messages);
        }
      }
    }

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

使用者目前在資料庫中生效的未完成提醒事項：
${remindersText}

請嚴格遵守以下原則：
1. 當使用者要求新增「提醒」、「鬧鐘」或「叫我做某事」時，你必須呼叫 set_reminder 工具，絕對不能只用文字回答「已設定完成」。
2. 當使用者要求「取消」、「刪除」提醒事項或鬧鐘時，你必須呼叫 cancel_reminder 工具，絕對不能回答「無法取消」。
3. 當使用者要求「記住...」、「以後請...」時，你必須呼叫 save_instruction 工具。
4. 呼叫工具後，你必須根據工具傳回的結果實話實說：
   - 若 success 為 false，你必須如實告知使用者操作失敗及原因，絕對不允許在失敗時回答「已預約成功」或「已刪除」！
   - 若 success 為 true，請親切簡潔地回覆使用者。
5. 保持親切、簡潔且具效益的回答。
6. 所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。
7.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！`;

    // 5. 定義模型嘗試清單
    const candidateModels = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
    let responseText = '';
    let lastError: any = null;

    // 6. 嘗試與模型互動
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

            let validRemindAt = new Date().toISOString();
            if (remind_at) {
              const parsedDate = new Date(remind_at);
              if (!isNaN(parsedDate.getTime())) {
                validRemindAt = parsedDate.toISOString();
              }
            }

            // 實作寫入並用 .select() 驗證
            const { data: insertedData, error: insertError } = await supabase
              .from('user_reminders')
              .insert([
                {
                  user_id: cleanUserId,
                  title: title,
                  remind_at: validRemindAt,
                  repeat_type: repeat_type || 'none',
                  reminder_type: reminder_type || 'both',
                  is_triggered: false,
                },
              ])
              .select();

            if (insertError || !insertedData || insertedData.length === 0) {
              const errMsg = insertError ? insertError.message : '資料庫未傳回寫入結果';
              console.error('❌ [新增提醒寫入失敗]:', insertError);
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'set_reminder',
                    response: { success: false, error: `寫入資料庫失敗：${errMsg}` },
                  },
                },
              ]);
            } else {
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'set_reminder',
                    response: { success: true, message: `已成功在資料庫中寫入提醒：${title}` },
                  },
                },
              ]);
            }
            responseText = (await result.response).text();

          } else if (name === 'cancel_reminder') {
            const { keyword } = args as any;
            let deleteQuery = supabase.from('user_reminders').delete().eq('user_id', cleanUserId);

            const searchKw = String(keyword || '').trim();
            if (searchKw && !['all', '全部', '所有'].includes(searchKw.toLowerCase())) {
              deleteQuery = deleteQuery.ilike('title', `%${searchKw}%`);
            }

            // 執行刪除並透過 .select() 取得被刪除的資料項目
            const { data: deletedData, error: deleteError } = await deleteQuery.select();

            if (deleteError) {
              console.error('❌ [刪除提醒失敗]:', deleteError);
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'cancel_reminder',
                    response: { success: false, error: `資料庫刪除失敗：${deleteError.message}` },
                  },
                },
              ]);
            } else {
              const count = deletedData ? deletedData.length : 0;
              if (count > 0) {
                result = await sendMessageWithRetry(chat, [
                  {
                    functionResponse: {
                      name: 'cancel_reminder',
                      response: { success: true, message: `已成功為您從資料庫刪除 ${count} 筆符合 "${searchKw}" 的提醒` },
                    },
                  },
                ]);
              } else {
                result = await sendMessageWithRetry(chat, [
                  {
                    functionResponse: {
                      name: 'cancel_reminder',
                      response: { success: false, error: `資料庫中完全找不到包含 "${searchKw}" 的未完成提醒` },
                    },
                  },
                ]);
              }
            }
            responseText = (await result.response).text();

          } else if (name === 'save_instruction') {
            const { instruction } = args as any;

            const { data: insertedData, error: insertError } = await supabase
              .from('user_instructions')
              .insert([
                {
                  user_id: cleanUserId,
                  instruction: instruction,
                },
              ])
              .select();

            if (insertError || !insertedData || insertedData.length === 0) {
              console.error('❌ [儲存記憶失敗]:', insertError);
              result = await sendMessageWithRetry(chat, [
                {
                  functionResponse: {
                    name: 'save_instruction',
                    response: { success: false, error: `儲存失敗：${insertError?.message || '未知錯誤'}` },
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
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini API Error] 模型 ${modelName} 失敗，嘗試備援模型... 錯誤:`, err?.message);
      }
    }

    if (lastError) {
      throw lastError;
    }

    // 8. 追加寫入 daily_chat_history
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: todayRecord } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', cleanUserId)
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
          user_id: cleanUserId,
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
