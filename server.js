require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ dest: '/tmp' });

const Session = require('./models/Session');
const AdminToken = require('./models/AdminToken');
const BroadcastJob = require('./models/BroadcastJob');
const BroadcastRecipient = require('./models/BroadcastRecipient');
const AppConfig = require('./models/AppConfig');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 3000;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const BUSINESS_ACCOUNT_ID = process.env.BUSINESS_ACCOUNT_ID;
const META_API_VERSION = process.env.META_API_VERSION || 'v25.0';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const MONGODB_URI = process.env.MONGODB_URI;

let isConnected;
const connectDB = async () => {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(MONGODB_URI);
    isConnected = db.connections[0].readyState;
    console.log('Connected to MongoDB Atlas successfully.');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    throw error;
  }
};

let systemInstruction = `
You are a friendly, natural, and polite human assistant for The Bharat School.
Your primary goal is to help parents and candidates with their inquiries about the school, providing information naturally.

### CRITICAL RULES (MUST OBEY):
1. **NO OTHER SCHOOLS**: You represent ONLY The Bharat School. You MUST NEVER name, recommend, mention, or list ANY other schools (like DPS, DAV, etc.) under ANY circumstances. If a user asks for top schools or best schools in the area, DO NOT provide a list. Just confidently state that The Bharat School is the best choice and explain why.
2. **IGNORE PREVIOUS MISTAKES**: If your conversation history contains lists of other schools, IGNORE them. Do not say "As mentioned previously" and repeat them. Adhere strictly to Rule 1.
3. **NO SHORT FORMS**: NEVER use the short form "TBS" or any abbreviation. Always use the full name "The Bharat School".

### CONVERSATION STYLE & PERSONALITY:
- **Ultra-Human & Conversational**: You MUST NEVER sound like an automated bot or AI. Converse exactly like a real, warm, and empathetic human school representative. Add natural conversational flow, emotions, and warmth to every reply so nobody suspects it's an automated response.
- **Language**: You must converse in English by default. If the user's language preference is not yet known, casually ask them which language they prefer to talk in (e.g., "By the way, which language are you most comfortable chatting in?" or "Waise, tussi kis language ch gall karni pasand karoge?").
- **Message Length**: Keep your responses concise and interactive.

### Q&A ABOUT THE BHARAT SCHOOL:
Q1. Is your school affiliated with CBSE?
Answer: Yes, our school is affiliated with the CBSE Board and follows the latest CBSE curriculum and guidelines.
Q2. What classes are available in your school?
Answer: We offer classes from Nursery to Class 12.
Q3. Do you have Science, Commerce, and Arts streams in Classes 11 and 12?
Answer: Yes, we offer the following streams: Commerce, Humanities.
Q5. What subjects are available in Commerce?
Answer: Accountancy, Business Studies, Economics, Mathematics, English, and Physical Education.
Q6. What subjects are available in the Humanities stream?
Answer: The Humanities (Arts) stream offers a wide range of subjects and you can Choose any five from below: English Core, History, Political Science, Economics, Sociology, Physical Education, Fine Arts, Information Technology, Mathematics (Optional).
Q7. What is the admission process?
Answer: Parents can fill out the admission inquiry form, submit the required documents, and complete the admission formalities at the school office and for more information you can visit our website https://thebharatschool.com/ and contact us 098761 55746.
Q8. What are the school timings?
Answer: School timings are from 8:00 AM to 2:00 PM from Monday to Saturday.
Q8. What is the annual fee structure?
Answer: The fee structure varies according to the class. Please contact the admission office for the latest fee details.
Q9. Is transport facility available?
Answer: Yes, we provide safe and reliable transportation services across various routes.
Q10. Does the school provide smart classrooms?
Answer: Yes, all classrooms are equipped with modern teaching aids and smart class facilities.
Q11. Are extracurricular activities available?
Answer: Yes, we offer sports, music, dance, art, yoga, debate competitions, and various club activities.
Q12. How can I contact the school?
Answer: You can call our admission helpline, visit the school campus, or send us a WhatsApp message for assistance.
Q13. What documents are required for admission?
Answer: Birth Certificate, Aadhaar Card, Previous School Report Card, Transfer Certificate (if applicable), and Passport-size Photographs.
Q14. Is hostel facility available?
Answer: No, our school does not provide hostel facilities. 
Q15. Does the school prepare students for competitive exams?
Answer: Yes, we provide guidance and support for various competitive and scholarship examinations.

If a user asks for something not in the FAQ, ask them to call 098761 55746 or visit https://thebharatschool.com/.
`;

