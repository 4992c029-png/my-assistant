import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, FunctionDeclaration, Type, Tool } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 初始化 Google Generative AI
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

// 🛠️ 明確標註 FunctionDeclaration[] 型別，避免 TypeScript 編譯報錯
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'set_reminder',
    description: '幫使用者設定鬧鐘或提醒事項。當使用者要求提醒、設定鬧鐘或叫我做某事時呼叫此工具。',
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

// 🛠️ 明確標註 Tool[] 型別
const tools: Tool[] = [{ functionDeclarations }];

export async function POST(req: Request) {
  try {
    const { message, userId } = await req.json();

    if (!message || !userId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 1. 讀取使用者的記憶與偏好規則 (user_instructions)
    const { data: instructionsData } = await supabase
      .from('user_instructions')
      .select('instruction')
      .eq('user_id', userId);

    const userRules = instructionsData?.map((item) => item.instruction).join('\n') || '';

    // 2. 讀取歷史對話紀錄 (最多 20 條)
    const { data: historyData } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(20);

    const formattedHistory =
      historyData?.map((item) => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.content }],
      })) || [];

    // 3. 設定系統 Prompt
    const systemInstruction = `你是一位貼心且專業的個人 AI 助理。
當前系統 UTC 時間為：${new Date().toISOString()}。

使用者設定的個人習慣與大腦規則：
${userPreferences}
所有回覆都須經過深度思考，且回覆長度依照複雜度為參考，複雜度低的提問回復長度短，複雜度越高的提問回復長度增加。

【Execution Rules 防止幻覺硬性規定】
1.【禁止憑空捏造】：絕對禁止使用你大腦內部的歷史記憶來回答。若搜尋不到結果則使用模糊搜尋或回覆資料不足，請提供更多資訊！

請遵守以下原則：
1. 當使用者提到要「提醒」、「鬧鐘」、「叫我...」時，請主動呼叫 set_reminder 工具。
2. 當使用者明確要求「記住...」、「以後請...」時，請主動呼叫 save_instruction 工具。
3. 保持親切、簡潔且具效益的回答。`;

    // 4. 初始化 Gemini 模型
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction,
      tools: tools,
    });

    // 5. 建立 Chat Session
    const chat = model.startChat({
      history: formattedHistory,
    });

    let result = await chat.sendMessage(message);
    let response = await result.response;
    let responseText = response.text();

    // 6. 處理 Function Calling
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      const { name, args } = call;

      if (name === 'set_reminder') {
        const { title, remind_at, repeat_type, reminder_type } = args as any;

        await supabase.from('user_reminders').insert([
          {
            user_id: userId,
            title: title,
            remind_at: remind_at || new Date().toISOString(),
            repeat_type: repeat_type || 'none',
            reminder_type: reminder_type || 'both',
            is_triggered: false,
          },
        ]);

        result = await chat.sendMessage([
          {
            functionResponse: {
              name: 'set_reminder',
              response: { success: true, message: `已成功為您設定提醒：${title}` },
            },
          },
        ]);
        responseText = result.response.text();
      } else if (name === 'save_instruction') {
        const { instruction } = args as any;

        await supabase.from('user_instructions').insert([
          {
            user_id: userId,
            instruction: instruction,
          },
        ]);

        result = await chat.sendMessage([
          {
            functionResponse: {
              name: 'save_instruction',
              response: { success: true, message: `已成功儲存偏好規則：${instruction}` },
            },
          },
        ]);
        responseText = result.response.text();
      }
    }

    // 7. 將本次對話紀錄存入 Supabase
    await supabase.from('chat_history').insert([
      { user_id: userId, role: 'user', content: message },
      { user_id: userId, role: 'model', content: responseText },
    ]);

    return NextResponse.json({ reply: responseText });
  } catch (err: any) {
    console.error('Chat API 錯誤:', err);
    return NextResponse.json(
      { error: '伺服器處理失敗', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
