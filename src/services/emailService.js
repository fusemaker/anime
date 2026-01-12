import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

// Create reusable transporter
const createTransporter = () => {
  // Use Gmail SMTP (most reliable for real-time notifications)
  // You can also use other providers like SendGrid, Mailgun, etc.
  return nodemailer.createTransport({
    service: 'gmail', // or use 'smtp.gmail.com'
    auth: {
      user: process.env.EMAIL_USER, // Your Gmail address
      pass: process.env.EMAIL_APP_PASSWORD, // Gmail App Password (not regular password)
    },
  });
};

// Alternative: Use SMTP directly (works with any email provider)
const createSMTPTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || process.env.EMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.EMAIL_APP_PASSWORD,
    },
  });
};

// Get transporter (use SMTP if configured, otherwise Gmail)
const getTransporter = () => {
  logger.info('📧 Email configuration check:');
  logger.info(`  EMAIL_USER: ${process.env.EMAIL_USER ? '✅ Set (' + process.env.EMAIL_USER + ')' : '❌ Missing'}`);
  logger.info(`  EMAIL_APP_PASSWORD: ${process.env.EMAIL_APP_PASSWORD ? '✅ Set (length: ' + process.env.EMAIL_APP_PASSWORD.length + ')' : '❌ Missing'}`);
  
  if (process.env.SMTP_HOST) {
    logger.info('  Using SMTP configuration');
    return createSMTPTransporter();
  }
  logger.info('  Using Gmail service configuration');
  return createTransporter();
};

