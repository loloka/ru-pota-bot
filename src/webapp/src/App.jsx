import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/layout/Header.jsx';
import BottomNav from './components/layout/BottomNav.jsx';
import DashboardTab from './components/tabs/DashboardTab.jsx';
import ClusterTab from './components/tabs/ClusterTab.jsx';
import MapTab from './components/tabs/MapTab.jsx';
import SubscriptionsTab from './components/tabs/SubscriptionsTab.jsx';
import ProfileTab from './components/tabs/ProfileTab.jsx';
import OoptTab from './components/tabs/OoptTab.jsx';
import OsmAndModal from './components/modals/OsmAndModal.jsx';
import TelegramAuthModal from './components/modals/TelegramAuthModal.jsx';
import WebAuthModal from './components/modals/WebAuthModal.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import { telegram } from './services/telegram.js';

import { api } from './services/api.js';
import { getTranslation } from './services/i18n.js';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clusterFilter, setClusterFilter] = useState({ scope: 'ru', search: '' });
  
  // Theme state with localStorage persistence
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('rupota_theme') || 'dark';
  });

  // Language state with localStorage persistence
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('rupota_lang') || 'RU';
  });
  
  // App profile state
  const [user, setUser] = useState(() => telegram.getUser());
  const [activeSpot, setActiveSpot] = useState(null);
  const [stats, setStats] = useState(null);
  const [subscriptionsCount, setSubscriptionsCount] = useState(0);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showOsmAndModal, setShowOsmAndModal] = useState(false);
  const [mapTarget, setMapTarget] = useState(null);

  // Guest Telegram Authorization Prompt Modal & Web Auth Modal
  const [authModal, setAuthModal] = useState({ open: false, title: '', reason: '' });
  const [webAuthModalOpen, setWebAuthModalOpen] = useState(false);

  const handleRequireAuth = (title = '', reason = '') => {
    setAuthModal({ open: true, title, reason });
  };

  const handleOpenWebAuth = () => {
    setAuthModal({ open: false, title: '', reason: '' });
    setWebAuthModalOpen(true);
  };

  const handleWebLogout = async () => {
    telegram.haptic.notification('warning');
    await api.logoutWeb();
    setUser(null);
    setActiveSpot(null);
    setStats(null);
    setSubscriptionsCount(0);
    setUnreadNotifsCount(0);
    await loadProfile(false);
  };

  const loadProfile = useCallback(async (silent = false) => {
    try {
      const data = await api.getMe();
      if (data?.user) {
        setUser(prev => {
          // If status transitioned from pending to approved, celebrate with tactile haptic
          if (prev?.status === 'pending' && data.user.status === 'approved') {
            telegram.haptic.notification('success');
          }
          return {
            ...(prev || {}),
            ...data.user,
          };
        });
      } else {
        setUser(null);
      }
      setActiveSpot(data?.activeSpot || null);
      setStats(data?.stats || null);
      setSubscriptionsCount(data?.subscriptionsCount || 0);
      setUnreadNotifsCount(data?.unreadNotificationsCount || 0);
    } catch (err) {
      if (!silent) {
        console.warn('[App] Could not load operator profile from API:', err.message);
        setUser(null);
      }
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const handleNavigate = (tabId, params = {}) => {
    if (tabId === 'cluster' && (params.scope || params.search !== undefined || params.highlightCallsign !== undefined)) {
      setClusterFilter({
        scope: params.scope || 'ru',
        search: params.search || '',
        highlightCallsign: params.highlightCallsign || null,
      });
    }
    if (tabId === 'map' && params.focusParkRef) {
      setMapTarget(params.focusParkRef);
    }
    setActiveTab(tabId);

    // Refresh profile on navigation to dashboard or profile
    if (tabId === 'dashboard' || tabId === 'profile') {
      loadProfile(true);
    }
  };

  // Sync theme with HTML document element and body
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    telegram.setThemeColors(theme);
    localStorage.setItem('rupota_theme', theme);
  }, [theme]);

  // Sync language with localStorage
  useEffect(() => {
    localStorage.setItem('rupota_lang', language);
  }, [language]);

  const t = useCallback((key) => {
    return getTranslation(language, key);
  }, [language]);

  // 1. Initial load
  useEffect(() => {
    telegram.init();

    // Check for auth_token query parameter (e.g. returning from Telegram bot 1-click login or /login)
    const urlParams = new URLSearchParams(window.location.search);
    const authToken = urlParams.get('auth_token');

    if (authToken) {
      setLoadingProfile(true);
      api.pollTelegramLogin(authToken)
        .then((res) => {
          if (res?.status === 'confirmed' && res?.token) {
            telegram.haptic.notification('success');
            urlParams.delete('auth_token');
            const newSearch = urlParams.toString();
            const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
            window.history.replaceState({}, document.title, cleanUrl);
          }
          loadProfile(false);
        })
        .catch(() => {
          loadProfile(false);
        });
    } else {
      loadProfile();
    }
  }, [loadProfile]);

  // Auto-close auth modal if user profile becomes authenticated
  useEffect(() => {
    if (user && authModal.open) {
      setAuthModal({ open: false, title: '', reason: '' });
    }
  }, [user, authModal.open]);

  // 2. Refresh on app focus or visibility change (e.g. returning after checking Telegram chat)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadProfile(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [loadProfile]);

  // 3. Smart auto-poll (every 5 seconds) while status is 'pending' so approval applies immediately without re-opening app!
  useEffect(() => {
    if (user?.status !== 'pending') return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadProfile(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [user?.status, loadProfile]);

  // 4. Gentle periodic background sync (every 45 seconds) for on-air spots and status
  useEffect(() => {
    if (user?.status === 'pending') return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadProfile(true);
      }
    }, 45000);

    return () => clearInterval(interval);
  }, [user?.status, loadProfile]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleLanguage = () => {
    setLanguage(prev => (prev === 'RU' ? 'EN' : 'RU'));
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#0b0f19] text-slate-100' : 'bg-slate-100 text-slate-800'} flex flex-col justify-between selection:bg-emerald-500/30 selection:text-emerald-400 transition-colors duration-200`}>
      {/* Ambient glowing background gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {theme === 'dark' ? (
          <>
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px]" />
            <div className="absolute top-1/3 -right-32 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-10 left-10 w-72 h-72 bg-emerald-600/5 rounded-full blur-[90px]" />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -left-32 w-80 h-80 bg-emerald-500/5 rounded-full blur-[100px]" />
            <div className="absolute top-1/3 -right-32 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
          </>
        )}
      </div>

      {/* Main Container */}
      <div className="relative z-10 flex flex-col flex-1 max-w-lg mx-auto w-full">
        {/* Top Header */}
        <Header 
          theme={theme}
          onToggleTheme={toggleTheme}
          language={language}
          onToggleLanguage={toggleLanguage}
          notificationCount={unreadNotifsCount}
          onOpenSubscriptions={() => handleNavigate('subscriptions')}
          onOpenOsmAnd={() => setShowOsmAndModal(true)}
          t={t}
        />


        {/* Dynamic Screen Content */}
        <main className="flex-1 px-4 pt-3">
          <ErrorBoundary key={activeTab}>
            {activeTab === 'dashboard' && (
              <DashboardTab 
                user={user} 
                activeSpot={activeSpot}
                stats={stats}
                subscriptionsCount={subscriptionsCount}
                onRefreshProfile={loadProfile}
                onNavigate={handleNavigate}
                onRequireAuth={handleRequireAuth}
                onOpenWebAuth={handleOpenWebAuth}
                language={language}
                t={t}
              />
            )}

            {activeTab === 'cluster' && (
              <ClusterTab 
                user={user}
                onNavigate={handleNavigate} 
                onRequireAuth={handleRequireAuth}
                clusterFilter={clusterFilter}
                language={language}
                t={t}
              />
            )}

            {activeTab === 'map' && (
              <MapTab 
                user={user}
                onNavigate={handleNavigate}
                language={language}
                t={t}
                mapTarget={mapTarget}
                onClearMapTarget={() => setMapTarget(null)}
              />
            )}

            {activeTab === 'oopt' && (
              <OoptTab 
                language={language}
                t={t}
                onNavigateToMap={(oopt) => {
                  setMapTarget(oopt);
                  setActiveTab('map');
                }}
              />
            )}


            {activeTab === 'subscriptions' && (
              <SubscriptionsTab 
                user={user}
                subscriptionsCount={subscriptionsCount}
                onCountChange={setSubscriptionsCount}
                unreadNotifsCount={unreadNotifsCount}
                onUnreadCountChange={setUnreadNotifsCount}
                onNavigate={handleNavigate}
                onRequireAuth={handleRequireAuth}
                onOpenWebAuth={handleOpenWebAuth}
                onRefreshProfile={loadProfile}
                language={language}
                t={t}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileTab 
                user={user} 
                stats={stats}
                subscriptionsCount={subscriptionsCount}
                onRefreshProfile={loadProfile}
                onRequireAuth={handleRequireAuth}
                onOpenWebAuth={handleOpenWebAuth}
                onWebLogout={handleWebLogout}
                onNavigate={handleNavigate}
                language={language}
                t={t}
              />
            )}
          </ErrorBoundary>
        </main>

        {/* Bottom Navigation Bar */}
        <BottomNav 
          activeTab={activeTab} 
          onSelectTab={handleNavigate} 
          unreadNotifsCount={unreadNotifsCount}
          language={language}
          t={t}
        />

        {/* Global OsmAnd Offline Modal */}
        {showOsmAndModal && (
          <OsmAndModal 
            language={language}
            onClose={() => setShowOsmAndModal(false)}
          />
        )}

        {/* Guest Telegram Authorization Prompt Modal */}
        {authModal.open && (
          <TelegramAuthModal 
            language={language}
            title={authModal.title}
            reason={authModal.reason}
            onOpenWebAuth={handleOpenWebAuth}
            onSuccess={() => loadProfile(false)}
            onClose={() => setAuthModal({ open: false, title: '', reason: '' })}
          />
        )}

        {/* Web Callsign + Email Authorization Modal */}
        {webAuthModalOpen && (
          <WebAuthModal 
            isOpen={webAuthModalOpen}
            language={language}
            onClose={() => setWebAuthModalOpen(false)}
            onSuccess={() => loadProfile(false)}
          />
        )}
      </div>
    </div>
  );
}

