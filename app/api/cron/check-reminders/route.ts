// app/api/cron/check-reminders/route.ts
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// 設定 Web Push 密鑰 (可在 .env 設定 VAPID 金鑰)
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function GET() {
  try {
    const now = new Date().toISOString();

    // 1. 撈出所有已到期且未觸發的提醒
    const { data: dueReminders, error: fetchError } = await supabase
      .from('user_reminders')
      .select('*')
      .lte('remind_at', now)
      .eq('is_triggered', false);

    if (fetchError || !dueReminders || dueReminders.length === 0) {
      return Response.json({ status: 'ok', processed: 0 });
    }

    for (const reminder of dueReminders) {
      // 2. 撈取使用者的 Web Push 訂閱裝置
      const { data: subRow } = await supabase
        .from('user_push_subscriptions')
        .select('subscription')
        .eq('user_id', reminder.user_id)
        .single();

      if (subRow && subRow.subscription) {
        const payload = JSON.stringify({
          id: reminder.id,
          title: `⏰ 提醒：${reminder.title}`,
          body: `設定時間：${new Date(reminder.remind_at).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })}`
        });

        // 3. 強制發送 Web Push 通知到手機作業系統層級
        try {
          await webpush.sendNotification(subRow.subscription, payload);
        } catch (pushErr) {
          console.error("發送 Web Push 失敗:", pushErr);
        }
      }

      // 4. 計算週期或標記已觸發
      const repeatType = reminder.repeat_type || 'none';
      if (repeatType !== 'none') {
        const current = new Date(reminder.remind_at);
        if (repeatType === 'daily') current.setDate(current.getDate() + 1);
        else if (repeatType === 'weekly') current.setDate(current.getDate() + 7);
        else if (repeatType === 'monthly') current.setMonth(current.getMonth() + 1);

        await supabase
          .from('user_reminders')
          .update({ remind_at: current.toISOString(), is_triggered: false })
          .eq('id', reminder.id);
      } else {
        await supabase
          .from('user_reminders')
          .update({ is_triggered: true })
          .eq('id', reminder.id);
      }
    }

    return Response.json({ status: 'success', processed: dueReminders.length });
  } catch (err: any) {
    console.error("Cron 執行失敗:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
