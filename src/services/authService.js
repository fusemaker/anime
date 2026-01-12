import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

export const createUser = async (username, email, password, accessKey = null) => {
  try {
    const passwordHash = await hashPassword(password);
    
    // Build user object - only include accessKey if it has a value
    const userData = {
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
    };
    
    // Only add accessKey if it's provided and not empty
    if (accessKey && typeof accessKey === 'string' && accessKey.trim().length > 0) {
      userData.accessKey = accessKey.trim();
    }
    
    const user = new User(userData);
    await user.save();
    return user;
  } catch (error) {
    logger.error('Error creating user:', error);
    throw error;
  }
};

export const authenticateUser = async (username, accessKey) => {
  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    if (user.accessKey && !user.compareAccessKey(accessKey)) {
      return { success: false, error: 'Invalid access key' };
    }

    user.lastActiveAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return { success: true, user, token };
  } catch (error) {
    logger.error('Error authenticating user:', error);
    return { success: false, error: 'Authentication failed' };
  }
};

export const authenticateUserWithPassword = async (username, password) => {
  try {
    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return { success: false, error: 'Invalid credentials' };
    }

    user.lastActiveAt = new Date();
    await user.save();

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return { success: true, user, token };
  } catch (error) {
    logger.error('Error authenticating user:', error);
    return { success: false, error: 'Authentication failed' };
  }
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (error) {
    return null;
  }
};
