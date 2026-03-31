const https = require('https');

const AUTH = 'Basic YW5kcm9pZDpUYVI2MHBFdHRZ';
const NS = '{http://www.ebayclassifiedsgroup.com/schema/ad/v1}';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.kleinanzeigen.de',
      path: '/api' + path,
      headers: { 'Authorization': AUTH, 'User-Agent': 'okhttp/4.10.0', 'Accept': 'application/json' }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

function jaxbVal(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if ('value' in obj) return obj.value;
  return obj;
}

function parseAd(ad) {
  // Extract location
  const locObj = ad['locations']?.['location'];
  const locArr = Array.isArray(locObj) ? locObj : (locObj ? [locObj] : []);
  const firstLoc = locArr[0] || {};
  
  // Extract thumbnail
  const picsObj = ad['pictures']?.['picture'];
  const picsArr = Array.isArray(picsObj) ? picsObj : (picsObj ? [picsObj] : []);
  const picLinks = jaxbVal(picsArr[0]?.['link']);
  const picArr = Array.isArray(picLinks) ? picLinks : (picLinks ? [picLinks] : []);
  const thumb = picArr.find(l => l?.rel === 'thumbnail');
  
  // Extract URL (public website link)
  const links = ad['link'];
  const linkArr = Array.isArray(links) ? links : (links ? [links] : []);
  const urlObj = linkArr.find(l => l?.rel === 'self-public-website');
  
  return {
    title: jaxbVal(ad['title']),
    price: jaxbVal(ad['price']?.['amount']),
    priceType: jaxbVal(ad['price']?.['price-type']),
    location: jaxbVal(firstLoc['localized-name']),
    distance: jaxbVal(firstLoc['radius']),
    url: urlObj?.href || null,
    thumb: thumb?.href || null,
    id: jaxbVal(ad['id'])
  };
}

async function search(query, locationId = 1921, maxPrice = null, maxDistance = null) {
  const path = `/ads.json?q=${encodeURIComponent(query)}&locationId=${locationId}&size=50`;
  const parsed = await apiGet(path);
  
  const adsData = parsed[NS + 'ads']?.value;
  if (!adsData) throw new Error('No ads data');
  
  let adArray = adsData['ad'];
  if (!Array.isArray(adArray)) adArray = adArray ? [adArray] : [];
  
  let results = adArray.map(parseAd);
  
  if (maxPrice !== null) {
    results = results.filter(a => a.price !== null && a.price <= maxPrice && a.priceType === 'SPECIFIED_AMOUNT');
  }
  
  if (maxDistance !== null) {
    results = results.filter(a => a.distance !== null && a.distance <= maxDistance);
  }
  
  return results;
}

async function main() {
  console.log('=== Kleinanzeigen Scraper ===\n');
  console.log('Search: fahrrad in Aachen (< 100€, <= 10km)\n');
  
  const results = await search('fahrrad', 1921, 100, 10);
  
  console.log(`Found ${results.length} listings:\n`);
  results.forEach((r, i) => {
    console.log(`${i+1}. ${r.title}`);
    console.log(`   💰 ${r.price}€ | 📍 ${r.location} (${r.distance}km)`);
    console.log(`   🔗 ${r.url}\n`);
  });
}

main().catch(console.error);
