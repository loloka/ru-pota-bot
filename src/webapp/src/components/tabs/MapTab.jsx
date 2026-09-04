import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  Compass, 
  MapPin, 
  Navigation, 
  Search, 
  ExternalLink, 
  Radio, 
  X,
  Layers,
  Smartphone,
  Check,
  RotateCw,
  LocateFixed,
  Zap,
  Plane,
  Info
} from 'lucide-react';
import { telegram } from '../../services/telegram.js';
import { api } from '../../services/api.js';
import RouteModal from '../modals/RouteModal.jsx';
import OsmAndModal from '../modals/OsmAndModal.jsx';

// Clean base map providers without watermarks and with no API key requirement
const BASE_MAPS = {
  osm: {
    name: 'Светлая (OSM)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
  },
  satellite: {
    name: 'Спутник',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18,
  },
  dark: {
    name: 'Тёмная',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 16,
  },
};

// Available Ham WMS Overlays from R1CF GeoServer with smart minZoom thresholds
const WMS_LAYERS_CONFIG = [
  { 
    id: 'rda', 
    name: 'Районы RDA (2025)', 
    desc: 'Границы и шифры районов РФ (CB-02, NS-05)',
    layer: 'RDA_2025X', 
    style: 'rda_centroid_rx', 
    defaultOn: true,
    minZoom: 3,
    icon: '🗺️'
  },
  { 
    id: 'raza', 
    name: 'Аномальные зоны RAZA', 
    desc: 'Заповедные и аномальные зоны (зум 5+)',
    layer: 'RAZAX', 
    style: 'razax', 
    defaultOn: false,
    minZoom: 5,
    icon: '⚡'
  },
  { 
    id: 'rafa', 
    name: 'Аэродромы RAFA', 
    desc: 'Аэродромы и вертодромы (зум 6+)',
    layer: 'aopax', 
    style: 'rafax', 
    defaultOn: false,
    minZoom: 6,
    icon: '✈️'
  },
  { 
    id: 'qth', 
    name: 'QTH Локаторы (WW Grid)', 
    desc: 'Сетка квадратов Maidenhead (зум 7+)',
    layer: 'QTH', 
    style: 'QTH', 
    defaultOn: false,
    minZoom: 7,
    icon: '🌐'
  },
  { 
    id: 'sota', 
    name: 'Вершины SOTA', 
    desc: 'Горные вершины для радиосвязи (зум 5+)',
    layer: 'SOTAX', 
    style: 'sotax', 
    defaultOn: false,
    minZoom: 5,
    icon: '⛰️'
  },
  { 
    id: 'rlha', 
    name: 'Маяки RLHA', 
    desc: 'Маяки России по дипломной программе (зум 4+)',
    layer: 'RLHAX', 
    style: 'rlhax', 
    defaultOn: false,
    minZoom: 4,
    icon: '🌊'
  },
];

const DEFAULT_LAYERS = { rda: true, raza: false, rafa: false, qth: false, sota: false, rlha: false };

