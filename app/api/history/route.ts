import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 全面載入歷史：180 天所有儲存數據，並在後端打平
    const { data, error } = await supabase
      .from('daily_chat_history')
      .select('messages')
      .eq('user_id', userId)
      .order('chat_date', { ascending: true })
      .limit(180);

    if (error) throw error;

    const flattenedHistory = data ? data.flatMap((day: any) => day.messages || []) : [];

    // 後端限制最多 500 筆對話送往前端渲染
    return NextResponse.json({ history: flattenedHistory.slice(-500) });
  } catch (error: any) {
    console.error('❌ 撈取歷史紀錄 API 失敗:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: '缺少 userId' }, { status: 400 });
    }

    const { error } = await supabase
      .from('daily_chat_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ 清除歷史對話失敗:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
