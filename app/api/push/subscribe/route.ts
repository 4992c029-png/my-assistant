// =========================================================
// Phase 2 - Step 4：新建檔案 app/api/push/subscribe/route.ts
// =========================================================
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId, subscription } = await req.json();

    if (!userId || !subscription?.endpoint || !subscription?.keys) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 });
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: String(userId),
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      console.error('儲存推播訂閱失敗:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
