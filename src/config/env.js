import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  serpApiKey: process.env.SERP_API_KEY || '70af1cc6113c8d045ffb38a7d13abcabb1713eac120843a720acc01866edac5d',
  serperApiKey: process.env.SERPER_API_KEY, // Fallback API
  geoapifyApiKey: process.env.GEOAPIFY_API_KEY,
  ipinfoToken: process.env.IPINFO_TOKEN || '6d1579279c208889d19285c6a1f5a7d731c8f42c',
  nodeEnv: process.env.NODE_ENV || 'development',
  // Email configuration
  emailUser: process.env.EMAIL_USER,
  emailAppPassword: process.env.EMAIL_APP_PASSWORD,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
};
