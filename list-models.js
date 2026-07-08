require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    const fetch = globalThis.fetch;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    if (data.models) {
      console.log('Available models:');
      data.models.forEach(model => console.log(model.name));
    } else {
      console.log('Response:', data);
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}
listModels();
