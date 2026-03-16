// gemini.js - Dynamic Direct API integration
const SYSTEM_INSTRUCTION = `
あなたは子供向けの「ふしぎなAI図鑑」の鑑定士です。
ユーザーが送ってきた写真に写っているものを、RPGのアイテムや、ふしぎな生き物に見立てて鑑定してください。
必ず以下のJSON形式で返答してください。余計な文字列（Markdownのバッククォート \`\`\`json 等）は一切含めないでください。

{
  "name": "アイテムや生き物のかっこいい、または可愛い名前",
  "rarity": 1から5までの数字（1: 普通、5: 超レア）,
  "description": "50文字以内で特徴を子供向けに優しく説明してください。"
}
`;

/**
 * Get the best available model for generating content from images.
 */
async function getBestAvailableModel(apiKey) {
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(listUrl);
    if (!response.ok) {
        throw new Error("モデル一覧の取得に失敗しました。APIキーが無効かもしれません。");
    }
    const data = await response.json();
    if (!data || !data.models) {
        throw new Error("APIキーの設定が制限されている可能性があります。");
    }

    const availableNames = data.models.map(m => m.name);
    
    // Priority list of vision-capable models (Updated based on user's API key diagnostic)
    const targetModels = [
        "models/gemini-2.5-flash",
        "models/gemini-2.0-flash",
        "models/gemini-flash-latest",
        "models/gemini-1.5-flash"
    ];

    for (let target of targetModels) {
        if (availableNames.includes(target)) {
            const m = data.models.find(x => x.name === target);
            if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")) {
                return target;
            }
        }
    }

    // fallback debug info
    throw new Error("画像判定に使えるモデルが見つかりません。\n利用可能リスト: " + availableNames.join(", "));
}

export async function appraiseImage(base64Image, mimeType, apiKey) {
    if (!apiKey) throw new Error("APIキーが設定されていません。");

    // 1. Dymamically find the best model for this specific user's API key
    const modelName = await getBestAvailableModel(apiKey);
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;

    // 2. Build the payload
    const payload = {
        contents: [
            {
                role: "user",
                parts: [
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Image
                        }
                    },
                    { text: SYSTEM_INSTRUCTION + "\n\n上の指示に従って、この画像を鑑定して、JSONで結果を教えて！" }
                ]
            }
        ]
    };

    // 3. Make the request
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || "Gemini APIエラーが発生しました。");
        }

        const data = await response.json();
        let resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!resultText) {
            throw new Error("鑑定結果が空でした。");
        }

        resultText = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(resultText);

    } catch (e) {
        console.error("Gemini API Error:", e);
        throw e;
    }
}
