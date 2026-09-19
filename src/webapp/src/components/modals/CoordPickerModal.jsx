import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, MapPin, ArrowLeft } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { telegram } from '../../services/telegram.js';

export default function CoordPickerModal({ initialLat, initialLon, onSelect, onClose }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const numLat = parseFloat(initialLat);
  const numLon = parseFloat(initialLon);
  const hasValidCoords = !isNaN(numLat) && !isNaN(numLon) && numLat !== 0 && numLon !== 0;

  const [coords, setCoords] = useState({
    lat: hasValidCoords ? numLat.toFixed(4) : '55.7512',
    lon: hasValidCoords ? numLon.toFixed(4) : '37.6184',
  });

  // Native Telegram BackButton
  useEffect(() => {
    const handleBack = () => {
      onClose();
    };
    telegram.backButton.show(handleBack);
    return () => {
      telegram.backButton.hide(handleBack);
    };
  }, [onClose]);

  // MainButton integration
  useEffect(() => {
    const handleConfirm = () => {
      telegram.haptic.notification('success');
      onSelect(coords.lat, coords.lon);
    };

    telegram.mainButton.setText('ВЫБРАТЬ ЭТИ КООРДИНАТЫ');
    telegram.mainButton.show();
    telegram.mainButton.onClick(handleConfirm);

    return () => {
      telegram.mainButton.hide();
      telegram.mainButton.offClick(handleConfirm);
    };
  }, [coords, onSelect]);

  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    const startLat = hasValidCoords ? numLat : 55.7512;
    const startLon = hasValidCoords ? numLon : 37.6184;
    const initialZoom = hasValidCoords ? 13 : 5;

    // Create Leaflet map
    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLon],
      zoom: initialZoom,
      zoomControl: true,
      attributionControl: false,
    });

    // Base OSM tiles
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '',
      maxZoom: 19,
    }).addTo(map);

    // Custom DivIcon that does not depend on unpkg image files
    const pinIcon = L.divIcon({
      className: 'coord-picker-pin',
      html: `
        <div style="position:relative; width:36px; height:36px; transform:translate(-50%, -100%); cursor:pointer;">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="#10b981" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4));">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3" fill="#ffffff"></circle>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    const marker = L.marker([startLat, startLon], {
      draggable: true,
      icon: pinIcon,
    }).addTo(map);

    markerRef.current = marker;

    const updateCoordsState = (lat, lon) => {
      telegram.haptic.impact('light');
      setCoords({
        lat: Number(lat).toFixed(4),
        lon: Number(lon).toFixed(4),
      });
    };

    marker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      updateCoordsState(pos.lat, pos.lng);
    });

    map.on('click', (e) => {
      const pos = e.latlng;
      marker.setLatLng(pos);
      updateCoordsState(pos.lat, pos.lng);
    });

    mapInstanceRef.current = map;

    // Invalidate size on mount to avoid black screen / 0px container
    const t1 = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    const t2 = setTimeout(() => {
      map.invalidateSize();
    }, 300);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  const modalContent = (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-slate-900 text-slate-100">
      {/* Top Header */}
      <div className="flex-none flex items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-20">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Назад</span>
          </button>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
            <MapPin className="w-4 h-4 text-emerald-500" />
            <span>Выбор точки на карте</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Map Body */}
      <div className="flex-1 relative w-full h-full min-h-[300px]">
        <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }} />

        {/* Floating Bottom Card */}
        <div className="absolute bottom-5 left-3 right-3 z-[1000] pointer-events-none">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 shadow-xl border border-slate-200/80 dark:border-slate-800 pointer-events-auto flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                Кликните или перетащите маркер:
              </span>
              <span className="text-[10px] text-slate-400">Точность 4 знака</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="font-mono font-bold text-sm text-slate-900 dark:text-white px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 tracking-wide">
                {coords.lat}, {coords.lon}
              </div>

              <button
                type="button"
                onClick={() => {
                  telegram.haptic.notification('success');
                  onSelect(coords.lat, coords.lon);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/30 shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>Применить</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
}
