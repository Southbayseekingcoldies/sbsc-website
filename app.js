
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
let selectedVenue = null;
let venueSearchTimer = null;

function roundTemp(value) {
  return Math.round(Number(value));
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
  }).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lng) && Number.isFinite(item.temp));

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
  const maxTemp = Number(els.temp.value);
  const city = els.city.value;

  let list = readings
    .filter(r => r.temp <= maxTemp)
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
      <div class="popup-judgment">${reading.status.label} · ${reading.status.message.toUpperCase()}</div>
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
      <div class="judgment ${reading.status.label === "PASS" ? "pass" : "fail"}">${reading.status.label} · ${reading.status.message.toUpperCase()}</div>
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

function venueMeta(venue) {
  const bits = [];
  if (Number.isFinite(venue.distance)) bits.push(`${venue.distance.toFixed(1)} mi`);
  if (venue.street) bits.push(venue.street);
  if (venue.city) bits.push(venue.city);
  return bits.join(" · ") || "Nearby";
}

function renderVenueResults(list) {
  els.venueResults.innerHTML = "";
  if (!list.length) {
    els.venueResults.innerHTML = '<div class="venue-empty">No nearby matches yet. Try typing the venue name.</div>';
    els.venueResults.classList.add("open");
    return;
  }

  list.slice(0, 12).forEach(venue => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "venue-option";
    button.setAttribute("role", "option");
    button.innerHTML = `<span class="venue-option-name">${escapeHtml(venue.name)}</span><span class="venue-option-meta">${escapeHtml(venueMeta(venue))}</span>`;
    button.addEventListener("click", () => chooseVenue(venue));
    els.venueResults.appendChild(button);
  });
  els.venueResults.classList.add("open");
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

async function chooseVenue(venue) {
  els.venueStatus.textContent = "Confirming venue address…";
  els.venueStatus.classList.remove("selected");

  const details = await reverseVenue(venue.lat, venue.lng, venue);
  selectedVenue = { ...venue, ...details };

  els.venueSearch.value = selectedVenue.name;
  els.barName.value = selectedVenue.name;
  els.barAddress.value = selectedVenue.address;
  els.barCity.value = selectedVenue.city || "South Bay";
  els.barState.value = selectedVenue.state || "CA";
  els.venueResults.classList.remove("open");
  els.venueStatus.textContent = "";
  els.venueStatus.classList.add("selected");
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

async function searchVenueByName(term) {
  const query = term.trim();
  if (query.length < 2) return;

  const localMatches = nearbyVenues.filter(v => v.name.toLowerCase().includes(query.toLowerCase()));
  if (localMatches.length) {
    renderVenueResults(localMatches);
    return;
  }

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      q: `${query}, California`,
      limit: "8",
      countrycodes: "us",
      addressdetails: "1",
      viewbox: "-118.55,34.05,-117.95,33.55"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    const results = data.map(row => {
      const a = row.address || {};
      const city = localityFromAddress(a);
      return {
        name: row.name || row.display_name.split(",")[0],
        lat: Number(row.lat),
        lng: Number(row.lon),
        street: [a.house_number, a.road].filter(Boolean).join(" "),
        city,
        state: stateAbbreviation(a.state || "CA"),
        distance: userPosition ? milesBetween(userPosition.lat, userPosition.lng, Number(row.lat), Number(row.lon)) : NaN
      };
    }).filter(v => v.name && Number.isFinite(v.lat) && Number.isFinite(v.lng));
    renderVenueResults(results);
  } catch (error) {
    els.venueStatus.textContent = "Could not search that name. Tap Nearby and try again.";
  }
}

async function startVenueLookup() {
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
      els.venueSearch.placeholder = "Tap a nearby spot or start typing";
      els.venueStatus.textContent = venues.length ? "Tap the right place below." : "No nearby places found. Start typing the venue name.";
      renderVenueResults(venues);
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
  els.venueSearch.value = "";
  els.venueSearch.placeholder = "Finding bars near you…";
  els.venueResults.innerHTML = "";
  els.venueResults.classList.remove("open");
  els.venueStatus.textContent = "Use your location, then tap the right bar or restaurant.";
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
  if (!Number.isFinite(venueLat) || !Number.isFinite(venueLng) ||
      venueLat < -90 || venueLat > 90 || venueLng < -180 || venueLng > 180) {
    showSubmitMessage("That venue is missing map coordinates. Please choose it again from the suggestions.");
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
  if (selectedVenue && els.venueSearch.value.trim() !== selectedVenue.name) {
    selectedVenue = null;
    els.barName.value = "";
    els.barAddress.value = "";
    els.barCity.value = "";
    els.venueStatus.classList.remove("selected");
    els.venueStatus.textContent = "Choose a venue from the suggestions.";
  }
  clearTimeout(venueSearchTimer);
  const term = els.venueSearch.value.trim();
  if (!term) {
    renderVenueResults(nearbyVenues);
    return;
  }
  const localMatches = nearbyVenues.filter(v => v.name.toLowerCase().includes(term.toLowerCase()));
  if (localMatches.length) renderVenueResults(localMatches);
  venueSearchTimer = setTimeout(() => searchVenueByName(term), 500);
});

els.venueSearch.addEventListener("focus", () => {
  if (nearbyVenues.length && !selectedVenue) renderVenueResults(nearbyVenues);
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

loadReadings();
