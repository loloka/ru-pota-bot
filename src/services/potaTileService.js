import zlib from 'zlib';

// Pre-generated 256x256 fully transparent PNG
let emptyPngBuffer = null;

// Tile memory cache for super-fast responses
const tileCache = new Map();
const MAX_CACHE_SIZE = 1000;

// CRC32 table for pure-JS PNG generation
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function buildPng(rawScanlines, width = 256, height = 256) {
  const compressed = zlib.deflateSync(rawScanlines);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Deflate
  ihdr[11] = 0; // Standard filter
  ihdr[12] = 0; // No interlace

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

export function getEmptyPng() {
  if (!emptyPngBuffer) {
    const stride = 256 * 4 + 1;
    const raw = Buffer.alloc(stride * 256);
    emptyPngBuffer = buildPng(raw);
  }
  return emptyPngBuffer;
}

/**
 * Converts XYZ Tile numbers to Bounding Box
 */
export function tileToBbox(z, x, y) {
  const n = Math.pow(2, z);
  const lon_min = (x / n) * 360 - 180;
  const lon_max = ((x + 1) / n) * 360 - 180;
  const lat_max = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const lat_min = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
  return { lon_min, lon_max, lat_min, lat_max };
}

/**
 * Parses WMS BBOX string (supports EPSG:4326 and EPSG:3857)
 */
export function parseWmsBbox(bboxStr) {
  if (!bboxStr) return null;
  const parts = bboxStr.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;

  let [b0, b1, b2, b3] = parts;

  // Case 1: EPSG:3857 (Spherical Mercator meters)
  if (Math.abs(b0) > 180 || Math.abs(b2) > 180) {
    const mercatorToLon = (x) => (x / 20037508.34) * 180;
    const mercatorToLat = (y) => (180 / Math.PI) * (2 * Math.atan(Math.exp((y / 20037508.34) * Math.PI)) - Math.PI / 2);
    return {
      lon_min: Math.min(mercatorToLon(b0), mercatorToLon(b2)),
      lon_max: Math.max(mercatorToLon(b0), mercatorToLon(b2)),
      lat_min: Math.min(mercatorToLat(b1), mercatorToLat(b3)),
      lat_max: Math.max(mercatorToLat(b1), mercatorToLat(b3)),
    };
  }

  // Case 2: EPSG:4326 (Degrees)
  // Check if axis order is [lat_min, lon_min, lat_max, lon_max] (WMS 1.3.0) or [lon_min, lat_min, lon_max, lat_max]
  let lon_min, lon_max, lat_min, lat_max;
  if (Math.abs(b0) <= 90 && Math.abs(b2) <= 90 && Math.abs(b1) <= 180 && Math.abs(b3) <= 180) {
    // Lat first
    lat_min = Math.min(b0, b2);
    lat_max = Math.max(b0, b2);
    lon_min = Math.min(b1, b3);
    lon_max = Math.max(b1, b3);
  } else {
    // Lon first
    lon_min = Math.min(b0, b2);
    lon_max = Math.max(b0, b2);
    lat_min = Math.min(b1, b3);
    lat_max = Math.max(b1, b3);
  }

  return { lon_min, lon_max, lat_min, lat_max };
}

/**
 * Generates a 256x256 transparent PNG tile with green pine tree pins for POTA parks in bbox
 */
export function renderPotaTile(bbox, parks) {
  const cacheKey = `${bbox.lon_min.toFixed(4)},${bbox.lat_min.toFixed(4)},${bbox.lon_max.toFixed(4)},${bbox.lat_max.toFixed(4)}`;
  if (tileCache.has(cacheKey)) {
    return tileCache.get(cacheKey);
  }

  // Filter parks inside tile bbox
  const visible = parks.filter(p => {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    return lat >= bbox.lat_min && lat <= bbox.lat_max && lon >= bbox.lon_min && lon <= bbox.lon_max;
  });

  if (visible.length === 0) {
    const empty = getEmptyPng();
    if (tileCache.size < MAX_CACHE_SIZE) tileCache.set(cacheKey, empty);
    return empty;
  }

  const width = 256;
  const height = 256;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * stride + 1 + x * 4;
    if (a === 255) {
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    } else if (a > 0) {
      const srcA = a / 255;
      const dstA = raw[offset + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA > 0) {
        raw[offset] = Math.round((r * srcA + raw[offset] * dstA * (1 - srcA)) / outA);
        raw[offset + 1] = Math.round((g * srcA + raw[offset + 1] * dstA * (1 - srcA)) / outA);
        raw[offset + 2] = Math.round((b * srcA + raw[offset + 2] * dstA * (1 - srcA)) / outA);
        raw[offset + 3] = Math.round(outA * 255);
      }
    }
  }

  // Draw pine tree pin at (cx, cy)
  function drawPin(cx, cy, isActive) {
    const r = 7;
    // Circular pin badge with dark outline
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= r * r) {
          if (dist2 >= (r - 1.5) * (r - 1.5)) {
            setPixel(cx + dx, cy + dy, 2, 44, 34, 255); // Dark green stroke
          } else {
            if (isActive) {
              setPixel(cx + dx, cy + dy, 234, 88, 12, 255); // Amber/orange if active on air
            } else {
              setPixel(cx + dx, cy + dy, 16, 185, 129, 255); // Emerald green for park
            }
          }
        }
      }
    }

    // White pine tree silhouette inside pin
    setPixel(cx, cy - 4, 255, 255, 255, 255);
    for (let dx = -1; dx <= 1; dx++) setPixel(cx + dx, cy - 3, 255, 255, 255, 255);
    for (let dx = -2; dx <= 2; dx++) setPixel(cx + dx, cy - 2, 255, 255, 255, 255);
    for (let dx = -3; dx <= 3; dx++) setPixel(cx + dx, cy - 1, 255, 255, 255, 255);
    for (let dx = -4; dx <= 4; dx++) setPixel(cx + dx, cy, 255, 255, 255, 255);
    // Tree trunk
    setPixel(cx, cy + 1, 255, 255, 255, 255);
    setPixel(cx, cy + 2, 255, 255, 255, 255);
    setPixel(cx, cy + 3, 255, 255, 255, 255);
  }

  visible.forEach(p => {
    const lonSpan = bbox.lon_max - bbox.lon_min;
    const latSpan = bbox.lat_max - bbox.lat_min;
    if (lonSpan <= 0 || latSpan <= 0) return;

    const px = Math.round(((Number(p.lon) - bbox.lon_min) / lonSpan) * width);
    const py = Math.round(((bbox.lat_max - Number(p.lat)) / latSpan) * height);
    drawPin(px, py, Boolean(p.isActive));
  });

  const png = buildPng(raw, width, height);

  if (tileCache.size < MAX_CACHE_SIZE) {
    tileCache.set(cacheKey, png);
  }

  return png;
}

