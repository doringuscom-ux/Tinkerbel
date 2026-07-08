require('dotenv').config();
const { generateAISessionReply } = require('./server'); // wait, server doesn't export this. I'll copy the function logic.

const axios = require('axios');
const mongoose = require('mongoose');
const Session = require('./models/Session');

async function testAI() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const session = await Session.findOne({ phone: '917009708435' });
    
    let history = session.history.slice(-20);
    const systemInstruction = process.env.SYSTEM_INSTRUCTION || "You are a helpful assistant.";
    history.unshift({ role: 'system', content: systemInstruction });

    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const messages = history.map(msg => ({ role: msg.role, content: msg.content }));
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://tinkerbelle.com',
      'X-Title': 'Tinkerbelle WhatsApp Bot'
    };

    const payload1 = { model: process.env.OPENROUTER_MODEL, messages };
    const payload2 = { model: process.env.OPENROUTER_MODEL_2 || 'google/gemma-4-26b-a4b-it:free', messages };

    console.log('Sending request to OpenRouter...', payload1.model, payload2.model);
    const req1 = axios.post(url, payload1, { headers, timeout: 30000 }).then(r => r.data).catch(e => { console.log('req1 err:', e.response?.data || e.message); throw e; });
    const req2 = axios.post(url, payload2, { headers, timeout: 30000 }).then(r => r.data).catch(e => { console.log('req2 err:', e.response?.data || e.message); throw e; });

    const response = await Promise.any([req1, req2]);
    console.log('Response:', response.choices[0].message.content);
    
    process.exit(0);
  } catch (err) {
    console.error('All requests failed:', err);
    process.exit(1);
  }
}

testAI();
