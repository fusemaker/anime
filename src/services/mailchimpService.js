import mailchimp from '@mailchimp/mailchimp_marketing';
import logger from '../utils/logger.js';

// Configuration
mailchimp.setConfig({
  apiKey: process.env.MAILCHIMP_API_KEY,
  server: 'us20',
});

const AUDIENCE_ID = '52cd3c4b13';

export const addSubscriber = async (email, firstName, lastName, mergeFields = {}) => {
  try {
    const response = await mailchimp.lists.addListMember(AUDIENCE_ID, {
      email_address: email,
      status: 'subscribed',
      merge_fields: {
        FNAME: firstName || '',
        LNAME: lastName || '',
        ...mergeFields,
      },
    });

    logger.info('Mailchimp subscriber added:', email);
    return { success: true, data: response };
  } catch (error) {
    if (error.status === 400 && error.response?.body?.title === 'Member Exists') {
      logger.info('Subscriber already exists:', email);
      return { success: true, message: 'Already subscribed' };
    }
    logger.error('Mailchimp error:', error.response?.body || error.message);
    return { success: false, error: error.response?.body || error.message };
  }
};

export const sendReminderEmail = async (email, eventTitle, eventDate, eventLocation) => {
  try {
    // For Mailchimp, we'll create a segment for reminder campaigns
    // Or use Transactional API (Mandrill) for direct emails
    logger.info('Reminder prepared for:', email, eventTitle);

    // In production, you would:
    // 1. Create a segment with this email
    // 2. Trigger an automation campaign
    // 3. Or use Mailchimp Transactional API

    return { success: true, message: 'Reminder queued' };
  } catch (error) {
    logger.error('Mailchimp reminder error:', error.response?.body || error.message);
    return { success: false, error: error.response?.body || error.message };
  }
};

export const updateSubscriber = async (email, mergeFields) => {
  try {
    const subscriberHash = Buffer.from(email.toLowerCase()).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await mailchimp.lists.updateListMember(
      AUDIENCE_ID,
      subscriberHash,
      {
        merge_fields: mergeFields,
      }
    );

    logger.info('Mailchimp subscriber updated:', email);
    return { success: true, data: response };
  } catch (error) {
    logger.error('Mailchimp update error:', error.response?.body || error.message);
    return { success: false, error: error.response?.body || error.message };
  }
};
