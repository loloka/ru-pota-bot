import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { POTA_LOCATION_CANONICAL } from './ooptService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache of POTA locations
const locationMap = new Map();

// Russian translations for entities/countries
const ENTITY_RU = {
  'United States of America': 'США',
  'United States': 'США',
  'European Russia': 'Россия',
  'Asiatic Russia': 'Россия',
  'Russia': 'Россия',
  'Belarus': 'Беларусь',
  'Kazakhstan': 'Казахстан',
  'France': 'Франция',
  'Germany': 'Германия',
  'Italy': 'Италия',
  'Spain': 'Испания',
  'England': 'Великобритания',
  'Scotland': 'Шотландия',
  'Wales': 'Уэльс',
  'Northern Ireland': 'Северная Ирландия',
  'United Kingdom': 'Великобритания',
  'Canada': 'Канада',
  'Poland': 'Польша',
  'Czech Republic': 'Чехия',
  'Croatia': 'Хорватия',
  'Australia': 'Австралия',
  'New Zealand': 'Новая Зеландия',
  'Japan': 'Япония',
  'Ukraine': 'Украина',
  'Finland': 'Финляндия',
  'Sweden': 'Швеция',
  'Norway': 'Норвегия',
  'Netherlands': 'Нидерланды',
  'Belgium': 'Бельгия',
  'Austria': 'Австрия',
  'Switzerland': 'Швейцария',
  'Hungary': 'Венгрия',
  'Romania': 'Румыния',
  'Bulgaria': 'Болгария',
  'Portugal': 'Португалия',
  'Slovakia': 'Словакия',
  'Slovenia': 'Словения',
  'Lithuania': 'Литва',
  'Latvia': 'Латвия',
  'Estonia': 'Эстония',
  'Ireland': 'Ирландия',
  'Greece': 'Греция',
  'Turkey': 'Турция',
  'Cyprus': 'Кипр',
  'Serbia': 'Сербия',
  'Bosnia and Herzegovina': 'Босния и Герцеговина',
  'North Macedonia': 'Северная Македония',
  'Montenegro': 'Черногория',
  'Israel': 'Израиль',
  'South Africa': 'ЮАР',
  'Brazil': 'Бразилия',
  'Argentina': 'Аргентина',
  'Chile': 'Чили',
  'Mexico': 'Мексика',
  'India': 'Индия',
  'China': 'Китай',
  'Republic of Korea': 'Южная Корея',
  'South Korea': 'Южная Корея',
  'Thailand': 'Таиланд',
  'Mongolia': 'Монголия',
  'Georgia': 'Грузия',
  'Armenia': 'Армения',
  'Azerbaijan': 'Азербайджан',
  'Uzbekistan': 'Узбекистан',
  'Kyrgyzstan': 'Кыргызстан',
  'Tajikistan': 'Таджикистан',
  'Turkmenistan': 'Туркменистан',
  'Moldova': 'Молдова',
  'Iceland': 'Исландия',
  'Denmark': 'Дания',
  'Luxembourg': 'Люксембург',
  'Cuba': 'Куба'
};

