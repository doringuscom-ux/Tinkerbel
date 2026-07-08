require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');

async function checkDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const session = await Session.findOne({ phone: '917087991506' }); // Assuming this is the phone from earlier
    
    if (session) {
      const recent = session.history.slice(-5);
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

checkDuplicates();
