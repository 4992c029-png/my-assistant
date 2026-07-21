import { NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  SchemaType,
} from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const Type = SchemaType;

// 環境變數淨化
function sanitizeAscii(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

const supabaseUrl = sanitizeAscii(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitizeAscii(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const supabase = createClient(supabaseUrl, supabaseKey);

// 時間格式化 (支援台灣時區 +08:00)
function safeToISOString(input: any): string | null {
  if (!input) return null;
  try {
    let str = String(input).trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
      str += ':00+08:00';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(str)) {
      str += '+08:00';
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

// 統一工具規格
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'set_reminder',
    description: '幫使用者設定鬧鐘或提醒事項。必須將時間詞與事件標題徹底分離。',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: '提醒事項的純事件名稱（絕對不能包含時間詞，例如：「開會」、「吃藥」）' },
        remind_at: { type: Type.STRING, description: '目標提醒時間 (包含台灣時區 +08:00 的 ISO 8601 字串，如 2026-07-21T17:00:00+08:00)' },
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

const groqTools = functionDeclarations.map((f) => ({
  type: 'function',
  function: {
    name: f.name,
    description: f.description,
    parameters: f.parameters as Record<string, any>,
  },
}));

// 工具執行邏輯
async function executeTool(name: string, args: any, userIdStr: string) {
  if (name === 'set_reminder') {
    let rawTitle = String(args?.title || '').trim();
    const rawRemindAt = args?.remind_at || args?.remindAt;
    const repeatType = args?.repeat_type || args?.repeatType || 'none';
    const reminderType = args?.reminder_type || args?.reminderType || 'both';

    const filterKeywords = ['取消', '重新設定', '已經被取消', '已清除', '系統訊息', '已經取消'];
    if (filterKeywords.some((kw) => rawTitle.includes(kw)) || rawTitle.length > 50) {
      return { success: false, error: '無效的提醒標題，請指定具體要提醒的事項（例如：開會、吃藥）。' };
    }

    const validRemindAt = safeToISOString(rawRemindAt) || new Date().toISOString();

    const { data, error } = await supabase
      .from('user_reminders')
      .insert([
        {
          user_id: userIdStr,
          title: rawTitle,
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
    return { success: true, message: `已成功在資料庫寫入提醒：「${rawTitle}」` };
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

// Groq 執行引擎
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

  if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
    messages.push(responseMessage);

    for (const toolCall of responseMessage.tool_calls) {
      const functionName = toolCall.function.name;
      let functionArgs = {};
      try {
        functionArgs = JSON.parse(toolCall.function.arguments || '{}');
      } catch (e) {
        functionArgs = {};
      }

      const toolResult = await executeTool(functionName, functionArgs, userIdStr);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      });
    }

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

    // 1. 讀取記憶與未完成提醒
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

    // 2. 歷史紀錄擴充
    const { data: dailyRecords } = await supabase
      .from('daily_chat_history')
      .select('messages, chat_date')
      .eq('user_id', userIdStr)
      .order('chat_date', { ascending: false })
      .limit(60);

    let allMessages: Array<{ role: string; content: string }> = [];
    if (dailyRecords && dailyRecords.length > 0) {
      const sortedRecords = [...dailyRecords].reverse();
      for (const record of sortedRecords) {
        if (Array.isArray(record.messages)) {
          allMessages.push(...record.messages);
        }
      }
    }
    const recentMessages = allMessages.slice(-80);

    const now = new Date();
    const taiwanTimeStr = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00');

    const systemInstruction = `你是一位貼心且專業的個人 AI 助理。
當前台灣時間 (UTC+8) 為：${taiwanTimeStr}

使用者設定的個人習慣與大腦規則：
${userRules ? userRules : '目前尚無特殊偏好設定。'}

使用者目前在資料庫中生效的未完成提醒事項：
${remindersText}

【提醒事項設定 (set_reminder) 絕對規範】：
1. 標題與時間徹底剝離：
   - 標題 (title) 必須為純事件名稱（例如：「開會」、「吃藥」）。
   - 嚴禁把時間詞（如「下午5點」、「明天早上」）寫入 title 中！
2. 精確時間推算 (remind_at)：
   - 參考台灣時間 (${taiwanTimeStr}) 推算絕對時間 ISO 8601。
3. 呼叫工具後，根據真實結果簡潔回覆使用者。

請嚴格遵守以下原則：
1. 保持親切、簡潔且具效益的回答。
2. 回覆長度依照複雜度彈性調整。
3. 【禁止憑空捏造】：資料不足時請直接說明。`;

    let responseText = '';
    let success = false;

    // 優先 Groq
    try {
      responseText = await runGroqPrimary(systemInstruction, recentMessages, message, userIdStr);
      success = true;
    } catch (groqErr: any) {
      console.warn('⚠️ Groq 切換至 Gemini 備援...', groqErr?.message || groqErr);
    }

    // Gemini 備援
    if (!success) {
      const geminiKeys = getGeminiApiKeys();
      const validGeminiModels = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];

      geminiLoop: for (const key of geminiKeys) {
        const genAI = new GoogleGenerativeAI(key);

        for (const modelName of validGeminiModels) {
          try {
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
            break geminiLoop;
          } catch (geminiErr: any) {
            console.warn(`[Gemini 失敗] ${modelName}:`, geminiErr?.message || geminiErr);
          }
        }
      }
    }

    if (!success) {
      throw new Error('Groq 與 Gemini 皆無法回應請求。');
    }

    // 寫入對話歷史
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
