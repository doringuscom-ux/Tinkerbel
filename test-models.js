require('dotenv').config();
const axios = require('axios');

async function testModels() {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const models = [
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemma-4-31b-it:free'
  ];

  const messages = [{ role: 'user', content: 'reply with "ok"' }];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
  };

  for (const model of models) {
    try {
      const res = await axios.post(url, { model, messages }, { headers, timeout: 5000 });
      console.log(`[SUCCESS] ${model}: ${res.data.choices[0].message.content}`);
    } catch (err) {
      console.error(`[ERROR] ${model}: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
    }
  }
}

testModels();
