require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;
const Database = require('./database-supabase');
const { saveFeedback } = require('./services/feedbackService');
const { saveReply } = require('./services/replyService');

const app = express();
const db = new Database();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'ddgrs_verify_token';

const supabaseStorage = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

const rateLimit = require('express-rate-limit');

app.set('trust proxy', 1); // Trust Render/proxy headers
app.use(bodyParser.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Rate limiter — 60 requests per minute per IP
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests'
});

// Health check + static admin panel serving
const path = require('path');
const fs = require('fs');
const publicPath = path.join(__dirname, 'public');

app.use(require('express').static(publicPath));

app.get('/', (_req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(200).send('DDGRS Bot is running ✅');
});

// SPA fallback for admin panel routes
app.get(/^(?!\/(webhook|notify)).*$/, (_req, res, next) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else next();
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
async function downloadAndUploadMedia(mediaId, grievanceId, mediaType = 'image') {
    try {
        const { data: mediaInfo } = await axios.get(
            `https://graph.facebook.com/v19.0/${mediaId}`,
            { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
        );
        const { data: buffer, headers } = await axios.get(mediaInfo.url, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
            responseType: 'arraybuffer'
        });
        const mimeType = headers['content-type'] || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
        let ext = 'jpg';
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('gif')) ext = 'gif';
        else if (mimeType.includes('mp4')) ext = 'mp4';
        else if (mimeType.includes('3gp')) ext = '3gp';
        else if (mimeType.includes('video')) ext = 'mp4';
        const fileName = `grievances/${grievanceId}_${Date.now()}.${ext}`;
        const { error } = await supabaseStorage.storage
            .from('grievance-media')
            .upload(fileName, Buffer.from(buffer), { contentType: mimeType, upsert: true });
        if (error) throw error;
        const { data } = supabaseStorage.storage.from('grievance-media').getPublicUrl(fileName);
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

// Categories that require mandatory student details
const MANDATORY_DETAIL_CATEGORIES = ['Academics', 'Behavioral'];

// Subcategory map
const SUBCATEGORIES = {
    '1':  { category: 'Academics',                 subcategory: 'Teaching' },
    '2':  { category: 'Academics',                 subcategory: 'Examination' },
    '3':  { category: 'Academics',                 subcategory: 'Internal Assessment' },
    '4':  { category: 'Office and Administration', subcategory: 'Fee' },
    '5':  { category: 'Office and Administration', subcategory: 'Scholarships' },
    '6':  { category: 'Office and Administration', subcategory: 'Certificates' },
    '7':  { category: 'Behavioral',                subcategory: 'Bullying / Ragging' },
    '8':  { category: 'Behavioral',                subcategory: 'Threat / Intimidation' },
    '9':  { category: 'Behavioral',                subcategory: 'Defamation' },
    '10': { category: 'Behavioral',                subcategory: 'Substance Abuse' },
    '11': { category: 'Behavioral',                subcategory: 'Sexual / Verbal Harassment' },
    '12': { category: 'Facilities',                subcategory: 'Library' },
    '13': { category: 'Facilities',                subcategory: 'Canteen' },
    '14': { category: 'Facilities',                subcategory: 'Laboratory' },
    '15': { category: 'Facilities',                subcategory: 'Computer Lab' },
    '16': { category: 'Facilities',                subcategory: 'Counselling Centre' },
    '17': { category: 'Facilities',                subcategory: 'Hostel' },
    '18': { category: 'Facilities',                subcategory: 'Washroom' },
    '19': { category: 'Facilities',                subcategory: 'Sports Amenities' },
    '20': { category: 'Campus',                    subcategory: 'Cleanliness' },
    '21': { category: 'Campus',                    subcategory: 'Building' },
    '22': { category: 'Campus',                    subcategory: 'Electrical / Plumbing' },
    '23': { category: 'Memorandum',                subcategory: 'Memorandum' }
};

const DISCLAIMER =
    '⚠️ DISCLAIMER\n\n' +
    'This is the official DDGRS Grievance Management System.\n\n' +
    'This platform is strictly meant for submitting genuine grievances related to academic, behavioral, facility, or campus issues.\n\n' +
    '🚫 Misuse of this system — including false complaints, spam, or abuse — is strictly prohibited and may result in disciplinary action.\n\n' +
    '✅ Type "I agree" to proceed.';

function getCategoryMenuText() {
    return (
        'Select a category:\n\n' +
        '📚 Academics\n' +
        '1. Teaching\n2. Examination\n3. Internal Assessment\n\n' +
        '🏢 Office and Administration\n' +
        '4. Fee\n5. Scholarships\n6. Certificates\n\n' +
        '⚠️ Behavioral\n' +
        '7. Bullying / Ragging\n8. Threat / Intimidation\n9. Defamation\n' +
        '10. Substance Abuse\n11. Sexual / Verbal Harassment\n\n' +
        '🏫 Facilities\n' +
        '12. Library\n13. Canteen\n14. Laboratory\n15. Computer Lab\n' +
        '16. Counselling Centre\n17. Hostel\n18. Washroom\n19. Sports Amenities\n\n' +
        '🏛️ Campus\n' +
        '20. Cleanliness\n21. Building\n22. Electrical / Plumbing\n\n' +
        '📄 Other\n' +
        '23. Memorandum\n\n' +
        'Reply with a number (1-23)'
    );
}

function buildSummary(session) {
    const isMandatory = MANDATORY_DETAIL_CATEGORIES.includes(session.categoryName);
    let summary = '📝 Summary:\n\n' +
        `Category: ${session.categoryName}\n` +
        `Subcategory: ${session.subcategoryName}\n`;

    if (isMandatory) {
        summary += `Name: ${session.userName}\nID No: ${session.userIdNo}\nYear: ${session.userYear}\n`;
    } else {
        summary += `Anonymous: ${session.isAnonymous ? 'Yes' : 'No'}\n`;
        if (!session.isAnonymous) summary += `Name: ${session.userName}\n`;
    }

    summary += `Grievance: ${session.grievance}\n`;
    summary += `Media: ${session.imageUrl ? '✅ Image attached' : session.videoUrl ? '✅ Video attached' : '❌ None'}\n`;
    return summary;
}

// ─── Incoming messages ─────────────────────────────────────────────────────
app.post('/webhook', webhookLimiter, async (req, res) => {
    res.sendStatus(200);

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const userId = msg.from;
    const userMessage = msg.text?.body?.trim() || '';
    const isImage = msg.type === 'image';
    const isVideo = msg.type === 'video';
    const isMedia = isImage || isVideo;
    const mediaId = isImage ? msg.image?.id : isVideo ? msg.video?.id : null;
    const mediaType = isImage ? 'image' : isVideo ? 'video' : null;

    console.log(`Message from ${userId}: ${userMessage || '[image]'}`);

    // ── Grievance ID lookup — works anytime, even outside a session ───────
    if (userMessage && /^GRV-\d+$/i.test(userMessage)) {
        const grievance = await db.getGrievanceById(userMessage.toUpperCase());
        let responseMessage;
        if (grievance) {
            const actions = await db.getGrievanceActions(grievance.id);
            const latestAction = actions?.length > 0 ? actions[actions.length - 1] : null;
            responseMessage =
                `📋 Grievance Status\n\n` +
                `ID: ${grievance.grievance_id}\n` +
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
            responseMessage = `❌ Grievance ID "${userMessage}" not found. Please check and try again.`;
        }
        await sendMessage(userId, responseMessage);
        return;
    }

    if (!userSessions.has(userId)) {
        userSessions.set(userId, { step: 'disclaimer' });
        await sendMessage(userId, DISCLAIMER);
        return;
    }
    const session = userSessions.get(userId);
    if (isMedia && session.step === 'image') {
        await sendMessage(userId, '⏳ Uploading your file...');
        const tempId = `TEMP_${Date.now()}`;
        console.log(`[media] Downloading mediaId: ${mediaId} type: ${mediaType}`);
        const mediaUrl = await downloadAndUploadMedia(mediaId, tempId, mediaType);
        console.log(`[media] Upload result: ${mediaUrl}`);
        if (mediaUrl) {
            session.imageUrl = mediaType === 'image' ? mediaUrl : null;
            session.videoUrl = mediaType === 'video' ? mediaUrl : null;
            session.step = 'confirm';
            await sendMessage(userId,
                buildSummary(session) +
                '\nType "confirm" to submit, "change" to edit category, or "cancel" to restart.'
            );
        } else {
            await sendMessage(userId, '❌ Failed to upload file. Send again or type "skip" to continue without one.');
        }
        return;
    }

    if (isMedia && session.step !== 'image') {
        await sendMessage(userId, '📎 File received but not expected at this step. Please follow the conversation flow.');
        return;
    }

    if (!userMessage) return;    if (!userMessage) return;

    try {
        let responseMessage = '';

        // ── STEP: disclaimer ──────────────────────────────────────────────
        if (userMessage.toLowerCase() === 'start') {
            session.step = 'disclaimer';
            responseMessage = DISCLAIMER;

        } else if (session.step === 'disclaimer') {
            if (userMessage.toLowerCase() === 'i agree') {
                session.step = 'category';
                responseMessage = '✅ Thank you for agreeing.\n\n' + getCategoryMenuText();
            } else {
                responseMessage = '⚠️ Please type "I agree" to proceed, or type "start" to see the disclaimer again.';
            }

        // ── STEP: category selection ──────────────────────────────────────
        } else if (session.step === 'category') {
            if (userMessage === '23') {
                // Memorandum — coming soon
                responseMessage =
                    '📄 Memorandum submission is coming in a future update.\n\n' +
                    'Please select another category:\n\n' +
                    getCategoryMenuText();
            } else if (SUBCATEGORIES[userMessage]) {
                const selected = SUBCATEGORIES[userMessage];
                session.categoryName = selected.category;
                session.subcategoryName = selected.subcategory;
                session.department = `${selected.category} - ${selected.subcategory}`;

                if (MANDATORY_DETAIL_CATEGORIES.includes(session.categoryName)) {
                    // Academics / Behavioral — mandatory student details
                    session.step = 'student_name';
                    responseMessage =
                        `✅ Category: ${session.subcategoryName}\n\n` +
                        '📋 This category requires your student details.\n\n' +
                        'Please enter your full name:';
                } else {
                    // Other categories — ask anonymous
                    session.step = 'anonymous';
                    responseMessage =
                        `✅ Category: ${session.subcategoryName}\n\n` +
                        'Do you want to submit anonymously?\n' +
                        '1 - Yes (Anonymous)\n' +
                        '2 - No (With my details)\n\n' +
                        'Reply with 1 or 2';
                }
            } else {
                responseMessage = '❌ Invalid selection. Please reply with a number between 1-23.';
            }

        // ── STEP: mandatory student name ──────────────────────────────────
        } else if (session.step === 'student_name') {
            session.userName = userMessage;
            session.step = 'student_id';
            responseMessage = `✅ Name: ${session.userName}\n\nEnter your Student ID number:`;

        // ── STEP: mandatory student ID ────────────────────────────────────
        } else if (session.step === 'student_id') {
            session.userIdNo = userMessage;
            session.step = 'student_year';
            responseMessage = `✅ ID: ${session.userIdNo}\n\nEnter your year of study (e.g. 1, 2, 3, 4):`;

        // ── STEP: mandatory student year ──────────────────────────────────
        } else if (session.step === 'student_year') {
            session.userYear = userMessage;
            session.isAnonymous = false;
            session.step = 'grievance';
            responseMessage = `✅ Year: ${session.userYear}\n\n📝 Please describe your grievance:`;

        // ── STEP: anonymous choice (non-mandatory categories) ─────────────
        } else if (session.step === 'anonymous') {
            if (userMessage === '1') {
                session.isAnonymous = true;
                session.step = 'grievance';
                responseMessage = '✅ Anonymous submission selected.\n\n📝 Please describe your grievance:';
            } else if (userMessage === '2') {
                session.isAnonymous = false;
                session.step = 'anon_name';
                responseMessage = '✅ Submission with details.\n\nPlease enter your full name:';
            } else {
                responseMessage = '❌ Invalid selection. Please reply with 1 or 2.';
            }

        // ── STEP: name for non-anonymous non-mandatory ────────────────────
        } else if (session.step === 'anon_name') {
            session.userName = userMessage;
            session.step = 'grievance';
            responseMessage = `✅ Name: ${session.userName}\n\n📝 Please describe your grievance:`;

        // ── STEP: grievance text ──────────────────────────────────────────
        } else if (session.step === 'grievance') {
            session.grievance = userMessage;
            session.step = 'image';
            responseMessage =
                '✅ Grievance noted.\n\n' +
                '📎 Do you want to attach evidence?\n\n' +
                'Send an image or video, or type "skip" to continue without one.';

        // ── STEP: image ───────────────────────────────────────────────────
        } else if (session.step === 'image') {
            if (userMessage.toLowerCase() === 'skip') {
                session.imageUrl = null;
                session.videoUrl = null;
                session.step = 'confirm';
                responseMessage =
                    buildSummary(session) +
                    '\nType "confirm" to submit, "change" to edit category, or "cancel" to restart.';
            } else {
                responseMessage = '📎 Please send an image or video, or type "skip" to continue without one.';
            }

        // ── STEP: confirm ─────────────────────────────────────────────────
        } else if (session.step === 'confirm') {
            if (userMessage.toLowerCase() === 'confirm') {
                session.step = 'any_changes';
                responseMessage = '🔍 Before submitting — do you want to make any changes?\n\nType "no" to submit now, or describe what you want to change.';

            } else if (userMessage.toLowerCase() === 'change') {
                session.step = 'category';
                responseMessage = getCategoryMenuText();

            } else if (userMessage.toLowerCase() === 'cancel') {
                userSessions.delete(userId);
                responseMessage = '❌ Cancelled. Type "start" to begin again.';

            } else {
                responseMessage = 'Please type "confirm", "change", or "cancel".';
            }

        // ── STEP: any changes? ────────────────────────────────────────────
        } else if (session.step === 'any_changes') {
            if (userMessage.toLowerCase() === 'no') {
                // Submit grievance
                const isMandatory = MANDATORY_DETAIL_CATEGORIES.includes(session.categoryName);
                const displayUserId = session.isAnonymous ? 'Anonymous' : userId;
                const grievanceId = await db.addGrievance({
                    userId: displayUserId,
                    department: session.department,
                    grievance: session.grievance,
                    status: 'Submitted',
                    isAnonymous: session.isAnonymous,
                    userName: session.userName || null,
                    userRole: isMandatory ? `Year ${session.userYear}` : null,
                    userDept: session.userIdNo || null,
                    mediaUrls: '[]',
                    imageUrl: session.imageUrl || null,
                    videoUrl: session.videoUrl || null
                });
                responseMessage =
                    `✅ Grievance submitted successfully!\n\n` +
                    `Your Grievance ID: *${grievanceId}*\n\n` +
                    `To check status anytime, just send your Grievance ID (e.g. ${grievanceId})\n\n` +
                    `Type "start" to submit another grievance.`;
                userSessions.delete(userId);

            } else {
                // User described a change — restart from category
                session.step = 'category';
                responseMessage =
                    '📝 No problem. Let\'s redo your submission.\n\n' +
                    getCategoryMenuText();
            }

        } else if (session.step === 'awaiting_info') {
            // Student replied to admin's info request
            try {
                await saveReply(session.awaitingGrievanceId, session.awaitingGrievanceUUID, userId, userMessage);
            } catch (e) {
                console.error('Reply save error:', e.message);
            }
            userSessions.delete(userId);
            responseMessage = '✅ Your reply has been sent to the grievance officer. They will get back to you soon.';

        } else if (session.step === 'feedback_rating') {
            const rating = parseInt(userMessage);
            if (isNaN(rating) || rating < 1 || rating > 5) {
                responseMessage = '❌ Please reply with a number between 1 and 5.';
            } else {
                session.feedbackRating = rating;
                session.step = 'feedback_comments';
                responseMessage = '💬 Any additional comments? (Type "skip" to finish)';
            }

        } else if (session.step === 'feedback_comments') {
            const comments = userMessage.toLowerCase() === 'skip' ? '' : userMessage;
            try {
                await saveFeedback(session.feedbackGrievanceId, userId, session.feedbackRating, comments);
            } catch (e) {
                console.error('Feedback save error:', e.message);
            }
            userSessions.delete(userId);
            responseMessage =
                '✅ Thank you for your feedback! It helps us improve.\n\n' +
                'Type "start" to submit a new grievance.';

        } else {
            userSessions.delete(userId);
            responseMessage = 'Type "start" to submit a grievance, or send your Grievance ID to check status.';
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
        console.log(`[notify] grievanceId=${grievanceId} newStatus="${newStatus}" rawUserId=${rawUserId}`);
        if (!rawUserId || rawUserId === 'Anonymous') return res.status(200).json({ message: 'Anonymous — skipped' });
        const phone = rawUserId.replace(/\D/g, '');
        console.log(`[notify] phone=${phone}`);

        if (newStatus === 'Resolved') {
            // Send feedback request
            const message =
                `✅ Your grievance *${grievanceId}* has been resolved!\n\n` +
                `Remarks: ${remarks}\nBy: ${adminName || 'Admin'}\n\n` +
                `⭐ We'd love your feedback!\n` +
                `How satisfied are you with the resolution?\n\n` +
                `Reply with a number:\n` +
                `1 - Very Dissatisfied\n2 - Dissatisfied\n3 - Neutral\n4 - Satisfied\n5 - Very Satisfied`;
            await sendMessage(phone, message);
            userSessions.set(phone, { step: 'feedback_rating', feedbackGrievanceId: grievanceId });

        } else if (newStatus === 'In Progress') {
            // Admin asking for more info
            const message =
                `📋 Update on your grievance *${grievanceId}*\n\n` +
                `Status: In Progress\n\n` +
                `💬 The grievance officer needs more information:\n\n` +
                `"${remarks}"\n\n` +
                `Please reply with your response.`;
            await sendMessage(phone, message);

            // Set awaiting_info session so next reply is captured
            const grievance = await db.getGrievanceById(grievanceId);
            userSessions.set(phone, {
                step: 'awaiting_info',
                awaitingGrievanceId: grievanceId,
                awaitingGrievanceUUID: grievance?.id || null
            });

        } else {
            const message =
                `📢 Update on your grievance ${grievanceId}\n\n` +
                `Status: ${newStatus || 'Updated'}\n` +
                `Remarks: ${remarks}\nBy: ${adminName || 'Admin'}\n\n` +
                `Send "${grievanceId}" to check full status.`;
            await sendMessage(phone, message);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`✅ WhatsApp API Bot (AIY) running on port ${PORT}`);
    console.log(`📡 Webhook: https://your-domain.com/webhook`);
});
