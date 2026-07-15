import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId, type, replyContent, correction } = await req.json();

    if (!userId || !type || !replyContent) {
      return Response.json({ error: '缺少必要參數' }, { status: 400 });
    }

    let instructionText = '';

    if (type === 'like') {
      //  👍 滿意：記錄為優良模仿對象
      instructionText = `【優良表現範例（使用者非常滿意，請多參考此類回答語氣與內容樣式）】：「${replyContent}」`;
    } else if (type === 'dislike') {
      // 👎 不滿意：記錄為避雷禁忌，並加上使用者期望的修正
      const reason = correction ? correction.trim() : '未提供具體原因';
      instructionText = `【避雷禁忌規則（使用者極不滿意，請絕對不要再這樣回答）】：「${replyContent}」。使用者的修正警告指引：「${reason}」`;
    } else {
      // 預留自定義大腦規則寫入
      instructionText = replyContent;
    }

    // 寫入到 user_instructions 表，嚴格綁定該 userId，保證不越界
    const { error } = await supabase
      .from('user_instructions')
      .insert({
        user_id: userId,
        instruction: instructionText,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("❌ 寫入大腦偏好失敗:", error);
      throw error;
    }

    return Response.json({ success: true, message: '大腦記憶已更新' });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
