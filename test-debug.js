require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const session = await Session.findOne().sort({ updatedAt: -1 });
  if (!session) {
    console.log("No session found");
    process.exit(1);
  }
  
  console.log("Session history length:", session.history.length);
  
  const systemInstruction = "You are a friendly assistant.";
  
  let cleanHistory = [];
  for (let msg of session.history) {
    if (cleanHistory.length === 0) {
      cleanHistory.push({ role: msg.role, content: msg.content });
    } else {
      let lastMsg = cleanHistory[cleanHistory.length - 1];
      if (lastMsg.role === msg.role && msg.role !== 'system') {
        lastMsg.content += '\n\n' + msg.content;
      } else {
        cleanHistory.push({ role: msg.role, content: msg.content });
      }
    }
  }

  let history = cleanHistory;
  if (history.length > 21) {
    history = [
      history[0],
      ...history.slice(history.length - 20)
    ];
  }

  if (history.length > 0 && history[0].role === 'system') {
    history[0].content = systemInstruction;
  } else {
    history.unshift({ role: 'system', content: systemInstruction });
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: history[0].content,
  });
  
  const contents = history
    .filter(msg => msg.role !== 'system')
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
    
  console.log("Contents being sent to Gemini:");
  console.log(JSON.stringify(contents, null, 2));

  try {
    const result = await model.generateContent({ contents });
    console.log("SUCCESS:", result.response.text());
  } catch (err) {
    console.error("GEMINI ERROR:", err);
  }
  process.exit(0);
}
test();
