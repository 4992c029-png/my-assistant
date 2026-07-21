import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 優先選用 SERVICE_ROLE_KEY 繞過 RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

function safeToISOString(input: any): string | null {
  if (!input) return null;
  try {
    let str = String(input).trim();
    // 處理 HTML <input type="datetime-local"> 的 "YYYY-MM-DDTHH:mm" 格式
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
  if (!rawId) return '';
  if (typeof rawId === 'object') {
    return String(rawId.id || rawId.userId || rawId.sub || rawId.email || '').trim();
  }
  return String(rawId).trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 雙向相容相容駝峰與底線命名
    const userId = cleanUserId(body.userId || body.user_id);
    const title = String(body.title || '').trim();
    const rawRemindAt = body.remindAt || body.remind_at;
    const repeatType = body.repeatType || body.repeat_type || 'none';
    const reminderType = body.reminderType || body.reminder_type || 'both';

    if (!userId) {
      return NextResponse.json({ error: '使用者 ID (userId) 不能為空' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: '提醒事項標題 (title) 不能為空' }, { status: 400 });
    }

    const isoRemindAt = safeToISOString(rawRemindAt);
    if (!isoRemindAt) {
      return NextResponse.json(
        { error: `無效的時間格式: "${rawRemindAt}"，請選擇正確的日期時間` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('user_reminders')
      .insert([
        {
          user_id: userId,
          title: title,
          remind_at: isoRemindAt,
          repeat_type: repeatType,
          reminder_type: reminderType,
          is_triggered: false,
        },
      ])
      .select();

    if (error) {
      console.error('❌ Supabase 寫入失敗:', error);
      return NextResponse.json(
        { error: `資料庫寫入失敗 (${error.code}): ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, reminder: data[0] });
  } catch (err: any) {
    console.error('❌ POST /api/reminders 錯誤:', err);
    return NextResponse.json(
      { error: '伺服器處理失敗', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = cleanUserId(searchParams.get('userId') || searchParams.get('user_id'));

    if (!userId) {
      return NextResponse.json({ error: '缺少 userId 參數' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_reminders')
      .select('*')
      .eq('user_id', userId)
      .order('remind_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reminders: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
