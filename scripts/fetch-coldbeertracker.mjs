import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'pro-beer-inspector.json');
const CACHE_FILE = path.join(DATA_DIR, 'pro-beer-inspector-geocode-cache.json');

const SOURCE_URL = process.env.PBI_SOURCE_URL || 'https://www.coldbeertracker.com/';
const SOURCE_NAME = process.env.PBI_SOURCE_NAME || 'Professional Beer Inspector';
const SOURCE_HANDLE = normalizeHandle(process.env.PBI_INSTAGRAM_HANDLE || '');
const SOURCE_INSTAGRAM_URL = normalizeUrl(process.env.PBI_INSTAGRAM_URL || '');
const USER_AGENT = 'SBSC Cold Beer Tracker importer bot/1.0 (+https://southbaycoldies.com)';

function normalizeHandle(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function normalizeUrl(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\//, '')}`;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTemp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0])) : null;
}

function titleCaseState(value = '') {
  const cleaned = cleanText(value).toUpperCase();
  return /^[A-Z]{2}$/.test(cleaned) ? cleaned : cleaned;
}

function looksLikeState(value = '') {
  return /^[A-Z]{2}$/.test(cleanText(value).toUpperCase());
}

function isLikelyBarName(value = '') {
  const text = cleanText(value);
  if (!text || text.length < 2) return false;
  if (/^find beer below/i.test(text)) return false;
  if (/^cold beer tracker$/i.test(text)) return false;
  if (/^search city/i.test(text)) return false;
  if (/^bar$/i.test(text)) return false;
  if (/^city$/i.test(text)) return false;
  if (/^state$/i.test(text)) return false;
  if (/^temp/i.test(text)) return false;
  if (/^temperature/i.test(text)) return false;
  if (/^share/i.test(text)) return false;
  if (/^details/i.test(text)) return false;
  return true;
}

function dedupeRecords(items) {
  const map = new Map();
  for (const item of items) {
    const key = `${item.bar}|${item.city}|${item.state}|${item.temp}`.toLowerCase();
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function normalizeRecord(raw, index = 0) {
  const bar = cleanText(raw.bar || raw.name || raw.venue || raw.location || raw.title);
  const city = cleanText(raw.city || raw.town || raw.locality);
  const state = titleCaseState(raw.state || raw.region || raw.province || 'CA');
  const temp = parseTemp(raw.temp ?? raw.temperature ?? raw.temperature_f ?? raw.value);
  if (!bar || !city || !looksLikeState(state) || temp == null) return null;

  return {
    id: `pbi-${slugify(`${bar}-${city}-${state}-${temp}`) || index}`,
    bar,
    address: cleanText(raw.address || ''),
    city,
    state,
    temp,
    beer: cleanText(raw.beer || raw.beer_name || 'Unknown Beer'),
    serveType: cleanText(raw.serveType || raw.serve_type || 'Draft'),
    notes: cleanText(raw.notes || 'Imported from coldbeertracker.com'),
    measuredAt: raw.measuredAt || raw.measured_at || new Date().toISOString(),
    source: 'pro-beer-inspector',
    sourceName: SOURCE_NAME,
    sourceHandle: SOURCE_HANDLE,
    sourceUrl: SOURCE_INSTAGRAM_URL,
    photoUrl: raw.photoUrl || raw.photo_url || ''
  };
}

function collectObjectCandidates(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const entry of value) collectObjectCandidates(entry, out);
    return out;
  }
  if (typeof value === 'object') {
    out.push(value);
    for (const entry of Object.values(value)) collectObjectCandidates(entry, out);
  }
  return out;
}

function parseRecordsFromJsonPayloads(payloads) {
  const records = [];
  for (const payload of payloads) {
    const candidates = collectObjectCandidates(payload);
    for (const candidate of candidates) {
      const normalized = normalizeRecord(candidate);
      if (normalized) records.push(normalized);
    }
  }
  return dedupeRecords(records);
}

async function parseVisibleRecordsFromDom(page) {
  const raw = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('div, article, section, li'));
    const seen = new Set();
    const rows = [];

    for (const el of nodes) {
      const text = (el.innerText || '').replace(/\u00a0/g, ' ').trim();
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 70) continue;

      const lines = text
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 10);

      if (lines.length < 4) continue;
      const firstTempIndex = lines.findIndex(line => /^-?\d+(?:\.\d+)?(?:\s*°?F)?$/.test(line));
      if (firstTempIndex < 3) continue;

      const bar = lines[0];
      const city = lines[1];
      const state = lines[2];
      const temp = lines[firstTempIndex];

      const key = `${bar}|${city}|${state}|${temp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ bar, city, state, temp });
    }

    return rows;
  });

  return raw.map((item, index) => normalizeRecord(item, index)).filter(Boolean);
}

async function collectRecordsWhileScrolling(page) {
  const collected = new Map();

  const add = records => {
    for (const record of records) {
      const key = `${record.bar}|${record.city}|${record.state}|${record.temp}`.toLowerCase();
      if (!collected.has(key)) collected.set(key, record);
    }
  };

  const collect = async () => add(await parseVisibleRecordsFromDom(page));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await collect();

  // First try the document itself.
  for (let i = 0; i < 120; i += 1) {
    const before = await page.evaluate(() => ({
      y: window.scrollY,
      h: document.documentElement.scrollHeight,
      vh: window.innerHeight
    }));
    await page.evaluate(() => window.scrollBy(0, Math.max(450, Math.floor(window.innerHeight * 0.70))));
    await page.waitForTimeout(250);
    await collect();
    const after = await page.evaluate(() => ({
      y: window.scrollY,
      h: document.documentElement.scrollHeight,
      vh: window.innerHeight
    }));
    if (after.y === before.y && after.h === before.h) break;
  }

  // Generated/mobile-first sites often put the list inside a nested scrolling
  // container. Find every vertically scrollable element and walk each one.
  const scrollers = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    return all.map((el, index) => {
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      const scrollable = el.scrollHeight > el.clientHeight + 20 &&
        ['auto', 'scroll', 'overlay'].includes(overflowY);
      if (!scrollable) return null;
      el.setAttribute('data-sbsc-scroller', String(index));
      return {
        id: String(index),
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight
      };
    }).filter(Boolean)
      .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))
      .slice(0, 12);
  });

  for (const scroller of scrollers) {
    await page.evaluate(id => {
      const el = document.querySelector(`[data-sbsc-scroller="${id}"]`);
      if (el) el.scrollTop = 0;
    }, scroller.id);
    await page.waitForTimeout(250);
    await collect();

    let unchanged = 0;
    let lastTop = -1;
    for (let i = 0; i < 180; i += 1) {
      const state = await page.evaluate(id => {
        const el = document.querySelector(`[data-sbsc-scroller="${id}"]`);
        if (!el) return null;
        const step = Math.max(300, Math.floor(el.clientHeight * 0.70));
        el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + step);
        return {
          top: el.scrollTop,
          height: el.scrollHeight,
          client: el.clientHeight
        };
      }, scroller.id);
      if (!state) break;
      await page.waitForTimeout(250);
      await collect();

      if (state.top === lastTop) unchanged += 1;
      else unchanged = 0;
      lastTop = state.top;
      if (unchanged >= 3 || state.top + state.client >= state.height - 5) {
        // Give lazy loaders a couple extra chances at the bottom.
        for (let j = 0; j < 3; j += 1) {
          await page.waitForTimeout(500);
          await collect();
        }
        break;
      }
    }
  }

  // Last-resort wheel scrolling catches custom/virtualized containers that do
  // not advertise overflow in computed CSS.
  const viewport = page.viewportSize() || { width: 1200, height: 800 };
  await page.mouse.move(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
  for (let i = 0; i < 120; i += 1) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(220);
    await collect();
  }

  return [...collected.values()];
}

async function geocodeRecord(record, cache) {
  const query = [record.bar, record.city, record.state].filter(Boolean).join(', ');
  const cacheKey = query.toLowerCase();
  if (cache[cacheKey]?.lat && cache[cacheKey]?.lng) {
    return { ...record, lat: cache[cacheKey].lat, lng: cache[cacheKey].lng };
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed for ${query}: HTTP ${response.status}`);
  }

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;
  if (!first?.lat || !first?.lon) {
    return null;
  }

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  cache[cacheKey] = {
    lat,
    lng,
    display_name: first.display_name || ''
  };

  await new Promise(resolve => setTimeout(resolve, 1100));
  return { ...record, lat, lng };
}

