import { NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  Tool,
  SchemaType,
} from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const Type = SchemaType;

/**
 * 強制淨化字串，移除所有非 ASCII 字元 (避免 HTTP Header 觸發 ByteString 崩潰)
 */
function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawSupabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 自動過濾非 ASCII 字元，防止 Supabase Header 塞入中文字
const supabaseUrl = sanitizeAscii(rawSupabaseUrl);
const supabaseKey = sanitizeAscii(rawSupabaseKey);
const supabase = createClient(supabaseUrl, supabaseKey);

function safeToISOString(input: any): string | null {
  if (!input) return null;
  try {
    let str = String(input).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
      str += ':00';
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch (e) {
    return null;
  }
}

/**
 * 清理並安全化 UserId，確保完全為純英數字/URL Safe 字元
 */
function cleanUserId(rawId: any): string {
  if (!rawId) return 'default_user';
  let idStr = '';
  if (typeof rawId === 'object') {
    idStr = String(rawId.id || rawId.userId || rawId.sub || rawId.email || '').trim();
  } else {
    idStr = String(rawId).trim();
  }
  if (!idStr) return 'default_user';
  return encodeURIComponent(idStr);
}

/**
 * 取得 API Keys 清單 (支援用逗號分隔的多組 Key 輪詢備援)
 */
function getApiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEY || '';
  return raw
    .split(',')
    .map((k) => sanitizeAscii(k))
    .filter(Boolean);
}

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
          description: '提醒時間 (標準 ISO 8601 時間字串，例如: 2026-07-21T15:30:00.000Z)',
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

