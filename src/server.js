import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('✅ .env file loaded from:', envPath);
} else {
  console.error('❌ .env file not found at:', envPath);
  process.exit(1);
}

import app from './app.js';
import connectDB from './config/db.js';
import { config } from './config/env.js';
import logger from './utils/logger.js';
import './services/reminderCron.js';
import { createServer } from 'net';

connectDB();

// Backend uses ports 3000-3009 (frontend will use 3010+ to avoid conflicts)
const PORT = parseInt(config.port) || 3000;

// Function to check if a port is available - more reliable check
const isPortAvailable = (port) => {
  return new Promise((resolve) => {
    const testServer = createServer();
    let resolved = false;
    
    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        testServer.removeAllListeners();
        testServer.close();
      }
    };
    
    testServer.once('listening', () => {
      cleanup();
      resolve(true);
    });
    
    testServer.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        cleanup();
        resolve(false);
      } else {
        cleanup();
        resolve(false);
      }
    });
    
    testServer.listen(port, '127.0.0.1');
    
    // Timeout to prevent hanging
    setTimeout(() => {
      if (!resolved) {
        cleanup();
        resolve(false);
      }
    }, 1000);
  });
};

// Function to find an available port starting from the desired port
// Backend uses ports 3000-3009 (leaves 3010+ for frontend)
const findAvailablePort = async (startPort) => {
  let port = parseInt(startPort);
  let maxAttempts = 10; // Try ports 3000-3009 for backend only
  
  for (let i = 0; i < maxAttempts; i++) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    logger.info(`Port ${port} is in use, trying port ${port + 1}...`);
    port++;
  }
  
  throw new Error(`Could not find an available port after trying ${maxAttempts} ports starting from ${startPort}`);
};

// Start server on available port - try binding directly and handle EADDRINUSE
const startServer = async () => {
  let attemptPort = PORT;
  const maxAttempts = 10; // Try ports 3000-3009
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check if port is available first
      const available = await isPortAvailable(attemptPort);
      if (!available) {
        logger.info(`Port ${attemptPort} is in use, trying port ${attemptPort + 1}...`);
        attemptPort++;
        continue;
      }
      
      // Port is available, try to start server
      const server = app.listen(attemptPort, '0.0.0.0', () => {
        logger.info(`✅ Server running on port ${attemptPort}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`✅ Header size limit increased to prevent 431 errors`);
        process.env.BACKEND_PORT = attemptPort.toString();
        
        // Write port to a file for frontend to read (if needed)
        try {
          writeFileSync('.backend-port', attemptPort.toString(), 'utf8');
        } catch (err) {
          // Ignore file write errors
        }
      });
      
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.info(`Port ${attemptPort} became unavailable, trying next port...`);
          server.close();
        } else {
          logger.error('Server error:', error);
          process.exit(1);
        }
      });
      
      // Server started successfully
      return;
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        logger.info(`Port ${attemptPort} is in use, trying port ${attemptPort + 1}...`);
        attemptPort++;
        if (attemptPort > PORT + maxAttempts - 1) {
          logger.error(`Could not find available port in range ${PORT}-${PORT + maxAttempts - 1}`);
          process.exit(1);
        }
        continue;
      } else {
        logger.error('Server startup error:', error);
        process.exit(1);
      }
    }
  }
  
  logger.error(`Could not find available port after trying ${maxAttempts} ports starting from ${PORT}`);
  process.exit(1);
};

startServer();
