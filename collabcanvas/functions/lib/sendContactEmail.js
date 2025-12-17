"use strict";
/**
 * Cloud Function to send contact form emails
 * Uses Resend API to send to all team members
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendContactEmail = void 0;
const functions = require("firebase-functions");
const resend_1 = require("resend");
// CORS configuration
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
// All 6 team member emails
const TEAM_EMAILS = [
    'ycorcos26@gmail.com',
    'ivanovkalin7@gmail.com',
    'kishorkashid99@gmail.com',
    'sainatha.yatham@gmail.com',
    'atharva.sardar02@gmail.com',
    'ankitrijal2054@gmail.com',
];
exports.sendContactEmail = functions
    .region('us-central1')
    .runWith({
    secrets: ['RESEND_API_KEY'],
})
    .https.onRequest(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        res.status(204).send('');
        return;
    }
    res.set(corsHeaders);
    if (req.method !== 'POST') {
        res.status(405).json({ success: false, error: 'Method not allowed' });
        return;
    }
    try {
        const { email, phone, subject, message } = req.body;
        // Validate required fields
        if (!email || !subject || !message) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: email, subject, message'
            });
            return;
        }
        // Get Resend API key from Firebase secrets
        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
            console.error('RESEND_API_KEY secret not configured');
            res.status(500).json({
                success: false,
                error: 'Email service not configured'
            });
            return;
        }
        const resend = new resend_1.Resend(resendApiKey);
        // Email content
        const htmlContent = `
        <h2>New Contact Form Submission</h2>
        <p><strong>From:</strong> ${email}</p>
        ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
        <p><strong>Subject:</strong> ${subject}</p>
        <hr />
        <h3>Message:</h3>
        <p>${message.replace(/\n/g, '<br>')}</p>
        <hr />
        <p style="color: #666; font-size: 12px;">
          Sent from gettruecost.com contact form
        </p>
      `;
        const textContent = `
New Contact Form Submission

From: ${email}
${phone ? `Phone: ${phone}` : ''}
Subject: ${subject}

Message:
${message}

---
Sent from gettruecost.com contact form
      `.trim();
        // Send email to all team members
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: TEAM_EMAILS,
            replyTo: email,
            subject: `[TrueCost Contact] ${subject}`,
            html: htmlContent,
            text: textContent,
        });
        console.log('Contact email sent successfully to all team members', { from: email, subject });
        res.status(200).json({ success: true, message: 'Email sent successfully' });
    }
    catch (error) {
        console.error('Error sending contact email:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send email. Please try again later.'
        });
    }
});
//# sourceMappingURL=sendContactEmail.js.map