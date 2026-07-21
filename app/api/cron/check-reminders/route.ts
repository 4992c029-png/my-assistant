import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 🛠️ 超強健時間解析器：可容錯 HTML5 datetime-local 與各式時間字串
 */
function normalizeToISOString(input: any): string | null {
  if (!input) return null;
  let str = String(input).trim();

  // 若為 HTML input 產生的 "2026-07-21T15:30" (缺少秒數)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) {
    str += ':00';
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * 🛠️ 純化 userId：防範前端傳入的是 Object 或非字串
 */
function normalizeUserId(userId: any): string {
  if (!userId) return '';
  if (typeof userId === 'object') {
    return String(userId.id || userId.userId || userId.sub || '').trim();
  }
  return String(userId).trim();
}

// 1. 手動新增提醒
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const cleanUserId = normalizeUserId(body.userId || body.user_id);
    const title = String(body.title || '').trim();
    const rawRemindAt = body.remindAt || body.remind_at;
    const repeatType = body.repeatType || body.repeat_type || 'none';
    const reminderType = body.reminderType || body.reminder_type || 'both';

    // 嚴格檢查參數
    if (!cleanUserId) {
      return NextResponse.json({ error: '格式錯誤：未傳入有效的 userId' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: '格式錯誤：提醒標題不能為空' }, { status: 400 });
    }

    const isoRemindAt = normalizeToISOString(rawRemindAt);
    if (!isoRemindAt) {
      return NextResponse.json(
        { error: `格式錯誤：無法解析提醒時間 (${rawRemindAt})` },
        { status: 400 }
      );
    }

    // 寫入 Supabase
    const { data, error } = await supabase
      .from('user_reminders')
      .insert([
        {
          user_id: cleanUserId,
          title: title,
          remind_at: isoRemindAt,
          repeat_type: repeatType,
          reminder_type: reminderType,
          is_triggered: false,
        },
      ])
      .select();

    if (error) {
      console.error('❌ Supabase 寫入提醒失敗:', error);
      return NextResponse.json(
        { error: `資料庫寫入失敗：${error.message}`, details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, reminder: data[0] });
  } catch (err: any) {
    console.error('❌ POST /api/reminders 伺服器錯誤:', err);
    return NextResponse.json(
      { error: '伺服器內部錯誤', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

// 2. 取得提醒事項清單
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUserId = searchParams.get('userId');
    const cleanUserId = normalizeUserId(rawUserId);

    if (!cleanUserId) {
      return NextResponse.json({ error: '缺少 userId 參數' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_reminders')
      .select('*')
      .eq('user_id', cleanUserId)
      .order('remind_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ reminders: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
