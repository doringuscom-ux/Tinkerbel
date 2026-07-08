require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');
const axios = require('axios');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const session = await Session.findOne().sort({ updatedAt: -1 });
  if (!session) {
    console.log("No session found");
    process.exit(0);
  }
  console.log("Found session for", session.phone);
  console.log("History:", JSON.stringify(session.history, null, 2));

  let history = session.history;
  if (history.length > 21) {
    history = [
      history[0],
      ...history.slice(history.length - 20)
    ];
  }

  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const messages = history.map(msg => ({ role: msg.role, content: msg.content }));
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'HTTP-Referer': 'https://tinkerbelle.com',
    'X-Title': 'Tinkerbelle WhatsApp Bot'
  };

  const payload1 = { model: process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free', messages };
  console.log("Payload1:", JSON.stringify(payload1, null, 2));

  try {
    const res = await axios.post(url, payload1, { headers, timeout: 30000 });
    console.log("Success:", res.data.choices[0].message.content);
  } catch (err) {
    console.error("Error:", err.response ? err.response.data : err.message);
  }
  process.exit(0);
}

test();
