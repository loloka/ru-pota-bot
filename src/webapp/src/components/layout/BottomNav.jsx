import React from 'react';
import { 
  Home, 
  Radio, 
  Compass, 
  Bell, 
  User 
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';

export const TABS = [
  { id: 'dashboard', key: 'nav_dashboard', icon: Home },
  { id: 'cluster', key: 'nav_cluster', icon: Radio, badge: 'LIVE' },
  { id: 'map', key: 'nav_map', icon: Compass },
  { id: 'subscriptions', key: 'nav_subscriptions', icon: Bell },
  { id: 'profile', key: 'nav_profile', icon: User },
];

export default function BottomNav({ activeTab, onSelectTab, t = (k) => k }) {
  const handleTabClick = (tabId) => {
    if (tabId !== activeTab) {
      telegram.haptic.selection();
      onSelectTab(tabId);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass-nav pb-safe select-none">
      <div className="flex items-center justify-around px-2 py-2 max-w-md mx-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const label = t(tab.key);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-2 rounded-2xl transition-all duration-200 active:scale-90 ${
                isActive 
                  ? 'bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-glow-pill' 
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {/* Badge for Cluster tab */}
              {tab.badge && !isActive && (
                <span className="absolute top-1 right-3 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}

              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110 stroke-[2.5]' : 'stroke-[1.8]'}`} />
              </div>

              <span className={`text-[10px] font-semibold mt-1 tracking-tight transition-all duration-200 ${
                isActive ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-slate-500 dark:text-slate-400'
              }`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