// Map special POTA prefixes (both amateur radio and ISO 2-letter prefixes)
const SPECIAL_PREFIXES = {
  'K': { flag: '🇺🇸', code: 'US', ru: 'США', en: 'United States' },
  'US': { flag: '🇺🇸', code: 'US', ru: 'США', en: 'United States' },
  'RU': { flag: '🇷🇺', code: 'RU', ru: 'Россия', en: 'Russia' },
  'BY': { flag: '🇧🇾', code: 'BY', ru: 'Беларусь', en: 'Belarus' },
  'KZ': { flag: '🇰🇿', code: 'KZ', ru: 'Казахстан', en: 'Kazakhstan' },
  'UA': { flag: '🇺🇦', code: 'UA', ru: 'Украина', en: 'Ukraine' },
  'VE': { flag: '🇨🇦', code: 'CA', ru: 'Канада', en: 'Canada' },
  'CA': { flag: '🇨🇦', code: 'CA', ru: 'Канада', en: 'Canada' },
  'VK': { flag: '🇦🇺', code: 'AU', ru: 'Австралия', en: 'Australia' },
  'AU': { flag: '🇦🇺', code: 'AU', ru: 'Австралия', en: 'Australia' },
  'ZL': { flag: '🇳🇿', code: 'NZ', ru: 'Новая Зеландия', en: 'New Zealand' },
  'NZ': { flag: '🇳🇿', code: 'NZ', ru: 'Новая Зеландия', en: 'New Zealand' },
  'JA': { flag: '🇯🇵', code: 'JP', ru: 'Япония', en: 'Japan' },
  'JP': { flag: '🇯🇵', code: 'JP', ru: 'Япония', en: 'Japan' },
  'DL': { flag: '🇩🇪', code: 'DE', ru: 'Германия', en: 'Germany' },
  'DE': { flag: '🇩🇪', code: 'DE', ru: 'Германия', en: 'Germany' },
  'F': { flag: '🇫🇷', code: 'FR', ru: 'Франция', en: 'France' },
  'FR': { flag: '🇫🇷', code: 'FR', ru: 'Франция', en: 'France' },
  'G': { flag: '🇬🇧', code: 'GB', ru: 'Великобритания', en: 'United Kingdom' },
  'GB': { flag: '🇬🇧', code: 'GB', ru: 'Великобритания', en: 'United Kingdom' },
  'EA': { flag: '🇪🇸', code: 'ES', ru: 'Испания', en: 'Spain' },
  'ES': { flag: '🇪🇸', code: 'ES', ru: 'Испания', en: 'Spain' },
  'I': { flag: '🇮🇹', code: 'IT', ru: 'Италия', en: 'Italy' },
  'IT': { flag: '🇮🇹', code: 'IT', ru: 'Италия', en: 'Italy' },
  'OE': { flag: '🇦🇹', code: 'AT', ru: 'Австрия', en: 'Austria' },
  'AT': { flag: '🇦🇹', code: 'AT', ru: 'Австрия', en: 'Austria' },
  'HB': { flag: '🇨🇭', code: 'CH', ru: 'Швейцария', en: 'Switzerland' },
  'CH': { flag: '🇨🇭', code: 'CH', ru: 'Швейцария', en: 'Switzerland' },
  'OH': { flag: '🇫🇮', code: 'FI', ru: 'Финляндия', en: 'Finland' },
  'FI': { flag: '🇫🇮', code: 'FI', ru: 'Финляндия', en: 'Finland' },
  'SM': { flag: '🇸🇪', code: 'SE', ru: 'Швеция', en: 'Sweden' },
  'SE': { flag: '🇸🇪', code: 'SE', ru: 'Швеция', en: 'Sweden' },
  'LA': { flag: '🇳🇴', code: 'NO', ru: 'Норвегия', en: 'Norway' },
  'NO': { flag: '🇳🇴', code: 'NO', ru: 'Норвегия', en: 'Norway' },
  'PA': { flag: '🇳🇱', code: 'NL', ru: 'Нидерланды', en: 'Netherlands' },
  'NL': { flag: '🇳🇱', code: 'NL', ru: 'Нидерланды', en: 'Netherlands' },
  'ON': { flag: '🇧🇪', code: 'BE', ru: 'Бельгия', en: 'Belgium' },
  'BE': { flag: '🇧🇪', code: 'BE', ru: 'Бельгия', en: 'Belgium' },
  'HA': { flag: '🇭🇺', code: 'HU', ru: 'Венгрия', en: 'Hungary' },
  'HU': { flag: '🇭🇺', code: 'HU', ru: 'Венгрия', en: 'Hungary' },
  'YO': { flag: '🇷🇴', code: 'RO', ru: 'Румыния', en: 'Romania' },
  'RO': { flag: '🇷🇴', code: 'RO', ru: 'Румыния', en: 'Romania' },
  'LZ': { flag: '🇧🇬', code: 'BG', ru: 'Болгария', en: 'Bulgaria' },
  'BG': { flag: '🇧🇬', code: 'BG', ru: 'Болгария', en: 'Bulgaria' },
  'CT': { flag: '🇵🇹', code: 'PT', ru: 'Португалия', en: 'Portugal' },
  'PT': { flag: '🇵🇹', code: 'PT', ru: 'Португалия', en: 'Portugal' },
  '9A': { flag: '🇭🇷', code: 'HR', ru: 'Хорватия', en: 'Croatia' },
  'HR': { flag: '🇭🇷', code: 'HR', ru: 'Хорватия', en: 'Croatia' },
  'YU': { flag: '🇷🇸', code: 'RS', ru: 'Сербия', en: 'Serbia' },
  'RS': { flag: '🇷🇸', code: 'RS', ru: 'Сербия', en: 'Serbia' },
  'S5': { flag: '🇸🇮', code: 'SI', ru: 'Словения', en: 'Slovenia' },
  'SI': { flag: '🇸🇮', code: 'SI', ru: 'Словения', en: 'Slovenia' },
  'OM': { flag: '🇸🇰', code: 'SK', ru: 'Словакия', en: 'Slovakia' },
  'SK': { flag: '🇸🇰', code: 'SK', ru: 'Словакия', en: 'Slovakia' },
  'LY': { flag: '🇱🇹', code: 'LT', ru: 'Литва', en: 'Lithuania' },
  'LT': { flag: '🇱🇹', code: 'LT', ru: 'Литва', en: 'Lithuania' },
  'YL': { flag: '🇱🇻', code: 'LV', ru: 'Латвия', en: 'Latvia' },
  'LV': { flag: '🇱🇻', code: 'LV', ru: 'Латвия', en: 'Latvia' },
  'EE': { flag: '🇪🇪', code: 'EE', ru: 'Эстония', en: 'Estonia' },
  'EI': { flag: '🇮🇪', code: 'IE', ru: 'Ирландия', en: 'Ireland' },
  'IE': { flag: '🇮🇪', code: 'IE', ru: 'Ирландия', en: 'Ireland' },
  'SV': { flag: '🇬🇷', code: 'GR', ru: 'Греция', en: 'Greece' },
  'GR': { flag: '🇬🇷', code: 'GR', ru: 'Греция', en: 'Greece' },
  'TA': { flag: '🇹🇷', code: 'TR', ru: 'Турция', en: 'Turkey' },
  'TR': { flag: '🇹🇷', code: 'TR', ru: 'Турция', en: 'Turkey' },
  '4X': { flag: '🇮🇱', code: 'IL', ru: 'Израиль', en: 'Israel' },
  'IL': { flag: '🇮🇱', code: 'IL', ru: 'Израиль', en: 'Israel' },
  'ZS': { flag: '🇿🇦', code: 'ZA', ru: 'ЮАР', en: 'South Africa' },
  'ZA': { flag: '🇿🇦', code: 'ZA', ru: 'ЮАР', en: 'South Africa' },
  'LU': { flag: '🇦🇷', code: 'AR', ru: 'Аргентина', en: 'Argentina' },
  'AR': { flag: '🇦🇷', code: 'AR', ru: 'Аргентина', en: 'Argentina' },
  'CE': { flag: '🇨🇱', code: 'CL', ru: 'Чили', en: 'Chile' },
  'CL': { flag: '🇨🇱', code: 'CL', ru: 'Чили', en: 'Chile' },
  'PY': { flag: '🇧🇷', code: 'BR', ru: 'Бразилия', en: 'Brazil' },
  'BR': { flag: '🇧🇷', code: 'BR', ru: 'Бразилия', en: 'Brazil' },
  'PL': { flag: '🇵🇱', code: 'PL', ru: 'Польша', en: 'Poland' },
  'SP': { flag: '🇵🇱', code: 'PL', ru: 'Польша', en: 'Poland' },
  'CZ': { flag: '🇨🇿', code: 'CZ', ru: 'Чехия', en: 'Czechia' },
  'OK': { flag: '🇨🇿', code: 'CZ', ru: 'Чехия', en: 'Czechia' },
  'CU': { flag: '🇨🇺', code: 'CU', ru: 'Куба', en: 'Cuba' },
  'TH': { flag: '🇹🇭', code: 'TH', ru: 'Таиланд', en: 'Thailand' }
};