async function scrapeColdBeerTracker() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: USER_AGENT, viewport: { width: 1440, height: 1600 } });
  const jsonPayloads = [];

  page.on('response', async response => {
    try {
      const request = response.request();
      const type = request.resourceType();
      const contentType = response.headers()['content-type'] || '';
      if (type !== 'xhr' && type !== 'fetch') return;
      if (!contentType.includes('application/json')) return;
      const json = await response.json();
      jsonPayloads.push(json);
    } catch {
      // Ignore non-JSON and parse errors.
    }
  });

  await page.goto(SOURCE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);

  const domRecords = await collectRecordsWhileScrolling(page);
  await page.waitForTimeout(1000);
  const jsonRecords = parseRecordsFromJsonPayloads(jsonPayloads);

  // Merge both sources. Some generated sites expose only a subset of records
  // through JSON while rendering the rest into a virtualized list.
  const records = dedupeRecords([...jsonRecords, ...domRecords]);

  console.log(`Found ${jsonRecords.length} JSON records and ${domRecords.length} DOM records (${records.length} unique total).`);
  await browser.close();
  return records;
}

async function main() {
  const geocodeCache = await readJson(CACHE_FILE, {});
  const records = await scrapeColdBeerTracker();

  if (!records.length) {
    throw new Error('No records were parsed from coldbeertracker.com.');
  }

  const enriched = [];
  for (const record of records) {
    try {
      const geocoded = await geocodeRecord(record, geocodeCache);
      if (geocoded) enriched.push(geocoded);
    } catch (error) {
      console.warn(`Skipping geocode for ${record.bar}:`, error.message);
    }
  }

  const output = {
    updated_at: new Date().toISOString(),
    source: SOURCE_URL,
    scraped_count: records.length,
    count: enriched.length,
    unmapped_count: Math.max(0, records.length - enriched.length),
    readings: enriched.sort((a, b) => a.temp - b.temp || a.bar.localeCompare(b.bar))
  };

  await writeJson(OUTPUT_FILE, output);
  await writeJson(CACHE_FILE, geocodeCache);

  console.log(`Scraped ${records.length} total records; mapped ${enriched.length}; unmapped ${Math.max(0, records.length - enriched.length)}.`);
  console.log(`Wrote ${enriched.length} Professional Beer Inspector readings to ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
