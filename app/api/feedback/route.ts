import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId, correction } = await req.json();

    if (!userId || !correction) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 🌟 寫入到 user_instructions 表，綁定屬於該使用者的 user_id
    const { error } = await supabase
      .from('user_instructions')
      .insert({
        user_id: userId,
        instruction: correction,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("❌ 寫入大腦偏好失敗:", error);
      throw error;
    }

    return Response.json({ success: true, message: '大腦記憶已同步' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
