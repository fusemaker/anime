import axios from 'axios';
import { config } from '../config/env.js';
import logger from '../utils/logger.js';

export const reverseGeocode = async (lat, lon) => {
  try {
    const response = await axios.get(
      `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&apiKey=${config.geoapifyApiKey}`,
      {
        timeout: 10000, // 10 seconds timeout for Geoapify API
      }
    );

    if (response.data && response.data.features && response.data.features.length > 0) {
      const feature = response.data.features[0];
      const properties = feature.properties;
      
      return {
        success: true,
        city: properties.city || properties.county || properties.state || 'Unknown',
        region: properties.state || properties.region || 'Unknown',
        country: properties.country || 'Unknown',
        address: properties.formatted || `${properties.city || ''}, ${properties.country || ''}`.trim(),
        lat: lat,
        lon: lon,
      };
    }
    
    return { success: false, error: 'No location data found' };
  } catch (error) {
    logger.error('Reverse geocoding error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

export const getLocationFromIP = async () => {
  try {
    const response = await axios.get(
      `https://ipinfo.io/json?token=${config.ipinfoToken}`,
      {
        timeout: 10000, // 10 seconds timeout for IPinfo API
      }
    );
    
    if (response.data && response.data.loc) {
      const [lat, lon] = response.data.loc.split(',');
      return {
        success: true,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        city: response.data.city || 'Unknown',
        region: response.data.region || 'Unknown',
        country: response.data.country || 'Unknown',
        ip: response.data.ip,
      };
    }
    
    return { success: false, error: 'Could not determine location from IP' };
  } catch (error) {
    logger.error('IP location error:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

export const getLocationDetails = async (lat, lon) => {
  if (lat && lon) {
    return await reverseGeocode(lat, lon);
  }
  return await getLocationFromIP();
};
