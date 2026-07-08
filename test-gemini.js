require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: "You are a helpful assistant."
    });

    const geminiHistory = [
      { role: 'user', parts: [{ text: 'Hello' }] }
    ];

    console.log("Sending request to Gemini...");
    const result = await model.generateContent({ contents: geminiHistory });
    console.log("Response:", result.response.text());
  } catch (err) {
    console.error("ERROR:", err);
  }
}
test();
