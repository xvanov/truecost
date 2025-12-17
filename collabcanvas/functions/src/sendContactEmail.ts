/**
 * Cloud Function to send contact form emails
 * Uses Nodemailer with Gmail SMTP
 */

import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';

// CORS configuration
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ContactFormData {
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

export const sendContactEmail = functions
  .region('us-central1')
  .runWith({
    secrets: ['GMAIL_APP_PASSWORD'],
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
      const { email, phone, subject, message } = req.body as ContactFormData;

      // Validate required fields
      if (!email || !subject || !message) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: email, subject, message'
        });
        return;
      }

      // Get Gmail credentials from Firebase secrets
      const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

      if (!gmailAppPassword) {
        console.error('GMAIL_APP_PASSWORD secret not configured');
        res.status(500).json({
          success: false,
          error: 'Email service not configured'
        });
        return;
      }

      // Create transporter with Gmail SMTP
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'ivanovkalin7@gmail.com',
          pass: gmailAppPassword,
        },
      });

      // Email content
      const mailOptions = {
        from: '"TrueCost Contact Form" <ivanovkalin7@gmail.com>',
        to: 'ivanovkalin7@gmail.com',
        replyTo: email,
        subject: `[TrueCost Contact] ${subject}`,
        html: `
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
        `,
        text: `
New Contact Form Submission

From: ${email}
${phone ? `Phone: ${phone}` : ''}
Subject: ${subject}

Message:
${message}

---
Sent from gettruecost.com contact form
        `,
      };

      // Send email
      await transporter.sendMail(mailOptions);

      console.log('Contact email sent successfully', { from: email, subject });

      res.status(200).json({ success: true, message: 'Email sent successfully' });
    } catch (error) {
      console.error('Error sending contact email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send email. Please try again later.'
      });
    }
  });
