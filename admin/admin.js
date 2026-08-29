const SUPABASE_URL = "https://horiiomkrvjtmcaoinlj.supabase.co";
const SUPABASE_KEY = "sb_publishable_0beNsBeuCwfaVbk8jGDWZg_nNiicK0O";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const el = {
  loginPanel: document.getElementById("loginPanel"),
  queuePanel: document.getElementById("queuePanel"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  login: document.getElementById("login"),
  signOut: document.getElementById("signOut"),
  loginMessage: document.getElementById("loginMessage"),
  adminStatus: document.getElementById("adminStatus"),
  queue: document.getElementById("queue"),
  pendingCount: document.getElementById("pendingCount")
};

const geocodes = new Map();

function escapeHtml(value="") {
  return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}

function formatWhen(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Unknown time" : d.toLocaleString([], {month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
}

function message(text) {
  el.loginMessage.textContent = text || "";
}

async function checkAdmin() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    return showLoggedOut();
  }

  const { data, error } = await client.rpc("is_admin");

  if (error || data !== true) {
    await client.auth.signOut();
    showLoggedOut();
    message("This account is not authorized as an SBSC admin.");
    return;
  }

  el.loginPanel.hidden = true;
  el.queuePanel.hidden = false;
  el.signOut.hidden = false;
  el.adminStatus.textContent = `Signed in as ${session.user.email}`;

  await loadQueue();
}

function showLoggedOut() {
  el.loginPanel.hidden = false;
  el.queuePanel.hidden = true;
  el.signOut.hidden = true;
  el.adminStatus.textContent = "Sign in to review pending Coldies.";
}

async function login() {
  message("");

  el.login.disabled = true;
  el.login.textContent = "Signing in…";

  const { error } = await client.auth.signInWithPassword({
    email: el.email.value.trim(),
    password: el.password.value
  });

  el.login.disabled = false;
  el.login.textContent = "Sign in";

  if (error) {
    return message(error.message);
  }

  await checkAdmin();
}

async function signOut() {
  await client.auth.signOut();
  showLoggedOut();
}

async function signedPhoto(path) {
  if (!path) return null;

  const { data, error } = await client.storage
    .from("submission-photos")
    .createSignedUrl(path, 3600);

  if (error) return null;

  return data.signedUrl;
}

async function loadQueue() {
  el.queue.innerHTML = '<div class="empty">Loading pending submissions…</div>';

  const { data, error } = await client
    .from("submissions")
    .select("id,bar_name,address,city,state,beer_name,temperature_f,measured_at,photo_path,submitter_instagram,notes,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending:false });

  if (error) {
    el.queue.innerHTML = `<div class="empty">Could not load queue: ${escapeHtml(error.message)}</div>`;
    return;
  }

  const rows = data || [];

  el.pendingCount.textContent = rows.length;

  if (!rows.length) {
    el.queue.innerHTML = '<div class="empty">No pending Coldies. 🍺</div>';
    return;
  }

  const photoUrls = await Promise.all(
    rows.map(r => signedPhoto(r.photo_path))
  );

  el.queue.innerHTML = rows
    .map((r, i) => cardHtml(r, photoUrls[i]))
    .join("");

  rows.forEach(r => {
    document
      .getElementById(`locate-${r.id}`)
      .addEventListener("click", () => locateSubmission(r));

    document
      .getElementById(`approve-${r.id}`)
      .addEventListener("click", () => approveSubmission(r));

    document
      .getElementById(`reject-${r.id}`)
      .addEventListener("click", () => rejectSubmission(r));
  });
}

function cardHtml(r, photoUrl) {
  return `
    <article class="review-card" id="card-${r.id}">
      <div class="photo-wrap">
        ${
          photoUrl
            ? `<img src="${escapeHtml(photoUrl)}" alt="Submitted thermometer evidence" />`
            : '<div class="photo-placeholder">Thermometer photo unavailable</div>'
        }
      </div>

      <div class="review-body">
        <div class="review-top">
          <div>
            <h3>${escapeHtml(r.bar_name)}</h3>
            <div class="beer">${escapeHtml(r.beer_name)}</div>
          </div>

          <div class="temp">
            ${Math.round(Number(r.temperature_f))}°F
          </div>
        </div>

        <div class="meta">
          ${escapeHtml(r.address)} ·
          ${escapeHtml(r.city)},
          ${escapeHtml(r.state || "CA")}
        </div>

        <div class="meta">
          Measured ${escapeHtml(formatWhen(r.measured_at))}
        </div>

        ${
          r.submitter_instagram
            ? `<div class="meta">Submitted by ${escapeHtml(r.submitter_instagram)}</div>`
            : ""
        }

        ${
          r.notes
            ? `<div class="notes">${escapeHtml(r.notes)}</div>`
            : ""
        }

        <div class="location-row">
          <button class="secondary" id="locate-${r.id}">
            📍 Locate bar
          </button>

          <div class="location-status" id="location-${r.id}">
            Required before approving a new location.
          </div>
        </div>

        <div class="actions">
          <button class="danger" id="reject-${r.id}">
            Reject
          </button>

          <button class="approve" id="approve-${r.id}" disabled>
            Approve
          </button>
        </div>
      </div>
    </article>
  `;
}

async function locateSubmission(r) {
  const status = document.getElementById(`location-${r.id}`);
  const btn = document.getElementById(`locate-${r.id}`);
  const approve = document.getElementById(`approve-${r.id}`);

  btn.disabled = true;
  status.textContent = "Finding address…";

  const searches = [
    `${r.address}, ${r.city}, ${r.state || "CA"}, USA`,
    `${r.address}, ${r.city}, USA`,
    `${r.bar_name}, ${r.city}, ${r.state || "CA"}, USA`
  ];

  try {
    let result = null;

    for (const search of searches) {
      const params = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        countrycodes: "us",
        addressdetails: "1",
        q: search
      });

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`
      );

      if (!response.ok) continue;

      const found = await response.json();

      if (found && found.length) {
        result = found[0];
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1100));
    }

    if (!result) {
      throw new Error("Address not found");
    }

    const lat = Number(result.lat);
    const lng = Number(result.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("Invalid coordinates");
    }

    geocodes.set(r.id, { lat, lng });

    status.textContent =
      `Found: ${result.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}`;

    approve.disabled = false;
    btn.textContent = "↻ Recheck";

  } catch (err) {
    status.textContent =
      `Could not locate automatically: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function approveSubmission(r) {
  const coords = geocodes.get(r.id);

  if (!coords) return;

  const card = document.getElementById(`card-${r.id}`);
  card.classList.add("busy");

  const { error } = await client.rpc("approve_submission", {
    p_submission_id: r.id,
    p_latitude: coords.lat,
    p_longitude: coords.lng
  });

  if (error) {
    card.classList.remove("busy");
    alert(`Approval failed: ${error.message}`);
    return;
  }

  await loadQueue();
}

async function rejectSubmission(r) {
  if (
    !confirm(
      `Reject ${r.bar_name} — ${r.beer_name} at ${r.temperature_f}°F?`
    )
  ) {
    return;
  }

  const card = document.getElementById(`card-${r.id}`);
  card.classList.add("busy");

  const { error } = await client.rpc("reject_submission", {
    p_submission_id: r.id,
    p_review_notes: null
  });

  if (error) {
    card.classList.remove("busy");
    alert(`Reject failed: ${error.message}`);
    return;
  }

  await loadQueue();
}

el.login.addEventListener("click", login);

el.password.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    login();
  }
});

el.signOut.addEventListener("click", signOut);

checkAdmin();
