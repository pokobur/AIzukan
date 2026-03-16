import fetch from 'node-fetch'; // Requires npm install node-fetch if not v18+ but node 18+ has fetch natively.
const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=invalid', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    system_instruction: { parts: [{text: "test"}] },
    contents: [{ role: "user", parts: [{text: "hello"}] }]
  })
});
const data = await res.json();
console.log(data);
