
const SUPABASE_URL = "https://horiiomkrvjtmcaoinlj.supabase.co";
const SUPABASE_KEY = "sb_publishable_0beNsBeuCwfaVbk8jGDWZg_nNiicK0O";
const PASS_STANDARD = 35;
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const els = {
  sort: document.getElementById("sort"),
  temp: document.getElementById("temp"),
  city: document.getElementById("city"),
  cards: document.getElementById("cards"),
  status: document.getElementById("status"),
  count: document.getElementById("count"),
  avgTemp: document.getElementById("avgTemp"),
  passRate: document.getElementById("passRate"),
  coldestPour: document.getElementById("coldestPour"),
  worstOffender: document.getElementById("worstOffender"),
  locate: document.getElementById("locate"),
  submit: document.getElementById("submit"),
  dialog: document.getElementById("dialog"),
  close: document.getElementById("close"),
  form: document.getElementById("form"),
  submissionFields: document.getElementById("submissionFields"),
  submissionSuccess: document.getElementById("submissionSuccess"),
  doneSubmission: document.getElementById("doneSubmission"),
  submitReading: document.getElementById("submitReading"),
  submitMessage: document.getElementById("submitMessage"),
  venueSearch: document.getElementById("venueSearch"),
  venueField: document.querySelector(".venue-field"),
  venueResults: document.getElementById("venueResults"),
  venueStatus: document.getElementById("venueStatus"),
  refreshVenues: document.getElementById("refreshVenues"),
  instagramSuggestions: document.getElementById("instagramSuggestions"),
  barName: document.getElementById("barName"),
  barAddress: document.getElementById("barAddress"),
  barCity: document.getElementById("barCity"),
  barState: document.getElementById("barState"),
  beerName: document.getElementById("beerName"),
  temperatureF: document.getElementById("temperatureF"),
  measuredAt: document.getElementById("measuredAt"),
  photo: document.getElementById("photo"),
  instagram: document.getElementById("instagram"),
  notes: document.getElementById("notes"),
  websiteField: document.getElementById("websiteField")
};

const map = L.map("map", { zoomControl: true }).setView([33.79, -118.31], 11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let readings = [];
let filtered = [];
let markers = [];
let userPosition = null;
let userMarker = null;
let nearbyVenues = [];

// Small rescue directory for South Bay venues that are missing or poorly named
// in OpenStreetMap. Aliases make typo/partial matching work even when the map
// provider has no usable POI record for the business.
const CURATED_VENUES = [
  {
    name: "Trani's Dockside Station",
    aliases: ["tranis dockside", "trani dockside", "tranis dockside station", "dockside station"],
    street: "311 E 22nd St",
    city: "San Pedro",
    state: "CA"
  },
  {
    name: "J. Trani's Ristorante",
    aliases: ["j tranis", "j trani", "tranis ristorante", "trani ristorante", "tranis restaurant", "trani restaurant"],
    street: "584 W 9th St",
    city: "San Pedro",
    state: "CA"
  },
  {
    name: "The Majestic",
    aliases: ["tranis majestic", "trani majestic", "majestic trani", "majestic tranis"],
    street: "921 S Beacon St",
    city: "San Pedro",
    state: "CA"
  }
];
let selectedVenue = null;
let venueSearchTimer = null;
let venueSearchRequest = 0;

function roundTemp(value) {
  return Math.round(Number(value));
}

function isSouthBayCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 33.55 && lat <= 34.10 &&
    lng >= -118.75 && lng <= -117.90;
}

