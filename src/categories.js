/**
 * Category configurations for deal-finder.js.
 *
 * Organized into:
 *   - CORE_CATEGORIES: two groups (even/odd days) for alternating daily runs
 *   - BONUS_CATEGORIES: rotating 3-day bonus cycle
 *   - ALWAYS_BONUS: always-searched categories with minimum score thresholds
 */

const ALWAYS_BONUS = [
  // VR headsets — only post scores ≥7
  {
    query: 'vr headset',
    label: '🥽 VR Headsets',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'sonderangebot', 'aktion', 'angebot', 'test', 'brille'],
  },
  {
    query: 'oculus quest',
    label: '🥽 Oculus/Meta Quest',
    maxPrice: 250,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'sonderangebot', 'aktion', 'test', 'brille'],
  },
  {
    query: 'valve index',
    label: '🕹️ Valve Index',
    maxPrice: 500,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'brille', ' einzeln', 'nur zubehör'],
  },
  {
    query: 'bigscreen beyond',
    label: '🖥️ Bigscreen Beyond',
    maxPrice: 500,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test'],
  },
  {
    query: 'psvr',
    label: '🎮 PSVR',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test'],
  },
  // Sim racing wheels — only post scores ≥7
  {
    query: 'sim racing lenkrad',
    label: '🏎️ Sim Racing Wheels',
    maxPrice: 300,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'cockpit', 'sitz', 'halterung', 'prüfstand', 'rollentrainer', 'rahmen', 'montage'],
  },
  {
    query: 'logitech g29',
    label: '🏎️ Logitech G29/G923',
    maxPrice: 250,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'cockpit', 'sitz', 'halterung'],
  },
  // 10GbE network cards — only excellent deals
  {
    query: '10gbe network card',
    label: '🔌 10GbE Netzwerkkarte',
    maxPrice: 150,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'sfp+ modul', 'sfp+ cable'],
  },
  {
    query: '10 gigabit pcie',
    label: '🔌 10GbE Netzwerkkarte',
    maxPrice: 150,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'sfp+ modul', 'sfp+ cable'],
  },
  {
    query: 'sfp+ netzwerkkarte',
    label: '🔌 SFP+ Netzwerkkarte',
    maxPrice: 150,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'nur karte', 'ohne transceiver'],
  },
  // Server cases — only excellent deals
  {
    query: 'server gehäuse 19 zoll',
    label: '🗄️ Server Gehäuse',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'leer', 'ohne hardware', 'netzteil'],
  },
  {
    query: 'rackmount gehäuse',
    label: '🗄️ Server Gehäuse',
    maxPrice: 200,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'leer', 'ohne hardware'],
  },
  // Fahrradanhänger (one-wheel trailers) — only excellent deals
  {
    query: 'fahrradanhänger',
    label: '🚲 Fahrradanhänger',
    maxPrice: 120,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'kinder', '2-rädrig', '2 rädrig', 'zweirädrig'],
  },
  {
    query: 'fahrrad anhänger cargo',
    label: '🚲 Fahrradanhänger',
    maxPrice: 120,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'kinder', '2-rädrig', '2 rädrig', 'zweirädrig'],
  },
];

