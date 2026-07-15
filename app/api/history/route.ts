import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// 1. 取得指定使用者的歷史對話
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: '缺少 userId' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return Response.json({ history: data });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// 2. 刪除該使用者的所有對話紀錄 (重製功能)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return Response.json({ error: '缺少 userId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    return Response.json({ success: true, message: '對話記憶已清空' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
