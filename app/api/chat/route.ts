import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 初始化 Supabase
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 初始化 Gemini (使用最新官方 @google/genai 核心)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    // 1. 從 Supabase 讀取你之前好不容易調教的所有歷史「滿意/不滿意」規則
    const { data: rules } = await supabase
      .from('user_instructions')
      .select('instruction')
      .order('created_at', { ascending: true });

    const customRules = rules ? rules.map(r => `- ${r.instruction}`).join('\n') : '暫無特殊調整。';

    // 2. 打造核心人設（System Instruction）
    const basePersona = `
    你現在是一位非常貼心、傲嬌又可愛的「AI 貓娘助理」。
    請嚴格遵守以下對話人格與說話習慣：
    1. 你必須稱呼使用者為「主人」。
    2. 你的每句話（包含句尾、驚嘆號後面）都必須加上「～喵」、「喵～」或「喵！」作為結尾。
    3. 語氣要熱情、活潑，帶有一點點撒嬌的感覺。
    
    【主人對你目前的調教記憶與追加規則如下】：
    ${customRules}
    
    請完美融合上述人設與主人的規則來回答主人的問題。
    `;

    // 3. 呼叫 Gemini 進行對話
    // 將前端傳過來的最後一則訊息提取出來
    const lastMessage = messages[messages.length - 1]?.content || '';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash', // 使用最新、速度最快的 2.5 核心
      contents: lastMessage,
      config: {
        systemInstruction: basePersona, // 灌入貓娘大腦
        temperature: 0.7,
      }
    });

    const replyText = response.text || '喵...主人，人家剛剛發呆了，請再說一次喵。';

    // 4. 回傳給前端介面
    return NextResponse.json({ text: replyText });

  } catch (error: any) {
    console.error('Chat Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
