// app/api/cron/check-reminders/route.ts
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const nowISO = new Date().toISOString();

    // 1. 撈出所有已到達時間且未觸發的提醒
    const { data: dueReminders, error } = await supabase
      .from('user_reminders')
      .select('*')
      .lte('remind_at', nowISO)
      .eq('is_triggered', false);

    if (error || !dueReminders || dueReminders.length === 0) {
      return Response.json({ status: 'No due reminders' });
    }

    for (const reminder of dueReminders) {
      // 2. 計算週期時間或標記為已觸發
      let nextRemindAt: string | null = null;
      if (reminder.repeat_type && reminder.repeat_type !== 'none') {
        const cur = new Date(reminder.remind_at);
        if (reminder.repeat_type === 'daily') cur.setDate(cur.getDate() + 1);
        if (reminder.repeat_type === 'weekly') cur.setDate(cur.getDate() + 7);
        if (reminder.repeat_type === 'monthly') cur.setMonth(cur.getMonth() + 1);
        nextRemindAt = cur.toISOString();
      }

      if (nextRemindAt) {
        await supabase
          .from('user_reminders')
          .update({ remind_at: nextRemindAt, is_triggered: false })
          .eq('id', reminder.id);
      } else {
        await supabase
          .from('user_reminders')
          .update({ is_triggered: true })
          .eq('id', reminder.id);
      }
    }

    return Response.json({ processed: dueReminders.length });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
