
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
  form: document.getElementById("form")
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

els.sort.addEventListener("change", render);
els.temp.addEventListener("change", render);
els.city.addEventListener("change", render);
els.locate.addEventListener("click", useLocation);
els.submit.addEventListener("click", () => els.dialog.showModal());
els.close.addEventListener("click", () => els.dialog.close());
els.form.addEventListener("submit", event => {
  event.preventDefault();
  alert("Public submission is the next build step. For now, keep adding verified readings in Supabase.");
});

loadReadings();
