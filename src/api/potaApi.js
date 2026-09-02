import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.POTA_API_BASE_URL || 'https://api.pota.app';

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 25000,
  headers: {
    'User-Agent': 'RU-POTA-Bot/1.2.0 (Telegram Bot; Node.js)'
  }
});

export const potaApi = {
  /**
   * Fetch active spots from the POTA API
   * @returns {Promise<Array>} Array of spots
   */
  async getSpots() {
    try {
      const response = await apiClient.get('/spot/activator');
      return response.data;
    } catch (error) {
      const code = error.code || (error.response ? `HTTP ${error.response.status}` : 'Unknown');
      console.warn(`[POTA API] ⚠️ Временная задержка сети (${code}). Ожидание следующего цикла...`);
      return [];
    }
  },

  /**
   * Fetch statistics for a specific callsign
   * @param {string} callsign 
   * @returns {Promise<Object>} Statistics object
   */
  async getStats(callsign) {
    try {
      const response = await apiClient.get(`/profile/${encodeURIComponent(callsign)}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching stats for ${callsign}:`, error.message);
      throw error;
    }
  },

  /**
   * Fetch park information
   * @param {string} reference e.g., 'RU-0073'
   * @returns {Promise<Object>} Park info
   */
  async getPark(reference) {
    try {
      const response = await apiClient.get(`/park/${encodeURIComponent(reference)}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching park ${reference}:`, error.message);
      throw error;
    }
  },

  /**
   * Fetch park leaderboard
   * @param {string} reference 
   * @returns {Promise<Object>} Leaderboard data
   */
  async getParkLeaderboard(reference) {
    try {
      const response = await apiClient.get(`/park/leaderboard/${encodeURIComponent(reference)}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching park leaderboard ${reference}:`, error.message);
      return { activations: [], activator_qsos: [], hunter_qsos: [] };
    }
  },

  /**
   * Fetch recent park activations
   * @param {string} reference 
   * @returns {Promise<Array>} Array of activations
   */
  async getParkActivations(reference) {
    try {
      const response = await apiClient.get(`/park/activations/${encodeURIComponent(reference)}`);
      return response.data || [];
    } catch (error) {
      console.error(`Error fetching park activations ${reference}:`, error.message);
      return [];
    }
  },

  /**
   * Post a spot to the POTA cluster
   * @param {Object} spotData 
   * @returns {Promise<number|null>} The new spotId or null on failure
   */
  async postSpot(spotData) {
    try {
      const response = await apiClient.post('/spot', spotData);
      // The API returns the list of all active spots. We find ours to extract the ID.
      const spots = response.data;
        if (Array.isArray(spots)) {
          // Find all spots that match our activator, reference, and spotter
          const mySpots = spots.filter(s => 
            s.activator === spotData.activator && 
            s.reference === spotData.reference &&
            s.spotter === spotData.spotter
          );
          if (mySpots.length > 0) {
            // Return the largest (newest) spotId
            return Math.max(...mySpots.map(s => s.spotId));
          }
        }
      return -1; // Success but couldn't find ID
    } catch (error) {
      console.error(`Error posting spot to POTA:`, error.response?.data || error.message);
      return null;
    }
  }
};
