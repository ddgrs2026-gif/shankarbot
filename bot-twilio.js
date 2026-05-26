require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;
const Database = require('./database-supabase');

const app = express();
const db = new Database();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

// Supabase client for storage uploads
const supabaseStorage = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

const userSessions = new Map();

const DEPARTMENTS = {
    '1': 'Academic',
    '2': 'Hostel',
    '3': 'Faculty',
    '4': 'Infrastructure'
};

function twiml(msg) {
    return `<Response><Message>${msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message></Response>`;
}

// Download Twilio media and upload to Supabase Storage
async function downloadAndUploadTwilioMedia(mediaUrl, grievanceId) {
    try {
        const { data: imageBuffer, headers } = await axios.get(mediaUrl, {
            auth: { username: accountSid, password: authToken },
            responseType: 'arraybuffer'
        });

        const mimeType = headers['content-type'] || 'image/jpeg';
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
        const fileName = `grievances/${grievanceId}_${Date.now()}.${ext}`;

        const { error } = await supabaseStorage.storage
            .from('grievance-media')
            .upload(fileName, Buffer.from(imageBuffer), { contentType: mimeType, upsert: true });

        if (error) throw error;

        const { data } = supabaseStorage.storage
            .from('grievance-media')
            .getPublicUrl(fileName);

        return data.publicUrl;
    } catch (err) {
        console.error('Twilio media upload error:', err.message);
        return null;
    }
}

