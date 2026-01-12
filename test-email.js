// Quick test script to verify email configuration
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

const testEmail = async () => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
      console.log('❌ Email credentials not found in .env file');
      console.log('Please add:');
      console.log('EMAIL_USER=your-email@gmail.com');
      console.log('EMAIL_APP_PASSWORD=your-16-digit-app-password');
      return;
    }

    console.log('📧 Testing email configuration...');
    console.log('Email User:', process.env.EMAIL_USER);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    // Verify connection
    await transporter.verify();
    console.log('✅ Email server connection successful!');

    // Send test email
    const info = await transporter.sendMail({
      from: `"Event Management System" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to yourself
      subject: '✅ Email Test - NodeMailer Working!',
      html: `
        <h2>🎉 Email Configuration Successful!</h2>
        <p>Your NodeMailer email service is working correctly.</p>
        <p>Real-time notifications are now enabled for:</p>
        <ul>
          <li>User signup</li>
          <li>Event registration</li>
          <li>Event saved</li>
          <li>Remind me later</li>
          <li>24-hour reminders</li>
          <li>Past event reminders</li>
        </ul>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('📬 Check your inbox:', process.env.EMAIL_USER);
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    if (error.code === 'EAUTH') {
      console.error('Authentication failed. Please check:');
      console.error('1. EMAIL_USER is your Gmail address');
      console.error('2. EMAIL_APP_PASSWORD is the 16-digit app password (no spaces)');
      console.error('3. 2-Step Verification is enabled on your Google account');
    }
  }
};

testEmail();
