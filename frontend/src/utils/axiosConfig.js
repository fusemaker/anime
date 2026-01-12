import axios from 'axios';

// Auto-detect API URL for mobile devices
const getApiBaseURL = () => {
  // Check if REACT_APP_API_URL is set in environment
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // For mobile devices, use the current hostname and port 3000
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const port = window.location.port || '3000';
    
    // If accessing from mobile (not localhost), use the current hostname
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `http://${hostname}:${port}`;
    }
  }
  
  // Default fallback
  return 'http://localhost:3000';
};

const api = axios.create({
  baseURL: getApiBaseURL(),
  timeout: 60000, // Increased to 60 seconds for complex operations (event search, AI responses)
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Log request details for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('API Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
        fullURL: `${config.baseURL}${config.url}`,
        hasToken: !!token
      });
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      if (error.response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.reload();
      }
      console.error('API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network Error - No response from server:', {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        message: error.message,
        code: error.code
      });
      
      // Provide user-friendly error message
      if (error.code === 'ERR_NETWORK' || error.message.includes('ERR_CONNECTION_RESET')) {
        console.error('⚠️ Backend server may be down or not responding. Please check if the backend is running.');
      }
    } else {
      // Error setting up the request
      console.error('Request Setup Error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
