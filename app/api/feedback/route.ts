import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客戶端
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    // 解析前端傳過來的 userId 與修正內容 (correction)
    const { userId, correction } = await req.json();

    console.log("======================================");
    console.log("【收到寫入記憶請求】");
    console.log("使用者 ID:", userId);
    console.log("要寫入的新規則:", correction);

    if (!userId || !correction) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    // 將新規則新增至 Supabase 的 user_instructions 資料表
    const { data, error } = await supabase
      .from('user_instructions')
      .insert([
        { 
          user_id: userId, 
          instruction: correction 
        }
      ]);

    if (error) {
      console.error('❌ 寫入 Supabase 失敗:', error);
      return Response.json({ error: '無法寫入資料庫' }, { status: 500 });
    }

    console.log("🎯 成功將新規則寫入 Supabase！");
    console.log("======================================");

    return Response.json({ success: true, message: '記憶寫入成功！' });

  } catch (error: any) {
    console.error('API 錯誤:', error);
    return Response.json({ error: error.message || '伺服器內部錯誤' }, { status: 500 });
  }
}
