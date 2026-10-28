/**
 * RU-POTA Public Map Page (HTML & Leaflet Web Application)
 * Accessible publicly at pota.r9o.ru/ and pota.r9o.ru/map without authentication.
 * Provides radio amateurs with full-screen interactive boundaries and RDA overlays.
 */

export function renderPublicMapHtml(options = {}) {
  const isAuthed = Boolean(options.isAuthed);

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Карта парков POTA и ООПТ России | RU-POTA Hub</title>
  <meta name="description" content="Интерактивная карта ООПТ России, парков дипломной программы Parks on the Air (POTA), границ заповедников и районов RDA.">
  <link rel="icon" type="image/svg+xml" href="/app/favicon.svg">
  
  <!-- Bootstrap 5 & Icons -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
  
  <!-- Leaflet 1.9.4 -->
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  
  <!-- SweetAlert2 -->
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

  <style>
    :root {
      --header-height: 56px;
    }
    * {
      box-sizing: border-box;
    }
    body, html {
      height: 100%;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      background: #0b0f19;
      color: #f8f9fa;
    }
    #public-header {
      height: var(--header-height);
      background: rgba(11, 15, 25, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 1000;
      position: relative;
    }
    #map-container {
      height: calc(100vh - var(--header-height));
      width: 100vw;
      position: relative;
    }
    #map {
      height: 100%;
      width: 100%;
      background: #0b0f19;
    }
    .brand-title {
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #fff;
      text-decoration: none;
      letter-spacing: -0.3px;
      line-height: 1;
    }
    .brand-title:hover {
      color: #10b981;
    }
    .brand-title .logo-icon {
      font-size: 24px;
      line-height: 1;
    }
    .brand-title .logo-text {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }

    /* Floating Control Panels */
    .map-floating-panel {
      position: absolute;
      top: 14px;
      left: 14px;
      z-index: 999;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 50px;
      padding: 6px 14px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      max-width: calc(100vw - 28px);
    }
    .filter-chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px;
      padding: 3px 10px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      user-select: none;
      transition: all 0.15s ease;
    }
    .filter-chip:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .filter-chip.active-pota {
      background: rgba(16, 185, 129, 0.15);
      border-color: rgba(16, 185, 129, 0.4);
      color: #34d399;
    }
    .filter-chip.active-candidates {
      background: rgba(148, 163, 184, 0.15);
      border-color: rgba(148, 163, 184, 0.4);
      color: #cbd5e1;
    }

    /* Search Dropdown Suggestions */
    #search-box-wrapper {
      position: relative;
    }
    #search-suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
      max-height: 340px;
      overflow-y: auto;
      z-index: 1050;
      display: none;
      margin-top: 4px;
    }
    .suggestion-item {
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 12px;
      transition: background 0.15s;
    }
    .suggestion-item:last-child {
      border-bottom: none;
    }
    .suggestion-item:hover {
      background: rgba(16, 185, 129, 0.15);
    }

    /* Floating Legend */
    .map-floating-legend {
      position: absolute;
      bottom: 16px;
      left: 14px;
      z-index: 999;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 30px;
      padding: 6px 16px;
      font-size: 11.5px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    /* Restricted Region Warning Banner */
    #region-restricted-banner {
      position: absolute;
      top: 68px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 998;
      background: rgba(245, 158, 11, 0.95);
      color: #000;
      font-weight: 600;
      font-size: 12px;
      padding: 6px 16px;
      border-radius: 30px;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
      display: none;
      align-items: center;
      gap: 8px;
      max-width: 90vw;
      text-align: center;
    }

    /* Leaflet Popup Styling */
    .leaflet-popup-content-wrapper {
      background: #1e293b;
      color: #f1f5f9;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 2px;
    }
    .leaflet-popup-tip {
      background: #1e293b;
    }
    .oopt-card-popup {
      font-family: inherit;
      min-width: 250px;
      max-width: 320px;
      font-size: 12px;
      padding: 8px 10px;
    }
    .popup-collapsed-bar {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
      padding: 2px 0;
    }

    /* Leaflet zoom controls shifted to right */
    .leaflet-top.leaflet-right {
      margin-top: 10px;
      margin-right: 10px;
    }
    .leaflet-control-zoom {
      border: 1px solid rgba(255, 255, 255, 0.15) !important;
      border-radius: 10px !important;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4) !important;
    }
    .leaflet-control-zoom a {
      background: #1e293b !important;
      color: #f1f5f9 !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
    }
    .leaflet-control-zoom a:hover {
      background: #334155 !important;
      color: #10b981 !important;
    }

    @media (max-width: 768px) {
      .hide-mobile {
        display: none !important;
      }
      .brand-title .logo-text {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>

  <!-- Top Navigation Header -->
  <header id="public-header" class="d-flex align-items-center justify-content-between px-3">
    <!-- Left: Aligned Brand & Navigation Links -->
    <div class="d-flex align-items-center gap-2 gap-md-3">
      <a href="/" class="brand-title">
        <span class="logo-icon">🌲</span>
        <span class="logo-text">RU-POTA</span>
      </a>

      <!-- Region Dropdown with Groups -->
      <div style="min-width: 200px; max-width: 280px;" class="hide-mobile">
        <select id="region-select" class="form-select form-select-sm bg-dark text-light border-secondary">
          <option value="">🇷🇺 Вся Россия (обзор)</option>
        </select>
      </div>

      <!-- Live Search Input with Autocomplete -->
      <div id="search-box-wrapper" style="width: 240px;" class="hide-mobile">
        <div class="input-group input-group-sm">
          <span class="input-group-text bg-dark border-secondary text-secondary"><i class="bi bi-search"></i></span>
          <input type="text" id="search-input" class="form-control bg-dark text-light border-secondary" placeholder="Парк, RDA, ООПТ, город..." autocomplete="off">
        </div>
        <div id="search-suggestions"></div>
      </div>
    </div>

    <!-- Right: Navigation Buttons -->
    <div class="d-flex align-items-center gap-2">
      <!-- Direct Mini App link -->
      <a href="https://pota.r9o.ru/app/" target="_blank" class="btn btn-sm btn-outline-success d-flex align-items-center gap-1.5" title="Запустить Telegram Mini App">
        <i class="bi bi-phone"></i>
        <span>Mini App</span>
      </a>

      <!-- Contacts Page -->
      <a href="/contacts" class="btn btn-sm btn-outline-secondary d-none d-sm-inline-flex align-items-center gap-1">
        <i class="bi bi-info-circle"></i>
        <span>Контакты</span>
      </a>

      <!-- Standalone Donate Page -->
      <a href="/donate" class="btn btn-sm btn-warning fw-semibold d-flex align-items-center gap-1.5 shadow-sm text-dark">
        <i class="bi bi-heart-fill text-danger"></i>
        <span>Поддержать</span>
      </a>

      <!-- Reps & Admin Login (Clear distinction: closed portal for reps & coordinators) -->
      ${isAuthed ? `
        <a href="/admin" class="btn btn-sm btn-primary d-flex align-items-center gap-1" title="Перейти в панель управления координатора">
          <i class="bi bi-speedometer2"></i>
          <span>Админка</span>
        </a>
      ` : `
        <a href="/login" class="btn btn-sm btn-outline-light d-flex align-items-center gap-1" title="Вход в закрытую систему для региональных представителей и координаторов программы POTA">
          <i class="bi bi-lock-fill text-warning"></i>
          <span class="hide-mobile">Координаторам</span>
        </a>
      `}
    </div>
  </header>

  <!-- Main Map Container -->
  <main id="map-container">
    <div id="map"></div>

    <!-- Restricted Region Alert Banner -->
    <div id="region-restricted-banner">
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span id="region-restricted-text">Добавление новых парков временно ограничено правилами POTA USA. Границы ООПТ и районы RDA доступны для ознакомления.</span>
    </div>

    <!-- Floating Top-Left Filter & Layers Panel (Cleanly separated from zoom buttons) -->
    <div class="map-floating-panel">
      <div class="d-flex align-items-center gap-2">
        <!-- POTA Parks Toggle Chip -->
        <div class="filter-chip active-pota" id="chip-pota" onclick="toggleLayerFilter('pota')">
          <i class="bi bi-star-fill text-warning"></i>
          <span>Парки POTA (<strong id="count-pota">...</strong>)</span>
        </div>

        <!-- Candidate OOPT Toggle Chip -->
        <div class="filter-chip active-candidates" id="chip-candidates" onclick="toggleLayerFilter('candidates')">
          <i class="bi bi-tree-fill text-secondary"></i>
          <span>Кандидаты ООПТ (<strong id="count-candidates">...</strong>)</span>
        </div>

        <!-- Prominent Layers Dropdown Button -->
        <div class="dropdown">
          <button class="btn btn-xs btn-outline-light rounded-pill px-2.5 py-1 dropdown-toggle fw-semibold d-flex align-items-center gap-1.5 shadow-sm" type="button" data-bs-toggle="dropdown" style="font-size: 11.5px; border-color: rgba(255,255,255,0.25);">
            <i class="bi bi-stack text-success"></i>
            <span>Слои</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-start shadow-lg mt-1" style="min-width: 250px;">
            <li><h6 class="dropdown-header text-uppercase text-secondary font-monospace" style="font-size: 10px;">Подложка карты</h6></li>
            <li><a class="dropdown-item active base-map-opt" href="#" data-base="twogis">🇷🇺 2ГИС (Россия)</a></li>
            <li><a class="dropdown-item base-map-opt" href="#" data-base="osm">🌍 OpenStreetMap</a></li>
            <li><a class="dropdown-item base-map-opt" href="#" data-base="satellite">🛰️ Спутник (Esri)</a></li>
            <li><a class="dropdown-item base-map-opt" href="#" data-base="dark">🌑 Тёмная карта</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><h6 class="dropdown-header text-uppercase text-secondary font-monospace" style="font-size: 10px;">Радиолюбительские слои R1CF</h6></li>
            <li>
              <div class="dropdown-item">
                <div class="form-check form-switch m-0">
                  <input class="form-check-input wms-toggle" type="checkbox" id="wms-rda" checked data-layer="rda">
                  <label class="form-check-label small" for="wms-rda">🗺️ Районы RDA (2025)</label>
                </div>
              </div>
            </li>
            <li>
              <div class="dropdown-item">
                <div class="form-check form-switch m-0">
                  <input class="form-check-input wms-toggle" type="checkbox" id="wms-raza" data-layer="raza">
                  <label class="form-check-label small" for="wms-raza">⚡ Зоны RAZA</label>
                </div>
              </div>
            </li>
            <li>
              <div class="dropdown-item">
                <div class="form-check form-switch m-0">
                  <input class="form-check-input wms-toggle" type="checkbox" id="wms-qth" data-layer="qth">
                  <label class="form-check-label small" for="wms-qth">🌐 Сетка QTH (WW Grid)</label>
                </div>
              </div>
            </li>
            <li>
              <div class="dropdown-item">
                <div class="form-check form-switch m-0">
                  <input class="form-check-input wms-toggle" type="checkbox" id="wms-sota" data-layer="sota">
                  <label class="form-check-label small" for="wms-sota">⛰️ Вершины SOTA</label>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Floating Bottom Legend -->
    <div class="map-floating-legend hide-mobile">
      <div class="legend-item">
        <span class="legend-dot" style="background: #10b981; border: 1.5px solid #fff;"></span>
        <span>Официальный парк POTA</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #64748b;"></span>
        <span>Кандидат ООПТ</span>
      </div>
      <div class="legend-item text-secondary">
        <span>Клик по точке загружает векторные границы ООПТ</span>
      </div>
    </div>
  </main>

  <!-- Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

  <script>
    const BASE_MAPS = {
      twogis: {
        url: 'https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}',
        subdomains: ['0', '1', '2', '3'],
        maxZoom: 18,
      },
      osm: {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        subdomains: 'abc',
        maxZoom: 19,
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        subdomains: 'abc',
        maxZoom: 18,
      },
      dark: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        subdomains: 'abc',
        maxZoom: 16,
      }
    };

    let map = null;
    let baseLayer = null;
    let potaGroup = null;
    let candidateGroup = null;
    let newRdaGroup = null;
    let currentBoundaryLayer = null;
    let wmsLayers = {};

    let showPota = true;
    let showCandidates = true;

    let allPointsData = { matched: [], unmatchedPota: [], candidates: [] };
    let currentRegion = '';

    function initMap() {
      // Zoom controls explicitly positioned at topright to avoid overlapping filter panel
      map = L.map('map', {
        center: [55.75, 50.0],
        zoom: 5,
        minZoom: 3,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      // Default base layer (2GIS Russia)
      baseLayer = L.tileLayer(BASE_MAPS.twogis.url, {
        subdomains: BASE_MAPS.twogis.subdomains,
        maxZoom: 18
      }).addTo(map);

      potaGroup = L.layerGroup().addTo(map);
      candidateGroup = L.layerGroup().addTo(map);
      newRdaGroup = L.layerGroup().addTo(map);

      // Initialize RDA WMS Overlay by default + New Regions RDA Layer
      toggleWms('rda', true);
      loadNewRdaLayer();

      // Base map switchers
      document.querySelectorAll('.base-map-opt').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const key = el.getAttribute('data-base');
          if (BASE_MAPS[key]) {
            map.removeLayer(baseLayer);
            baseLayer = L.tileLayer(BASE_MAPS[key].url, {
              subdomains: BASE_MAPS[key].subdomains || 'abc',
              maxZoom: BASE_MAPS[key].maxZoom
            }).addTo(map);
            baseLayer.bringToBack();
            document.querySelectorAll('.base-map-opt').forEach(b => b.classList.remove('active'));
            el.classList.add('active');
          }
        });
      });

      // WMS Overlays
      document.querySelectorAll('.wms-toggle').forEach(el => {
        el.addEventListener('change', () => {
          const lyr = el.getAttribute('data-layer');
          toggleWms(lyr, el.checked);
          if (lyr === 'rda') {
            if (el.checked) map.addLayer(newRdaGroup);
            else map.removeLayer(newRdaGroup);
          }
        });
      });

      // Region Dropdown with Groups
      document.getElementById('region-select').addEventListener('change', (e) => {
        const val = e.target.value;
        currentRegion = val;
        const selectedOpt = e.target.options[e.target.selectedIndex];
        const isRestricted = selectedOpt ? selectedOpt.getAttribute('data-restricted') === '1' : false;

        const banner = document.getElementById('region-restricted-banner');
        if (isRestricted) {
          banner.style.display = 'inline-flex';
        } else {
          banner.style.display = 'none';
        }

        loadPoints(currentRegion, true);
      });

      // Search Autocomplete
      initSearchAutocomplete();

      // Load initial data
      loadRegionsDropdown();
      loadPoints('', false);
    }

    // Toggle layer chip filter
    window.toggleLayerFilter = function(type) {
      if (type === 'pota') {
        showPota = !showPota;
        const chip = document.getElementById('chip-pota');
        if (showPota) {
          map.addLayer(potaGroup);
          chip.classList.add('active-pota');
        } else {
          map.removeLayer(potaGroup);
          chip.classList.remove('active-pota');
        }
      } else if (type === 'candidates') {
        showCandidates = !showCandidates;
        const chip = document.getElementById('chip-candidates');
        if (showCandidates) {
          map.addLayer(candidateGroup);
          chip.classList.add('active-candidates');
        } else {
          map.removeLayer(candidateGroup);
          chip.classList.remove('active-candidates');
        }
      }
    };

    // Toggle WMS Layers from R1CF GeoServer
    function toggleWms(id, enable) {
      const wmsConfig = {
        rda: { layer: 'RDA_2025X', style: 'rda_centroid_rx', minZoom: 3 },
        raza: { layer: 'RAZAX', style: 'razax', minZoom: 5 },
        qth: { layer: 'QTH', style: 'QTH', minZoom: 7 },
        sota: { layer: 'SOTAX', style: 'sotax', minZoom: 5 },
      };

      const cfg = wmsConfig[id];
      if (!cfg) return;

      if (enable && !wmsLayers[id]) {
        const wms = L.tileLayer.wms('https://map.r1cf.ru/geoserver/cite/wms', {
          layers: cfg.layer,
          styles: cfg.style,
          format: 'image/png',
          transparent: true,
          opacity: 0.85,
          zIndex: 15,
          minZoom: cfg.minZoom || 3,
          maxZoom: 19
        }).addTo(map);
        wmsLayers[id] = wms;
      } else if (!enable && wmsLayers[id]) {
        map.removeLayer(wmsLayers[id]);
        delete wmsLayers[id];
      }
    }

    // Load New Regions RDA Overlay (DO, LU, ZP, HE) matching R1CF style
    async function loadNewRdaLayer() {
      try {
        const res = await fetch('/api/map/new-rda');
        const data = await res.json();
        newRdaGroup.clearLayers();

        // 1. Magenta outlines
        if (data.borders) {
          const borderLyr = L.geoJSON(data.borders, {
            style: {
              color: '#d90077',
              weight: 2,
              opacity: 0.9,
              fillColor: '#d90077',
              fillOpacity: 0.02
            },
            interactive: false
          });
          newRdaGroup.addLayer(borderLyr);
        }

        // 2. Yellow/Magenta RDA Centroid Badges
        if (Array.isArray(data.districts)) {
          data.districts.forEach(d => {
            const rdaHtml = \`
              <div style="background:#fff83b; color:#000000; border:1.5px solid #d90077; border-radius:3px; padding:1px 4px; font-weight:800; font-size:11px; font-family:monospace; box-shadow:0 1px 3px rgba(0,0,0,0.45); white-space:nowrap; cursor:pointer; text-align:center;">
                \${d.code}
              </div>
            \`;
            const icon = L.divIcon({
              html: rdaHtml,
              className: 'custom-rda-badge',
              iconSize: [44, 20],
              iconAnchor: [22, 10]
            });
            const marker = L.marker([d.lat, d.lon], { icon });
            marker.bindTooltip(\`<b>\${d.code}</b> — \${d.name} (\${d.region})\`, { direction: 'top' });
            marker.on('click', () => {
              map.flyTo([d.lat, d.lon], 13);
            });
            newRdaGroup.addLayer(marker);
          });
        }
      } catch (err) {
        console.warn('Error loading new RDA overlay:', err);
      }
    }

    // Load Regions Dropdown with Groups (Matches Admin Panel categorization)
    async function loadRegionsDropdown() {
      try {
        const res = await fetch('/api/map/regions');
        const data = await res.json();
        const sel = document.getElementById('region-select');
        if (!data || !data.regions || !sel) return;

        const list = data.regions.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));

        const groupEurope = document.createElement('optgroup');
        groupEurope.label = '🇪🇺 Европейская Россия (R1, R2, R3, R4, R6)';

        const groupAsia = document.createElement('optgroup');
        groupAsia.label = '🌏 Азиатская Россия (R9, R0 — Урал, Сибирь, ДВ)';

        const groupRestricted = document.createElement('optgroup');
        groupRestricted.label = '⚠️ Новые субъекты РФ (ограничено POTA USA)';

        list.forEach(r => {
          const opt = document.createElement('option');
          opt.value = r.name;
          if (r.isRestricted) {
            opt.setAttribute('data-restricted', '1');
            opt.textContent = \`\${r.name} (\${r.code}) — [ ⚠️ POTA USA ]\`;
            groupRestricted.appendChild(opt);
          } else {
            opt.textContent = \`\${r.name} (\${r.code}) — \${r.matchedParks || 0} парков\`;
            if (r.zone === 'asia') {
              groupAsia.appendChild(opt);
            } else {
              groupEurope.appendChild(opt);
            }
          }
        });

        sel.appendChild(groupEurope);
        sel.appendChild(groupAsia);
        sel.appendChild(groupRestricted);
      } catch (err) {
        console.warn('Error loading regions:', err);
      }
    }

    // Load Points Data
    async function loadPoints(region, fitBounds) {
      try {
        let url = '/api/map/points';
        if (region) url += '?region=' + encodeURIComponent(region);
        const res = await fetch(url);
        allPointsData = await res.json();

        const potaTotal = (allPointsData.matched?.length || 0) + (allPointsData.unmatchedPota?.length || 0);
        document.getElementById('count-pota').textContent = potaTotal;
        document.getElementById('count-candidates').textContent = allPointsData.candidates?.length || 0;

        renderPoints(fitBounds);
      } catch (err) {
        console.error('Error loading points:', err);
      }
    }

    // Render Points on Map
    function renderPoints(fitBounds = false) {
      potaGroup.clearLayers();
      candidateGroup.clearLayers();
      const bounds = [];

      // 1. Matched Official POTA Parks (Green)
      (allPointsData.matched || []).forEach(p => {
        if (!p.lat || !p.lon) return;

        const areaStr = p.area ? \`📏 Площадь: <strong>\${Number(p.area).toLocaleString('ru-RU')} га</strong>\` : '';
        const popupHtml = \`
          <div class="oopt-card-popup" id="card-popup-\${p.nid}">
            <div class="popup-collapsed-bar" onclick="togglePopupCollapse(\${p.nid})" title="Нажмите, чтобы развернуть карточку">
              <span class="fw-bold text-success small">⭐ \${p.ref} \${p.title || ''}</span>
              <button type="button" class="btn btn-xs btn-outline-success py-0 px-1.5" style="font-size:10px;">⤢ Развернуть</button>
            </div>
            <div class="popup-expanded-content">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="badge bg-success fw-bold">\${p.ref}</span>
                <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1.5" style="font-size:10px;" onclick="togglePopupCollapse(\${p.nid})" title="Свернуть карточку, чтобы открыть вид на полигон">⭐ Свернуть</button>
              </div>
              <div class="fw-bold fs-6 text-light mb-1">\${p.title || p.potaName}</div>
              <div class="text-secondary small mb-1">📍 \${p.ate || ''}</div>
              <div class="text-secondary small mb-2">\${areaStr}</div>
              <div id="boundary-status-\${p.nid}" class="small mb-2"></div>
              <div class="d-flex flex-wrap gap-1 mt-2">
                <button class="btn btn-xs btn-outline-info py-0 px-2" style="font-size:11px;" onclick="zoomToBoundary()">📐 Границы</button>
                <a href="https://pota.app/#/park/\${p.ref}" target="_blank" class="btn btn-xs btn-outline-success py-0 px-2" style="font-size:11px;">POTA.app</a>
                \${p.site ? \`<a href="\${p.site}" target="_blank" class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size:11px;">Паспорт</a>\` : ''}
              </div>
            </div>
          </div>
        \`;

        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: '#15803d',
          fillColor: '#22c55e',
          fillOpacity: 0.9,
          weight: 1.5
        }).bindPopup(popupHtml);

        marker.on('click', () => {
          loadAndDrawBoundary(p.nid, p.title);
        });

        potaGroup.addLayer(marker);
        p._marker = marker;
        bounds.push([p.lat, p.lon]);
      });

      // 2. Unmatched POTA Parks (Yellow/Orange)
      (allPointsData.unmatchedPota || []).forEach(p => {
        if (!p.lat || !p.lon) return;

        const popupHtml = \`
          <div class="oopt-card-popup">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <span class="badge bg-warning text-dark fw-bold">\${p.ref}</span>
              <small class="text-secondary">POTA Park</small>
            </div>
            <div class="fw-bold fs-6 text-light mb-1">\${p.name}</div>
            <div class="text-secondary small mb-2">📍 \${p.location || ''}</div>
            <div class="d-flex gap-1 mt-2">
              <a href="https://pota.app/#/park/\${p.ref}" target="_blank" class="btn btn-xs btn-outline-warning py-0 px-2" style="font-size:11px;">POTA.app</a>
            </div>
          </div>
        \`;

        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 6,
          color: '#b45309',
          fillColor: '#f59e0b',
          fillOpacity: 0.9,
          weight: 1.5
        }).bindPopup(popupHtml);

        potaGroup.addLayer(marker);
        p._marker = marker;
        bounds.push([p.lat, p.lon]);
      });

      // 3. Candidate OOPTs (Grey/Slate)
      (allPointsData.candidates || []).forEach(c => {
        if (!c.lat || !c.lon) return;

        const areaStr = c.area ? \`📏 Площадь: <strong>\${Number(c.area).toLocaleString('ru-RU')} га</strong>\` : '';
        const popupHtml = \`
          <div class="oopt-card-popup" id="card-popup-\${c.nid}">
            <div class="popup-collapsed-bar" onclick="togglePopupCollapse(\${c.nid})" title="Нажмите, чтобы развернуть карточку">
              <span class="fw-bold text-secondary small">🌲 \${c.title || ''}</span>
              <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1.5" style="font-size:10px;">⤢ Развернуть</button>
            </div>
            <div class="popup-expanded-content">
              <div class="d-flex align-items-center justify-content-between mb-1">
                <span class="badge bg-secondary">Кандидат ООПТ</span>
                <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1.5" style="font-size:10px;" onclick="togglePopupCollapse(\${c.nid})" title="Свернуть карточку">⭐ Свернуть</button>
              </div>
              <div class="fw-bold fs-6 text-light mb-1">\${c.title}</div>
              <div class="text-secondary small mb-1">📍 \${c.ate || ''}</div>
              <div class="text-secondary small mb-2">\${areaStr}</div>
              <div id="boundary-status-\${c.nid}" class="small mb-2"></div>
              <div class="d-flex flex-wrap gap-1 mt-2">
                <button class="btn btn-xs btn-outline-info py-0 px-2" style="font-size:11px;" onclick="zoomToBoundary()">📐 Границы</button>
                \${c.site ? \`<a href="\${c.site}" target="_blank" class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size:11px;">Паспорт</a>\` : ''}
              </div>
            </div>
          </div>
        \`;

        const marker = L.circleMarker([c.lat, c.lon], {
          radius: 4.5,
          color: '#475569',
          fillColor: '#94a3b8',
          fillOpacity: 0.85,
          weight: 1.5
        }).bindPopup(popupHtml);

        marker.on('click', () => {
          loadAndDrawBoundary(c.nid, c.title);
        });

        candidateGroup.addLayer(marker);
        c._marker = marker;
        bounds.push([c.lat, c.lon]);
      });

      if (fitBounds && bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
        } catch (_) {}
      }
    }

    // Toggle card collapse in popup
    window.togglePopupCollapse = function(nid) {
      const card = document.getElementById('card-popup-' + nid);
      if (!card) return;
      const bar = card.querySelector('.popup-collapsed-bar');
      const content = card.querySelector('.popup-expanded-content');
      if (bar.style.display === 'none' || !bar.style.display) {
        bar.style.display = 'flex';
        content.style.display = 'none';
      } else {
        bar.style.display = 'none';
        content.style.display = 'block';
      }
    };

    // Load and draw vector GeoJSON boundary
    async function loadAndDrawBoundary(nid, title) {
      if (!nid) return;
      const statusEl = document.getElementById('boundary-status-' + nid);
      if (statusEl) statusEl.innerHTML = '<span class="text-info spinner-border spinner-border-sm"></span> Загрузка границ...';

      try {
        const res = await fetch('/api/admin/oopt/' + nid + '/boundary');
        const data = await res.json();

        if (currentBoundaryLayer) {
          map.removeLayer(currentBoundaryLayer);
          currentBoundaryLayer = null;
        }

        if (data && data.geometry) {
          currentBoundaryLayer = L.geoJSON(data.geometry, {
            style: {
              color: '#10b981',
              weight: 2.5,
              opacity: 0.9,
              fillColor: '#10b981',
              fillOpacity: 0.25
            }
          }).addTo(map);

          window._lastBoundaryBounds = currentBoundaryLayer.getBounds();

          if (statusEl) {
            statusEl.innerHTML = '<span class="text-success"><i class="bi bi-check-circle-fill"></i> Границы отображены</span>';
          }
        } else {
          if (statusEl) {
            statusEl.innerHTML = '<span class="text-secondary"><i class="bi bi-info-circle"></i> Полигон границ отсутствует в базе</span>';
          }
        }
      } catch (e) {
        if (statusEl) statusEl.innerHTML = '<span class="text-danger">Ошибка загрузки полигона</span>';
      }
    }

    window.zoomToBoundary = function() {
      if (window._lastBoundaryBounds) {
        map.fitBounds(window._lastBoundaryBounds, { padding: [40, 40] });
      }
    };

    // Search Autocomplete (Parks, RDA, Cities)
    function initSearchAutocomplete() {
      const input = document.getElementById('search-input');
      const suggestions = document.getElementById('search-suggestions');
      let debounce = null;

      input.addEventListener('input', (e) => {
        clearTimeout(debounce);
        const query = e.target.value.trim().toUpperCase();
        if (query.length < 2) {
          suggestions.style.display = 'none';
          return;
        }

        debounce = setTimeout(() => {
          showSearchSuggestions(query);
        }, 200);
      });

      document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !suggestions.contains(e.target)) {
          suggestions.style.display = 'none';
        }
      });
    }

    function showSearchSuggestions(query) {
      const suggestions = document.getElementById('search-suggestions');
      const items = [];

      // 1. Match POTA Parks
      (allPointsData.matched || []).forEach(p => {
        if (items.length >= 8) return;
        const refMatch = p.ref && p.ref.toUpperCase().includes(query);
        const nameMatch = p.title && p.title.toUpperCase().includes(query);
        if (refMatch || nameMatch) {
          items.push({
            type: 'pota',
            icon: '⭐',
            title: \`\${p.ref} \${p.title}\`,
            subtitle: p.ate || 'ООПТ',
            lat: p.lat,
            lon: p.lon,
            item: p
          });
        }
      });

      // 2. Match Candidates
      (allPointsData.candidates || []).forEach(c => {
        if (items.length >= 12) return;
        if (c.title && c.title.toUpperCase().includes(query)) {
          items.push({
            type: 'cand',
            icon: '🌲',
            title: c.title,
            subtitle: c.ate || 'Кандидат ООПТ',
            lat: c.lat,
            lon: c.lon,
            item: c
          });
        }
      });

      // 3. Known Top Russian Cities / Geocoding
      const TOP_CITIES = [
        { name: 'Москва', lat: 55.7558, lon: 37.6173 },
        { name: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351 },
        { name: 'Новосибирск', lat: 55.0084, lon: 82.9357 },
        { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057 },
        { name: 'Казань', lat: 55.8304, lon: 49.0661 },
        { name: 'Нижний Новгород', lat: 56.3269, lon: 44.0059 },
        { name: 'Самара', lat: 53.1959, lon: 50.1002 },
        { name: 'Челябинск', lat: 55.1644, lon: 61.4368 },
        { name: 'Красноярск', lat: 56.0153, lon: 92.8932 },
        { name: 'Уфа', lat: 54.7388, lon: 55.9721 },
        { name: 'Ростов-на-Дону', lat: 47.2357, lon: 39.7015 },
        { name: 'Краснодар', lat: 45.0355, lon: 38.9753 },
        { name: 'Сочи', lat: 43.6028, lon: 39.7342 },
        { name: 'Владивосток', lat: 43.1198, lon: 131.8869 },
        { name: 'Хабаровск', lat: 48.4827, lon: 135.0838 },
        { name: 'Иркутск', lat: 52.2871, lon: 104.3050 },
        { name: 'Калининград', lat: 54.7104, lon: 20.4522 },
        { name: 'Архангельск', lat: 64.5472, lon: 40.5601 },
        { name: 'Мурманск', lat: 68.9585, lon: 33.0827 },
        { name: 'Петропавловск-Камчатский', lat: 53.0167, lon: 158.6500 }
      ];

      TOP_CITIES.forEach(city => {
        if (items.length >= 15) return;
        if (city.name.toUpperCase().includes(query)) {
          items.push({
            type: 'city',
            icon: '🏙️',
            title: city.name,
            subtitle: 'Город РФ',
            lat: city.lat,
            lon: city.lon
          });
        }
      });

      if (items.length === 0) {
        suggestions.innerHTML = '<div class="p-2 text-secondary text-center small">Ничего не найдено</div>';
        suggestions.style.display = 'block';
        return;
      }

      suggestions.innerHTML = items.map((it, idx) => \`
        <div class="suggestion-item d-flex align-items-center justify-content-between" onclick="selectSuggestion(\${idx})">
          <div class="text-truncate">
            <span class="me-1">\${it.icon}</span>
            <strong class="text-light">\${it.title}</strong>
            <div class="text-secondary small">\${it.subtitle}</div>
          </div>
          <span class="badge bg-dark border border-secondary text-secondary small">Перейти</span>
        </div>
      \`).join('');

      window._currentSuggestions = items;
      suggestions.style.display = 'block';
    }

    window.selectSuggestion = function(idx) {
      const items = window._currentSuggestions || [];
      const it = items[idx];
      if (!it) return;

      document.getElementById('search-suggestions').style.display = 'none';
      document.getElementById('search-input').value = it.title;

      if (it.type === 'city') {
        map.flyTo([it.lat, it.lon], 11);
      } else if (it.item) {
        map.flyTo([it.lat, it.lon], 13);
        setTimeout(() => {
          if (it.item._marker) {
            it.item._marker.openPopup();
          }
          if (it.item.nid) {
            loadAndDrawBoundary(it.item.nid, it.item.title);
          }
        }, 500);
      }
    };

    document.addEventListener('DOMContentLoaded', initMap);
  </script>
</body>
</html>`;
}
