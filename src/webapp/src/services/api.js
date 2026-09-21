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
  } else {
    // Check for standalone browser web token in localStorage
    try {
      const webToken = localStorage.getItem('rupota_web_token');
      if (webToken) {
        headers['Authorization'] = `Bearer ${webToken}`;
        headers['X-Web-Token'] = webToken;
      }
    } catch (e) {}
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

  async lookupPark(ref, callsign = '') {
    if (!ref) throw new Error('Park reference required');
    const qs = callsign ? `?callsign=${encodeURIComponent(callsign.trim().toUpperCase())}` : '';
    return request(`/lookup/park/${encodeURIComponent(ref.trim().toUpperCase())}${qs}`);
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
   * @param {{ callsign?: string, reference?: string, frequency?: string|number, mode?: string, parkName?: string }} [data]
   */
  async stopSpot(data = {}) {
    return request('/spots/qrt', {
      method: 'POST',
      body: JSON.stringify(data),
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
   * Get user notification feed (incoming spots)
   */
  async getNotifications() {
    return request('/notifications');
  },

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead() {
    return request('/notifications/read-all', {
      method: 'POST',
    });
  },

  /**
   * Delete single notification by ID
   */
  async deleteNotification(id) {
    return request(`/notifications/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Clear all user notifications
   */
  async clearAllNotifications() {
    return request('/notifications', {
      method: 'DELETE',
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

  /**
   * Get Russian Protected Areas (ООПТ) list with pagination and filters
   */
  async getOoptList(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.search) query.set('search', params.search);
    if (params.sig) query.set('sig', params.sig);
    if (params.category) query.set('category', params.category);
    if (params.status) query.set('status', params.status);
    if (params.region) query.set('region', params.region);
    if (params.pota) query.set('pota', params.pota);
    return request(`/oopt?${query.toString()}`);
  },

  /**
   * Get Russian Protected Areas (ООПТ) summary statistics
   */
  async getOoptStats() {
    return request('/oopt/stats');
  },

  /**
   * Get full detail card for an individual ООПТ
   */
  async getOoptDetails(nid) {
    return request(`/oopt/${nid}`);
  },

  /**
   * Online neural translation of OOPT name
   */
  async translateOoptName(text, category = '') {
    const params = new URLSearchParams({ text, category });
    return request(`/oopt/translate?${params.toString()}`);
  },

  /**
   * Request 6-digit email verification code for web login
   */
  async sendEmailCode({ callsign, email }) {
    return request('/auth/send-code', {
      method: 'POST',
      body: JSON.stringify({ callsign, email }),
    });
  },

  /**
   * Verify code and login as web operator
   */
  async verifyEmailCode({ email, code, callsign }) {
    const data = await request('/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code, callsign }),
    });
    if (data?.token) {
      try {
        localStorage.setItem('rupota_web_token', data.token);
      } catch (e) {}
    }
    return data;
  },

  /**
   * Request deep-link token to connect Telegram account for a web user
   */
  async getTelegramLinkToken() {
    return request('/link/telegram-token', { method: 'POST' });
  },

  /**
   * Logout web session
   */
  async logoutWeb() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (e) {}
    try {
      localStorage.removeItem('rupota_web_token');
    } catch (e) {}
  },
};
