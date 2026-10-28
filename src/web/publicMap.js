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
  <title>Публичная карта ООПТ и парков POTA России | RU-POTA Hub</title>
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
      --header-height: 58px;
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
      background: #0f172a;
      color: #f8f9fa;
    }
    #public-header {
      height: var(--header-height);
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
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
      background: #0f172a;
    }
    .brand-title {
      font-weight: 800;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
      color: #fff;
      text-decoration: none;
    }
    .brand-title:hover {
      color: #34d399;
    }
    .brand-badge {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .map-floating-panel {
      position: absolute;
      top: 12px;
      left: 12px;
      z-index: 999;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 8px 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      max-width: calc(100vw - 24px);
    }
    .map-floating-legend {
      position: absolute;
      bottom: 16px;
      left: 12px;
      z-index: 999;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 6px 14px;
      font-size: 11px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      gap: 12px;
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
    /* Popup styling */
    .leaflet-popup-content-wrapper {
      background: #1e293b;
      color: #f1f5f9;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
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
    .btn-donate {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #fff;
      font-weight: 600;
      border: none;
    }
    .btn-donate:hover {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #fff;
    }
    @media (max-width: 768px) {
      .hide-mobile {
        display: none !important;
      }
      .brand-title span {
        display: none;
      }
    }
  </style>
</head>
<body>

  <!-- Top Navigation Header -->
  <header id="public-header" class="d-flex align-items-center justify-content-between px-3">
    <!-- Left: Brand & Search -->
    <div class="d-flex align-items-center gap-2 gap-md-3">
      <a href="/" class="brand-title">
        <span class="fs-4">🌲</span>
        <strong class="fs-5">RU-POTA</strong>
        <span class="brand-badge hide-mobile">Карта ООПТ</span>
      </a>

      <!-- Region Dropdown -->
      <div style="min-width: 180px; max-width: 260px;" class="hide-mobile">
        <select id="region-select" class="form-select form-select-sm bg-dark text-light border-secondary">
          <option value="">🇷🇺 Вся Россия (обзор)</option>
        </select>
      </div>

      <!-- Live Search Input -->
      <div class="input-group input-group-sm" style="max-width: 220px;">
        <span class="input-group-text bg-dark border-secondary text-secondary"><i class="bi bi-search"></i></span>
        <input type="text" id="search-input" class="form-control bg-dark text-light border-secondary" placeholder="Поиск (RU-0001, RDA, ООПТ)...">
      </div>
    </div>

    <!-- Right: Actions & Login -->
    <div class="d-flex align-items-center gap-2">
      <!-- Telegram Mini App -->
      <a href="https://t.me/ru_pota_bot/app" target="_blank" class="btn btn-sm btn-outline-success d-flex align-items-center gap-1" title="Открыть в Telegram">
        <i class="bi bi-telegram"></i>
        <span class="hide-mobile">Mini App</span>
      </a>

      <!-- Donate / Server Support Button -->
      <button type="button" class="btn btn-sm btn-donate d-flex align-items-center gap-1 shadow-sm" onclick="showDonateModal()" title="Поддержать сервер и развитие бота">
        <i class="bi bi-heart-fill text-danger"></i>
        <span>Поддержать</span>
      </button>

      <!-- Reps / Admin Entry -->
      ${isAuthed ? `
        <a href="/" class="btn btn-sm btn-primary d-flex align-items-center gap-1">
          <i class="bi bi-speedometer2"></i>
          <span class="hide-mobile">Панель</span>
        </a>
      ` : `
        <a href="/login" class="btn btn-sm btn-outline-light d-flex align-items-center gap-1" title="Вход для региональных координаторов">
          <i class="bi bi-box-arrow-in-right"></i>
          <span class="hide-mobile">Вход</span>
        </a>
      `}
    </div>
  </header>

  <!-- Main Map Container -->
  <main id="map-container">
    <div id="map"></div>

    <!-- Floating Filter Controls -->
    <div class="map-floating-panel">
      <div class="d-flex flex-wrap align-items-center gap-2">
        <!-- Layer filters -->
        <div class="form-check form-check-inline m-0">
          <input class="form-check-input" type="checkbox" id="filter-pota" checked>
          <label class="form-check-label small fw-semibold text-success" for="filter-pota">
            ⭐ Парки POTA (<span id="count-pota">...</span>)
          </label>
        </div>
        <div class="form-check form-check-inline m-0">
          <input class="form-check-input" type="checkbox" id="filter-candidates" checked>
          <label class="form-check-label small fw-semibold text-secondary" for="filter-candidates">
            🌲 Кандидаты ООПТ (<span id="count-candidates">...</span>)
          </label>
        </div>

        <!-- Overlays Dropdown -->
        <div class="dropdown ms-auto">
          <button class="btn btn-xs btn-outline-light dropdown-toggle py-0 px-2" type="button" data-bs-toggle="dropdown" style="font-size: 11px;">
            <i class="bi bi-layers"></i> Слои
          </button>
          <ul class="dropdown-menu dropdown-menu-dark dropdown-menu-end shadow">
            <li><h6 class="dropdown-header">Подложка</h6></li>
            <li><a class="dropdown-item active base-map-opt" href="#" data-base="twogis">2ГИС (Россия)</a></li>
            <li><a class="dropdown-item base-map-opt" href="#" data-base="osm">OpenStreetMap</a></li>
            <li><a class="dropdown-item base-map-opt" href="#" data-base="satellite">Спутник (Esri)</a></li>
            <li><a class="dropdown-item base-map-opt" href="#" data-base="dark">Тёмная карта</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><h6 class="dropdown-header">Сетки и радиолюбительские слои</h6></li>
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
        <span class="legend-dot" style="background: #198754; border: 1px solid #fff;"></span>
        <span>Официальный парк POTA</span>
      </div>
      <div class="legend-item">
        <span class="legend-dot" style="background: #64748b;"></span>
        <span>Кандидат ООПТ</span>
      </div>
      <div class="legend-item text-secondary">
        <span>Клик по метке загружает точные границы полигона</span>
      </div>
    </div>
  </main>

  <!-- Donate & Support Modal -->
  <div class="modal fade" id="donateModal" tabindex="-1" aria-labelledby="donateModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content bg-dark text-light border-secondary shadow-lg">
        <div class="modal-header border-secondary">
          <h5 class="modal-title d-flex align-items-center gap-2" id="donateModalLabel">
            <span>☕</span> Поддержка проекта RU-POTA
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <p class="mb-3">
            Проект <strong>RU-POTA Bot</strong> и картографический хаб развиваются силами радиолюбителей-энтузиастов.
          </p>
          <div class="p-3 rounded bg-black bg-opacity-40 border border-secondary mb-3">
            <div class="small text-secondary mb-1">На что идут средства:</div>
            <ul class="small mb-0 ps-3">
              <li>Оплата VPS-сервера, скоростного канала и базы данных</li>
              <li>Синхронизация спотов с кластером POTA и каналом RDA</li>
              <li>Сбор и геопривязка полигонов 11 000+ ООПТ России</li>
              <li>Разработка мобильного Mini App и новых полезных фич</li>
            </ul>
          </div>
          <p class="small text-secondary mb-3">
            Любой донат помогает проекту оставаться бесплатным и мотивирует развивать новые инструменты для радиоэкспедиций!
          </p>
          
          <div class="d-grid gap-2">
            <a href="https://t.me/r9ogl" target="_blank" class="btn btn-warning fw-bold d-flex align-items-center justify-content-center gap-2">
              <i class="bi bi-telegram"></i> Написать автору (Сан Саныч R9OGL)
            </a>
            <a href="https://t.me/ru_pota_bot" target="_blank" class="btn btn-outline-light btn-sm d-flex align-items-center justify-content-center gap-2">
              <i class="bi bi-robot"></i> Telegram-бот @ru_pota_bot
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

  <script>
    // 1. Base Maps Configuration
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
    let currentBoundaryLayer = null;
    let wmsLayers = {};

    let allPointsData = { matched: [], unmatchedPota: [], candidates: [] };
    let currentRegion = '';

    // Initialize Map
    function initMap() {
      map = L.map('map', {
        center: [55.75, 50.0],
        zoom: 5,
        minZoom: 3,
        maxZoom: 18,
        zoomControl: true,
        attributionControl: false,
        preferCanvas: true
      });

      // Default base layer (2GIS)
      baseLayer = L.tileLayer(BASE_MAPS.twogis.url, {
        subdomains: BASE_MAPS.twogis.subdomains,
        maxZoom: 18
      }).addTo(map);

      potaGroup = L.layerGroup().addTo(map);
      candidateGroup = L.layerGroup().addTo(map);

      // Initialize RDA WMS Overlay by default
      toggleWms('rda', true);

      // Event listeners for base maps
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

      // Event listeners for WMS overlays
      document.querySelectorAll('.wms-toggle').forEach(el => {
        el.addEventListener('change', () => {
          const lyr = el.getAttribute('data-layer');
          toggleWms(lyr, el.checked);
        });
      });

      // Filter checkboxes
      document.getElementById('filter-pota').addEventListener('change', (e) => {
        if (e.target.checked) map.addLayer(potaGroup);
        else map.removeLayer(potaGroup);
      });
      document.getElementById('filter-candidates').addEventListener('change', (e) => {
        if (e.target.checked) map.addLayer(candidateGroup);
        else map.removeLayer(candidateGroup);
      });

      // Region Dropdown
      document.getElementById('region-select').addEventListener('change', (e) => {
        currentRegion = e.target.value;
        loadPoints(currentRegion, true);
      });

      // Search filter input
      let searchDebounce = null;
      document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          renderPoints(e.target.value.trim().toUpperCase());
        }, 250);
      });

      // Load initial data
      loadRegions();
      loadPoints('', false);
    }

    // Toggle WMS Layers from R1CF
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

    // Load Regions Dropdown
    async function loadRegions() {
      try {
        const res = await fetch('/api/map/regions');
        const data = await res.json();
        const sel = document.getElementById('region-select');
        if (data && data.regions && sel) {
          const list = data.regions.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
          list.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.name;
            opt.textContent = \`\${r.name} (\${r.matchedParks || 0} POTA)\`;
            sel.appendChild(opt);
          });
        }
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

        document.getElementById('count-pota').textContent = (allPointsData.matched?.length || 0) + (allPointsData.unmatchedPota?.length || 0);
        document.getElementById('count-candidates').textContent = allPointsData.candidates?.length || 0;

        renderPoints('', fitBounds);
      } catch (err) {
        console.error('Error loading points:', err);
      }
    }

    // Render Points on Map
    function renderPoints(searchQuery = '', fitBounds = false) {
      potaGroup.clearLayers();
      candidateGroup.clearLayers();

      const bounds = [];
      const query = searchQuery ? searchQuery.toUpperCase() : '';

      // 1. Official Matched POTA Parks (Green)
      (allPointsData.matched || []).forEach(p => {
        if (!p.lat || !p.lon) return;
        if (query) {
          const match = (p.ref && p.ref.toUpperCase().includes(query)) ||
                        (p.title && p.title.toUpperCase().includes(query)) ||
                        (p.potaName && p.potaName.toUpperCase().includes(query)) ||
                        (p.ate && p.ate.toUpperCase().includes(query));
          if (!match) return;
        }

        const areaStr = p.area ? \`📏 Площадь: <strong>\${Number(p.area).toLocaleString('ru-RU')} га</strong>\` : '';
        const popupHtml = \`
          <div class="oopt-card-popup">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <span class="badge bg-success fw-bold">\${p.ref}</span>
              <small class="text-secondary">\${p.sigDisplay || 'Федеральное'}</small>
            </div>
            <div class="fw-bold fs-6 text-light mb-1">\${p.title || p.potaName}</div>
            <div class="text-secondary small mb-1">📍 \${p.ate || ''}</div>
            <div class="text-secondary small mb-2">\${areaStr}</div>
            <div id="boundary-status-\${p.nid}" class="small mb-2"></div>
            <div class="d-flex flex-wrap gap-1 mt-2">
              <button class="btn btn-xs btn-outline-info py-0 px-2" style="font-size:11px;" onclick="zoomToBoundary(\${p.nid})">📐 Границы</button>
              <a href="https://pota.app/#/park/\${p.ref}" target="_blank" class="btn btn-xs btn-outline-success py-0 px-2" style="font-size:11px;">POTA.app</a>
              \${p.site ? \`<a href="\${p.site}" target="_blank" class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size:11px;">Паспорт</a>\` : ''}
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
        bounds.push([p.lat, p.lon]);
      });

      // 2. Unmatched POTA Parks (Yellow/Orange)
      (allPointsData.unmatchedPota || []).forEach(p => {
        if (!p.lat || !p.lon) return;
        if (query) {
          const match = (p.ref && p.ref.toUpperCase().includes(query)) ||
                        (p.name && p.name.toUpperCase().includes(query)) ||
                        (p.location && p.location.toUpperCase().includes(query));
          if (!match) return;
        }

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
        bounds.push([p.lat, p.lon]);
      });

      // 3. Candidate OOPTs (Grey/Slate)
      (allPointsData.candidates || []).forEach(c => {
        if (!c.lat || !c.lon) return;
        if (query) {
          const match = (c.title && c.title.toUpperCase().includes(query)) ||
                        (c.ate && c.ate.toUpperCase().includes(query));
          if (!match) return;
        }

        const areaStr = c.area ? \`📏 Площадь: <strong>\${Number(c.area).toLocaleString('ru-RU')} га</strong>\` : '';
        const popupHtml = \`
          <div class="oopt-card-popup">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <span class="badge bg-secondary">Кандидат ООПТ</span>
              <small class="text-secondary">\${c.sigDisplay || 'Региональное'}</small>
            </div>
            <div class="fw-bold fs-6 text-light mb-1">\${c.title}</div>
            <div class="text-secondary small mb-1">📍 \${c.ate || ''}</div>
            <div class="text-secondary small mb-2">\${areaStr}</div>
            <div id="boundary-status-\${c.nid}" class="small mb-2"></div>
            <div class="d-flex flex-wrap gap-1 mt-2">
              <button class="btn btn-xs btn-outline-info py-0 px-2" style="font-size:11px;" onclick="zoomToBoundary(\${c.nid})">📐 Границы</button>
              \${c.site ? \`<a href="\${c.site}" target="_blank" class="btn btn-xs btn-outline-secondary py-0 px-2" style="font-size:11px;">Паспорт</a>\` : ''}
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
        bounds.push([c.lat, c.lon]);
      });

      if (fitBounds && bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
        } catch (_) {}
      }
    }

    // Load & Render Polygon Boundary for an OOPT
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

    window.zoomToBoundary = function(nid) {
      if (window._lastBoundaryBounds) {
        map.fitBounds(window._lastBoundaryBounds, { padding: [40, 40] });
      }
    };

    window.showDonateModal = function() {
      const modal = new bootstrap.Modal(document.getElementById('donateModal'));
      modal.show();
    };

    // Initialize when DOM ready
    document.addEventListener('DOMContentLoaded', initMap);
  </script>
</body>
</html>`;
}