function formatTemp(value) {
  return `${roundTemp(value)}°F`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function getStatus(temp) {
  const t = roundTemp(temp);
  if (t <= 30) return { tier: "elite", label: "PASS", message: `${Math.abs(PASS_STANDARD - t)}° below standard` };
  if (t <= PASS_STANDARD) return { tier: "pass", label: "PASS", message: `${Math.abs(PASS_STANDARD - t)}° ${t === PASS_STANDARD ? "at standard" : "below standard"}` };
  return { tier: "fail", label: "FAIL", message: `${t - PASS_STANDARD}° over standard` };
}

function displayJudgment(status, surface = "card") {
  if (status.tier === "fail") {
    return `${status.label} · ${status.message.toUpperCase()}`;
  }

  // Successful pours get the SBSC hype treatment.
  return surface === "map"
    ? "CERTIFIED COLDIES ✅"
    : "CERTIFIED COLDIES ✅🌡️❄️";
}

function haversineMiles(a, b) {
  const toRad = x => x * Math.PI / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const q = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

function rebuildCityOptions() {
  const current = els.city.value;
  const cities = [...new Set(readings.map(r => r.city).filter(Boolean))].sort();
  els.city.innerHTML = '<option value="all">All South Bay</option>';
  cities.forEach(city => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    els.city.appendChild(opt);
  });
  if ([...els.city.options].some(opt => opt.value === current)) {
    els.city.value = current;
  }
}

function markerColor(status) {
  if (status.tier === "elite") return "#0a7cff";
  if (status.tier === "pass") return "#12b7c8";
  return "#ef4444";
}

function makeMarkerIcon(status) {
  return L.divIcon({
    className: "custom-div-icon",
    html: `<div style="background:${markerColor(status)};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.25)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10]
  });
}

async function loadReadings() {
  els.status.textContent = "Loading live SBSC readings…";
  const { data, error } = await supabaseClient
    .from("readings")
    .select(`
      id,
      beer_name,
      temperature_f,
      measured_at,
      notes,
      approved,
      bars!inner(
        id,
        name,
        address,
        city,
        state,
        latitude,
        longitude
      )
    `)
    .eq("approved", true)
    .order("measured_at", { ascending: false });

  if (error) {
    console.error(error);
    els.status.textContent = "Could not load readings from the SBSC database.";
    els.cards.innerHTML = '<div class="empty">Database connection error. Check Supabase table permissions or query shape.</div>';
    updateStats([]);
    els.count.textContent = "0 results";
    return;
  }

  readings = (data || []).map(row => {
    const bar = row.bars || {};
    return {
      id: row.id,
      bar: bar.name || "Unknown Bar",
      address: bar.address || "",
      city: bar.city || "",
      state: bar.state || "CA",
      lat: Number(bar.latitude),
      lng: Number(bar.longitude),
      beer: row.beer_name || "Unknown Beer",
      temp: roundTemp(row.temperature_f),
      measuredAt: row.measured_at,
      notes: row.notes || ""
    };
  }).filter(item => isSouthBayCoordinate(item.lat, item.lng) && Number.isFinite(item.temp));

  rebuildCityOptions();
  render();
}

function updateStats(sourceList) {
  if (!sourceList.length) {
    els.avgTemp.textContent = "--";
    els.passRate.textContent = "--";
    els.coldestPour.textContent = "--";
    els.worstOffender.textContent = "--";
    return;
  }

  const temps = sourceList.map(r => r.temp);
  const avg = Math.round(temps.reduce((sum, val) => sum + val, 0) / temps.length);
  const passes = sourceList.filter(r => r.temp <= PASS_STANDARD).length;
  const coldest = [...sourceList].sort((a, b) => a.temp - b.temp)[0];
  const warmest = [...sourceList].sort((a, b) => b.temp - a.temp)[0];

  els.avgTemp.textContent = formatTemp(avg);
  els.passRate.textContent = `${Math.round((passes / sourceList.length) * 100)}%`;
  els.coldestPour.textContent = `${formatTemp(coldest.temp)} · ${coldest.bar}`;
  els.worstOffender.textContent = `${formatTemp(warmest.temp)} · ${warmest.bar}`;
}

function currentList() {
  const resultType = els.temp.value;
  const city = els.city.value;

  let list = readings
    .filter(r => {
      if (resultType === "coldies") return r.temp <= PASS_STANDARD;
      if (resultType === "fails") return r.temp > PASS_STANDARD;
      return true;
    })
    .filter(r => city === "all" ? true : r.city === city)
    .map(r => ({
      ...r,
      distance: userPosition ? haversineMiles(userPosition, r) : null,
      status: getStatus(r.temp)
    }));

  switch (els.sort.value) {
    case "nearest":
      if (userPosition) list.sort((a, b) => a.distance - b.distance);
      break;
    case "recent":
      list.sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt));
      break;
    case "warmest":
      list.sort((a, b) => b.temp - a.temp);
      break;
    default:
      list.sort((a, b) => a.temp - b.temp);
  }

  return list;
}

function render() {
  filtered = currentList();
  updateStats(readings);

  markers.forEach(marker => map.removeLayer(marker));
  markers = [];

  els.cards.innerHTML = "";

  if (!readings.length) {
    els.status.textContent = "Database connected. No approved readings yet.";
    els.cards.innerHTML = '<div class="empty">Add your first approved reading in Supabase and it will appear here automatically.</div>';
    els.count.textContent = "0 results";
    return;
  }

  if (!filtered.length) {
    els.status.textContent = "No verified readings match the current filters.";
    els.cards.innerHTML = '<div class="empty">Try changing the city or temperature filter.</div>';
    els.count.textContent = "0 results";
    return;
  }

  if (els.sort.value === "nearest" && !userPosition) {
    els.status.textContent = "Tap Use My Location to sort by distance.";
  } else {
    els.status.textContent = `Showing ${filtered.length} verified reading${filtered.length === 1 ? "" : "s"}.`;
  }

  filtered.forEach(reading => {
    const popup = `
      <div class="popup-title">${reading.bar}</div>
      <div>${reading.city}, ${reading.state}</div>
      <div>${reading.beer}</div>
      <div class="popup-temp">${formatTemp(reading.temp)}</div>
      <div class="popup-judgment">${displayJudgment(reading.status, "map")}</div>
    `;
    const marker = L.marker([reading.lat, reading.lng], { icon: makeMarkerIcon(reading.status) }).addTo(map);
    marker.bindPopup(popup);
    markers.push(marker);

    const article = document.createElement("article");
    article.className = "card";
    article.innerHTML = `
      <div class="card-top">
        <div>
          <h3>${reading.bar}</h3>
          <div class="place-meta">${reading.city}, ${reading.state}</div>
          <div class="address-line">${reading.address}</div>
        </div>
        <div class="temp-chip ${reading.status.tier}">${formatTemp(reading.temp)}</div>
      </div>
      <div class="card-divider"></div>
      <div class="beer-line"><strong>Beer:</strong> ${reading.beer}</div>
      <div class="time-line"><strong>Measured:</strong> ${formatDate(reading.measuredAt)}</div>
      ${reading.distance != null ? `<div class="time-line"><strong>Distance:</strong> ${reading.distance.toFixed(1)} mi</div>` : ""}
      <div class="status-line"><strong>SBSC standard:</strong> 35°F or below</div>
      <div class="judgment ${reading.status.tier === "fail" ? "fail" : "pass"}">${displayJudgment(reading.status, "card")}</div>
      ${reading.notes ? `<div class="time-line"><strong>Notes:</strong> ${reading.notes}</div>` : ""}
    `;
    article.addEventListener("click", () => {
      map.setView([reading.lat, reading.lng], 14);
      marker.openPopup();
    });
    els.cards.appendChild(article);
  });

  els.count.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
}

function useLocation() {
  if (!navigator.geolocation) {
    els.status.textContent = "Location services are not supported in this browser.";
    return;
  }
  els.locate.textContent = "Locating…";
  navigator.geolocation.getCurrentPosition(position => {
    userPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([userPosition.lat, userPosition.lng], {
      radius: 8,
      color: "#083d9e",
      weight: 3,
      fillColor: "#ffffff",
      fillOpacity: 1
    }).addTo(map).bindPopup("You are here");
    map.setView([userPosition.lat, userPosition.lng], 12);
    els.locate.textContent = "Location On";
    els.sort.value = "nearest";
    render();
  }, () => {
    els.locate.textContent = "Use My Location";
    els.status.textContent = "Location access was denied.";
  });
}

function localDateTimeValue(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function stateAbbreviation(value) {
  if (!value) return "CA";
  const cleaned = String(value).trim();
  if (/^california$/i.test(cleaned)) return "CA";
  if (/^[A-Za-z]{2}$/.test(cleaned)) return cleaned.toUpperCase();
  return cleaned;
}

function localityFromAddress(address = {}) {
  if (address.city === "Los Angeles" && address.suburb) return address.suburb;
  return address.city || address.town || address.village || address.municipality || address.suburb || address.county || "";
}

function milesBetween(lat1, lng1, lat2, lng2) {
  return haversineMiles({ lat: Number(lat1), lng: Number(lng1) }, { lat: Number(lat2), lng: Number(lng2) });
}


function normalizeVenueText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalVenueToken(token) {
  const aliases = {
    pizzeria: "pizza",
    pizzaria: "pizza",
    pizzas: "pizza",
    grille: "grill",
    tavern: "tavern",
    taproom: "tap",
    taprooms: "tap",
    brewery: "brew",
    brewing: "brew",
    brewhouse: "brew"
  };
  return aliases[token] || token;
}

function venueTokens(value = "") {
  const stop = new Set(["the", "a", "an", "of", "at", "and", "bar", "restaurant"]);
  return normalizeVenueText(value)
    .split(" ")
    .map(canonicalVenueToken)
    .filter(token => token.length > 1 && !stop.has(token));
}

function levenshteinDistance(a, b) {
  const s = String(a);
  const t = String(b);
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);
  let current = new Array(t.length + 1);

  for (let i = 1; i <= s.length; i++) {
    current[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[t.length];
}

function stringSimilarity(a, b) {
  const aa = normalizeVenueText(a);
  const bb = normalizeVenueText(b);
  if (!aa && !bb) return 1;
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const longest = Math.max(aa.length, bb.length);
  return Math.max(0, 1 - (levenshteinDistance(aa, bb) / longest));
}

function venueNameScore(query, venueName) {
  const q = normalizeVenueText(query);
  const n = normalizeVenueText(venueName);
  if (!q || !n) return 0;

  if (q === n) return 100;
  if (n.startsWith(q) || q.startsWith(n)) return 96;
  if (n.includes(q) || q.includes(n)) return 92;

  const qTokens = venueTokens(q);
  const nTokens = venueTokens(n);
  if (!qTokens.length || !nTokens.length) {
    return Math.round(stringSimilarity(q, n) * 82);
  }

  const tokenScores = qTokens.map(qt => {
    let best = 0;
    nTokens.forEach(nt => {
      if (qt === nt) {
        best = 1;
      } else if (nt.startsWith(qt) || qt.startsWith(nt)) {
        best = Math.max(best, 0.94);
      } else {
        best = Math.max(best, stringSimilarity(qt, nt));
      }
    });
    return best;
  });

  const tokenAverage = tokenScores.reduce((sum, score) => sum + score, 0) / tokenScores.length;
  const whole = stringSimilarity(q, n);

  // Token similarity matters most for venue names because users often omit
  // words such as "The", "Station", "Pizzeria", etc.
  return Math.round(Math.max(tokenAverage * 90, whole * 84));
}

function curatedVenueMatches(query) {
  const q = normalizeVenueText(query);
  if (!q) return [];

  return CURATED_VENUES
    .map(venue => {
      const names = [venue.name, ...(venue.aliases || [])];
      const matchScore = Math.max(...names.map(name => venueNameScore(q, name)));
      return { ...venue, matchScore, curated: true };
    })
    .filter(venue => venue.matchScore >= 48)
    .sort((a, b) => b.matchScore - a.matchScore);
}

function knownSbscVenues() {
  const seen = new Set();
  return readings.map(r => {
    const key = `${normalizeVenueText(r.bar)}|${Number(r.lat).toFixed(5)}|${Number(r.lng).toFixed(5)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      name: r.bar,
      lat: Number(r.lat),
      lng: Number(r.lng),
      street: r.address || "",
      city: r.city || "",
      state: r.state || "CA",
      distance: userPosition ? milesBetween(userPosition.lat, userPosition.lng, r.lat, r.lng) : NaN,
      sbscKnown: true
    };
  }).filter(Boolean);
}

function venueCandidatePool() {
  const seen = new Set();
  const pool = [];

  [...nearbyVenues, ...knownSbscVenues(), ...CURATED_VENUES].forEach(venue => {
    if (!venue || !venue.name) return;
    const hasCoords = Number.isFinite(Number(venue.lat)) && Number.isFinite(Number(venue.lng));
    const coordKey = hasCoords ? `${Number(venue.lat).toFixed(4)}|${Number(venue.lng).toFixed(4)}` : `${venue.street || ""}|${venue.city || ""}`;
    const key = `${normalizeVenueText(venue.name)}|${coordKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    pool.push(venue);
  });

  return pool;
}

function fuzzyVenueMatches(query, limit = 8) {
  const q = normalizeVenueText(query);
  if (!q) return [];

  return venueCandidatePool()
    .map(venue => {
      const aliases = venue.aliases || [];
      const matchScore = Math.max(venueNameScore(q, venue.name), ...aliases.map(alias => venueNameScore(q, alias)));
      const hasCoords = Number.isFinite(Number(venue.lat)) && Number.isFinite(Number(venue.lng));
      const distance = Number.isFinite(venue.distance)
        ? venue.distance
        : (userPosition && hasCoords ? milesBetween(userPosition.lat, userPosition.lng, Number(venue.lat), Number(venue.lng)) : NaN);

      // Keep location as a tie-breaker, but name similarity is the main signal.
      const distanceBonus = Number.isFinite(distance)
        ? Math.max(0, 8 - Math.min(distance, 8))
        : 0;

      return { ...venue, distance, matchScore, rankScore: matchScore + distanceBonus };
    })
    .filter(venue => venue.matchScore >= 54)
    .sort((a, b) => b.rankScore - a.rankScore || (a.distance || 999) - (b.distance || 999))
    .slice(0, limit)
    .map((venue, index) => ({
      ...venue,
      matchHint: index === 0 && venue.matchScore < 100 ? "Best match" : ""
    }));
}

function uniqueSearchVariants(query) {
  const variants = [];
  const add = value => {
    const cleaned = String(value || "").trim();
    if (cleaned && !variants.some(v => normalizeVenueText(v) === normalizeVenueText(cleaned))) {
      variants.push(cleaned);
    }
  };

  add(query);

  // If our nearby data strongly suggests a correction, use that official name
  // for the external geocoder too.
  const bestLocal = fuzzyVenueMatches(query, 1)[0];
  if (bestLocal && bestLocal.matchScore >= 67) add(bestLocal.name);

  const tokens = venueTokens(query)
    .filter(token => token.length >= 4)
    .sort((a, b) => b.length - a.length);

  // A correctly spelled second word often rescues a misspelled first word:
  // "Trannis Dockside" -> also search "Dockside".
  if (tokens[0]) add(tokens[0]);
  if (tokens[1]) add(`${tokens[0]} ${tokens[1]}`);

  return variants.slice(0, 3);
}

function venueMeta(venue) {
  const bits = [];
  if (venue.matchHint) bits.push(`★ ${venue.matchHint}`);
  if (Number.isFinite(venue.distance)) bits.push(`${venue.distance.toFixed(1)} mi`);
  if (venue.street) bits.push(venue.street);
  if (venue.city) bits.push(venue.city);
  return bits.join(" · ") || "Nearby";
}

function closeVenueResults() {
  els.venueResults.innerHTML = "";
  els.venueResults.classList.remove("open");
  els.venueSearch.setAttribute("aria-expanded", "false");
}

function setVenueSelectionUI(isSelected) {
  if (els.venueField) els.venueField.classList.toggle("has-selection", isSelected);
}

function renderVenueResults(list) {
  if (selectedVenue) {
    closeVenueResults();
    return;
  }

  els.venueResults.innerHTML = "";
  if (!list.length) {
    els.venueResults.innerHTML = '<div class="venue-empty">No close match yet. Keep typing — we’ll keep looking.</div>';
    els.venueResults.classList.add("open");
    els.venueSearch.setAttribute("aria-expanded", "true");
    return;
  }

  list.slice(0, 10).forEach(venue => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "venue-option";
    button.setAttribute("role", "option");
    const meta = venue.useCurrentLocation
      ? "📍 Use this name at my current location"
      : venueMeta(venue);
    button.innerHTML = `<span class="venue-option-name">${escapeHtml(venue.name)}</span><span class="venue-option-meta">${escapeHtml(meta)}</span>`;
    button.addEventListener("click", () => chooseVenue(venue));
    els.venueResults.appendChild(button);
  });
  els.venueResults.classList.add("open");
  els.venueSearch.setAttribute("aria-expanded", "true");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

async function reverseVenue(lat, lng, fallback = {}) {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      zoom: "18",
      addressdetails: "1"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    if (!response.ok) throw new Error("Reverse geocoder unavailable");
    const data = await response.json();
    const address = data.address || {};
    const street = [address.house_number, address.road || address.pedestrian || address.footway].filter(Boolean).join(" ");
    return {
      address: street || fallback.street || data.display_name || fallback.address || "Location selected",
      city: localityFromAddress(address) || fallback.city || "",
      state: stateAbbreviation(address.state || fallback.state || "CA")
    };
  } catch (error) {
    return {
      address: fallback.street || fallback.address || "Location selected",
      city: fallback.city || "",
      state: stateAbbreviation(fallback.state || "CA")
    };
  }
}

async function geocodeVenueAddress(venue) {
  const parts = [venue.street, venue.city, venue.state || "CA", "USA"].filter(Boolean);
  if (!venue.street || !venue.city) return venue;

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: parts.join(", "),
      limit: "1",
      countrycodes: "us",
      addressdetails: "1"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!response.ok) throw new Error("Address lookup unavailable");
    const data = await response.json();
    const row = data && data[0];
    const lat = Number(row?.lat);
    const lng = Number(row?.lon);
    if (!isSouthBayCoordinate(lat, lng)) throw new Error("Address lookup returned invalid coordinates");
    return { ...venue, lat, lng };
  } catch (error) {
    return venue;
  }
}

async function chooseVenue(venue) {
  // Lock the choice immediately so a slower autocomplete request cannot reopen
  // stale suggestions after the user has already picked the right venue.
  venueSearchRequest += 1;
  clearTimeout(venueSearchTimer);

  let resolvedVenue = { ...venue };
  const hasCoords = Number.isFinite(Number(resolvedVenue.lat)) && Number.isFinite(Number(resolvedVenue.lng));
  if (!hasCoords && resolvedVenue.street && resolvedVenue.city) {
    resolvedVenue = await geocodeVenueAddress(resolvedVenue);
  }

  // If a curated venue still cannot be geocoded, use live GPS only when the
  // user is physically there; otherwise don't silently invent a map point.
  const resolvedHasCoords = Number.isFinite(Number(resolvedVenue.lat)) && Number.isFinite(Number(resolvedVenue.lng));
  if (!resolvedHasCoords) {
    if (userPosition && venue.useCurrentLocation) {
      resolvedVenue.lat = userPosition.lat;
      resolvedVenue.lng = userPosition.lng;
    } else {
      showSubmitMessage("I found the venue name, but couldn't lock its map point. Try Nearby or use your current location.");
      return;
    }
  }

  selectedVenue = { ...resolvedVenue };
  els.venueSearch.value = resolvedVenue.name;
  setVenueSelectionUI(true);
  closeVenueResults();
  els.venueSearch.blur();

  els.venueStatus.textContent = "Confirming venue address…";
  els.venueStatus.classList.remove("selected");

  const details = await reverseVenue(resolvedVenue.lat, resolvedVenue.lng, resolvedVenue);
  selectedVenue = { ...resolvedVenue, ...details };

  els.venueSearch.value = selectedVenue.name;
  els.barName.value = selectedVenue.name;
  els.barAddress.value = selectedVenue.address;
  els.barCity.value = selectedVenue.city || "South Bay";
  els.barState.value = selectedVenue.state || "CA";
  closeVenueResults();
  els.venueStatus.textContent = "";
  els.venueStatus.classList.add("selected");
  setVenueSelectionUI(true);
}

async function fetchNearbyVenues(lat, lng) {
  const query = `[out:json][timeout:18];(node["amenity"~"^(bar|pub|restaurant|biergarten|cafe|nightclub)$"](around:4000,${lat},${lng});way["amenity"~"^(bar|pub|restaurant|biergarten|cafe|nightclub)$"](around:4000,${lat},${lng});relation["amenity"~"^(bar|pub|restaurant|biergarten|cafe|nightclub)$"](around:4000,${lat},${lng}););out center 80;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Nearby venue search is temporarily unavailable.");
  const data = await response.json();

  const seen = new Set();
  nearbyVenues = (data.elements || []).map(item => {
    const tags = item.tags || {};
    const vlat = Number(item.lat ?? item.center?.lat);
    const vlng = Number(item.lon ?? item.center?.lon);
    const name = String(tags.name || "").trim();
    if (!name || !Number.isFinite(vlat) || !Number.isFinite(vlng)) return null;
    const key = `${name.toLowerCase()}|${vlat.toFixed(4)}|${vlng.toFixed(4)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    return {
      name,
      lat: vlat,
      lng: vlng,
      street,
      city: tags["addr:city"] || "",
      state: tags["addr:state"] || "CA",
      distance: milesBetween(lat, lng, vlat, vlng)
    };
  }).filter(Boolean).sort((a,b) => a.distance - b.distance);

  return nearbyVenues;
}

async function searchVenueByName(term, requestId) {
  const query = term.trim();
  if (query.length < 2 || requestId !== venueSearchRequest || selectedVenue) return;

  // First answer instantly from nearby OSM venues + venues SBSC already knows.
  // This is typo-tolerant: "trannis", "sardinee", "nikos pizza", etc.
  const localMatches = fuzzyVenueMatches(query, 8);
  const curatedMatches = curatedVenueMatches(query);
  const instantMatches = [];
  const instantSeen = new Set();
  [...curatedMatches, ...localMatches].forEach(v => {
    const key = `${normalizeVenueText(v.name)}|${v.street || ""}|${v.city || ""}`;
    if (instantSeen.has(key)) return;
    instantSeen.add(key);
    instantMatches.push(v);
  });
  instantMatches.slice(0, 8).forEach((venue, index) => {
    if (index === 0 && venue.matchScore < 100) venue.matchHint = "Best match";
  });
  if (instantMatches.length && requestId === venueSearchRequest && !selectedVenue) renderVenueResults(instantMatches.slice(0, 8));

  try {
    const variants = uniqueSearchVariants(query);
    const seen = new Set();
    const remoteResults = [];

    // Keep this deliberately small so we don't hammer the public geocoder.
    for (const variant of variants) {
      const searches = [
        `${variant}, San Pedro, California`,
        `${variant}, South Bay, Los Angeles County, California`
      ];

      for (const q of searches) {
        const params = new URLSearchParams({
          format: "jsonv2",
          q,
          limit: "8",
          countrycodes: "us",
          addressdetails: "1",
          viewbox: "-118.55,34.05,-117.95,33.55",
          bounded: "1"
        });

        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
        if (!response.ok) continue;
        const data = await response.json();
        if (requestId !== venueSearchRequest || selectedVenue) return;

        data.forEach(row => {
          const a = row.address || {};
          const lat = Number(row.lat);
          const lng = Number(row.lon);
          if (!isSouthBayCoordinate(lat, lng)) return;

          const name = row.name || row.display_name.split(",")[0];
          if (!name) return;

          const matchScore = venueNameScore(query, name);
          // External results can still be useful when only one token survived
          // the typo, but don't show unrelated map clutter.
          if (matchScore < 42 && !normalizeVenueText(name).includes(normalizeVenueText(variant))) return;

          const key = `${normalizeVenueText(name)}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
          if (seen.has(key)) return;
          seen.add(key);

          const distance = userPosition
            ? milesBetween(userPosition.lat, userPosition.lng, lat, lng)
            : NaN;

          remoteResults.push({
            name,
            lat,
            lng,
            street: [a.house_number, a.road].filter(Boolean).join(" "),
            city: localityFromAddress(a),
            state: stateAbbreviation(a.state || "CA"),
            distance,
            matchScore
          });
        });

        if (remoteResults.length >= 6) break;
      }
      if (remoteResults.length >= 6) break;
    }

    const combined = [];
    const combinedKeys = new Set();

    [...curatedMatches, ...localMatches, ...remoteResults].forEach(v => {
      const hasCoords = Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lng));
      const key = hasCoords
        ? `${normalizeVenueText(v.name)}|${Number(v.lat).toFixed(5)}|${Number(v.lng).toFixed(5)}`
        : `${normalizeVenueText(v.name)}|${v.street || ""}|${v.city || ""}`;
      if (combinedKeys.has(key)) return;
      combinedKeys.add(key);

      const matchScore = Number.isFinite(v.matchScore) ? v.matchScore : venueNameScore(query, v.name);
      const distance = Number.isFinite(v.distance)
        ? v.distance
        : (userPosition && hasCoords ? milesBetween(userPosition.lat, userPosition.lng, Number(v.lat), Number(v.lng)) : NaN);

      combined.push({
        ...v,
        matchScore,
        distance,
        rankScore: matchScore + (Number.isFinite(distance) ? Math.max(0, 8 - Math.min(distance, 8)) : 0)
      });
    });

    combined.sort((a, b) =>
      b.rankScore - a.rankScore ||
      (Number.isFinite(a.distance) ? a.distance : 9999) -
      (Number.isFinite(b.distance) ? b.distance : 9999)
    );

    combined.slice(0, 8).forEach((venue, index) => {
      if (index === 0 && venue.matchScore < 100) venue.matchHint = "Best match";
    });

    const results = combined.slice(0, 8);

    // Last resort: the submission form is intended to be used at the venue.
    // If map data cannot identify the business, let the user keep the typed
    // name but anchor it to their live GPS position.
    if (userPosition) {
      results.push({
        name: query,
        lat: userPosition.lat,
        lng: userPosition.lng,
        street: "",
        city: "",
        state: "CA",
        distance: 0,
        useCurrentLocation: true
      });
    }

    if (requestId !== venueSearchRequest || selectedVenue) return;
    renderVenueResults(results);
  } catch (error) {
    const fallback = [...localMatches];

    if (userPosition) {
      fallback.push({
        name: query,
        lat: userPosition.lat,
        lng: userPosition.lng,
        street: "",
        city: "",
        state: "CA",
        distance: 0,
        useCurrentLocation: true
      });
    }

    if (requestId !== venueSearchRequest || selectedVenue) return;
    renderVenueResults(fallback);
  }
}

