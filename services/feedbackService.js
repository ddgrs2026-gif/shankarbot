/**
 * feedbackService.js
 * Stores student feedback after grievance resolution.
 */

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
if (!globalThis.WebSocket) globalThis.WebSocket = ws.WebSocket || ws;

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
);

/**
 * Save feedback from a student.
 * @param {string} grievanceId - Public GRV-XXXXXX id
 * @param {string} userPhone   - Student's WhatsApp number
 * @param {number} rating      - 1 to 5
 * @param {string} comments    - Optional comments
 */
async function saveFeedback(grievanceId, userPhone, rating, comments = '') {
    const { error } = await supabase.from('grievance_feedback').insert({
        grievance_id: grievanceId,
        user_phone: userPhone,
        rating,
        comments: comments || null
    });
    if (error) throw new Error('Failed to save feedback: ' + error.message);
    console.log(`✅ Feedback saved for ${grievanceId} — rating: ${rating}`);
}

module.exports = { saveFeedback };
