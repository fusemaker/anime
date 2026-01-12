const { execSync } = require('child_process');
const { createServer } = require('net');
const { resolve } = require('path');
const http = require('http');
const { existsSync, readFileSync } = require('fs');

// Function to check if a port is available
function isPortAvailable(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => {
      server.once('close', () => resolvePort(true));
      server.close();
    });
    server.on('error', () => resolvePort(false));
  });
}

// Find backend port by checking health endpoint or reading from file
async function findBackendPort() {
  // First, try to read from .backend-port file in project root (backend writes this)
  const backendPortFile = resolve(__dirname, '../../.backend-port');
  if (existsSync(backendPortFile)) {
    try {
      const port = readFileSync(backendPortFile, 'utf8').trim();
      if (port && /^\d+$/.test(port)) {
        // Verify backend is actually running on this port
        if (await checkBackendHealth(parseInt(port))) {
          return parseInt(port);
        }
      }
    } catch (err) {
      // Ignore file read errors
    }
  }
  
  // Try to find backend by checking health endpoint on ports 3000-3009
  for (let port = 3000; port <= 3009; port++) {
    if (await checkBackendHealth(port)) {
      return port;
    }
  }
  
  // Default fallback
  console.warn('⚠️  Could not detect backend port, using default 3000');
  return 3000;
}

// Check if backend is running on a specific port by hitting health endpoint
function checkBackendHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, { timeout: 2000 }, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Find an available port starting from 3010
async function findAvailablePort(startPort = 3010, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`Could not find available port in range ${startPort}-${startPort + maxAttempts - 1}`);
}

// Main function
(async () => {
  try {
    // Wait a moment for backend to start if it's starting concurrently
    console.log('🔍 Detecting backend port...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
    
    const backendPort = await findBackendPort();
    const port = await findAvailablePort(3010);
    
    console.log(`✅ Backend detected on port ${backendPort}`);
    console.log(`Starting React app on port ${port}...`);
    
    const apiUrl = `http://localhost:${backendPort}`;
    console.log(`Frontend will connect to backend at: ${apiUrl}`);
    
    // Set environment variables for react-scripts
    // REACT_APP_* variables must be set in the environment when react-scripts starts
    process.env.PORT = port.toString();
    process.env.BROWSER = 'none';
    process.env.FAST_REFRESH = 'true';
    process.env.CI = 'false';
    process.env.REACT_APP_API_URL = apiUrl;
    
    // Start react-scripts (it will inherit process.env automatically)
    execSync('react-scripts start', { 
      stdio: 'inherit',
      cwd: resolve(__dirname, '..'),
      env: {
        ...process.env,
        PORT: port.toString(),
        BROWSER: 'none',
        FAST_REFRESH: 'true',
        CI: 'false',
        REACT_APP_API_URL: apiUrl
      }
    });
  } catch (error) {
    console.error('Error starting frontend:', error.message);
    process.exit(1);
  }
})();
