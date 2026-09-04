/**
 * Telegram WebApp Integration Service
 * Provides safe fallbacks when running in a desktop browser outside of Telegram.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

// Mock user profile for local browser development
const MOCK_USER = {
  id: 890862502,
  first_name: 'Сан Саныч',
  last_name: '',
  username: 'r9ogl',
  language_code: 'ru',
  callsign: 'R9OGL',
  isMock: true,
};

export const telegram = {
  /**
   * Reference to native Telegram WebApp object
   */
  raw: tg,

  /**
   * Check if running inside real Telegram client
   */
  isAvailable: Boolean(tg && tg.initData),

  /**
   * Initialize Telegram Mini App viewport and appearance
   */
  init() {
    if (!tg) {
      console.info('[Telegram Service] Running in desktop browser (Dev Mock active)');
      return;
    }

    try {
      tg.ready();
      tg.expand();
      if (typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
      }
      if (typeof tg.setHeaderColor === 'function') {
        tg.setHeaderColor('#0b0f19');
      }
      if (typeof tg.setBackgroundColor === 'function') {
        tg.setBackgroundColor('#0b0f19');
      }
      console.info('[Telegram Service] Initialized successfully in Telegram client');
    } catch (e) {
      console.warn('[Telegram Service] Init warning:', e.message);
    }
  },

  /**
   * Get current Telegram user profile or dev mock
   */
  getUser() {
    if (tg?.initDataUnsafe?.user) {
      return {
        ...tg.initDataUnsafe.user,
        isMock: false,
      };
    }
    return MOCK_USER;
  },

  /**
   * Raw initData string for backend HMAC validation
   */
  getInitData() {
    return tg?.initData || '';
  },

  /**
   * Telegram Haptic Feedback
   */
  haptic: {
    impact(style = 'light') {
      try {
        tg?.HapticFeedback?.impactOccurred(style);
      } catch (e) {
        // Safe no-op outside Telegram
      }
    },
    notification(type = 'success') {
      try {
        tg?.HapticFeedback?.notificationOccurred(type);
      } catch (e) {
        // Safe no-op
      }
    },
    selection() {
      try {
        tg?.HapticFeedback?.selectionChanged();
      } catch (e) {
        // Safe no-op
      }
    },
  },

  /**
   * Open link in Telegram
   */
  openTelegramLink(url) {
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  },

  /**
   * Open external web URL
   */
  openLink(url) {
    if (tg?.openLink) {
      tg.openLink(url);
    } else {
      window.open(url, '_blank');
    }
  },

  /**
   * Close Telegram WebApp
   */
  close() {
    tg?.close();
  },
};
