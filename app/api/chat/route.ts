import { NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  SchemaType,
} from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const Type = SchemaType;

// 1. 環境變數淨化（過濾中文字元與非 ASCII 字元，避免 Header 崩潰）
function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

const supabaseUrl = sanitizeAscii(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitizeAscii(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
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

function cleanUserId(rawId: any): string {
  if (!rawId) return 'default_user';
  let idStr = typeof rawId === 'object' ? String(rawId.id || rawId.userId || rawId.sub || '') : String(rawId);
  idStr = idStr.trim();
  return idStr ? encodeURIComponent(idStr) : 'default_user';
}

function getGeminiApiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEY || '';
  return raw.split(',').map((k) => sanitizeAscii(k)).filter(Boolean);
}

// 2. 定義統一工具規格 (Tools)
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'set_reminder',
    description: '幫使用者設定鬧鐘或提醒事項。當使用者要求新增提醒、設定鬧鐘或叫我做某事時呼叫此工具。',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: '提醒事項的標題或內容' },
        remind_at: { type: Type.STRING, description: '提醒時間 (標準 ISO 8601 時間字串)' },
        repeat_type: { type: Type.STRING, description: '重複類型：none, daily, weekly, monthly' },
        reminder_type: { type: Type.STRING, description: '提醒方式：both, alert, audio' },
      },
      required: ['title', 'remind_at'],
    },
  },
  {
    name: 'cancel_reminder',
    description: '幫使用者取消或刪除已設定的提醒事項/鬧鐘。',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keyword: { type: Type.STRING, description: '要取消的提醒關鍵字，若要全部取消傳入 "all"' },
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
        instruction: { type: Type.STRING, description: '要記憶的個人偏好或規則內容' },
      },
      required: ['instruction'],
    },
  },
];

// 轉譯成 Groq / OpenAI 相容格式
const groqTools = functionDeclarations.map((f) => ({
  type: 'function',
  function: {
    name: f.name,
    description: f.description,
    parameters: f.parameters as Record<string, any>,
  },
}));

// 3. 核心工具執行邏輯（Groq 與 Gemini 共用）
async function executeTool(name: string, args: any, userIdStr: string) {
  if (name === 'set_reminder') {
    const rawTitle = args?.title;
    const rawRemindAt = args?.remind_at || args?.remindAt;
    const repeatType = args?.repeat_type || args?.repeatType || 'none';
    const reminderType = args?.reminder_type || args?.reminderType || 'both';
    const validRemindAt = safeToISOString(rawRemindAt) || new Date().toISOString();

    const { data, error } = await supabase
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

    if (error || !data || data.length === 0) {
      return { success: false, error: `寫入資料庫失敗：${error?.message || '未知錯誤'}` };
    }
    return { success: true, message: `已成功在資料庫寫入提醒：${rawTitle}` };
  }

  if (name === 'cancel_reminder') {
    const keyword = args?.keyword;
    let query = supabase.from('user_reminders').delete().eq('user_id', userIdStr);
    const searchKw = String(keyword || '').trim();

    if (searchKw && !['all', '全部', '所有'].includes(searchKw.toLowerCase())) {
      query = query.ilike('title', `%${searchKw}%`);
    }

    const { data, error } = await query.select();

    if (error) {
      return { success: false, error: `刪除失敗：${error.message}` };
    }
    const count = data ? data.length : 0;
    return count > 0
      ? { success: true, message: `已成功從資料庫刪除 ${count} 筆提醒` }
      : { success: false, error: `資料庫中未找到與 "${searchKw}" 相符的提醒` };
  }

  if (name === 'save_instruction') {
    const { instruction } = args;
    const { data, error } = await supabase
      .from('user_instructions')
      .insert([{ user_id: userIdStr, instruction }])
      .select();

    if (error || !data || data.length === 0) {
      return { success: false, error: `儲存記憶失敗：${error?.message || '未知錯誤'}` };
    }
    return { success: true, message: `已成功儲存偏好規則：${instruction}` };
  }

  return { success: false, error: '未知的工具名稱' };
}

// 4. 【優先執行】使用 Groq 高速模型處理對話與工具呼叫
async function runGroqPrimary(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  userIdStr: string
): Promise<string> {
  const groqApiKey = sanitizeAscii(process.env.GROQ_API_KEY);
  if (!groqApiKey) {
    throw new Error('Groq API Key 未設定');
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const groqEndpoint = 'https://api.groq.com/openai/v1/chat/completions';

  // 第一次呼叫 Groq API (使用高 TPM 與高效能的 llama-3.3-70b-versatile 模型)
  const response = await fetch(groqEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      tools: groqTools,
      tool_choice: 'auto',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API 錯誤 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const responseMessage = data.choices?.[0]?.message;

  // 處理 Groq 的 Tool Calling
  if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
    const toolCall = responseMessage.tool_calls[0];
    const functionName = toolCall.function.name;
    const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

    // 執行資料庫操作
    const toolResult = await executeTool(functionName, functionArgs, userIdStr);

    // 將工具結果帶回給 Groq 產生最終親切回覆
    messages.push(responseMessage);
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
    });

    const secondResponse = await fetch(groqEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
      }),
    });

    if (!secondResponse.ok) {
      const errText = await secondResponse.text();
      throw new Error(`Groq 二次請求錯誤 (${secondResponse.status}): ${errText}`);
    }

    const secondData = await secondResponse.json();
    return secondData.choices?.[0]?.message?.content || '處理完成。';
  }

  return responseMessage?.content || '無法取得回應。';
}

