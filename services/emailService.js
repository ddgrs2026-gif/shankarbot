/**
 * emailService.js
 * Sends emails via Gmail API (OAuth2) — works on Render free tier.
 * Uses HTTPS instead of SMTP, so no port blocking issues.
 */

const { google } = require('googleapis');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://ddgrsfinalfinal.vercel.app';

// OAuth2 client setup
function getOAuth2Client() {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
    });
    return oauth2Client;
}

/**
 * Encode email as base64 for Gmail API
 */
function makeEmailBody(to, from, subject, htmlBody) {
    const message = [
        `From: "DDGRS Grievance System" <${from}>`,
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        '',
        htmlBody
    ].join('\n');

    return Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Sends assignment notification email to the assigned member.
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
    <div class="header"><h1>📋 New Grievance Assigned</h1></div>
    <div class="body">
      <p>Dear <strong>${toName}</strong>,</p>
      <p>A new grievance has been assigned to you. Please review it on the admin dashboard.</p>
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
      <a href="${DASHBOARD_URL}/grievances/${grievanceUUID}" class="btn">View Grievance →</a>
    </div>
    <div class="footer">
      <p>Automated notification from DDGRS Grievance Management System. Do not reply.</p>
    </div>
  </div>
</body>
</html>`;

    const auth = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth });

    const raw = makeEmailBody(
        toEmail,
        process.env.GMAIL_USER,
        `[DDGRS] New Grievance Assigned: ${grievanceId}`,
        html
    );

    await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw }
    });

    console.log(`📧 Email sent to ${toEmail} for grievance ${grievanceId}`);
}

module.exports = { sendAssignmentEmail };
