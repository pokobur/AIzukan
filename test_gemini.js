const fs = require('fs');
const https = require('https');

const apiKey = "DUMMY_KEY";
const SYSTEM_INSTRUCTION = "You are a helpful assistant.";

// We cannot actually test with a dummy key, but we want to see if the structure compiles properly against the API
// or if the API returns a validation error vs a general dummy key error.
const payload = {
    system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: [
        {
            role: "user",
            parts: [
                { text: "test" }
            ]
        }
    ],
    generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
    }
};

const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
}, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        try {
            console.log("Status:", res.statusCode);
            console.log(JSON.parse(rawData));
        } catch (e) {
            console.error(e.message);
        }
    });
});
req.write(JSON.stringify(payload));
req.end();
