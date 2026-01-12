export const validateUsername = (username) => {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: 'Username is required' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username must be alphanumeric with underscores only' };
  }
  if (username.length < 3 || username.length > 30) {
    return { valid: false, error: 'Username must be between 3 and 30 characters' };
  }
  return { valid: true };
};

export const validateEmail = (email) => {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email is required' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  return { valid: true };
};

export const validatePassword = (password) => {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  return { valid: true };
};

export const validateAccessKey = (accessKey) => {
  if (!accessKey || accessKey.trim().length === 0) {
    return { valid: false, error: 'Access key is required' };
  }
  return { valid: true };
};
