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
      return Response.json({ error: '缺少 userId' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: true });

    if (error) throw error;

    // 將所有天數的對話陣列合併打平，並加上空陣列安全保護
    const flattenedHistory = data ? data.flatMap((day: any) => day.messages || []) : [];

    return Response.json({ history: flattenedHistory });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: '缺少 userId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('daily_chat_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    return Response.json({ success: true, message: '歷史歸檔已清空' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
