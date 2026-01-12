import { createUser, authenticateUser, authenticateUserWithPassword } from '../services/authService.js';
import { validateUsername, validateEmail, validatePassword, validateAccessKey } from '../utils/validator.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { sendWelcomeEmail } from '../services/emailService.js';

export const signup = async (req, res) => {
  try {
    const { username, email, password, confirmPassword, accessKey } = req.body;

    // Log request for debugging (without sensitive data)
    logger.info('Signup request received', { 
      username: username ? 'provided' : 'missing', 
      email: email ? 'provided' : 'missing',
      password: password ? 'provided' : 'missing',
      confirmPassword: confirmPassword ? 'provided' : 'missing',
      accessKey: accessKey ? 'provided' : 'not provided'
    });

    // Validate required fields exist
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    if (!confirmPassword || typeof confirmPassword !== 'string') {
      return res.status(400).json({ success: false, error: 'Password confirmation is required' });
    }

    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ success: false, error: usernameValidation.error });
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return res.status(400).json({ success: false, error: emailValidation.error });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ success: false, error: passwordValidation.error });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: 'Passwords do not match' });
    }

    const existingUser = await User.findOne({
      $or: [{ username: username.toLowerCase().trim() }, { email: email.toLowerCase().trim() }],
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Username or email already exists' });
    }

    // Only pass accessKey if it's provided and not empty/null
    const finalAccessKey = (accessKey && typeof accessKey === 'string' && accessKey.trim().length > 0) 
      ? accessKey.trim() 
      : null;

    const user = await createUser(username, email, password, finalAccessKey);
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    // Send welcome email in background (don't wait for it)
    sendWelcomeEmail(user.email, user.username)
      .then(result => {
        if (result && result.success) {
          logger.info(`✅ Welcome email sent successfully to ${user.email}`);
        } else {
          logger.error(`❌ Failed to send welcome email to ${user.email}:`, result?.error || 'Unknown error');
        }
      })
      .catch(err => {
        logger.error('❌ Error sending welcome email:', err);
        logger.error('Error details:', err.message, err.stack);
      });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error('Signup error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Username or email already exists' });
    }
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
};

export const login = async (req, res) => {
  try {
    const { username, accessKey, password } = req.body;

    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }

    let result;
    // Primary authentication method: password
    if (password) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ success: false, error: passwordValidation.error });
      }
      result = await authenticateUserWithPassword(username, password);
    } else if (accessKey) {
      // Fallback: access key (for backward compatibility)
      const accessKeyValidation = validateAccessKey(accessKey);
      if (!accessKeyValidation.valid) {
        return res.status(400).json({ success: false, error: accessKeyValidation.error });
      }
      result = await authenticateUser(username, accessKey);
    } else {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    if (!result.success) {
      return res.status(401).json({ success: false, error: result.error || 'Invalid credentials' });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token: result.token,
      user: {
        id: result.user._id,
        username: result.user.username,
        email: result.user.email,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
};