export async function POST(req: Request) {
  try {
    const { message, userId } = await req.json();
    const userIdStr = cleanUserId(userId);

    if (!message || !userIdStr) {
      return NextResponse.json({ error: '缺少必要參數 (message 或 userId)' }, { status: 400 });
    }

    // A. 讀取記憶與未完成提醒
    const { data: instructionsData } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userIdStr);

    const userRules = instructionsData?.map((item) => item.instruction).join('\n') || '';

    const { data: activeReminders } = await supabase
      .from('user_reminders')
      .select('id, title, remind_at, repeat_type')
      .eq('user_id', userIdStr)
      .eq('is_triggered', false);

    const remindersText = activeReminders && activeReminders.length > 0
      ? activeReminders.map((r) => `- [ID: ${r.id}] 標題: "${r.title}" (時間: ${r.remind_at}, 重複: ${r.repeat_type || 'none'})`).join('\n')
      : '目前無任何未完成的提醒事項。';

    // B. 讀取對話歷史
    const { data: dailyRecords } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userIdStr)
      .order('chat_date', { ascending: true })
      .limit(7);

    let allMessages: Array<{ role: string; content: string }> = [];
    if (dailyRecords) {
      for (const record of dailyRecords) {
        if (Array.isArray(record.messages)) {
          allMessages.push(...record.messages);
        }
      }
    }
    const recentMessages = allMessages.slice(-20);

    const now = new Date();
    const taiwanTimeStr = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');

    const systemInstruction = `你是一位貼心且專業的個人 AI 助理。
當前台灣時間 (UTC+8) 為：${taiwanTimeStr}

使用者設定的個人習慣與大腦規則：
${userRules ? userRules : '目前尚無特殊偏好設定。'}

使用者目前在資料庫中生效的未完成提醒事項：
${remindersText}

【時間推算與工具呼叫規則】：
1. 當使用者要求新增「提醒」、「鬧鐘」或「叫我做某事」時，請務必根據【台灣時間】計算目標時間，轉換為 ISO 8601 UTC 時間字串傳入 set_reminder，並呼叫 set_reminder。
2. 當使用者要求「取消」、「刪除」提醒事項或鬧鐘時，必須呼叫 cancel_reminder 工具。
3. 當使用者要求「記住...」、「以後請...」時，必須呼叫 save_instruction 工具。
4. 呼叫工具後，你必須根據工具傳回的結果實話實說，若成功請親切簡潔地回覆使用者。

請嚴格遵守以下原則：
1.保持親切、簡潔且具效益的回答。
2.所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。
3.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！`;

    let responseText = '';
    let success = false;

    // C. 【優先步驟】首先嘗試透過 Groq (高 TPM) 進行處理
    try {
      console.log('🚀 [Chat API] 優先嘗試使用 Groq (llama-3.3-70b-versatile)...');
      responseText = await runGroqPrimary(systemInstruction, recentMessages, message, userIdStr);
      success = true;
      console.log('✅ [Chat API] Groq 處理成功！');
    } catch (groqErr: any) {
      console.warn('⚠️ [Groq 優先執行失敗/觸發 TPM 限制]，準備切換至 Gemini 備援引擎...', groqErr?.message || groqErr);
    }

    // D. 【備援步驟】若 Groq 失敗或 TPM 爆滿，依序嘗試 Gemini API 進行備援
    if (!success) {
      const geminiKeys = getGeminiApiKeys();
      const validGeminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

      geminiLoop: for (const key of geminiKeys) {
        const genAI = new GoogleGenerativeAI(key);

        for (const modelName of validGeminiModels) {
          try {
            console.log(`🔄 [Gemini 備援] 嘗試使用模型 (${modelName})...`);
            const model = genAI.getGenerativeModel({
              model: modelName,
              systemInstruction: systemInstruction,
              tools: [{ functionDeclarations }],
            });

            const formattedHistory = recentMessages.map((item) => ({
              role: item.role === 'user' ? 'user' : 'model',
              parts: [{ text: item.content || '' }],
            }));

            const chat = model.startChat({ history: formattedHistory });
            let result = await chat.sendMessage(message);
            let response = await result.response;
            let functionCalls = response.functionCalls();

            if (functionCalls && functionCalls.length > 0) {
              const call = functionCalls[0];
              const toolResult = await executeTool(call.name, call.args, userIdStr);

              result = await chat.sendMessage([
                {
                  functionResponse: {
                    name: call.name,
                    response: toolResult,
                  },
                },
              ]);
              responseText = (await result.response).text();
            } else {
              responseText = response.text();
            }

            success = true;
            console.log(`✅ [Chat API] 成功使用 Gemini 備援模型 (${modelName})`);
            break geminiLoop;
          } catch (geminiErr: any) {
            console.warn(`[Gemini 備援嘗試失敗] 模型 (${modelName}):`, geminiErr?.message || geminiErr);
          }
        }
      }
    }

    // E. 如果 Groq 與所有 Gemini 備援皆失敗，拋出最終錯誤
    if (!success) {
      throw new Error('Groq 與 Gemini 備援皆無法處理請求（所有模型的額度與 TPM 皆已耗盡）。');
    }

    // F. 寫入對話歷史紀錄
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: todayRecord } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userIdStr)
      .eq('chat_date', todayStr)
      .maybeSingle();

    const rawMessages = todayRecord?.messages;
    const currentMessages: any[] = Array.isArray(rawMessages) ? rawMessages : [];

    const updatedMessages = [
      ...currentMessages,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'model', content: responseText, timestamp: new Date().toISOString() },
    ];

    await supabase.from('daily_chat_history').upsert(
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
      { error: '系統服務暫時不可用，請稍後再試。', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
