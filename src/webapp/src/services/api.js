import { telegram } from './telegram.js';

const API_BASE = '/api/tma';

/**
 * Universal TMA API Request Wrapper
 * Automatically provides Telegram WebApp credentials and Dev Mock headers.
 */
async function request(endpoint, options = {}) {
  const initData = telegram.getInitData();
  const isExplicitDevMock = Boolean(
    import.meta.env.DEV && 
    typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
    window.location.search.includes('dev_mock=1')
  );

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  if (initData) {
    headers['Authorization'] = `tma ${initData}`;
    headers['X-Telegram-Init-Data'] = initData;
  }

  if (isExplicitDevMock) {
    headers['X-Dev-Mock'] = 'true';
  }

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data?.error || `HTTP ${res.status}: Ошибка запроса`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    console.error(`[API Error] ${options.method || 'GET'} ${endpoint}:`, err.message);
    throw err;
  }
}

export const api = {
  /**
   * Get current operator profile, status, active spot and stats
   */
  async getMe() {
    return request('/me');
  },

  /**
   * Get cluster spots with filters
   * @param {{ scope?: 'ru'|'world', band?: string, mode?: string, search?: string }} params 
   */
  async getSpots(params = {}) {
    const query = new URLSearchParams();
    if (params.scope) query.append('scope', params.scope);
    if (params.band && params.band !== 'Все') query.append('band', params.band);
    if (params.mode && params.mode !== 'Все') query.append('mode', params.mode);
    if (params.search) query.append('search', params.search);

    const qs = query.toString();
    return request(`/spots${qs ? `?${qs}` : ''}`);
  },

  /**
   * Get POTA parks list with coordinates and active status
   * @param {{ search?: string, activeOnly?: boolean }} params 
   */
  async getParks(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.activeOnly) query.append('activeOnly', 'true');
    const qs = query.toString();
    return request(`/parks${qs ? `?${qs}` : ''}`);
  },

  async getRaza(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    const qs = query.toString();
    return request(`/raza${qs ? `?${qs}` : ''}`);
  },

  async searchAirfields(q) {
    if (!q) return { airfields: [] };
    return request(`/airfields?q=${encodeURIComponent(q)}`);
  },

  async lookupCallsign(callsign) {
    if (!callsign) throw new Error('Callsign required');
    return request(`/lookup/callsign/${encodeURIComponent(callsign.trim().toUpperCase())}`);
  },

  async lookupPark(ref) {
    if (!ref) throw new Error('Park reference required');
    return request(`/lookup/park/${encodeURIComponent(ref.trim().toUpperCase())}`);
  },




  /**
   * Publish a new spot or respot
   * @param {{ reference: string, frequency: string|number, mode: string, comment?: string }} data 
   */
  async postSpot(data) {
    return request('/spots', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Finish activation (QRT)
   */
  async stopSpot() {
    return request('/spots/qrt', {
      method: 'POST',
    });
  },

  /**
   * Get all user subscriptions (callsigns and parks)
   */
  async getSubscriptions() {
    return request('/subscriptions');
  },

  /**
   * Add a new subscription
   * @param {{ type: 'callsign'|'park', target: string }} data 
   */
  async addSubscription(data) {
    return request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete a subscription by ID
   * @param {number|string} id 
   */
  async deleteSubscription(id) {
    return request(`/subscriptions/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Delete subscription by target name/callsign
   * @param {'callsign'|'park'} type
   * @param {string} target
   */
  async deleteSubscriptionByTarget(type, target) {
    return request(`/subscriptions/target/${type}/${encodeURIComponent(target)}`, {
      method: 'DELETE',
    });
  },

  /**
   * Toggle DM notifications in Telegram bot
   * @param {boolean} enabled 
   */
  async toggleAlerts(enabled) {
    return request('/subscriptions/toggle-alerts', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },


  /**
   * Submit a callsign change request to bot administrators
   * @param {string} newCallsign 
   */
  async requestCallsign(newCallsign) {
    return request('/callsign/request', {
      method: 'POST',
      body: JSON.stringify({ newCallsign }),
    });
  },
};
