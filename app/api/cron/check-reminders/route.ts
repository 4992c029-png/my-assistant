import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 輔助函式：安全解析時間字串為 ISO 8601
function parseToISO(dateString: any): string | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// 1. 手動新增提醒
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // 同時支援 camelCase 與 snake_case 的欄位命名
    const userId = body.userId || body.user_id;
    const title = body.title;
    const rawRemindAt = body.remindAt || body.remind_at;
    const repeatType = body.repeatType || body.repeat_type || 'none';
    const reminderType = body.reminderType || body.reminder_type || 'both';

    if (!userId || !title || !rawRemindAt) {
      return NextResponse.json(
        { error: '缺少必要欄位：userId, title 或 remindAt/remind_at' },
        { status: 400 }
      );
    }

    const isoRemindAt = parseToISO(rawRemindAt);
    if (!isoRemindAt) {
      return NextResponse.json(
        { error: '時間格式錯誤，請傳入有效的日期時間字串' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('user_reminders')
      .insert([
        {
          user_id: String(userId).trim(),
          title: String(title).trim(),
          remind_at: isoRemindAt,
          repeat_type: repeatType,
          reminder_type: reminderType,
          is_triggered: false,
        },
      ])
      .select();

    if (error) {
      console.error('❌ 手動新增提醒失敗:', error);
      return NextResponse.json({ error: `資料庫寫入失敗: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, reminder: data[0] });
  } catch (err: any) {
    return NextResponse.json({ error: '伺服器內部錯誤', details: err?.message }, { status: 500 });
  }
}

// 2. 取得目前使用者的提醒清單
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: '缺少 userId 參數' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_reminders')
      .select('*')
      .eq('user_id', String(userId).trim())
      .order('remind_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reminders: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
