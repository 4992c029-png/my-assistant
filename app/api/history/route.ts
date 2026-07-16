import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 🌟 全面載入極致歷史：180 天所有儲存數據，並在後端打平
    const { data, error } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: true })
      .limit(180); // 擴充上限為最近 180 天

    if (error) throw error;

    const flattenedHistory = data ? data.flatMap((day: any) => day.messages || []) : [];

    // 後端限制極致 500 筆對話送往前端渲染
    return Response.json({ history: flattenedHistory.slice(-500) });
  } catch (error: any) {
    console.error("❌ 撈取歷史紀錄 API 失敗:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    const { error } = await supabase
      .from('daily_chat_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
