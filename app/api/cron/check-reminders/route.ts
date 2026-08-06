// =========================================================
// Phase 2 - Step 5：新建檔案 app/api/cron/check-reminders/route.ts
// 這支 API 會被「外部排程服務」每分鐘呼叫一次（見 SETUP_STEPS.md）
// =========================================================
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:you@example.com',
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function GET(req: Request) {
  // 用自訂密鑰保護這支 API，避免任何人在網路上找到網址就能亂觸發
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: '未授權' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();

  const { data: dueReminders, error } = await supabase
    .from('user_reminders')
    .select('*')
    .lte('remind_at', nowIso)
    .eq('is_triggered', false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sentCount = 0;

for (const reminder of dueReminders || []) {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', reminder.user_id);

  let deliveredToAtLeastOne = false;

  for (const sub of subs || []) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: '⏰ 提醒通知', body: reminder.title, data: { reminderId: reminder.id } })
      );
      deliveredToAtLeastOne = true;
      sentCount++;
    } catch (pushErr: any) {
      if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('推播發送失敗:', pushErr);
      }
    }
  }

  // 關鍵修正：完全沒有任何訂閱、或全部發送失敗時，不要標記完成，
  // 留給前端原本的計時器邏輯處理（APP 重新打開時仍會偵測到並正常顯示/觸發）
if (!deliveredToAtLeastOne) {
  continue;
}

if (!reminder.repeat_type || reminder.repeat_type === 'none') {
  // 單次提醒：刪除
  await supabase.from('user_reminders').delete().eq('id', reminder.id);
} else {
  // 週期性提醒：更新下一次時間
  const next = new Date(reminder.remind_at);
  if (reminder.repeat_type === 'daily') next.setDate(next.getDate() + 1);
  if (reminder.repeat_type === 'weekly') next.setDate(next.getDate() + 7);
  if (reminder.repeat_type === 'monthly') next.setMonth(next.getMonth() + 1);
  await supabase.from('user_reminders').update({ remind_at: next.toISOString() }).eq('id', reminder.id);
}
}
        

  return NextResponse.json({
    success: true,
    checked: dueReminders?.length || 0,
    sent: sentCount,
  });
}