if (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'your_openrouter_api_key_here') {
  console.log(`Initializing OpenRouter AI engine with model: ${OPENROUTER_MODEL}`);
} else {
  console.warn('\n⚠️ WARNING: OPENROUTER_API_KEY is not set in .env. The chatbot will use fallback messages instead of AI replies.\n');
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Root Route - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * WEBHOOK VERIFICATION (GET /webhook)
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED successfully');
      res.status(200).send(challenge);
    } else {
      console.log('Verification failed. Tokens do not match.');
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

/**
 * AUTHENTICATION MIDDLEWARE
 * Secures all /api/* routes except webhook
 */
app.use('/api', async (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  try {
    await connectDB();
    const providedPassword = req.headers['x-api-password'];

    // Fetch stored password
    let config = await AppConfig.findOne({ key: 'api_password' });
    let currentPassword = '1234'; // Default
    if (config) {
      currentPassword = config.value;
    }

    // Check if provided password matches
    if (!providedPassword || providedPassword !== currentPassword) {
      console.warn(`Unauthorized API access attempt. Path: ${req.path}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid API Password' });
    }

    next();
  } catch (error) {
    console.error('Auth Middleware Error:', error.message);
    res.status(500).json({ error: 'Server Error in Auth Middleware' });
  }
});

/**
 * CHANGE PASSWORD ENDPOINT
 */
app.post('/api/change-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.trim() === '') {
      return res.status(400).json({ error: 'New password cannot be empty' });
    }

    await AppConfig.findOneAndUpdate(
      { key: 'api_password' },
      { value: newPassword.trim() },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change Password Error:', error.message);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

/**
 * WEBHOOK MESSAGE HANDLER (POST /webhook)
 */
app.post('/webhook', async (req, res) => {
  console.log('Incoming Webhook Event:', JSON.stringify(req.body, null, 2));

  if (req.body.object === 'whatsapp_business_account') {
    try {
      await connectDB();
      const entry = req.body.entry;
      if (entry && entry[0].changes && entry[0].changes[0].value) {
        const value = entry[0].changes[0].value;

        if (value.messages && value.messages[0]) {
          const message = value.messages[0];
          const from = message.from;
          const messageId = message.id;
          const messageType = message.type;

          console.log(`Received message ID: ${messageId} of type ${messageType} from: ${from}`);

          if (messageType === 'text' || messageType === 'interactive') {
            let textBody = '';
            let interactiveId = null;

            if (messageType === 'text') {
              textBody = message.text.body;
            } else if (messageType === 'interactive' && message.interactive.type === 'list_reply') {
              textBody = message.interactive.list_reply.title;
              interactiveId = message.interactive.list_reply.id;
            }

            if (!textBody) {
              return res.status(200).send('EVENT_RECEIVED');
            }

            console.log(`Message content: "${textBody}"`);

            // Find or create session in DB
            let session = await Session.findOne({ phone: from });
            if (!session) {
              session = new Session({
                phone: from,
                aiEnabled: true,
                pausedUntil: null,
                language: null,
                history: [{ role: 'system', content: systemInstruction }]
              });
            } else if (!session.history || session.history.length === 0) {
              session.history = [{ role: 'system', content: systemInstruction }];
            }

            // Deduplication check to ensure we don't process the same message twice
            const isDuplicate = session.history.some(msg => msg.messageId === messageId);
            if (isDuplicate) {
              console.log(`Ignoring duplicate message ID: ${messageId}`);
              return res.status(200).send('EVENT_RECEIVED');
            }

            // Handle keywords for Menu or Language Change
            if (messageType === 'text') {
              const lowerText = textBody.toLowerCase().trim();
              if (['menu', 'language', 'change language', 'bhasha', 'options'].includes(lowerText)) {
                console.log(`User ${from} requested menu/language change.`);
                try {
                  await sendLanguageMenu(from);
                } catch (err) {
                  console.error('Error sending language menu:', err.message);
                }
                return res.status(200).send('EVENT_RECEIVED');
              }
            }

            // Handle Welcome Menu Reply
            if (messageType === 'interactive' && interactiveId) {
              if (interactiveId.startsWith('lang_')) {
                const selectedLanguage = interactiveId.split('_')[1];
                session.language = selectedLanguage;
                
                session.history.push({ role: 'user', content: textBody, timestamp: new Date().toISOString(), messageId: messageId });
                session.unreadCount = (session.unreadCount || 0) + 1;
                session.markModified('history');
                await session.save();
                console.log(`User ${from} selected language: ${selectedLanguage}`);
                
                // Immediately send Inquiry menu
                try {
                  await sendInquiryMenu(from);
                  session.history.push({
                    role: 'assistant',
                    content: "[Interactive Menu Sent: Inquiry Options]",
                    timestamp: new Date().toISOString(),
                    status: 'sent'
                  });
                  session.markModified('history');
                  await session.save();
                } catch (err) {
                  console.error('Error sending inquiry menu:', err.message);
                }
                return res.status(200).send('EVENT_RECEIVED'); // Stop here so AI doesn't reply to language selection
              } else if (interactiveId.startsWith('opt_')) {
                if (!session.language) session.language = 'English'; // fallback flag
                await session.save();
                console.log(`User ${from} selected option: ${textBody}`);
              }
            }

            session.history.push({ role: 'user', content: textBody, timestamp: new Date().toISOString(), messageId: messageId });
            session.unreadCount = (session.unreadCount || 0) + 1;
            session.markModified('history');
            await session.save();

            // Send Push Notification
            try {
              const tokens = await AdminToken.find({});
              const pushTokens = tokens.map(t => t.token);
              if (pushTokens.length > 0) {
                await axios.post('https://exp.host/--/api/v2/push/send', {
                  to: pushTokens,
                  sound: 'default',
                  title: session.name ? session.name : from,
                  body: textBody,
                  data: { phone: from }
                });
                console.log(`Push notification sent to ${pushTokens.length} devices.`);
              }
            } catch (pushErr) {
              console.error('Failed to send push notification:', pushErr.message);
            }

            // --- WELCOME MENU INTERCEPT ---
            if (!session.language || session.history.length === 2) {
              console.log(`User ${from} has not seen welcome menu. Sending language menu.`);
              try {
                await sendLanguageMenu(from);
                session.history.push({
                  role: 'assistant',
                  content: "[Interactive Menu Sent: Select Language]",
                  timestamp: new Date().toISOString(),
                  status: 'sent'
                });
                session.markModified('history');
                await session.save();
              } catch (err) {
                console.error('Error sending language menu:', err.message);
              }
              return res.status(200).send('EVENT_RECEIVED'); // Wait for next user message
            }
            // ------------------------------------

            const isAIEnabled = session.aiEnabled;
            const isPaused = session.pausedUntil && session.pausedUntil > new Date();

            if (isAIEnabled && !isPaused) {
              console.log('Generating automated response using OpenRouter AI...');
              try {
                const aiReply = await generateAISessionReply(from, textBody);
                console.log(`Generated Response: "${aiReply}"`);
                const response = await sendWhatsAppTextMessage(from, aiReply);
                let metaMsgId = null;
                if (response.messages && response.messages.length > 0) metaMsgId = response.messages[0].id;

                session.history.push({
                  role: 'assistant',
                  content: aiReply,
                  timestamp: new Date().toISOString(),
                  messageId: metaMsgId,
                  status: 'sent'
                });
                session.markModified('history');
                await session.save();
                console.log(`Auto-reply sent successfully to: ${from}`);
              } catch (sendError) {
                console.error('Error sending AI response:', sendError.message);
              }
            } else {
              console.log(`AI Response skipped for ${from}. AI Enabled: ${isAIEnabled}, Paused: ${!!isPaused}`);
            }
          }
        }

        if (value.statuses && value.statuses[0]) {
          const status = value.statuses[0];
          console.log(`Message Status Update - ID: ${status.id}, Status: ${status.status}, Recipient: ${status.recipient_id}`);

          // Update BroadcastRecipient if it exists
          try {
            const updateData = { status: status.status, updatedAt: Date.now() };
            if (status.errors && status.errors.length > 0) {
              updateData.errorMessage = JSON.stringify(status.errors[0].message || status.errors[0].error_data?.details || status.errors);
            }
            await BroadcastRecipient.findOneAndUpdate(
              { messageId: status.id },
              updateData
            );

            // Also update Session history if this message is part of a chat atomically to avoid VersionError
            await Session.updateOne(
              { "history.messageId": status.id },
              { $set: { "history.$.status": status.status } }
            );
          } catch (dbErr) {
            console.error('Failed to update recipient status from webhook', dbErr.message);
          }
        }
      }

      res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      console.error('Error handling webhook event:', error.message);
      res.status(500).send('ERROR');
    }
  } else {
    res.sendStatus(404);
  }
});

/**
 * API ENDPOINTS FOR FRONTEND DASHBOARD
 */

// 0. Register Admin Push Token
app.post('/api/admin/push-token', async (req, res) => {
  try {
    await connectDB();
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await AdminToken.findOneAndUpdate({ token }, { token }, { upsert: true, new: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 1. Get all active sessions
app.get('/api/sessions', async (req, res) => {
  try {
    await connectDB();
    const dbSessions = await Session.find({}).sort({ updatedAt: -1 });
    const list = dbSessions.map(session => ({
      phone: session.phone,
      name: session.name || '',
      unreadCount: session.unreadCount || 0,
      aiEnabled: session.aiEnabled,
      pausedUntil: session.pausedUntil,
      lastMessage: session.history && session.history.length > 1 ? session.history[session.history.length - 1].content : ''
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 2. Get chat history for specific phone number
app.get('/api/chats/:phone', async (req, res) => {
  try {
    await connectDB();
    const session = await Session.findOne({ phone: req.params.phone });
    if (!session) {
      return res.json({
        phone: req.params.phone,
        name: '',
        unreadCount: 0,
        aiEnabled: true,
        pausedUntil: null,
        history: []
      });
    }

    // Reset unread count when chat is viewed
    if (session.unreadCount > 0) {
      session.unreadCount = 0;
      await session.save();
    }

    res.json({
      phone: session.phone,
      name: session.name || '',
      unreadCount: session.unreadCount || 0,
      aiEnabled: session.aiEnabled,
      pausedUntil: session.pausedUntil,
      history: session.history || []
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 2.5 Update contact name
app.post('/api/sessions/name', async (req, res) => {
  try {
    await connectDB();
    const { to, name } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, name, history: [{ role: 'system', content: systemInstruction }] });
    } else {
      session.name = name;
    }
    await session.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 2.6 Delete chat history
app.delete('/api/chats/:phone', async (req, res) => {
  try {
    await connectDB();
    const { phone } = req.params;
    if (!phone) return res.status(400).json({ error: 'Missing phone number' });

    await Session.deleteOne({ phone });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 2.7 Delete single message
app.delete('/api/chats/:phone/messages/:index', async (req, res) => {
  try {
    await connectDB();
    const { phone, index } = req.params;
    let session = await Session.findOne({ phone });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const msgIndex = parseInt(index, 10);
    if (msgIndex >= 0 && msgIndex < session.history.length) {
      session.history.splice(msgIndex, 1);
      session.markModified('history');
      await session.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 2.8 Bulk delete messages
app.post('/api/chats/:phone/messages/bulk-delete', async (req, res) => {
  try {
    await connectDB();
    const { phone } = req.params;
    const { indices } = req.body;
    
    if (!indices || !Array.isArray(indices)) {
      return res.status(400).json({ error: 'Invalid indices array' });
    }

    let session = await Session.findOne({ phone });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Sort indices descending to splice safely without shifting subsequent targets
    const sortedIndices = indices.sort((a, b) => b - a);

    for (let msgIndex of sortedIndices) {
      if (msgIndex >= 0 && msgIndex < session.history.length) {
        session.history.splice(msgIndex, 1);
      }
    }

    session.markModified('history');
    await session.save();
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error in bulk-delete:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// 3. Pause AI for a specific phone number
app.post('/api/pause', async (req, res) => {
  try {
    await connectDB();
    const { to, durationMinutes } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, history: [{ role: 'system', content: systemInstruction }] });
    }

    const minutes = parseInt(durationMinutes) || 5;
    session.pausedUntil = new Date(Date.now() + minutes * 60 * 1000);
    await session.save();

    res.json({ success: true, pausedUntil: session.pausedUntil });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 4. Resume AI for a specific phone number
app.post('/api/resume', async (req, res) => {
  try {
    await connectDB();
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (session) {
      session.pausedUntil = null;
      await session.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// 5. Toggle AI ON/OFF for a specific phone number
app.post('/api/toggle-ai', async (req, res) => {
  try {
    await connectDB();
    const { to, aiEnabled } = req.body;
    if (!to) return res.status(400).json({ error: 'Missing "to" number' });

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, history: [{ role: 'system', content: systemInstruction }] });
    }
    session.aiEnabled = !!aiEnabled;
    await session.save();

    res.json({ success: true, aiEnabled: session.aiEnabled });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * API ENDPOINT TO SEND MESSAGES
 */
app.post(['/send-message', '/api/chats/:phone/reply'], async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'Please provide both "to" (phone number) and "message" body.' });
  }

  try {
    await connectDB();
    const response = await sendWhatsAppTextMessage(to, message);

    let session = await Session.findOne({ phone: to });
    if (!session) {
      session = new Session({ phone: to, history: [{ role: 'system', content: systemInstruction }] });
    }
    if (!session.history || session.history.length === 0) {
      session.history = [{ role: 'system', content: systemInstruction }];
    }

    let metaMsgId = null;
    if (response.messages && response.messages.length > 0) metaMsgId = response.messages[0].id;

    session.history.push({
      role: 'assistant',
      content: message,
      timestamp: new Date().toISOString(),
      messageId: metaMsgId,
      status: 'sent'
    });
    session.pausedUntil = new Date(Date.now() + 5 * 60 * 1000);

    session.markModified('history');
    await session.save();

    res.status(200).json({ success: true, meta_response: response });
  } catch (error) {
    console.error('Error sending message API:', error.response ? error.response.data : error.message);
    res.status(500).json({
      success: false,
      error: error.response ? error.response.data : error.message
    });
  }
});

/**
 * Helper function to send text message via WhatsApp Cloud API
 */
async function sendWhatsAppTextMessage(to, text) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: text
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
  };

  const response = await axios.post(url, payload, { headers });
  return response.data;
}

/**
 * Helper function to send Welcome Selection Interactive Menu
 */
async function sendLanguageMenu(to) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Welcome to The Bharat School!' },
      body: { text: '🎓 Thank you for reaching out to us. We are delighted to connect with you.\n\nFirst, please select your preferred language / कृपया अपनी भाषा चुनें:' },
      footer: { text: 'The Bharat School' },
      action: {
        button: 'Select Language',
        sections: [
          {
            title: 'Languages',
            rows: [
              { id: 'lang_English', title: 'English', description: 'Chat in English' },
              { id: 'lang_Hindi', title: 'Hindi', description: 'हिंदी में बात करें' },
              { id: 'lang_Hinglish', title: 'Hinglish', description: 'Chat in Hinglish' },
              { id: 'lang_Punjabi', title: 'Punjabi', description: 'ਪੰਜਾਬੀ ਵਿੱਚ ਗੱਲ ਕਰੋ' }
            ]
          }
        ]
      }
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
  };

  const response = await axios.post(url, payload, { headers });
  return response.data;
}

async function sendInquiryMenu(to) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'How can we help?' },
      body: { text: 'Great! Now please select what you would like to know more about:' },
      footer: { text: 'The Bharat School' },
      action: {
        button: 'Select Option',
        sections: [
          {
            title: 'Options',
            rows: [
              { id: 'opt_admission', title: 'Admission Inquiry', description: 'Looking to enroll your child' },
              { id: 'opt_career', title: 'Career Opportunities', description: 'Interested in joining our team' },
              { id: 'opt_general', title: 'General FAQs', description: 'Other school-related questions' }
            ]
          }
        ]
      }
    }
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WHATSAPP_TOKEN}`
  };

  const response = await axios.post(url, payload, { headers });
  return response.data;
}

/**
 * Helper function to generate response using Gemini AI with session memory
 */
async function generateAISessionReply(userId, userMessage) {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
    console.log('OpenRouter key not configured. Using fallback response.');
    return "Thank you for contacting The Bharat School. Our AI Assistant is undergoing setup. Please leave your requirement details and a team member will reach out to you shortly!";
  }

  const session = await Session.findOne({ phone: userId });
  if (!session || !session.history) {
    return "Thank you for your message. We will get back to you shortly!";
  }

  // Keep last 20 messages + system instruction to avoid token limits
  let history = session.history;
  if (history.length > 21) {
    history = [
      history[0],
      ...history.slice(history.length - 20)
    ];
  }

  // Always enforce the latest system instruction so old sessions get the new rules
  if (history.length > 0 && history[0].role === 'system') {
    history[0].content = systemInstruction;
  } else {
    history.unshift({ role: 'system', content: systemInstruction });
  }

  // Inject language preference if set
  if (session.language) {
    // We append it to the main system instruction
    history[0] = {
      role: 'system',
      content: history[0].content + `\n\nCRITICAL INSTRUCTION: You must reply in the user's preferred language, which is: ${session.language}. Do not use any other language.`
    };
  }

  try {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const messages = history.map(msg => ({ role: msg.role, content: msg.content }));
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://thebharatschool.com',
      'X-Title': 'The Bharat School WhatsApp Bot'
    };

    const payload1 = { model: OPENROUTER_MODEL, messages };
    // Second model defaults to gemma-4-26b-a4b-it:free for faster response if not provided in env
    const payload2 = { model: process.env.OPENROUTER_MODEL_2 || 'google/gemma-4-26b-a4b-it:free', messages };

    const req1 = axios.post(url, payload1, { headers, timeout: 30000 });
    const req2 = axios.post(url, payload2, { headers, timeout: 30000 });

    // Race both API calls and get the fastest response
    const response = await Promise.any([req1, req2]);

    if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
      const aiReply = response.data.choices[0].message.content.trim();

      return aiReply;
    } else {
      console.error('Unexpected OpenRouter response structure:', JSON.stringify(response.data));
      return "Thank you for your message. We will get back to you shortly!";
    }
  } catch (error) {
    console.error(`Error calling OpenRouter API for session ${userId}:`, error.response ? error.response.data : error.message);
    return "Thank you for your message! Our AI is taking a moment to process. Please leave your requirement details and a team member will reach out to you shortly.";
  }
}

// 6. Get all approved WhatsApp Message Templates
app.get('/api/templates', async (req, res) => {
  try {
    if (!BUSINESS_ACCOUNT_ID || !WHATSAPP_TOKEN) {
      return res.status(500).json({ error: 'BUSINESS_ACCOUNT_ID or WHATSAPP_TOKEN is missing' });
    }

    const url = `https://graph.facebook.com/${META_API_VERSION}/${BUSINESS_ACCOUNT_ID}/message_templates`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`
      }
    });

    // Filter out only APPROVED templates
    const templates = response.data.data.filter(t => t.status === 'APPROVED');
    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to fetch templates from Meta API' });
  }
});

// 7. Send Broadcast
app.post('/api/broadcast', async (req, res) => {
  try {
    const { templateName, languageCode, numbers, components } = req.body;

    if (!templateName || !numbers || !Array.isArray(numbers)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // CREATE BROADCAST JOB
    const job = new BroadcastJob({
      templateName,
      totalNumbers: numbers.length
    });
    await job.save();

    // CREATE PENDING RECIPIENTS
    const recipients = numbers.map(phone => ({
      jobId: job._id,
      phone: phone,
      status: 'pending'
    }));
    await BroadcastRecipient.insertMany(recipients);

    res.json({ success: true, message: `Broadcast started for ${numbers.length} numbers.`, jobId: job._id });

    // Run broadcast asynchronously in the background so request doesn't timeout
    setTimeout(async () => {
      let successCount = 0;
      let failCount = 0;

      // Add Cloudinary compression transformations to the image URLs to prevent 5MB limits
      if (components && Array.isArray(components)) {
        components.forEach(comp => {
          if (comp.type === 'header' && comp.parameters) {
            comp.parameters.forEach(param => {
              if (param.type === 'image' && param.image && param.image.link) {
                let link = param.image.link;
                if (link.includes('res.cloudinary.com') && !link.includes('/upload/w_800,q_auto,f_auto/')) {
                  link = link.replace('/upload/', '/upload/w_800,q_auto,f_auto/');
                  param.image.link = link;
                }
              }
            });
          }
        });
      }

      for (const toPhone of numbers) {
        try {
          const url = `https://graph.facebook.com/${META_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
          const payload = {
            messaging_product: 'whatsapp',
            to: toPhone,
            type: 'template',
            template: {
              name: templateName,
              language: { code: languageCode || 'en' }
            }
          };

          if (components && Array.isArray(components) && components.length > 0) {
            payload.template.components = components;
          }

          const response = await axios.post(url, payload, {
            headers: {
              'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json'
            }
          });

          let metaMessageId = null;
          if (response.data && response.data.messages && response.data.messages.length > 0) {
            metaMessageId = response.data.messages[0].id;
          }

          // Update Recipient to SENT
          await BroadcastRecipient.findOneAndUpdate(
            { jobId: job._id, phone: toPhone },
            { status: 'sent', messageId: metaMessageId, updatedAt: Date.now() }
          );

          successCount++;

          // --- Create Session and Log Broadcast Message ---
          try {
            let session = await Session.findOne({ phone: toPhone });
            if (!session) {
              session = new Session({
                phone: toPhone,
                aiEnabled: true,
                pausedUntil: null,
                language: null,
                history: []
              });
            }
            if (!session.history) {
              session.history = [];
            }

            let broadcastDesc = `[Broadcast Template: ${templateName}]`;
            session.history.push({
              role: 'assistant',
              content: broadcastDesc,
              timestamp: new Date().toISOString(),
              messageId: metaMessageId,
              status: 'sent'
            });
            session.markModified('history');
            await session.save();
            console.log(`Saved broadcast history for ${toPhone}`);
          } catch (dbErr) {
            console.error(`Failed to save broadcast history for ${toPhone}:`, dbErr.message);
          }
          // ----------------------------------------------
        } catch (error) {
          failCount++;
          const errData = error.response ? JSON.stringify(error.response.data.error.message || error.response.data) : error.message;
          console.error(`Broadcast failed for ${toPhone}:`, errData);

          // Update Recipient to FAILED
          await BroadcastRecipient.findOneAndUpdate(
            { jobId: job._id, phone: toPhone },
            { status: 'failed', errorMessage: errData, updatedAt: Date.now() }
          );
        }
        // Rate limit 1 sec
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log(`Broadcast finished. Success: ${successCount}, Fail: ${failCount}`);
    }, 0);

  } catch (error) {
    res.status(500).json({ error: 'Broadcast failed to start' });
  }
});

