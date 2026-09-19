import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { telegram } from '../../services/telegram.js';

export default function CoordPickerModal({ initialLat, initialLon, onSelect, onClose }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [coords, setCoords] = useState({ 
    lat: initialLat || 55.75, 
    lon: initialLon || 37.61 
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!mapInstanceRef.current && mapContainerRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [coords.lat, coords.lon],
        zoom: initialLat ? 12 : 5,
        zoomControl: false, // We'll add our own or just keep it simple
      });

      L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ru', {
        attribution: '&copy; Google Maps',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([coords.lat, coords.lon], { draggable: true }).addTo(map);
      markerRef.current = marker;

      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        setCoords({ lat: pos.lat.toFixed(6), lon: pos.lng.toFixed(6) });
      });

      map.on('click', (e) => {
        const pos = e.latlng;
        marker.setLatLng(pos);
        setCoords({ lat: pos.lat.toFixed(6), lon: pos.lng.toFixed(6) });
      });

      mapInstanceRef.current = map;
      
      // Fix leaflet icons
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Run once on mount

  // MainButton integration
  useEffect(() => {
    const handleConfirm = () => {
      onSelect(coords.lat, coords.lon);
    };

    telegram.mainButton.setText('ПОДТВЕРДИТЬ КООРДИНАТЫ');
    telegram.mainButton.show();
    telegram.mainButton.onClick(handleConfirm);

    return () => {
      telegram.mainButton.hide();
      telegram.mainButton.offClick(handleConfirm);
    };
  }, [coords, onSelect]);

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-slate-900">
      <div className="flex-none flex items-center justify-between p-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-10">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-emerald-500" />
          Укажите на карте
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>
      
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0" />
        
        <div className="absolute bottom-4 left-4 right-4 z-[1000] pointer-events-none">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-xl p-3 shadow-lg border border-slate-200/50 dark:border-slate-700/50 pointer-events-auto">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Текущие координаты:
            </div>
            <div className="font-mono font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center justify-between">
              <span>{coords.lat}, {coords.lon}</span>
              <button 
                onClick={() => onSelect(coords.lat, coords.lon)}
                className="ml-4 bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-emerald-600 transition-colors shadow-sm"
              >
                <Check className="w-4 h-4" /> Выбрать
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
