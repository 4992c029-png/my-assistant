import { NextResponse } from 'next/server';

// 圖片編輯：接收一張現有圖片（data URI）+ 修改指令，回傳修改後的圖片（一樣是 data URI）
export async function POST(req: Request) {
  try {
    const { imageDataUri, prompt } = await req.json();

    if (!imageDataUri || typeof imageDataUri !== 'string') {
      return NextResponse.json({ error: '缺少要修改的圖片' }, { status: 400 });
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: '請輸入修改指令' }, { status: 400 });
    }

    const pollinationsKey = process.env.POLLINATIONS_API_KEY;
    if (!pollinationsKey) {
      return NextResponse.json({ error: '尚未設定 POLLINATIONS_API_KEY 環境變數' }, { status: 500 });
    }

    // 把前端傳來的 data URI（data:image/xxx;base64,....）還原成二進位資料
    const match = imageDataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: '圖片格式無法辨識' }, { status: 400 });
    }
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');

    // 呼叫 Pollinations.ai 新版圖片編輯端點（OpenAI 相容格式）
    const formData = new FormData();
    formData.append('image', new Blob([buffer], { type: mimeType }), 'source.png');
    formData.append('prompt', prompt.trim());
    formData.append('model', 'kontext'); // kontext 是目前圖片編輯效果較穩定的模型

    const editRes = await fetch('https://gen.pollinations.ai/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pollinationsKey}` },
      body: formData,
    });

    if (!editRes.ok) {
      const errText = await editRes.text().catch(() => '');
      console.error('圖片修改失敗:', editRes.status, errText);
      return NextResponse.json({ error: '圖片修改服務異常，請稍後再試' }, { status: 502 });
    }

    const editData = await editRes.json();
    const resultB64: string | undefined = editData?.data?.[0]?.b64_json;
    const resultUrl: string | undefined = editData?.data?.[0]?.url;

    let resultImageUrl: string;
    if (resultB64) {
      resultImageUrl = `data:image/png;base64,${resultB64}`;
    } else if (resultUrl) {
      // 若回傳的是外部網址，後端代為抓取並轉成 base64，前端一樣不需要接觸任何金鑰
      const fetchRes = await fetch(resultUrl);
      if (!fetchRes.ok) {
        return NextResponse.json({ error: '取得修改後圖片失敗' }, { status: 502 });
      }
      const arrayBuffer = await fetchRes.arrayBuffer();
      const contentType = fetchRes.headers.get('content-type') || 'image/png';
      resultImageUrl = `data:${contentType};base64,${Buffer.from(arrayBuffer).toString('base64')}`;
    } else {
      return NextResponse.json({ error: '圖片修改服務未回傳有效結果' }, { status: 502 });
    }

    return NextResponse.json({ imageUrl: resultImageUrl });
  } catch (error: any) {
    console.error('圖片修改錯誤:', error);
    return NextResponse.json({ error: '圖片修改服務異常，請稍後再試' }, { status: 500 });
  }
}
