const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const { assignGrievance } = require('./services/assignmentService');
const { sendAssignmentEmail } = require('./services/emailService');

// Polyfill WebSocket for Node.js 20
if (!globalThis.WebSocket) {
    globalThis.WebSocket = ws.WebSocket || ws;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
});

class SupabaseDatabase {
    constructor() { console.log('Connected to Supabase'); }

    async addGrievance(data) {
        const grievanceData = {
            category: this.mapDepartmentToCategory(data.department),
            description: data.grievance,
            is_anonymous: data.isAnonymous,
            user_id: data.userId,
            status: 'Submitted',
            image_url: null,
            video_url: null,
            user_name: data.userName || null,
            user_role: data.userRole || null,
            user_department: data.userDept || null,
        };

        if (data.mediaUrls) {
            const mediaArray = JSON.parse(data.mediaUrls);
            if (mediaArray.length > 0) {
                const first = mediaArray[0];
                if (first.type.startsWith('image/')) grievanceData.image_url = first.url;
                else if (first.type.startsWith('video/')) grievanceData.video_url = first.url;
            }
        }

        // Direct image/video URL from WhatsApp bot
        if (data.imageUrl) grievanceData.image_url = data.imageUrl;
        if (data.videoUrl) grievanceData.video_url = data.videoUrl;

        const { data: result, error } = await supabase.from('grievances').insert([grievanceData]).select().single();
        if (error) throw error;

        // ── Auto-assign and notify ──────────────────────────────────────────
        try {
            const member = await assignGrievance(result.id);
            if (member) {
                await sendAssignmentEmail({
                    toEmail: member.email,
                    toName: member.name,
                    grievanceId: result.grievance_id,
                    grievanceUUID: result.id,
                    submittedBy: data.isAnonymous ? 'Anonymous' : (data.userName || data.userId || 'Unknown'),
                    submittedDate: result.created_at
                });
            }
        } catch (assignErr) {
            // Non-fatal: log but don't block grievance submission
            console.error('Assignment/email error:', assignErr.message);
        }

        return result.grievance_id;
    }

    async getAllGrievances() {
        const { data, error } = await supabase.from('grievances').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async getGrievanceById(id) {
        const { data, error } = await supabase.from('grievances').select('*').eq('grievance_id', id).single();
        if (error && error.code !== 'PGRST116') console.error('Error getting grievance:', error);
        return data || null;
    }

    async getGrievanceActions(grievanceUUID) {
        const { data, error } = await supabase
            .from('grievance_actions')
            .select('remarks, new_status, admin_name, created_at')
            .eq('grievance_id', grievanceUUID)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async markResponseSent(id) { return Promise.resolve(); }

    mapDepartmentToCategory(department) {
        const mapping = {
            'Academic': 'Academic', 'Hostel': 'Hostel', 'Faculty': 'Academic',
            'Infrastructure': 'Infrastructure', 'IT Cell': 'IT Cell',
            'Maintenance': 'Maintenance', 'Transport': 'Transport', 'Accounts': 'Accounts'
        };
        return mapping[department] || 'Other';
    }
}

module.exports = SupabaseDatabase;
