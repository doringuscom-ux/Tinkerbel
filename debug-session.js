require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');

async function debugSession() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    // Fetch the most recently updated session
    const session = await Session.findOne().sort({ updatedAt: -1 });
    
    if (session) {
      console.log(`Phone: ${session.phone}`);
      console.log(`AI Enabled: ${session.aiEnabled}`);
      console.log(`Paused Until: ${session.pausedUntil}`);
      console.log(`Language: ${session.language}`);
      const recent = session.history.slice(-6);
      console.log('Recent messages:', JSON.stringify(recent, null, 2));
    } else {
      console.log('Session not found');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugSession();