async function startVenueLookup() {
  const lookupRequest = ++venueSearchRequest;
  if (!navigator.geolocation) {
    els.venueStatus.textContent = "Location is unavailable. Start typing the venue name.";
    els.venueSearch.placeholder = "Type a bar or restaurant";
    return;
  }

  els.refreshVenues.disabled = true;
  els.refreshVenues.textContent = "Locating…";
  els.venueStatus.textContent = "Finding bars and restaurants near you…";

  navigator.geolocation.getCurrentPosition(async position => {
    userPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
    try {
      const venues = await fetchNearbyVenues(userPosition.lat, userPosition.lng);
      els.venueSearch.placeholder = "Search nearby bars & restaurants";
      els.venueStatus.textContent = venues.length ? "Tap the right place below." : "No nearby places found. Start typing the venue name.";
      if (lookupRequest === venueSearchRequest && !selectedVenue && !els.venueSearch.value.trim()) {
        renderVenueResults(venues);
      }
    } catch (error) {
      els.venueStatus.textContent = "Nearby search had trouble loading. Start typing the venue name.";
      els.venueSearch.placeholder = "Type a bar or restaurant";
    } finally {
      els.refreshVenues.disabled = false;
      els.refreshVenues.textContent = "Nearby";
    }
  }, () => {
    els.venueStatus.textContent = "Location access was denied. Start typing the venue name.";
    els.venueSearch.placeholder = "Type a bar or restaurant";
    els.refreshVenues.disabled = false;
    els.refreshVenues.textContent = "Nearby";
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
}

function loadInstagramSuggestions() {
  let handles = [];
  try { handles = JSON.parse(localStorage.getItem("sbscInstagramHandles") || "[]"); } catch (_) {}
  els.instagramSuggestions.innerHTML = "";
  handles.slice(0, 12).forEach(handle => {
    const option = document.createElement("option");
    option.value = handle;
    els.instagramSuggestions.appendChild(option);
  });
}

function rememberInstagramHandle(handle) {
  if (!handle) return;
  let handles = [];
  try { handles = JSON.parse(localStorage.getItem("sbscInstagramHandles") || "[]"); } catch (_) {}
  handles = [handle, ...handles.filter(item => item.toLowerCase() !== handle.toLowerCase())].slice(0, 12);
  localStorage.setItem("sbscInstagramHandles", JSON.stringify(handles));
  loadInstagramSuggestions();
}

function resetSubmissionForm() {
  els.form.reset();
  selectedVenue = null;
  nearbyVenues = [];
  els.barState.value = "CA";
  els.measuredAt.value = localDateTimeValue();
  venueSearchRequest += 1;
  clearTimeout(venueSearchTimer);
  els.venueSearch.value = "";
  els.venueSearch.placeholder = "Search nearby bars & restaurants";
  closeVenueResults();
  setVenueSelectionUI(false);
  els.venueStatus.textContent = "";
  els.venueStatus.classList.remove("selected");
  loadInstagramSuggestions();
  els.submissionFields.hidden = false;
  els.submissionSuccess.hidden = true;
  els.submitMessage.className = "submit-message";
  els.submitMessage.textContent = "";
  els.submitReading.disabled = false;
  els.submitReading.textContent = "Submit for Verification";
}

function showSubmitMessage(message, type = "error") {
  els.submitMessage.textContent = message;
  els.submitMessage.className = `submit-message ${type}`;
}

function safeFileExtension(file) {
  const byType = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif"
  };
  if (byType[file.type]) return byType[file.type];
  const match = file.name.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : "jpg";
}

function makeSubmissionId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

async function submitColdie(event) {
  event.preventDefault();

  // Simple bot trap. Humans never see this field.
  if (els.websiteField.value) return;

  if (!els.form.reportValidity()) return;

  if (!selectedVenue || !els.barName.value.trim()) {
    showSubmitMessage("Choose the bar or restaurant from the venue suggestions first.");
    els.venueSearch.focus();
    return;
  }

  const venueLat = Number(selectedVenue.lat);
  const venueLng = Number(selectedVenue.lng);
  if (!isSouthBayCoordinate(venueLat, venueLng)) {
    showSubmitMessage("That venue is missing a valid South Bay map location. Please choose it again from the suggestions.");
    els.venueSearch.focus();
    return;
  }

  const photo = els.photo.files && els.photo.files[0];
  if (!photo) {
    showSubmitMessage("Please add a thermometer photo.");
    return;
  }
  if (!photo.type.startsWith("image/")) {
    showSubmitMessage("The evidence file must be an image.");
    return;
  }
  if (photo.size > 10 * 1024 * 1024) {
    showSubmitMessage("That photo is over 10 MB. Please choose a smaller image.");
    return;
  }

  const temp = Number(els.temperatureF.value);
  if (!Number.isInteger(temp) || temp < 20 || temp > 80) {
    showSubmitMessage("Enter the thermometer reading as a whole number from 20°F to 80°F.");
    return;
  }

  const measuredDate = new Date(els.measuredAt.value);
  if (Number.isNaN(measuredDate.getTime())) {
    showSubmitMessage("Please enter when the beer was measured.");
    return;
  }
  if (measuredDate.getTime() > Date.now() + 5 * 60 * 1000) {
    showSubmitMessage("The measurement time cannot be in the future.");
    return;
  }

  els.submitReading.disabled = true;
  els.submitReading.textContent = "Uploading…";
  showSubmitMessage("Uploading thermometer photo…", "info");

  const submissionId = makeSubmissionId();
  const ext = safeFileExtension(photo);
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const photoPath = `${now.getFullYear()}/${month}/${submissionId}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("submission-photos")
    .upload(photoPath, photo, {
      cacheControl: "3600",
      upsert: false,
      contentType: photo.type || undefined
    });

  if (uploadError) {
    console.error("Submission photo upload failed:", uploadError);
    els.submitReading.disabled = false;
    els.submitReading.textContent = "Submit for Verification";
    const detail = uploadError.message || uploadError.error || uploadError.statusCode || "Unknown Supabase Storage error";
    showSubmitMessage(`Upload failed: ${detail}`);
    return;
  }

  els.submitReading.textContent = "Submitting…";
  showSubmitMessage("Photo uploaded. Saving your reading…", "info");

  const instagram = els.instagram.value.trim().replace(/^@+/, "");
  const payload = {
    bar_name: els.barName.value.trim(),
    address: els.barAddress.value.trim(),
    city: els.barCity.value.trim(),
    state: "CA",
    latitude: venueLat,
    longitude: venueLng,
    beer_name: els.beerName.value.trim(),
    temperature_f: temp,
    measured_at: measuredDate.toISOString(),
    photo_path: photoPath,
    submitter_instagram: instagram ? `@${instagram}` : null,
    notes: els.notes.value.trim() || null,
    status: "pending"
  };

  const { error: insertError } = await supabaseClient
    .from("submissions")
    .insert(payload);

  if (insertError) {
    console.error("Submission insert failed:", insertError);
    els.submitReading.disabled = false;
    els.submitReading.textContent = "Submit for Verification";
    const detail = insertError.message || insertError.details || insertError.code || "Unknown database error";
    showSubmitMessage(`Photo uploaded, but submission failed: ${detail}`);
    return;
  }

  if (instagram) rememberInstagramHandle(`@${instagram}`);
  els.submissionFields.hidden = true;
  els.submissionSuccess.hidden = false;
}

els.sort.addEventListener("change", render);
els.temp.addEventListener("change", render);
els.city.addEventListener("change", render);
els.locate.addEventListener("click", useLocation);
els.venueSearch.addEventListener("input", () => {
  const term = els.venueSearch.value.trim();
  const requestId = ++venueSearchRequest;
  clearTimeout(venueSearchTimer);

  if (selectedVenue && term !== selectedVenue.name) {
    selectedVenue = null;
    els.barName.value = "";
    els.barAddress.value = "";
    els.barCity.value = "";
    els.barState.value = "CA";
    setVenueSelectionUI(false);
    els.venueStatus.classList.remove("selected");
    els.venueStatus.textContent = "";
  }

  if (!term) {
    setVenueSelectionUI(false);
    renderVenueResults(nearbyVenues);
    return;
  }

  const localMatches = fuzzyVenueMatches(term, 8);
  if (localMatches.length) renderVenueResults(localMatches);
  venueSearchTimer = setTimeout(() => searchVenueByName(term, requestId), 280);
});

els.venueSearch.addEventListener("focus", () => {
  if (nearbyVenues.length && !selectedVenue) {
    const term = els.venueSearch.value.trim();
    renderVenueResults(term ? fuzzyVenueMatches(term, 8) : nearbyVenues);
  }
});

els.venueSearch.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeVenueResults();
    els.venueSearch.blur();
  }
});

document.addEventListener("click", event => {
  if (els.venueField && !els.venueField.contains(event.target)) closeVenueResults();
});

els.refreshVenues.addEventListener("click", startVenueLookup);

els.submit.addEventListener("click", () => {
  resetSubmissionForm();
  els.dialog.showModal();
  startVenueLookup();
});
els.close.addEventListener("click", () => els.dialog.close());
els.doneSubmission.addEventListener("click", () => els.dialog.close());
els.form.addEventListener("submit", submitColdie);
els.dialog.addEventListener("click", event => {
  if (event.target === els.dialog) els.dialog.close();
});


let lastReadingsRefresh = 0;
async function refreshReadingsIfNeeded(force = false) {
  const now = Date.now();
  if (!force && now - lastReadingsRefresh < 3000) return;
  lastReadingsRefresh = now;
  await loadReadings();
}

window.addEventListener("focus", () => refreshReadingsIfNeeded());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshReadingsIfNeeded();
});

refreshReadingsIfNeeded(true);
