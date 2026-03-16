const https = require('https');
const apiKey = process.env.GEMINI_API_KEY || "dummy"; // User's key not available, but let's see if we get a 400 instead of 404
const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, (res) => {
    let rawData = '';
    res.on('data', (d) => rawData += d);
    res.on('end', () => console.log(rawData.substring(0, 500)));
});
req.end();
