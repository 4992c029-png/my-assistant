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

    console.log("======================================");
    console.log("【歷史對話讀取請求】");
    console.log("請求讀取的 userId 是:", userId);

    if (!userId) {
      return Response.json({ error: '缺少 userId' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('chat_history')
      .select('role, content')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ 【資料庫錯誤】讀取歷史對話失敗，請檢查 RLS 政策！', error);
      throw error;
    }

    console.log(`🎯 成功讀取到 ${data?.length || 0} 筆歷史紀錄！`);
    console.log("======================================");

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
