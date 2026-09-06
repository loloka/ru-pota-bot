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
   * Measure WebKit environment safe area top inset
   */
  getEnvSafeTop() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
    try {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-top:env(safe-area-inset-top, 0px);';
      (document.body || document.documentElement).appendChild(probe);
      const val = parseFloat(window.getComputedStyle(probe).paddingTop) || 0;
      probe.remove();
      return val;
    } catch (e) {
      return 0;
    }
  },

  /**
   * Synchronize Telegram content safe area insets with CSS custom properties on :root
   */
  syncSafeAreas() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;

    const envTop = this.getEnvSafeTop();
    let csTop = Number(tg?.contentSafeAreaInset?.top) || 0;
    let csBottom = Number(tg?.contentSafeAreaInset?.bottom) || 0;
    let saTop = Number(tg?.safeAreaInset?.top) || 0;
    let saBottom = Number(tg?.safeAreaInset?.bottom) || 0;

    // When running inside Telegram client:
    // If launched from chat list, attachment menu, direct link, or in fullscreen mode,
    // the webview extends behind the device status bar/Dynamic Island.
    // In this mode, Telegram displays floating capsule buttons ([X Закрыть] and [...]) ~36-44px tall.
    // If Telegram client reports saTop > 0 or envTop > 20px, but csTop is 0 or hasn't provided capsule clearance:
    if (tg && (saTop > 0 || envTop > 20)) {
      const baseTop = Math.max(saTop, envTop);
      if (csTop < baseTop + 36) {
        csTop = baseTop + 44;
      }
    }

    if (csTop > 0) {
      root.style.setProperty('--tg-content-safe-area-inset-top', `${csTop}px`);
      root.style.setProperty('--app-safe-top', `${csTop}px`);
    } else if (envTop > 0) {
      root.style.setProperty('--app-safe-top', `${envTop}px`);
    } else {
      root.style.setProperty('--app-safe-top', '0px');
    }

    if (csBottom > 0) {
      root.style.setProperty('--tg-content-safe-area-inset-bottom', `${csBottom}px`);
      root.style.setProperty('--app-safe-bottom', `${csBottom}px`);
    }

    if (saTop > 0) {
      root.style.setProperty('--tg-safe-area-inset-top', `${saTop}px`);
    }
    if (saBottom > 0) {
      root.style.setProperty('--tg-safe-area-inset-bottom', `${saBottom}px`);
    }
  },

  /**
   * Update header and background colors to match active theme
   */
  setThemeColors(theme = 'dark') {
    if (!tg) return;
    const color = theme === 'dark' ? '#0b0f19' : '#f1f5f9';
    try {
      if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor(color);
      if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor(color);
    } catch (e) {}
  },

  /**
   * Initialize Telegram Mini App viewport and appearance
   */
  init() {
    // Initial sync of safe area insets
    this.syncSafeAreas();

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
      this.setThemeColors('dark');

      // Re-sync after tg.ready() and expand()
      this.syncSafeAreas();

      // Listen for safe area and viewport events from Telegram client
      if (typeof tg.onEvent === 'function') {
        tg.onEvent('safeAreaChanged', () => this.syncSafeAreas());
        tg.onEvent('contentSafeAreaChanged', () => this.syncSafeAreas());
        tg.onEvent('viewportChanged', () => this.syncSafeAreas());
        tg.onEvent('fullscreenChanged', () => this.syncSafeAreas());
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', () => this.syncSafeAreas());
        window.addEventListener('orientationchange', () => {
          setTimeout(() => this.syncSafeAreas(), 150);
        });
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