function getFlagFrom2LetterIso(code) {
  if (!code || code.length !== 2) return null;
  const chars = code.toUpperCase().split('');
  if (chars.some(c => c < 'A' || c > 'Z')) return null;
  return String.fromCodePoint(...chars.map(c => 127397 + c.charCodeAt(0)));
}

/**
 * Initializes locations map from file on disk
 */
function initLocations() {
  if (locationMap.size > 0) return;
  try {
    const locationsPath = path.resolve(__dirname, '../data/pota_locations.json');
    if (fs.existsSync(locationsPath)) {
      const raw = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
      if (Array.isArray(raw)) {
        for (const loc of raw) {
          if (loc && loc.locationDesc) {
            locationMap.set(loc.locationDesc, loc);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[LocationService] Failed to load pota_locations.json:', err.message);
  }
}

// Pre-initialize on module load
initLocations();

export const locationService = {
  /**
   * Returns flag emoji for a given country/prefix code
   * @param {string} prefix 
   * @returns {string} Emoji flag or '🌐'
   */
  getFlag(prefix) {
    if (!prefix) return '🌐';
    const up = prefix.toUpperCase().trim();
    if (SPECIAL_PREFIXES[up]) {
      return SPECIAL_PREFIXES[up].flag;
    }
    const isoFlag = getFlagFrom2LetterIso(up);
    return isoFlag || '🌐';
  },

  /**
   * Resolves country, region, and flag for a spot based on locationDesc and/or park reference
   * @param {string} rawLocationDesc e.g. "FR-PAC", "US-MI", "US-CT,US-DC", "RU-NS"
   * @param {string} rawReference e.g. "FR-7040", "RU-0073", "US-13184"
   * @returns {{
   *   flag: string,
   *   countryName: string,
   *   countryNameEn: string,
   *   entityName: string,
   *   regionName: string,
   *   location: string
   * }}
   */
  resolveLocation(rawLocationDesc = '', rawReference = '') {
    initLocations();

    const locDesc = (rawLocationDesc || '').trim();
    const ref = (rawReference || '').toUpperCase().trim();

    // 1. Identify country prefix
    let countryPrefix = '';
    if (locDesc) {
      const firstCode = locDesc.split(',')[0].trim();
      const dashIdx = firstCode.indexOf('-');
      if (dashIdx > 0) {
        countryPrefix = firstCode.substring(0, dashIdx).toUpperCase();
      }
    }
    if (!countryPrefix && ref) {
      const dashIdx = ref.indexOf('-');
      if (dashIdx > 0) {
        countryPrefix = ref.substring(0, dashIdx);
      }
    }

    // 2. Identify Flag and default Country Names
    let flag = '🌐';
    let countryNameEn = '';
    let countryNameRu = '';
    let entityName = '';

    if (countryPrefix) {
      if (SPECIAL_PREFIXES[countryPrefix]) {
        flag = SPECIAL_PREFIXES[countryPrefix].flag;
        countryNameEn = SPECIAL_PREFIXES[countryPrefix].en;
        countryNameRu = SPECIAL_PREFIXES[countryPrefix].ru;
        entityName = SPECIAL_PREFIXES[countryPrefix].en;
      } else {
        flag = getFlagFrom2LetterIso(countryPrefix) || '🌐';
      }
    }

    // 3. Resolve Region and refine Country from POTA locations map
    let regionName = '';

    if (locDesc) {
      const parts = locDesc.split(',').map(p => p.trim()).filter(Boolean);

      if (parts.length === 1) {
        const singleCode = parts[0];
        // Check Russian canonical names first
        if (POTA_LOCATION_CANONICAL && POTA_LOCATION_CANONICAL[singleCode]) {
          regionName = POTA_LOCATION_CANONICAL[singleCode];
          countryNameRu = 'Россия';
          countryNameEn = 'Russia';
          entityName = 'Russia';
          flag = '🇷🇺';
        } else {
          const locItem = locationMap.get(singleCode);
          if (locItem) {
            regionName = locItem.locationName || '';
            if (locItem.entityName) {
              entityName = locItem.entityName;
              countryNameEn = locItem.entityName;
              countryNameRu = ENTITY_RU[locItem.entityName] || locItem.entityName;
            }
          }
        }
      } else if (parts.length > 1) {
        // Multi-region
        const resolvedNames = [];
        for (const p of parts) {
          if (POTA_LOCATION_CANONICAL && POTA_LOCATION_CANONICAL[p]) {
            resolvedNames.push(POTA_LOCATION_CANONICAL[p]);
            if (!countryNameRu) {
              countryNameRu = 'Россия';
              countryNameEn = 'Russia';
              flag = '🇷🇺';
            }
          } else {
            const locItem = locationMap.get(p);
            if (locItem) {
              resolvedNames.push(locItem.locationName || p);
              if (!entityName && locItem.entityName) {
                entityName = locItem.entityName;
                countryNameEn = locItem.entityName;
                countryNameRu = ENTITY_RU[locItem.entityName] || locItem.entityName;
              }
            } else {
              resolvedNames.push(p);
            }
          }
        }

        if (resolvedNames.length <= 2) {
          regionName = resolvedNames.join(', ');
        } else {
          regionName = `${resolvedNames[0]}, ${resolvedNames[1]} (+${resolvedNames.length - 2})`;
        }
      }
    }

    // Final fallback for country names if not yet set
    if (!countryNameEn && entityName) {
      countryNameEn = entityName;
    }
    if (!countryNameRu) {
      countryNameRu = ENTITY_RU[entityName] || countryNameEn || countryPrefix;
    }
    if (!countryNameEn) {
      countryNameEn = countryNameRu || countryPrefix;
    }

    return {
      flag,
      countryName: countryNameRu,
      countryNameEn,
      entityName: entityName || countryNameEn,
      regionName,
      location: locDesc
    };
  }
};
