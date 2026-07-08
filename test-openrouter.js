require('dotenv').config();
const axios = require('axios');

async function testOpenRouter() {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-2-9b-it:free';
  const OPENROUTER_MODEL_2 = process.env.OPENROUTER_MODEL_2 || 'google/gemma-7b-it:free';

  const messages = [{ role: 'user', content: 'hello' }];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'HTTP-Referer': 'https://tinkerbelle.com',
    'X-Title': 'Tinkerbelle WhatsApp Bot'
  };

  const payload1 = { model: OPENROUTER_MODEL, messages };
  const payload2 = { model: OPENROUTER_MODEL_2, messages };

  console.log('Testing payload1:', payload1);
  try {
    const res1 = await axios.post(url, payload1, { headers, timeout: 30000 });
    console.log('Res1 success:', res1.data.choices[0].message.content);
  } catch (err) {
    console.error('Res1 error:', err.response ? err.response.data : err.message);
  }

  console.log('Testing payload2:', payload2);
  try {
    const res2 = await axios.post(url, payload2, { headers, timeout: 30000 });
    console.log('Res2 success:', res2.data.choices[0].message.content);
  } catch (err) {
    console.error('Res2 error:', err.response ? err.response.data : err.message);
  }
}

testOpenRouter();