export default function MapTab({ 
  language = 'RU', 
  t = (k) => k,
  mapTarget = null,
  onClearMapTarget = () => {}
}) {

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseTileRef = useRef(null);
  const wmsLayersRef = useRef({});
  const markersLayerRef = useRef(null);
  const razaLayerRef = useRef(null);

  const [parks, setParks] = useState([]);
  const [razaZones, setRazaZones] = useState([]);
  const [airfieldResults, setAirfieldResults] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);
  
  const [selectedItem, setSelectedItem] = useState(null); // park or raza or airfield
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showOsmAndModal, setShowOsmAndModal] = useState(false);
  const [showLayersSheet, setShowLayersSheet] = useState(false);

  // First-time onboarding hint for layers
  const [showLayersHint, setShowLayersHint] = useState(() => {
    return !localStorage.getItem('rupota_layers_hint_seen');
  });

  const dismissLayersHint = () => {
    setShowLayersHint(false);
    try {
      localStorage.setItem('rupota_layers_hint_seen', 'true');
    } catch (e) {}
  };

  // Base map type: default to OSM (clean light map per user request)
  const [baseMapType, setBaseMapType] = useState(() => {
    const saved = localStorage.getItem('rupota_basemap');
    if (!saved || saved === 'dark') return 'osm';
    return saved;
  });

  // Active WMS layers state
  const [activeLayers, setActiveLayers] = useState(() => {
    try {
      const saved = localStorage.getItem('rupota_map_layers');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return DEFAULT_LAYERS;
  });

  // ========================================================
  // 1. Fetch Parks & RAZA from Backend API
  // ========================================================
  const fetchParks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getParks();
      if (res && res.parks) {
        setParks(res.parks);
      }
    } catch (err) {
      console.error('[MapTab] Error fetching parks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchParks();
  }, [fetchParks]);

  // Lazy load RAZA zones when RAZA layer is enabled
  useEffect(() => {
    if (activeLayers.raza && razaZones.length === 0) {
      api.getRaza().then(res => {
        if (res && res.zones) {
          setRazaZones(res.zones);
        }
      }).catch(err => console.warn('[MapTab] RAZA fetch error:', err));
    }
  }, [activeLayers.raza, razaZones.length]);

  // ========================================================
  // 2. Initialize Leaflet Map
  // ========================================================
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    // Center on Russian / CIS central territory
    const map = L.map(mapContainerRef.current, {
      center: [55.75, 50.0],
      zoom: 5,
      minZoom: 3,
      maxZoom: 18,
      zoomControl: false, // Custom buttons
    });

    const currentBase = BASE_MAPS[baseMapType] || BASE_MAPS.osm;
    const baseTile = L.tileLayer(currentBase.url, {
      attribution: '',
      maxZoom: currentBase.maxZoom || 19,
    }).addTo(map);

    baseTileRef.current = baseTile;

    // Layer groups
    const markersGroup = L.layerGroup().addTo(map);
    markersLayerRef.current = markersGroup;

    const razaGroup = L.layerGroup().addTo(map);
    razaLayerRef.current = razaGroup;

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update base tiles when baseMapType changes
  useEffect(() => {
    if (!baseTileRef.current || !mapInstanceRef.current) return;
    const currentBase = BASE_MAPS[baseMapType] || BASE_MAPS.osm;
    baseTileRef.current.setUrl(currentBase.url);
    try {
      localStorage.setItem('rupota_basemap', baseMapType);
    } catch (e) {}
  }, [baseMapType]);

  // ========================================================
  // 3. Manage R1CF WMS Overlays with Smart minZoom
  // ========================================================
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    WMS_LAYERS_CONFIG.forEach(cfg => {
      const isEnabled = Boolean(activeLayers[cfg.id]);
      let currentLyr = wmsLayersRef.current[cfg.id];

      if (isEnabled && !currentLyr) {
        // Create WMS layer from R1CF GeoServer with zoom threshold
        const wmsUrl = 'https://map.r1cf.ru/geoserver/cite/wms';
        const layer = L.tileLayer.wms(wmsUrl, {
          layers: cfg.layer,
          styles: cfg.style,
          format: 'image/png',
          transparent: true,
          opacity: 0.85,
          zIndex: 15,
          minZoom: cfg.minZoom || 3,
          maxZoom: 19,
        }).addTo(map);

        wmsLayersRef.current[cfg.id] = layer;
      } else if (!isEnabled && currentLyr) {
        map.removeLayer(currentLyr);
        delete wmsLayersRef.current[cfg.id];
      }
    });

    try {
      localStorage.setItem('rupota_map_layers', JSON.stringify(activeLayers));
    } catch (e) {}
  }, [activeLayers]);

  // Toggle single WMS layer
  const toggleWmsLayer = (id) => {
    telegram.haptic.selection();
    setActiveLayers(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Reset to default (only RDA)
  const resetLayersToDefault = () => {
    telegram.haptic.impact('light');
    setActiveLayers(DEFAULT_LAYERS);
  };

  // ========================================================
  // 4. Focus Item (Park, RAZA zone, or Airfield) on Map
  // ========================================================
  const focusItem = useCallback((item, zoomLevel = 12) => {
    if (!item || !mapInstanceRef.current) return;
    telegram.haptic.impact('medium');
    setSelectedItem(item);
    setShowSuggestions(false);
    
    mapInstanceRef.current.flyTo([item.lat, item.lon], zoomLevel, {
      animate: true,
      duration: 1.0,
    });
  }, []);

  // Handle external navigation target (e.g. from ClusterTab or PotaLookupWidget "На карте")
  useEffect(() => {
    if (!mapTarget) return;

    const clean = mapTarget.trim().toUpperCase();

    const applyFocus = async () => {
      const map = mapInstanceRef.current;
      if (!map) return;

      map.invalidateSize();

      // 1. Try to find in loaded parks list
      let target = parks.find(p => p.reference && p.reference.toUpperCase() === clean);

      if (target && target.lat && target.lon) {
        setSearchQuery(clean);
        focusItem(target, 13);
        if (onClearMapTarget) onClearMapTarget();
        return;
      }

      // If parks are still being fetched, wait for parks to load
      if (parks.length === 0 && loading) {
        return;
      }

      // 2. Fallback: Park not in local database (e.g. World park like US-0010)
      try {
        const res = await api.lookupPark(clean);
        if (res && res.lat && res.lon) {
          const customItem = {
            reference: res.reference || clean,
            name: res.name || 'Заповедник POTA',
            lat: parseFloat(res.lat),
            lon: parseFloat(res.lon),
            region: res.region || '',
            grid: res.grid || '',
            isActive: Boolean(res.isActive),
            activeStation: res.activeStation || null,
          };
          setSearchQuery(clean);
          focusItem(customItem, 13);
        }
      } catch (e) {
        console.warn('[MapTab] Could not lookup external park target:', clean, e.message);
      }

      if (onClearMapTarget) onClearMapTarget();
    };

    const timer = setTimeout(applyFocus, 250);
    return () => clearTimeout(timer);
  }, [mapTarget, parks, loading, focusItem, onClearMapTarget]);

  // Handle Search Typing with debounced Airfield lookup
  const handleSearchChange = (val) => {
    setSearchQuery(val);
    const clean = val.trim().toUpperCase();
    setShowSuggestions(Boolean(clean));

    if (!clean) {
      setAirfieldResults([]);
      return;
    }

    // Exact POTA match
    const exactPark = parks.find(p => p.reference.toUpperCase() === clean);
    if (exactPark && exactPark.lat && exactPark.lon) {
      focusItem(exactPark, 12);
      return;
    }

    // Exact RAZA match
    const exactRaza = razaZones.find(z => z.reference.toUpperCase() === clean);
    if (exactRaza && exactRaza.lat && exactRaza.lon) {
      focusItem(exactRaza, 13);
      return;
    }

    // If query has 3+ chars and starts with letters, search airfields in background
    if (clean.length >= 3 && /^[A-Z0-9А-Я]+$/.test(clean)) {
      api.searchAirfields(clean).then(res => {
        if (res && res.airfields) {
          setAirfieldResults(res.airfields);
        }
      }).catch(() => {});
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchQuery.trim().toUpperCase();
      if (!query) return;

      const parkMatch = parks.find(p => 
        p.reference.toUpperCase() === query ||
        p.reference.toUpperCase().startsWith(query) ||
        p.name.toUpperCase().includes(query)
      );
      if (parkMatch) {
        focusItem(parkMatch, 12);
        return;
      }

      const razaMatch = razaZones.find(z => 
        z.reference.toUpperCase() === query ||
        z.reference.toUpperCase().startsWith(query) ||
        z.name.toUpperCase().includes(query)
      );
      if (razaMatch) {
        focusItem(razaMatch, 13);
        return;
      }

      if (airfieldResults.length > 0) {
        focusItem(airfieldResults[0], 13);
      }
    }
  };

  // ========================================================
  // 5. Render Park Markers (Custom DivIcon — NO country flags!)
  // ========================================================
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    const query = searchQuery.trim().toUpperCase();
    const visible = parks.filter(p => {
      if (filterActiveOnly && !p.isActive) return false;
      if (query) {
        return (
          p.reference.toUpperCase().includes(query) ||
          p.name.toUpperCase().includes(query) ||
          (p.region && p.region.toUpperCase().includes(query))
        );
      }
      return true;
    });

    visible.forEach(park => {
      if (!park.lat || !park.lon) return;

      const markerHtml = park.isActive
        ? `<div class="relative flex items-center justify-center cursor-pointer transform -translate-x-1/2 -translate-y-1/2 select-none">
             <div class="absolute -inset-1.5 rounded-full bg-emerald-500/40 animate-ping"></div>
             <div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/50 font-bold text-xs">
               📡
             </div>
           </div>`
        : `<div class="w-7 h-7 rounded-full bg-white dark:bg-slate-900 border-2 border-emerald-600 dark:border-emerald-500 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shadow-md text-xs cursor-pointer hover:scale-110 transition transform -translate-x-1/2 -translate-y-1/2 select-none">
             🌲
           </div>`;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-park-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([park.lat, park.lon], { icon: customIcon });

      marker.on('click', () => {
        focusItem(park, 12);
      });

      markersGroup.addLayer(marker);
    });
  }, [parks, searchQuery, filterActiveOnly, focusItem]);

  // Render RAZA zone markers when RAZA layer is active
  useEffect(() => {
    const map = mapInstanceRef.current;
    const razaGroup = razaLayerRef.current;
    if (!map || !razaGroup) return;

    razaGroup.clearLayers();
    if (!activeLayers.raza || razaZones.length === 0) return;

    razaZones.forEach(zone => {
      if (!zone.lat || !zone.lon) return;

      const razaHtml = `
        <div class="w-6 h-6 rounded-full bg-amber-500 border border-slate-900 flex items-center justify-center text-slate-950 shadow-md text-[11px] font-bold cursor-pointer hover:scale-125 transition transform -translate-x-1/2 -translate-y-1/2 select-none">
          ⚡
        </div>
      `;

      const customIcon = L.divIcon({
        html: razaHtml,
        className: 'custom-raza-pin',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([zone.lat, zone.lon], { icon: customIcon });
      marker.on('click', () => {
        focusItem({
          ...zone,
          type: 'raza',
        }, 13);
      });

      razaGroup.addLayer(marker);
    });
  }, [activeLayers.raza, razaZones, focusItem]);

  // Matching items for search suggestions dropdown
  const query = searchQuery.trim().toUpperCase();
  const parkMatches = query 
    ? parks.filter(p => 
        p.reference.toUpperCase().includes(query) ||
        p.name.toUpperCase().includes(query) ||
        (p.region && p.region.toUpperCase().includes(query))
      ).slice(0, 4)
    : [];

  const razaMatches = query
    ? razaZones.filter(z => 
        z.reference.toUpperCase().includes(query) ||
        z.name.toUpperCase().includes(query)
      ).slice(0, 3)
    : [];

  const airfieldMatches = (airfieldResults || []).slice(0, 3);

  // ========================================================
  // 6. Geolocation / Locate Operator
  // ========================================================
  const handleLocateMe = () => {
    telegram.haptic.impact('light');
    if (!navigator.geolocation) {
      alert(language === 'RU' ? 'Геолокация недоступна на вашем устройстве.' : 'Geolocation not supported.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([latitude, longitude], 12, { duration: 1.2 });
          
          const userIcon = L.divIcon({
            html: `<div class="relative flex items-center justify-center select-none">
                     <div class="absolute -inset-2 rounded-full bg-blue-500/40 animate-ping"></div>
                     <div class="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-lg"></div>
                   </div>`,
            className: 'user-loc-pin',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });
          L.marker([latitude, longitude], { icon: userIcon }).addTo(map);
        }
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        alert(language === 'RU' ? 'Не удалось определить координаты GPS.' : 'GPS location error.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const zoomIn = () => {
    telegram.haptic.selection();
    mapInstanceRef.current?.zoomIn();
  };

  const zoomOut = () => {
    telegram.haptic.selection();
    mapInstanceRef.current?.zoomOut();
  };

  const activeCount = parks.filter(p => p.isActive).length;

  return (
    <div className="relative w-full h-[calc(100dvh-185px)] min-h-[380px] rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 animate-fade-in select-none shadow-lg">
      
      {/* 1. Leaflet Map Canvas */}

      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* 2. Top Floating Bar: Search & Filter */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => setShowSuggestions(Boolean(searchQuery.trim()))}
              placeholder={language === 'RU' ? 'Поиск парка, RAZA или аэродрома...' : 'Search park, RAZA or airport...'}
              className="w-full bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-300 dark:border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 shadow-xl outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowSuggestions(false);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter: Only On Air */}
          <button
            type="button"
            onClick={() => {
              telegram.haptic.impact('light');
              setFilterActiveOnly(!filterActiveOnly);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition shadow-xl shrink-0 active:scale-95 ${
              filterActiveOnly
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-white/95 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700/80'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>{language === 'RU' ? 'В эфире' : 'On Air'}</span>
            {activeCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                filterActiveOnly ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-500 text-slate-950'
              }`}>
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* Live Search Suggestions Dropdown (POTA + RAZA + Airfields) */}
        {showSuggestions && (parkMatches.length > 0 || razaMatches.length > 0 || airfieldMatches.length > 0) && (
          <div className="w-full max-h-60 overflow-y-auto rounded-2xl glass-card p-1.5 shadow-2xl border border-slate-300 dark:border-slate-800 space-y-1 animate-slide-up z-30">
            {/* POTA Parks */}
            {parkMatches.map((p) => (
              <div
                key={p.reference}
                onClick={() => focusItem(p, 12)}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-emerald-500 text-slate-950 shrink-0">
                    {p.reference}
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {p.name}
                  </span>
                </div>
                {p.isActive ? (
                  <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 shrink-0 animate-pulse ml-2">
                    📡 В эфире
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                    {p.region}
                  </span>
                )}
              </div>
            ))}

            {/* RAZA Zones */}
            {razaMatches.map((z) => (
              <div
                key={z.reference}
                onClick={() => focusItem({ ...z, type: 'raza' }, 13)}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-amber-500/10 cursor-pointer transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-amber-500 text-slate-950 shrink-0 flex items-center gap-1">
                    <span>⚡</span>
                    <span>{z.reference}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {z.name}
                  </span>
                </div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 ml-2 font-semibold">
                  RAZA Зона
                </span>
              </div>
            ))}

            {/* Airfields RAFA */}
            {airfieldMatches.map((a) => (
              <div
                key={a.icao + a.name}
                onClick={() => focusItem({ ...a, reference: a.icao, type: 'airfield' }, 13)}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-blue-500/10 cursor-pointer transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-blue-500 text-white shrink-0 flex items-center gap-1">
                    <span>✈️</span>
                    <span>{a.icao}</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {a.name} {a.city ? `(${a.city})` : ''}
                  </span>
                </div>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 shrink-0 ml-2 font-semibold">
                  {a.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Floating Action Controls (Right side) */}
      <div className="absolute right-3 top-16 z-20 flex flex-col gap-2">
        {/* Animated First-Time Layer Hint Tooltip */}
        {showLayersHint && (
          <div 
            onClick={() => {
              dismissLayersHint();
              setShowLayersSheet(true);
            }}
            className="absolute right-12 top-0 z-30 flex items-center gap-2 px-3 py-2 rounded-2xl bg-emerald-600 text-white shadow-2xl border border-emerald-400 text-xs font-bold animate-pulse cursor-pointer whitespace-nowrap"
          >
            <span>Тут вы можете настроить слои</span>
            <span className="text-base animate-bounce">👉</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissLayersHint();
              }}
              className="p-0.5 rounded-full hover:bg-emerald-700 text-emerald-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* R1CF Layers & Basemap Button */}
        <button
          type="button"
          onClick={() => {
            telegram.haptic.impact('light');
            dismissLayersHint();
            setShowLayersSheet(true);
          }}
          className="p-2.5 rounded-xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 shadow-xl hover:border-emerald-500/50 transition active:scale-95"
          title="Слои карты и подложки"
        >
          <Layers className="w-4 h-4 text-emerald-500" />
        </button>

        {/* OsmAnd APK & Guide Button */}
        <button
          type="button"
          onClick={() => {
            telegram.haptic.impact('light');
            setShowOsmAndModal(true);
          }}
          className="p-2.5 rounded-xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 shadow-xl hover:border-amber-500/50 transition active:scale-95"
          title="Офлайн-карты OsmAnd PlusM (APK)"
        >
          <Smartphone className="w-4 h-4 text-amber-500" />
        </button>

        {/* GPS Locate Me */}
        <button
          type="button"
          onClick={handleLocateMe}
          className="p-2.5 rounded-xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 shadow-xl hover:border-blue-500/50 transition active:scale-95"
          title="Мое местоположение"
        >
          <LocateFixed className="w-4 h-4 text-blue-500" />
        </button>

        {/* Zoom Controls */}
        <div className="flex flex-col rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/90 shadow-xl divide-y divide-slate-200 dark:divide-slate-800">
          <button
            type="button"
            onClick={zoomIn}
            className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 font-bold"
          >
            +
          </button>
          <button
            type="button"
            onClick={zoomOut}
            className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 font-bold"
          >
            -
          </button>
        </div>
      </div>

      {/* 4. Active Legend Badge */}
      {!selectedItem && (
        <div className="absolute left-3 bottom-3 z-20 pointer-events-none">
          <div className="px-2.5 py-1.5 rounded-xl glass-card text-[11px] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-800 shadow-xl flex items-center gap-2 pointer-events-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <span className="font-semibold">
              {language === 'RU' ? 'Парков: ' : 'Parks: '}
              <b className="text-emerald-600 dark:text-emerald-400 font-mono">{parks.length}</b>
            </span>
            {activeLayers.raza && razaZones.length > 0 && (
              <span className="ml-1 pl-2 border-l border-slate-300 dark:border-slate-700 font-semibold text-amber-600 dark:text-amber-400">
                ⚡ RAZA: <b className="font-mono">{razaZones.length}</b>
              </span>
            )}
          </div>
        </div>
      )}


      {/* 5. Selected Item Bottom Sheet Card (Park, RAZA or Airfield) */}
      {selectedItem && (
        <div className="absolute bottom-3 left-3 right-3 z-30 p-4 rounded-2xl glass-card shadow-2xl border border-emerald-500/50 animate-slide-up space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                {/* Badge based on type */}
                {selectedItem.type === 'raza' ? (
                  <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg bg-amber-500 text-slate-950 flex items-center gap-1">
                    <span>⚡</span>
                    <span>{selectedItem.reference}</span>
                  </span>
                ) : selectedItem.type === 'airfield' ? (
                  <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg bg-blue-500 text-white flex items-center gap-1">
                    <span>✈️</span>
                    <span>{selectedItem.icao}</span>
                  </span>
                ) : (
                  <span className="font-mono font-extrabold text-sm px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950">
                    {selectedItem.reference}
                  </span>
                )}

                {selectedItem.isActive && (
                  <span className="flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 animate-pulse">
                    <span>📡 {language === 'RU' ? 'В ЭФИРЕ' : 'ON AIR'}</span>
                  </span>
                )}
              </div>

              <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-1 leading-tight">
                {selectedItem.name}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {selectedItem.region || selectedItem.city || (selectedItem.type === 'raza' ? 'Дипломная программа RAZA' : 'RU-POTA')} 
                {selectedItem.grid ? ` • QTH: ${selectedItem.grid}` : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Active Broadcast Info */}
          {selectedItem.isActive && selectedItem.activeStation && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
                <div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedItem.activeCallsign}
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 ml-2">
                    {selectedItem.activeFreq} MHz • {selectedItem.activeMode}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            {/* Route Button */}
            <button
              type="button"
              onClick={() => {
                telegram.haptic.impact('medium');
                setShowRouteModal(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow-glow-emerald transition active:scale-95"
            >
              <Navigation className="w-4 h-4" />
              <span>{language === 'RU' ? 'Маршрут' : 'Directions'}</span>
            </button>

            {/* External Link if RAZA */}
            {selectedItem.link && (
              <a
                href={selectedItem.link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition active:scale-95"
              >
                <span>Инфо</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* OsmAnd Offline Guide Button */}
            <button
              type="button"
              onClick={() => {
                telegram.haptic.impact('light');
                setShowOsmAndModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition active:scale-95"
            >
              <Smartphone className="w-4 h-4 text-amber-500" />
              <span>OsmAnd</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. R1CF WMS Layers & Base Map Drawer */}
      {showLayersSheet && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pt-12 pb-safe">
          <div 
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm animate-fade-in" 
            onClick={() => setShowLayersSheet(false)} 
          />

          <div className="relative w-full max-w-sm max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl glass-card p-4 sm:p-5 shadow-2xl border border-slate-300 dark:border-slate-800 space-y-3.5 animate-slide-up z-10 overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                    Слои карты и подложки
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Управление видимостью и базовой картой
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowLayersSheet(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-3.5 pr-1">
              {/* Base Map Selector */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
                  Подложка карты:
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(BASE_MAPS).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        telegram.haptic.selection();
                        setBaseMapType(key);
                      }}
                      className={`py-2 px-1.5 rounded-xl text-xs font-bold border transition active:scale-95 ${
                        baseMapType === key
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-glow-emerald'
                          : 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {cfg.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* R1CF WMS Overlays */}
              <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Радиолюбительские слои R1CF:
                  </span>
                  <button
                    type="button"
                    onClick={resetLayersToDefault}
                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                  >
                    Сбросить к RDA
                  </button>
                </div>

                <div className="space-y-1.5">
                  {WMS_LAYERS_CONFIG.map((cfg) => {
                    const isActive = Boolean(activeLayers[cfg.id]);
                    return (
                      <button
                        key={cfg.id}
                        type="button"
                        onClick={() => toggleWmsLayer(cfg.id)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition active:scale-[0.99] text-left ${
                          isActive 
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-slate-900 dark:text-white' 
                            : 'bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center border transition shrink-0 ${
                            isActive ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-400 dark:border-slate-600'
                          }`}>
                            {isActive && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs select-none">{cfg.icon}</span>
                              <span className="font-semibold text-xs truncate">{cfg.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate">
                              {cfg.desc}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0 ml-2">
                          {cfg.layer}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <p>
                  Слои QTH, аэродромов и вершин автоматически проявляются при приближении карты к объекту (зум 6+).
                </p>
              </div>
            </div>

            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 pt-1 shrink-0">
              Геосервер: map.r1cf.ru • Проекция EPSG:3857
            </p>
          </div>
        </div>
      )}

      {/* 7. Multi-app Route Modal (Yandex, 2GIS, OsmAnd, Copy) */}
      {showRouteModal && selectedItem && (
        <RouteModal
          park={selectedItem}
          language={language}
          onClose={() => setShowRouteModal(false)}
        />
      )}

      {/* 8. Full OsmAnd Offline Guide & Downloads Modal */}
      {showOsmAndModal && (
        <OsmAndModal
          language={language}
          onClose={() => setShowOsmAndModal(false)}
        />
      )}

    </div>
  );
}