/**
 * Generates a full GPX 1.1 document for OsmAnd
 */
export function generatePotaGpx(parks) {
  function escapeXml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  const waypoints = parks
    .filter(p => p.lat && p.lon && !isNaN(p.lat) && !isNaN(p.lon))
    .map(p => {
      const ref = escapeXml(p.reference);
      const name = escapeXml(p.name);
      const reg = escapeXml(p.region || '');
      const grid = escapeXml(p.grid || '');
      return `  <wpt lat="${Number(p.lat).toFixed(6)}" lon="${Number(p.lon).toFixed(6)}">
    <name>${ref} ${name}</name>
    <cmt>${ref} (${reg}) ${grid ? `[${grid}]` : ''}</cmt>
    <desc>${ref}: ${name}&#10;Регион: ${reg}&#10;QTH Локатор: ${grid}&#10;Программа: Parks on the Air (RU-POTA)</desc>
    <sym>Tree</sym>
    <type>Parks on the Air</type>
    <extensions>
      <osmand:icon>special_star</osmand:icon>
      <osmand:background>circle</osmand:background>
      <osmand:color>#10b981</osmand:color>
    </extensions>
  </wpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RU-POTA Hub - https://pota.r9o.ru" xmlns="http://www.topografix.com/GPX/1/1" xmlns:osmand="https://osmand.net">
  <metadata>
    <name>RU-POTA Parks (Заповедники и парки)</name>
    <desc>Официальные точки программы Parks on the Air для РФ, Беларуси и Казахстана с метками-елочками</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypoints}
</gpx>`;
}
