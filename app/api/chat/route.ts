import { NextResponse } from 'next/server';
import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  Tool,
  SchemaType,
} from '@google/generative-ai';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const Type = SchemaType;

// 1. 環境變數淨化（防止非 ASCII 字元破壞 Header）
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

// 轉譯成 OpenAI / Groq 格式的 Tool 結構
const groqTools: Groq.Chat.Completions.ChatCompletionTool[] = functionDeclarations.map((f) => ({
  type: 'function',
  function: {
    name: f.name,
    description: f.description,
    parameters: f.parameters as Record<string, any>,
  },
}));

// 3. 核心工具執行邏輯（Gemini 與 Groq 共用）
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

// 4. Groq 備援呼叫處理函式
async function runGroqFallback(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  userIdStr: string
): Promise<string> {
  const groqApiKey = sanitizeAscii(process.env.GROQ_API_KEY);
  if (!groqApiKey) {
    throw new Error('Groq API Key 未設定');
  }

  const groq = new Groq({ apiKey: groqApiKey });

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({
      role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: h.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // 選用 Groq 目前最強且支援 Tool Calling 的模型
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: messages,
    tools: groqTools,
    tool_choice: 'auto',
  });

  const responseMessage = completion.choices[0]?.message;

  if (responseMessage?.tool_calls && responseMessage.tool_calls.length > 0) {
    const toolCall = responseMessage.tool_calls[0];
    const functionName = toolCall.function.name;
    const functionArgs = JSON.parse(toolCall.function.arguments || '{}');

    // 執行資料庫工具
    const toolResult = await executeTool(functionName, functionArgs, userIdStr);

    // 將工具結果二次餵給 Groq 產生最終親切回覆
    messages.push(responseMessage);
    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
    });

    const secondCompletion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
    });

    return secondCompletion.choices[0]?.message?.content || '處理完成。';
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
3.禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！`;

    let responseText = '';
    let success = false;

    // C. 優先嘗試 Gemini API (僅保留現行有效模型名稱)
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
          console.log(`[Chat API] 成功使用 Gemini 模型 (${modelName})`);
          break geminiLoop;
        } catch (err: any) {
          console.warn(`[Gemini API 失敗] 模型 (${modelName}):`, err?.message || err);
        }
      }
    }

    // D. 若所有 Gemini Keys/模型皆額度爆滿或失敗，觸發 Groq 備援！
    if (!success) {
      console.warn('⚠️ [Gemini 全部失效/額度滿] 觸發 Groq (llama-3.3-70b-versatile) 備援引擎...');
      try {
        responseText = await runGroqFallback(systemInstruction, recentMessages, message, userIdStr);
        success = true;
        console.log('[Chat API] 成功使用 Groq 備援引擎產出回應');
      } catch (groqErr: any) {
        console.error('❌ [Groq 備援亦失敗]:', groqErr);
        throw new Error(`Gemini 與 Groq 備援皆無法處理請求: ${groqErr?.message}`);
      }
    }

    // E. 寫入歷史紀錄
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: todayRecord } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userIdStr)
      .eq('chat_date', todayStr)
      .maybeSingle();

    const currentMessages = Array.isArray(todayRecord?.messages) ? todayRecord.messages : [];
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