app.post('/webhook', async (req, res) => {
    const userId = (req.body.From || '').trim();
    const userMessage = (req.body.Body || '').trim();
    const mediaUrl = req.body.MediaUrl0 || null;
    const numMedia = parseInt(req.body.NumMedia || '0');
    const hasImage = numMedia > 0 && mediaUrl;

    if (!userId) {
        res.set('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
    }

    console.log(`Message from ${userId}: ${userMessage || '[image]'}`);

    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: 'start' });
    }
    const session = userSessions.get(userId);

    // ── Handle image during image step ──
    if (hasImage && session.step === 'image') {
        res.set('Content-Type', 'text/xml');
        res.status(200).send(twiml('⏳ Uploading your image...'));

        const tempId = `TEMP_${Date.now()}`;
        const imageUrl = await downloadAndUploadTwilioMedia(mediaUrl, tempId);
        if (imageUrl) {
            session.imageUrl = imageUrl;
            session.step = 'confirm';
            await client.messages.create({
                body:
                    '✅ Image attached!\n\n' +
                    '📝 Summary:\n' +
                    `Category: ${session.department}\n` +
                    `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                    (!session.isAnonymous ? `Name: ${session.userName}\nRole: ${session.userRole}\n` : '') +
                    `Grievance: ${session.grievance}\n` +
                    `Image: ✅ Attached\n\n` +
                    'Type "confirm" to submit or "cancel" to restart',
                from: TWILIO_WHATSAPP_NUMBER,
                to: userId
            });
        } else {
            await client.messages.create({
                body: '❌ Failed to upload image. Type "skip" to continue without image or send again.',
                from: TWILIO_WHATSAPP_NUMBER,
                to: userId
            });
        }
        return;
    }

    if (hasImage && session.step !== 'image') {
        res.set('Content-Type', 'text/xml');
        return res.status(200).send(twiml('📷 Image received but not expected at this step. Please follow the conversation flow.'));
    }

    if (!userMessage) {
        res.set('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
    }

    // ── Track command ──
    if (userMessage.toLowerCase().startsWith('track ')) {
        const trackingId = userMessage.split(' ')[1];
        const grievance = await db.getGrievanceById(trackingId);
        let responseMessage;
        if (grievance) {
            const actions = await db.getGrievanceActions(grievance.id);
            const latestAction = actions?.length > 0 ? actions[actions.length - 1] : null;
            responseMessage =
                `📋 Grievance Status\n\n` +
                `Tracking ID: ${grievance.grievance_id}\n` +
                `Category: ${grievance.category}\n` +
                `Status: ${grievance.status}\n` +
                `Submitted: ${new Date(grievance.created_at).toLocaleString()}\n\n`;
            if (latestAction?.remarks) {
                responseMessage += `📝 Latest Remark:\n${latestAction.remarks}\nBy: ${latestAction.admin_name || 'Admin'}\n\n`;
            } else {
                responseMessage += `Your grievance is being reviewed.\n\n`;
            }
            responseMessage += `Type "start" to submit a new grievance.`;
        } else {
            responseMessage = `❌ Tracking ID ${trackingId} not found.\n\nPlease check the ID and try again.`;
        }
        res.set('Content-Type', 'text/xml');
        return res.status(200).send(twiml(responseMessage));
    }

    try {
        let responseMessage = '';

        if (userMessage.toLowerCase() === 'start' || session.step === 'start') {
            session.step = 'anonymous';
            responseMessage =
                '👋 Welcome to College Grievance Management System\n\n' +
                'Do you want to submit anonymously?\n' +
                '1️⃣ Yes (Anonymous)\n' +
                '2️⃣ No (With my details)\n\n' +
                'Reply with 1 or 2';

        } else if (session.step === 'anonymous') {
            if (userMessage === '1') {
                session.isAnonymous = true;
                session.step = 'category';
                responseMessage =
                    '✅ Anonymous submission selected\n\n' +
                    'Select Category:\n' +
                    '1️⃣ Academic\n2️⃣ Hostel\n3️⃣ Faculty\n4️⃣ Infrastructure\n\n' +
                    'Reply with the number (1-4)';
            } else if (userMessage === '2') {
                session.isAnonymous = false;
                session.step = 'name';
                responseMessage = '✅ Submission with details\n\nPlease enter your full name:';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with 1 or 2.';
            }

        } else if (session.step === 'name') {
            session.userName = userMessage;
            session.step = 'role';
            responseMessage =
                `✅ Name: ${session.userName}\n\n` +
                'Select your role:\n' +
                '1️⃣ Student\n2️⃣ Faculty\n3️⃣ Staff\n\n' +
                'Reply with 1, 2, or 3';

        } else if (session.step === 'role') {
            const roles = { '1': 'Student', '2': 'Faculty', '3': 'Staff' };
            if (roles[userMessage]) {
                session.userRole = roles[userMessage];
                session.step = 'category';
                responseMessage =
                    `✅ Role: ${session.userRole}\n\n` +
                    'Select Category:\n' +
                    '1️⃣ Academic\n2️⃣ Hostel\n3️⃣ Faculty\n4️⃣ Infrastructure\n\n' +
                    'Reply with the number (1-4)';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with 1, 2, or 3.';
            }

        } else if (session.step === 'category') {
            if (DEPARTMENTS[userMessage]) {
                session.department = DEPARTMENTS[userMessage];
                session.step = 'grievance';
                responseMessage = `✅ Category: ${session.department}\n\nPlease describe your grievance:`;
            } else {
                responseMessage = '❌ Invalid selection. Please reply with a number between 1-4.';
            }

        } else if (session.step === 'grievance') {
            session.grievance = userMessage;
            session.step = 'image';
            responseMessage =
                '✅ Grievance noted.\n\n' +
                '📷 Do you want to attach an image as evidence?\n\n' +
                'Send an image now, or type "skip" to continue without one.';

        } else if (session.step === 'image') {
            if (userMessage.toLowerCase() === 'skip') {
                session.imageUrl = null;
                session.step = 'confirm';
                responseMessage =
                    '📝 Summary:\n' +
                    `Category: ${session.department}\n` +
                    `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                    (!session.isAnonymous ? `Name: ${session.userName}\nRole: ${session.userRole}\n` : '') +
                    `Grievance: ${session.grievance}\n` +
                    `Image: ❌ None\n\n` +
                    'Type "confirm" to submit or "cancel" to restart';
            } else {
                responseMessage = '📷 Please send an image or type "skip" to continue without one.';
            }

        } else if (session.step === 'confirm') {
            if (userMessage.toLowerCase() === 'confirm') {
                const displayUserId = session.isAnonymous ? 'Anonymous' : userId;
                const grievanceId = await db.addGrievance({
                    userId: displayUserId,
                    department: session.department,
                    grievance: session.grievance,
                    status: 'Pending',
                    isAnonymous: session.isAnonymous,
                    userName: session.userName || null,
                    userRole: session.userRole || null,
                    mediaUrls: '[]',
                    imageUrl: session.imageUrl || null
                });
                responseMessage =
                    `✅ Grievance submitted!\n` +
                    `Tracking ID: ${grievanceId}\n\n` +
                    `Track anytime: track ${grievanceId}\n\n` +
                    `Type "start" to submit another.`;
                userSessions.delete(userId);
            } else if (userMessage.toLowerCase() === 'cancel') {
                userSessions.delete(userId);
                responseMessage = '❌ Cancelled. Type "start" to begin again.';
            } else {
                responseMessage = 'Please type "confirm" or "cancel"';
            }
        }

        res.set('Content-Type', 'text/xml');
        res.status(200).send(twiml(responseMessage));

    } catch (error) {
        console.error('Error:', error.message);
        res.set('Content-Type', 'text/xml');
        res.status(500).send('<Response></Response>');
    }
});

// ─── Admin notify endpoint ─────────────────────────────────────────────────
app.post('/notify', async (req, res) => {
    const { grievanceId, remarks, newStatus, adminName } = req.body;
    if (!grievanceId || !remarks) return res.status(400).json({ error: 'grievanceId and remarks required' });
    try {
        const grievance = await db.getGrievanceById(grievanceId);
        if (!grievance) return res.status(404).json({ error: 'Grievance not found' });
        const userId = grievance.user_id;
        if (!userId || userId === 'Anonymous') return res.status(200).json({ message: 'Anonymous — skipped' });
        const toNumber = userId.startsWith('whatsapp:') ? userId : `whatsapp:${userId}`;
        const message =
            `📢 Update on grievance ${grievanceId}\n\n` +
            `Status: ${newStatus || 'Updated'}\n` +
            `Remarks: ${remarks}\nBy: ${adminName || 'Admin'}\n\n` +
            `Reply "track ${grievanceId}" for full status.`;
        await client.messages.create({ body: message, from: TWILIO_WHATSAPP_NUMBER, to: toNumber });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ WhatsApp Bot running on port ${PORT}`);
    console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
});