// Send email function
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!to) {
      logger.error('Email recipient not provided');
      return { success: false, error: 'Recipient email required' };
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      logger.error('❌ Email credentials not configured!');
      logger.error(`  EMAIL_USER: ${process.env.EMAIL_USER ? 'Set' : 'MISSING'}`);
      logger.error(`  EMAIL_APP_PASSWORD: ${process.env.EMAIL_APP_PASSWORD ? 'Set' : 'MISSING'}`);
      return { success: false, error: 'Email service not configured' };
    }
    
    logger.info(`📧 Sending email to: ${to}`);
    logger.info(`  From: ${process.env.EMAIL_USER}`);
    logger.info(`  Subject: ${subject}`);

    const transporter = getTransporter();

    const mailOptions = {
      from: `"Event Management System" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, ''), // Plain text fallback
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info(`✅ Email sent successfully to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('❌ Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Welcome email for new signups
export const sendWelcomeEmail = async (userEmail, userName) => {
  logger.info(`📧 Attempting to send welcome email to: ${userEmail}`);
  
  const subject = 'Welcome to Event Management System! 🎉';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #00f2ea 0%, #a855f7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 12px 30px; background: #00f2ea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome ${userName || 'there'}! 🎉</h1>
        </div>
        <div class="content">
          <p>Thank you for signing up for our Event Management System!</p>
          <p>You can now:</p>
          <ul>
            <li>Discover events near you</li>
            <li>Register for events</li>
            <li>Save events for later</li>
            <li>Set reminders</li>
            <li>Create your own events</li>
          </ul>
          <p>Get started by asking our AI assistant about events in your area!</p>
          <p>Best regards,<br>Event Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail({
    to: userEmail,
    subject,
    html,
  });
  
  if (result && result.success) {
    logger.info(`✅ Welcome email sent successfully to ${userEmail}`);
  } else {
    logger.error(`❌ Failed to send welcome email to ${userEmail}:`, result?.error || 'Unknown error');
  }
  
  return result;
};

// Event registration confirmation
export const sendRegistrationEmail = async (userEmail, userName, event) => {
  logger.info(`📧 Attempting to send registration email to: ${userEmail}`);
  
  const subject = `✅ Registration Confirmed: ${event.title}`;
  const eventDate = event.startDate ? new Date(event.startDate).toLocaleString() : 'TBD';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .event-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
        .event-title { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
        .event-info { margin: 10px 0; }
        .event-info strong { color: #4b5563; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Registration Confirmed!</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || 'there'},</p>
          <p>Your registration for the following event has been confirmed:</p>
          <div class="event-details">
            <div class="event-title">${event.title}</div>
            <div class="event-info"><strong>📍 Location:</strong> ${event.location || 'TBD'}</div>
            <div class="event-info"><strong>📅 Date:</strong> ${eventDate}</div>
            ${event.mode ? `<div class="event-info"><strong>💻 Mode:</strong> ${event.mode}</div>` : ''}
          </div>
          <p>We'll send you a reminder before the event. See you there!</p>
          <p>Best regards,<br>Event Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail({
    to: userEmail,
    subject,
    html,
  });
  
  if (result && result.success) {
    logger.info(`✅ Registration email sent successfully to ${userEmail}`);
  } else {
    logger.error(`❌ Failed to send registration email to ${userEmail}:`, result?.error || 'Unknown error');
  }
  
  return result;
};

// Event saved notification
export const sendEventSavedEmail = async (userEmail, userName, event) => {
  logger.info(`📧 Attempting to send event saved email to: ${userEmail}`);
  
  const subject = `💾 Event Saved: ${event.title}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #00f2ea 0%, #a855f7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .event-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00f2ea; }
        .event-title { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
        .event-info { margin: 10px 0; }
        .event-info strong { color: #4b5563; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💾 Event Saved!</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || 'there'},</p>
          <p>You've saved the following event:</p>
          <div class="event-details">
            <div class="event-title">${event.title}</div>
            <div class="event-info"><strong>📍 Location:</strong> ${event.location || 'TBD'}</div>
            ${event.startDate ? `<div class="event-info"><strong>📅 Date:</strong> ${new Date(event.startDate).toLocaleString()}</div>` : ''}
          </div>
          <p>You can view all your saved events in the "Saved" section of the app.</p>
          <p>Best regards,<br>Event Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail({
    to: userEmail,
    subject,
    html,
  });
  
  if (result && result.success) {
    logger.info(`✅ Event saved email sent successfully to ${userEmail}`);
  } else {
    logger.error(`❌ Failed to send event saved email to ${userEmail}:`, result?.error || 'Unknown error');
  }
  
  return result;
};

// Remind me later notification
export const sendRemindLaterEmail = async (userEmail, userName, event) => {
  logger.info(`📧 Attempting to send remind later email to: ${userEmail}`);
  
  const subject = `⏰ Reminder Set: ${event.title}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .event-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #a855f7; }
        .event-title { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
        .event-info { margin: 10px 0; }
        .event-info strong { color: #4b5563; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Reminder Set!</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || 'there'},</p>
          <p>You've set a "Remind Me Later" reminder for:</p>
          <div class="event-details">
            <div class="event-title">${event.title}</div>
            <div class="event-info"><strong>📍 Location:</strong> ${event.location || 'TBD'}</div>
            ${event.startDate ? `<div class="event-info"><strong>📅 Date:</strong> ${new Date(event.startDate).toLocaleString()}</div>` : ''}
          </div>
          <p>We'll send you a reminder in 24 hours about this event!</p>
          <p>Best regards,<br>Event Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail({
    to: userEmail,
    subject,
    html,
  });
  
  if (result && result.success) {
    logger.info(`✅ Remind later email sent successfully to ${userEmail}`);
  } else {
    logger.error(`❌ Failed to send remind later email to ${userEmail}:`, result?.error || 'Unknown error');
  }
  
  return result;
};

// Past event attendance reminder
export const sendPastEventReminderEmail = async (userEmail, userName, event) => {
  logger.info(`📧 Attempting to send past event reminder email to: ${userEmail}`);
  
  const subject = `📅 Event Reminder: ${event.title} - You Attended This Event`;
  const eventDate = event.startDate ? new Date(event.startDate).toLocaleString() : 'TBD';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .event-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        .event-title { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
        .event-info { margin: 10px 0; }
        .event-info strong { color: #4b5563; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📅 Event You Attended</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || 'there'},</p>
          <p>This is a reminder about an event you registered for and attended:</p>
          <div class="event-details">
            <div class="event-title">${event.title}</div>
            <div class="event-info"><strong>📍 Location:</strong> ${event.location || 'TBD'}</div>
            <div class="event-info"><strong>📅 Date:</strong> ${eventDate}</div>
          </div>
          <p>Thank you for attending! We hope you had a great time.</p>
          <p>Best regards,<br>Event Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail({
    to: userEmail,
    subject,
    html,
  });
  
  if (result && result.success) {
    logger.info(`✅ Past event reminder email sent successfully to ${userEmail}`);
  } else {
    logger.error(`❌ Failed to send past event reminder email to ${userEmail}:`, result?.error || 'Unknown error');
  }
  
  return result;
};

// 24-hour reminder notification (for remind me later)
export const send24HourReminderEmail = async (userEmail, userName, event) => {
  logger.info(`📧 Attempting to send 24-hour reminder email to: ${userEmail}`);
  
  const subject = `⏰ Reminder: ${event.title} - 24 Hours Later`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .event-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #a855f7; }
        .event-title { font-size: 24px; font-weight: bold; color: #1f2937; margin-bottom: 10px; }
        .event-info { margin: 10px 0; }
        .event-info strong { color: #4b5563; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ 24-Hour Reminder</h1>
        </div>
        <div class="content">
          <p>Hi ${userName || 'there'},</p>
          <p>You asked us to remind you about this event 24 hours later:</p>
          <div class="event-details">
            <div class="event-title">${event.title}</div>
            <div class="event-info"><strong>📍 Location:</strong> ${event.location || 'TBD'}</div>
            ${event.startDate ? `<div class="event-info"><strong>📅 Date:</strong> ${new Date(event.startDate).toLocaleString()}</div>` : ''}
          </div>
          <p>Don't forget to check it out!</p>
          <p>Best regards,<br>Event Management Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const result = await sendEmail({
    to: userEmail,
    subject,
    html,
  });
  
  if (result && result.success) {
    logger.info(`✅ 24-hour reminder email sent successfully to ${userEmail}`);
  } else {
    logger.error(`❌ Failed to send 24-hour reminder email to ${userEmail}:`, result?.error || 'Unknown error');
  }
  
  return result;
};
