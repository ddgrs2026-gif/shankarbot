require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Database = require('./database-supabase');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const bodyParser = require('body-parser');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;

const db = new Database();

const supabaseStorage = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code with WhatsApp on 8281660326:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => console.log('✅ WhatsApp Bot is ready! Connected to 8281660326'));
client.on('auth_failure', (msg) => console.error('❌ Auth failed:', msg));
client.on('disconnected', (reason) => console.log('⚠️ Disconnected:', reason));

// Upload image to Supabase Storage
async function uploadImageToSupabase(mediaData, mimeType, grievanceId) {
    try {
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
        const fileName = `grievances/${grievanceId}_${Date.now()}.${ext}`;
        const buffer = Buffer.from(mediaData, 'base64');
        const { error } = await supabaseStorage.storage
            .from('grievance-media')
            .upload(fileName, buffer, { contentType: mimeType, upsert: true });
        if (error) throw error;
        const { data } = supabaseStorage.storage.from('grievance-media').getPublicUrl(fileName);
        return data.publicUrl;
    } catch (err) {
        console.error('Image upload error:', err.message);
        return null;
    }
}

const userSessions = new Map();
const DEPARTMENTS = { '1': 'Academic', '2': 'Hostel', '3': 'Faculty', '4': 'Infrastructure' };

