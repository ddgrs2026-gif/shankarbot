/**
 * emailService.js
 * Sends email notifications via Gmail using Nodemailer.
 * Does NOT include grievance content — only ID, submitter, and date.
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://your-admin-dashboard.com';

/**
 * Sends assignment notification email to the assigned member.
 * @param {object} params
 * @param {string} params.toEmail       - Recipient email
 * @param {string} params.toName        - Recipient name
 * @param {string} params.grievanceId   - Public grievance ID (e.g. GRV-0042)
 * @param {string} params.grievanceUUID - Internal UUID for direct dashboard link
 * @param {string} params.submittedBy   - 'Anonymous' or student name
 * @param {string} params.submittedDate - ISO date string
 */
async function sendAssignmentEmail({ toEmail, toName, grievanceId, grievanceUUID, submittedBy, submittedDate }) {
    const formattedDate = new Date(submittedDate).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1d4ed8; padding: 24px 32px; }
    .header h1 { color: #ffffff; margin: 0; font-size: 20px; }
    .body { padding: 32px; }
    .body p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .info-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin: 24px 0; }
    .info-row { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .info-value { color: #111827; font-size: 14px; font-weight: 500; margin-top: 2px; }
    .btn { display: inline-block; background: #1d4ed8; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 8px; }
    .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📋 New Grievance Assigned</h1>
    </div>
    <div class="body">
      <p>Dear <strong>${toName}</strong>,</p>
      <p>A new grievance has been assigned to you. Please review it on the admin dashboard at your earliest convenience.</p>
      <div class="info-box">
        <div class="info-row">
          <div class="info-label">Grievance ID</div>
          <div class="info-value">${grievanceId}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Submitted By</div>
          <div class="info-value">${submittedBy}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Submitted On</div>
          <div class="info-value">${formattedDate}</div>
        </div>
      </div>
      <p>Please log in to the dashboard to view full details and take appropriate action.</p>
      <a href="${DASHBOARD_URL}/grievances/${grievanceUUID}" class="btn">View Grievance →</a>
    </div>
    <div class="footer">
      <p>This is an automated notification from the DDGRS Grievance Management System. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;

    await transporter.sendMail({
        from: `"DDGRS Grievance System" <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: `[DDGRS] New Grievance Assigned: ${grievanceId}`,
        html
    });

    console.log(`📧 Email sent to ${toEmail} for grievance ${grievanceId}`);
}

module.exports = { sendAssignmentEmail };
