/**
 * Telegram WebApp Integration Service
 * Provides safe fallbacks when running in a desktop browser outside of Telegram.
 */

const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

// Optional mock user profile ONLY for localhost dev when ?dev_mock=1 is explicitly in URL
const DEV_MOCK_USER = {
  id: 890862502,
  first_name: 'Сан Саныч',
  last_name: '',
  username: 'r9ogl',
  language_code: 'ru',
  callsign: 'R9OGL',
  isMock: true,
};

export const BOT_USERNAME = 'ru_pota_bot';
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;

export const telegram = {
  /**
   * Reference to native Telegram WebApp object
   */
  raw: tg,

  /**
   * Bot username and deep-link URLs
   */
  botUsername: BOT_USERNAME,
  botUrl: BOT_URL,

  /**
   * Check if running inside real Telegram client with valid auth session
   */
  isAvailable: Boolean(tg && tg.initData),

  /**
   * Initialize Telegram Mini App viewport and appearance
   */
  init() {
    if (!tg) {
      console.info('[Telegram Service] Running in standard web browser (Guest Mode)');
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
   * Get current Telegram user profile or null for guests
   */
  getUser() {
    if (tg?.initDataUnsafe?.user && tg?.initData) {
      return {
        ...tg.initDataUnsafe.user,
        isGuest: false,
      };
    }

    // Only allow explicit mock if localhost, Vite dev mode, AND ?dev_mock=1 query param
    const isExplicitLocalMock = Boolean(
      import.meta.env.DEV && 
      typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && 
      window.location.search.includes('dev_mock=1')
    );

    if (isExplicitLocalMock) {
      return DEV_MOCK_USER;
    }

    // Standard Guest mode (outside Telegram)
    return null;
  },

  /**
   * Raw initData string for backend HMAC validation
   */
  getInitData() {
    return tg?.initData || '';
  },

  /**
   * Open official bot link in Telegram
   */
  openTelegramBot(startParam = 'hub') {
    const url = `https://t.me/${BOT_USERNAME}?start=${startParam}`;
    if (tg && typeof tg.openTelegramLink === 'function') {
      try {
        tg.openTelegramLink(url);
        return;
      } catch (e) {}
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
