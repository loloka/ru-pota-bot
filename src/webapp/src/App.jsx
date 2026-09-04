import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/layout/Header.jsx';
import BottomNav from './components/layout/BottomNav.jsx';
import DashboardTab from './components/tabs/DashboardTab.jsx';
import ClusterTab from './components/tabs/ClusterTab.jsx';
import MapTab from './components/tabs/MapTab.jsx';
import SubscriptionsTab from './components/tabs/SubscriptionsTab.jsx';
import ProfileTab from './components/tabs/ProfileTab.jsx';
import OsmAndModal from './components/modals/OsmAndModal.jsx';
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
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showOsmAndModal, setShowOsmAndModal] = useState(false);
  const [mapTarget, setMapTarget] = useState(null);

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
    localStorage.setItem('rupota_theme', theme);
  }, [theme]);

  // Sync language with localStorage
  useEffect(() => {
    localStorage.setItem('rupota_lang', language);
  }, [language]);

  const t = useCallback((key) => {
    return getTranslation(language, key);
  }, [language]);

  const loadProfile = useCallback(async () => {
    try {
      const data = await api.getMe();
      if (data.user) {
        setUser(prev => ({
          ...prev,
          ...data.user,
        }));
      }
      setActiveSpot(data.activeSpot || null);
      setStats(data.stats || null);
      setSubscriptionsCount(data.subscriptionsCount || 0);
    } catch (err) {
      console.warn('[App] Could not load operator profile from API:', err.message);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    telegram.init();
    loadProfile();
  }, [loadProfile]);

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
            <div className="absolute top-1/3 -right-32 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px]" />
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
          notificationCount={subscriptionsCount > 0 ? subscriptionsCount : 0}
          onOpenOsmAnd={() => setShowOsmAndModal(true)}
          t={t}
        />


        {/* Dynamic Screen Content */}
        <main className="flex-1 px-4 pt-3">
          {activeTab === 'dashboard' && (
            <DashboardTab 
              user={user} 
              activeSpot={activeSpot}
              stats={stats}
              subscriptionsCount={subscriptionsCount}
              onRefreshProfile={loadProfile}
              onNavigate={handleNavigate}
              language={language}
              t={t}
            />
          )}

          {activeTab === 'cluster' && (
            <ClusterTab 
              onNavigate={handleNavigate} 
              clusterFilter={clusterFilter}
              language={language}
              t={t}
            />
          )}

          {activeTab === 'map' && (
            <MapTab 
              language={language}
              t={t}
              mapTarget={mapTarget}
              onClearMapTarget={() => setMapTarget(null)}
            />
          )}


          {activeTab === 'subscriptions' && (
            <SubscriptionsTab 
              onCountChange={setSubscriptionsCount} 
              language={language}
              t={t}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileTab 
              user={user} 
              stats={stats}
              onRefreshProfile={loadProfile}
              language={language}
              t={t}
            />
          )}
        </main>

        {/* Bottom Navigation Bar */}
        <BottomNav 
          activeTab={activeTab} 
          onSelectTab={handleNavigate} 
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
      </div>
    </div>
  );
}