async function sendMessageWithRetry(chatSession: any, payload: any, maxRetries = 2, initialDelay = 2000) {
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await chatSession.sendMessage(payload);
    } catch (error: any) {
      const isRateLimit =
        error?.status === 429 ||
        error?.status === 503 ||
        String(error?.message).includes('429') ||
        String(error?.message).includes('Quota exceeded');

      if (isRateLimit && attempt < maxRetries) {
        console.warn(`[Gemini API] 觸發流量限制 (429)，等待 ${delay}ms 後進行重試 (第 ${attempt} 次)...`);
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
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      return NextResponse.json(
        { error: '系統未設定 GEMINI_API_KEY 環境變數。' },
        { status: 500 }
      );
    }

    const { message, userId } = await req.json();
    const userIdStr = cleanUserId(userId);

    if (!message || !userIdStr) {
      return NextResponse.json({ error: '缺少必要參數 (message 或 userId)' }, { status: 400 });
    }

    // 1. 讀取記憶規則
    const { data: instructionsData } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userIdStr);

    const userRules = instructionsData?.map((item) => item.instruction).join('\n') || '';

    // 2. 讀取未完成提醒
    const { data: activeReminders, error: fetchErr } = await supabase
      .from('user_reminders')
      .select('id, title, remind_at, repeat_type')
      .eq('user_id', userIdStr)
      .eq('is_triggered', false);

    if (fetchErr) {
      console.error('⚠️ [讀取 user_reminders 失敗]:', fetchErr);
    }

    const remindersText = activeReminders && activeReminders.length > 0
      ? activeReminders.map((r) => `- [ID: ${r.id}] 標題: "${r.title}" (時間: ${r.remind_at}, 重複: ${r.repeat_type || 'none'})`).join('\n')
      : '目前無任何未完成的提醒事項。';

    // 3. 讀取歷史紀錄
    const { data: dailyRecords } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userIdStr)
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

    const now = new Date();
    const nowUtcStr = now.toISOString();
    const taiwanTimeStr = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');

    // 4. System Prompt
    const systemInstruction = `你是一位貼心且專業的個人 AI 助理。
當前 UTC 時間為：${nowUtcStr}
當前台灣時間 (UTC+8) 為：${taiwanTimeStr}

使用者設定的個人習慣與大腦規則：
${userRules ? userRules : '目前尚無特殊偏好設定。'}

使用者目前在資料庫中生效的未完成提醒事項：
${remindersText}

【時間推算與工具呼叫規則】：
1. 當使用者要求新增「提醒」、「鬧鐘」或「叫我做某事」時，請務必根據【台灣時間】計算目標時間，轉換為 ISO 8601 UTC 時間字串傳入 set_reminder 的 remind_at 參數，並呼叫 set_reminder。
2. 當使用者要求「取消」、「刪除」提醒事項或鬧鐘時，必須呼叫 cancel_reminder 工具。
3. 當使用者要求「記住...」、「以後請...」時，必須呼叫 save_instruction 工具。
4. 呼叫工具後，你必須根據工具傳回的結果實話實說：
   - 若 success 為 false，必須如實告知使用者失敗原因，嚴禁謊報設定成功！
   - 若 success 為 true，請親切簡潔地回覆使用者。
請嚴格遵守以下原則：
1. 保持親切、簡潔且具效益的回答。
2. 所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。
3.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！`;

    // 修正模型的正確 API 名稱，移除無效的 -latest 避開 404
    const candidateModels = [
      'gemini-2.0-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',  
    ];

    let responseText = '';
    let lastError: any = null;
    let requestSuccess = false;

    // 雙層輪詢備援機制：依次嘗試 API Key 與 正確的模型清單
    keyLoop: for (const apiKey of apiKeys) {
      const genAI = new GoogleGenerativeAI(apiKey);

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

          if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            const { name, args } = call;

            if (name === 'set_reminder') {
              const rawTitle = args?.title;
              const rawRemindAt = args?.remind_at || (args as any)?.remindAt;
              const repeatType = args?.repeat_type || (args as any)?.repeatType || 'none';
              const reminderType = args?.reminder_type || (args as any)?.reminderType || 'both';

              const validRemindAt = safeToISOString(rawRemindAt) || new Date().toISOString();

              const { data: insertedData, error: insertError } = await supabase
                .from('user_reminders')
                .insert([
                  {
                    user_id: userIdStr,
                    title: String(rawTitle).trim(),
                    remind_at: validRemindAt,
                    repeat_type: repeatType,
                    reminder_type: reminderType,
                    is_triggered: false,
                  },
                ])
                .select();

              if (insertError || !insertedData || insertedData.length === 0) {
                const errMsg = insertError ? `${insertError.message} (代碼: ${insertError.code})` : '資料庫未傳回結果';
                console.error('❌ [新增提醒寫入 DB 失敗]:', insertError);
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
                      response: { success: true, message: `已成功在資料庫寫入提醒：${rawTitle}` },
                    },
                  },
                ]);
              }
              responseText = (await result.response).text();

            } else if (name === 'cancel_reminder') {
              const keyword = args?.keyword;
              let deleteQuery = supabase.from('user_reminders').delete().eq('user_id', userIdStr);

              const searchKw = String(keyword || '').trim();
              if (searchKw && !['all', '全部', '所有'].includes(searchKw.toLowerCase())) {
                deleteQuery = deleteQuery.ilike('title', `%${searchKw}%`);
              }

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
                        response: { success: true, message: `已成功從資料庫刪除 ${count} 筆提醒` },
                      },
                    },
                  ]);
                } else {
                  result = await sendMessageWithRetry(chat, [
                    {
                      functionResponse: {
                        name: 'cancel_reminder',
                        response: { success: false, error: `資料庫中未找到與 "${searchKw}" 相符的未完成提醒` },
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
                    user_id: userIdStr,
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

          requestSuccess = true;
          break keyLoop;
        } catch (err: any) {
          lastError = err;
          console.warn(`[Gemini API 嘗試失敗] Key/模型 (${modelName}):`, err?.message);
        }
      }
    }

    if (!requestSuccess && lastError) {
      throw lastError;
    }

    // 5. 寫入歷史對話
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: todayRecord } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userIdStr)
      .eq('chat_date', todayStr)
      .maybeSingle();

    const rawMessages = todayRecord?.messages;
    const currentMessages = Array.isArray(rawMessages) ? rawMessages : [];

    const updatedMessages = [
      ...currentMessages,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'model', content: responseText, timestamp: new Date().toISOString() },
    ];

    await supabase
      .from('daily_chat_history')
      .upsert(
        {
          user_id: userIdStr,
          chat_date: todayStr,
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,chat_date' }
      );

    return NextResponse.json({ reply: responseText });
  } catch (err: any) {
    console.error('Chat API 最終錯誤:', err);
    return NextResponse.json(
      { error: 'API 額度耗盡或處理失敗，請稍後再試或在 .env.local 新增更多 GEMINI_API_KEY。', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
