require('dotenv').config();
const mongoose = require('mongoose');
const Session = require('./models/Session');

async function cleanDuplicates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const sessions = await Session.find({});
    let totalRemoved = 0;

    for (let session of sessions) {
      if (!session.history || session.history.length === 0) continue;

      const uniqueHistory = [];
      const seenMessages = new Set();
      let removedCount = 0;

      for (let msg of session.history) {
        // Create a unique key for the message based on content and role
        // For AI messages, they might have the same content if repeated, or different content.
        // If they have messageId, use that. Otherwise use content + role + rough timestamp
        
        let key;
        if (msg.messageId) {
          key = msg.messageId;
        } else {
          // If no messageId, use role + content
          key = `${msg.role}:${msg.content.substring(0, 50)}`;
        }

        if (seenMessages.has(key)) {
          removedCount++;
          totalRemoved++;
        } else {
          seenMessages.add(key);
          uniqueHistory.push(msg);
        }
      }

      if (removedCount > 0) {
        session.history = uniqueHistory;
        session.markModified('history');
        await session.save();
        console.log(`Cleaned ${removedCount} duplicates from session ${session.phone}`);
      }
    }

    console.log(`Cleanup complete! Removed a total of ${totalRemoved} duplicate messages.`);
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning up DB:', error);
    process.exit(1);
  }
}

cleanDuplicates();