const CORE_GROUPS = [
  // Group 0 (even days: 2,4,6,...30) — study/desk
  [
    {
      query: 'laptop',
      label: '💻 Laptops',
      maxPrice: 70,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'gesperrt', 'suche', 'nur ', 'nur-', 'defect', 'damage', 'funktioniert nicht', 'startet nicht', 'bootet nicht', 'fehler', 'fehlerhaft', 'Reparatur', 'restwert', 'für teile', 'für ersatzteile', 'als ersatz', 'Displayfehler', 'Tastatur defekt', 'display kaputt', 'akku defekt', 'ladebuchse', 'ohne RAM', 'ohne ram', 'ohne Ram'],
    },
    // Bürostuhl, Taschenrechner, Bücher removed per dork (2026-04-04)
    {
      query: 'werkzeug',
      label: '🔧 Werkzeug',
      maxPrice: 80,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'feinmechaniker', 'brille', 'handy', 'uhr', 'bike', 'fahrrad', 'playmobil', 'theo klein'],
    },
    {
      query: 'hantel',
      label: '🏋️ Hanteln (1-10kg)',
      maxPrice: 30,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'ergometer', 'fahrrad', 'laufband'],
    },
  ],
  // Group 1 (odd days: 1,3,5,...31) — tech/gear
  [
    {
      query: 'monitor',
      label: '🖥️ Monitore',
      maxPrice: 150,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'burnin', 'einbrennen', 'fleck', 'flecken', 'totale defekt', 'netbook', 'Displayfehler', 'burn in', 'burn-in', 'brennt ein', 'eingebrannt'],
    },
    {
      query: 'tastatur maus',
      label: '⌨️🖱️ Tastaturen+Mäuse',
      maxPrice: 80,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'rauch', 'geraucht', 'tier', 'ps/2 adapter', 'ps/2 konverter', 'adapter', 'konverter'],
    },
    {
      query: 'pc komponenten',
      label: '🔧 PC-Komponenten',
      maxPrice: 150,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'defekt', 'fehlerhaft', 'restwert', 'für teile', 'für ersatzteile'],
    },
    {
      query: 'tablet ipad',
      label: '📱 Tablets+iPads',
      maxPrice: 200,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'tasche', 'hülle', 'case', 'cover', 'folie', 'ständer', 'halterung', 'pencil', 'pen', 'stift', 'keyboard cover', 'schutzhülle'],
    },
    {
      query: 'headset',
      label: '🎧 Headsets',
      maxPrice: 80,
      excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'motorrad', 'moped', 'fahrrad', 'bike', 'velo', 'helm', 'intercom', 'sprachanlage', 'vimoto', 'fahrradcomputer', 'cycle', 'wired only', 'nur kabel', 'ps4', 'xbox', 'kind', 'kinder', ' gaming ', 'gamingkopfhörer'],
    },
  ],
];

const BONUS_CATEGORIES = [
  // Day % 4 == 0: Speakers / Subwoofers
  {
    query: 'lautsprecher subwoofer',
    label: '🔊 Lautsprecher+Subwoofer',
    maxPrice: 250,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'kabel', 'nur', 'led', 'party', 'mini', 'billig', 'computer', 'pc-lautsprecher', 'laptop', 'theo klein'],
  },
  // Day % 4 == 1: Bikes — max €80, AI checks description+picture before posting
  {
    query: 'fahrrad mountainbike rennrad',
    label: '🚲 Fahrräder',
    maxPrice: 80,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'kinder', '10 zoll', '12 zoll', '14 zoll', '16 zoll', '18 zoll', '20 zoll', '24 zoll', 'damenn', 'damenrad', 'herrenrad einfache', 'cityrad'],
  },
  // Day % 4 == 2: DDR4 RAM
  {
    query: 'ddr4 ram',
    label: '🧠 DDR4 RAM',
    maxPrice: 80,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'ddr3', 'ddr5', 'sodimm', 'laptop ram', 'server', 'ecc'],
  },
  // Day % 4 == 3: Sony Xperia phones — only great deals
  {
    query: 'sony xperia',
    label: '📱 Sony Xperia',
    maxPrice: 300,
    excludeKeywords: ['defekt', 'kaputt', 'broken', 'suche', 'test', 'gesperrt', 'lock', 'cracked', 'display kaputt', 'touch defekt', 'akku defekt'],
  },
];

/** Get the categories for today (based on day of month). */
function getCategories() {
  // Test mode: only first category for heartbeat verification
  if (process.env.TEST === '1') {
    const day = new Date().getDate();
    const core = CORE_GROUPS[day % 2];
    return [core[0]];
  }
  const day = new Date().getDate();
  const core = CORE_GROUPS[day % 2];
  const bonus = BONUS_CATEGORIES[day % 4];
  // Quick mode for heartbeat checks (skip ALWAYS_BONUS to speed up)
  if (process.env.QUICK === '1') {
    return [...core, bonus];
  }
  return [...core, bonus, ...ALWAYS_BONUS];
}

module.exports = { CORE_GROUPS, BONUS_CATEGORIES, ALWAYS_BONUS, getCategories };
