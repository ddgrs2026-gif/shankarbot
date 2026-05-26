require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;
const Database = require('./database-supabase');

const app = express();
const db = new Database();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ddgrs_verify_token';

// Supabase client for storage uploads
const supabaseStorage = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

app.use(bodyParser.json());

// Health check — keeps Render awake via cron pinger
app.get('/', (_req, res) => {
    res.status(200).send('DDGRS Bot is running ✅');
});

// ─── Send text message ─────────────────────────────────────────────────────
async function sendMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } },
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error('Send error:', err.response?.data || err.message);
    }
}

// ─── Download media from Meta and upload to Supabase ──────────────────────
async function downloadAndUploadMedia(mediaId, grievanceId) {
    try {
        // Get media URL from Meta
        const { data: mediaInfo } = await axios.get(
            `https://graph.facebook.com/v19.0/${mediaId}`,
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
        );

        // Download the actual image bytes
        const { data: imageBuffer, headers } = await axios.get(mediaInfo.url, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
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
        console.error('Media upload error:', err.message);
        return null;
    }
}

// ─── Webhook verification ──────────────────────────────────────────────────
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ─── Session store ─────────────────────────────────────────────────────────
const userSessions = new Map();

const DEPARTMENTS = {
    '1': 'Academic',
    '2': 'Hostel',
    '3': 'Faculty',
    '4': 'Infrastructure'
};

// ─── Incoming messages ─────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
    res.sendStatus(200);

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const userId = msg.from;
    const userMessage = msg.text?.body?.trim() || '';
    const isImage = msg.type === 'image';
    const mediaId = isImage ? msg.image?.id : null;

    console.log(`Message from ${userId}: ${userMessage || '[image]'}`);

    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: 'start' });
    }
    const session = userSessions.get(userId);

    // ── Handle image during image step ──
    if (isImage && session.step === 'image') {
        await sendMessage(userId, '⏳ Uploading your image...');
        const tempId = `TEMP_${Date.now()}`;
        const imageUrl = await downloadAndUploadMedia(mediaId, tempId);
        if (imageUrl) {
            session.imageUrl = imageUrl;
            session.step = 'confirm';
            await sendMessage(userId,
                '✅ Image attached!\n\n' +
                '📝 Summary:\n' +
                `Category: ${session.department}\n` +
                `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                (!session.isAnonymous ? `Name: ${session.userName}\nRole: ${session.userRole}\n` : '') +
                `Grievance: ${session.grievance}\n` +
                `Image: ✅ Attached\n\n` +
                'Type "confirm" to submit or "cancel" to restart'
            );
        } else {
            await sendMessage(userId, '❌ Failed to upload image. Type "skip" to continue without image or send again.');
        }
        return;
    }

    if (isImage && session.step !== 'image') {
        await sendMessage(userId, '📷 Image received but not expected at this step. Please follow the conversation flow.');
        return;
    }

    if (!userMessage) return;

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
            responseMessage = `❌ Tracking ID ${trackingId} not found.`;
        }
        await sendMessage(userId, responseMessage);
        return;
    }

    try {
        let responseMessage = '';

        if (userMessage.toLowerCase() === 'start' || session.step === 'start') {
            session.step = 'anonymous';
            responseMessage =
                '👋 Welcome to College Grievance Management System\n\n' +
                'Do you want to submit anonymously?\n' +
                '1 - Yes (Anonymous)\n' +
                '2 - No (With my details)\n\n' +
                'Reply with 1 or 2';

        } else if (session.step === 'anonymous') {
            if (userMessage === '1') {
                session.isAnonymous = true;
                session.step = 'category';
                responseMessage =
                    '✅ Anonymous submission selected\n\n' +
                    'Select Category:\n' +
                    '1 - Academic\n2 - Hostel\n3 - Faculty\n4 - Infrastructure\n\n' +
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
                '1 - Student\n2 - Faculty\n3 - Staff\n\n' +
                'Reply with 1, 2, or 3';

        } else if (session.step === 'role') {
            const roles = { '1': 'Student', '2': 'Faculty', '3': 'Staff' };
            if (roles[userMessage]) {
                session.userRole = roles[userMessage];
                session.step = 'category';
                responseMessage =
                    `✅ Role: ${session.userRole}\n\n` +
                    'Select Category:\n' +
                    '1 - Academic\n2 - Hostel\n3 - Faculty\n4 - Infrastructure\n\n' +
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
        } else {
            responseMessage = 'Type "start" to submit a grievance, or "track <ID>" to check status.';
        }

        await sendMessage(userId, responseMessage);

    } catch (error) {
        console.error('Error:', error.message);
        await sendMessage(userId, '⚠️ Something went wrong. Please try again.');
    }
});

// ─── Admin notify endpoint ─────────────────────────────────────────────────
app.post('/notify', async (req, res) => {
    const { grievanceId, remarks, newStatus, adminName } = req.body;
    if (!grievanceId || !remarks) return res.status(400).json({ error: 'grievanceId and remarks required' });
    try {
        const grievance = await db.getGrievanceById(grievanceId);
        if (!grievance) return res.status(404).json({ error: 'Grievance not found' });
        const rawUserId = grievance.user_id;
        if (!rawUserId || rawUserId === 'Anonymous') return res.status(200).json({ message: 'Anonymous — skipped' });
        const phone = rawUserId.replace(/\D/g, '');
        const message =
            `📢 Update on grievance ${grievanceId}\n\n` +
            `Status: ${newStatus || 'Updated'}\n` +
            `Remarks: ${remarks}\nBy: ${adminName || 'Admin'}\n\n` +
            `Reply "track ${grievanceId}" for full status.`;
        await sendMessage(phone, message);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ WhatsApp API Bot running on port ${PORT}`);
    console.log(`📡 Webhook: http://your-domain.com/webhook`);
});