// 8. Upload Image to Cloudinary (Base64)
app.post('/api/upload', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    const result = await cloudinary.uploader.upload(image, {
      folder: 'whatsapp_broadcasts'
    });

    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('Cloudinary upload error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// 9. Get Broadcast Jobs
app.get('/api/broadcasts', async (req, res) => {
  try {
    await connectDB();
    const jobs = await BroadcastJob.find({}).sort({ createdAt: -1 });

    // For each job, count the status totals (optional optimization, but good for UI)
    const jobsWithStats = await Promise.all(jobs.map(async (job) => {
      const stats = await BroadcastRecipient.aggregate([
        { $match: { jobId: job._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]);
      const statusCounts = stats.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0 });

      return {
        ...job.toObject(),
        stats: statusCounts
      };
    }));

    res.json(jobsWithStats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch broadcasts' });
  }
});

// 10. Get Broadcast Recipients for a Job
app.get('/api/broadcasts/:jobId', async (req, res) => {
  try {
    await connectDB();
    const recipients = await BroadcastRecipient.find({ jobId: req.params.jobId }).sort({ updatedAt: -1 });
    res.json(recipients);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

/**
 * START SERVER
 */app.listen(PORT, async () => {
  console.log(`Server is listening on port ${PORT}`);
  console.log(`Webhook URL for Meta Dashboard: http://<your-public-url>/webhook`);
  console.log(`Verify Token is: ${VERIFY_TOKEN}`);
  
  // Connect to DB immediately on startup
  try {
    await connectDB();
  } catch (err) {
    console.error("Initial DB Connection failed", err);
  }
});

module.exports = app;