client.on('message', async (msg) => {
    if (msg.isGroupMsg) return;

    const userId = msg.from;
    const userMessage = msg.body.trim();
    const hasMedia = msg.hasMedia && msg.type === 'image';

    console.log(`Message from ${userId}: ${userMessage || '[image]'}`);

    if (!userSessions.has(userId)) userSessions.set(userId, { step: 'start' });
    const session = userSessions.get(userId);

    // Image during image step
    if (hasMedia && session.step === 'image') {
        await msg.reply('⏳ Uploading your image...');
        try {
            const media = await msg.downloadMedia();
            const imageUrl = await uploadImageToSupabase(media.data, media.mimetype, `TEMP_${Date.now()}`);
            if (imageUrl) {
                session.imageUrl = imageUrl;
                session.step = 'confirm';
                await msg.reply(
                    '✅ Image attached!\n\n📝 *Summary:*\n' +
                    `Category: ${session.department}\n` +
                    `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                    (!session.isAnonymous ? `Name: ${session.userName}\nRole: ${session.userRole}\n` : '') +
                    `Grievance: ${session.grievance}\nImage: ✅ Attached\n\n` +
                    'Type *confirm* to submit or *cancel* to restart'
                );
            } else {
                await msg.reply('❌ Failed to upload. Type *skip* to continue without image or send again.');
            }
        } catch (err) {
            console.error('Media error:', err.message);
            await msg.reply('❌ Could not process image. Type *skip* to continue without it.');
        }
        return;
    }

    if (hasMedia && session.step !== 'image') {
        await msg.reply('📷 Image not expected at this step. Please follow the conversation flow.');
        return;
    }

    // Track command
    if (userMessage.toLowerCase().startsWith('track ')) {
        const trackingId = userMessage.split(' ')[1];
        const grievance = await db.getGrievanceById(trackingId);
        let responseMessage;
        if (grievance) {
            const actions = await db.getGrievanceActions(grievance.id);
            const latestAction = actions?.length > 0 ? actions[actions.length - 1] : null;
            responseMessage =
                `📋 *Grievance Status*\n\nTracking ID: ${grievance.grievance_id}\n` +
                `Category: ${grievance.category}\nStatus: ${grievance.status}\n` +
                `Submitted: ${new Date(grievance.created_at).toLocaleString()}\n\n`;
            if (latestAction?.remarks) {
                responseMessage += `📝 *Latest Remark:*\n${latestAction.remarks}\nBy: ${latestAction.admin_name || 'Admin'}\n\n`;
            } else {
                responseMessage += `Your grievance is being reviewed.\n\n`;
            }
            responseMessage += `Type *start* to submit a new grievance.`;
        } else {
            responseMessage = `❌ Tracking ID ${trackingId} not found.`;
        }
        await msg.reply(responseMessage);
        return;
    }

    try {
        let responseMessage = '';

        if (userMessage.toLowerCase() === 'start' || session.step === 'start') {
            session.step = 'anonymous';
            responseMessage =
                '👋 *Welcome to College Grievance Management System*\n\n' +
                'Do you want to submit anonymously?\n1️⃣ Yes (Anonymous)\n2️⃣ No (With my details)\n\nReply with *1* or *2*';

        } else if (session.step === 'anonymous') {
            if (userMessage === '1') {
                session.isAnonymous = true;
                session.step = 'category';
                responseMessage =
                    '✅ Anonymous submission selected\n\n*Select Category:*\n' +
                    '1️⃣ Academic\n2️⃣ Hostel\n3️⃣ Faculty\n4️⃣ Infrastructure\n\nReply with the number (1-4)';
            } else if (userMessage === '2') {
                session.isAnonymous = false;
                session.step = 'name';
                responseMessage = '✅ Submission with details\n\nPlease enter your *full name*:';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with *1* or *2*.';
            }

        } else if (session.step === 'name') {
            session.userName = userMessage;
            session.step = 'role';
            responseMessage =
                `✅ Name: ${session.userName}\n\n*Select your role:*\n` +
                '1️⃣ Student\n2️⃣ Faculty\n3️⃣ Staff\n\nReply with *1*, *2*, or *3*';

        } else if (session.step === 'role') {
            const roles = { '1': 'Student', '2': 'Faculty', '3': 'Staff' };
            if (roles[userMessage]) {
                session.userRole = roles[userMessage];
                session.step = 'category';
                responseMessage =
                    `✅ Role: ${session.userRole}\n\n*Select Category:*\n` +
                    '1️⃣ Academic\n2️⃣ Hostel\n3️⃣ Faculty\n4️⃣ Infrastructure\n\nReply with the number (1-4)';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with *1*, *2*, or *3*.';
            }

        } else if (session.step === 'category') {
            if (DEPARTMENTS[userMessage]) {
                session.department = DEPARTMENTS[userMessage];
                session.step = 'grievance';
                responseMessage = `✅ Category: *${session.department}*\n\nPlease describe your grievance:`;
            } else {
                responseMessage = '❌ Invalid selection. Please reply with a number between *1-4*.';
            }

        } else if (session.step === 'grievance') {
            session.grievance = userMessage;
            session.step = 'image';
            responseMessage =
                '✅ Grievance noted.\n\n📷 Do you want to attach an image as evidence?\n\n' +
                'Send an *image* now, or type *skip* to continue without one.';

        } else if (session.step === 'image') {
            if (userMessage.toLowerCase() === 'skip') {
                session.imageUrl = null;
                session.step = 'confirm';
                responseMessage =
                    '📝 *Summary:*\n' +
                    `Category: ${session.department}\nAnonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n` +
                    (!session.isAnonymous ? `Name: ${session.userName}\nRole: ${session.userRole}\n` : '') +
                    `Grievance: ${session.grievance}\nImage: ❌ None\n\n` +
                    'Type *confirm* to submit or *cancel* to restart';
            } else {
                responseMessage = '📷 Please send an *image* or type *skip* to continue without one.';
            }

        } else if (session.step === 'confirm') {
            if (userMessage.toLowerCase() === 'confirm') {
                const grievanceId = await db.addGrievance({
                    userId: session.isAnonymous ? 'Anonymous' : userId,
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
                    `✅ *Grievance submitted!*\nTracking ID: *${grievanceId}*\n\n` +
                    `Track anytime: track ${grievanceId}\n\nType *start* to submit another.`;
                userSessions.delete(userId);
            } else if (userMessage.toLowerCase() === 'cancel') {
                userSessions.delete(userId);
                responseMessage = '❌ Cancelled. Type *start* to begin again.';
            } else {
                responseMessage = 'Please type *confirm* or *cancel*';
            }
        } else {
            responseMessage = 'Type *start* to submit a grievance, or *track <ID>* to check status.';
        }

        await msg.reply(responseMessage);

    } catch (error) {
        console.error('Error:', error.message);
        await msg.reply('⚠️ Something went wrong. Please try again.');
    }
});

// Admin notify endpoint
const app = express();
app.use(bodyParser.json());

app.post('/notify', async (req, res) => {
    const { grievanceId, remarks, newStatus, adminName } = req.body;
    if (!grievanceId || !remarks) return res.status(400).json({ error: 'grievanceId and remarks required' });
    try {
        const grievance = await db.getGrievanceById(grievanceId);
        if (!grievance) return res.status(404).json({ error: 'Grievance not found' });
        const rawUserId = grievance.user_id;
        if (!rawUserId || rawUserId === 'Anonymous') return res.status(200).json({ message: 'Anonymous — skipped' });
        const waId = `${rawUserId.replace(/\D/g, '')}@c.us`;
        const message =
            `📢 *Update on grievance ${grievanceId}*\n\nStatus: ${newStatus || 'Updated'}\n` +
            `Remarks: ${remarks}\nBy: ${adminName || 'Admin'}\n\nReply *track ${grievanceId}* for full status.`;
        await client.sendMessage(waId, message);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Notify API running on port ${PORT}`));

client.initialize();
