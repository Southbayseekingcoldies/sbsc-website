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
function toLocalInput(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function message(text) { el.loginMessage.textContent = text || ""; }

async function checkAdmin() {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return showLoggedOut();
  const { data, error } = await client.rpc("is_admin");
  if (error || data !== true) {
    await client.auth.signOut(); showLoggedOut(); message("This account is not authorized as an SBSC admin."); return;
  }
  el.loginPanel.hidden = true; el.queuePanel.hidden = false; el.signOut.hidden = false;
  el.adminStatus.textContent = `Signed in as ${session.user.email}`;
  await loadQueue();
}
function showLoggedOut() {
  el.loginPanel.hidden = false; el.queuePanel.hidden = true; el.signOut.hidden = true;
  el.adminStatus.textContent = "Sign in to review pending Coldies.";
}
async function login() {
  message(""); el.login.disabled = true; el.login.textContent = "Signing in…";
  const { error } = await client.auth.signInWithPassword({email:el.email.value.trim(),password:el.password.value});
  el.login.disabled = false; el.login.textContent = "Sign in";
  if (error) return message(error.message); await checkAdmin();
}
async function signOut() { await client.auth.signOut(); showLoggedOut(); }
async function signedPhoto(path) {
  if (!path) return null;
  const { data, error } = await client.storage.from("submission-photos").createSignedUrl(path,3600);
  return error ? null : data.signedUrl;
}

async function loadQueue() {
  el.queue.innerHTML = '<div class="empty">Loading pending submissions…</div>';
  const { data, error } = await client.from("submissions")
    .select("id,bar_name,address,city,state,latitude,longitude,beer_name,temperature_f,measured_at,photo_path,submitter_instagram,notes,status,created_at")
    .eq("status","pending").order("created_at",{ascending:false});
  if (error) { el.queue.innerHTML=`<div class="empty">Could not load queue: ${escapeHtml(error.message)}</div>`; return; }
  const rows=data||[]; el.pendingCount.textContent=rows.length;
  if (!rows.length) { el.queue.innerHTML='<div class="empty">No pending Coldies. 🍺</div>'; return; }
  const photoUrls=await Promise.all(rows.map(r=>signedPhoto(r.photo_path)));
  el.queue.innerHTML=rows.map((r,i)=>cardHtml(r,photoUrls[i])).join("");
  rows.forEach(r=>wireCard(r));
}

function hasStoredCoords(r) {
  const lat = Number(r.latitude);
  const lng = Number(r.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
         lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function cardHtml(r,photoUrl) {
  return `<article class="review-card" id="card-${r.id}">
    <div class="photo-wrap">${photoUrl?`<img src="${escapeHtml(photoUrl)}" alt="Submitted thermometer evidence" onclick="window.open(this.src,'_blank')" />`:'<div class="photo-placeholder">Thermometer photo unavailable</div>'}</div>
    <div class="review-body">
      <div class="review-summary"><div><div class="submitted-label">Submitted</div><strong>${escapeHtml(r.bar_name)}</strong><div class="meta">${escapeHtml(r.beer_name)} · ${escapeHtml(formatWhen(r.measured_at))}</div></div><div class="submitted-temp">${Math.round(Number(r.temperature_f))}°F</div></div>
      <div class="section-title">Review / correct before approval</div>
      <div class="edit-grid">
        <label class="wide">Bar / restaurant<input id="bar-${r.id}" value="${escapeHtml(r.bar_name)}" /></label>
        <label class="wide">Street address<input id="address-${r.id}" value="${escapeHtml(r.address)}" /></label>
        <label>City<input id="city-${r.id}" value="${escapeHtml(r.city)}" /></label>
        <label>State<input id="state-${r.id}" value="${escapeHtml(r.state||'CA')}" /></label>
        <label>Beer<input id="beer-${r.id}" value="${escapeHtml(r.beer_name)}" /></label>
        <label>Temperature °F<input id="temp-${r.id}" type="number" min="20" max="80" step="1" value="${Math.round(Number(r.temperature_f))}" /></label>
        <label class="wide">Measured at<input id="when-${r.id}" type="datetime-local" value="${escapeHtml(toLocalInput(r.measured_at))}" /></label>
        <label class="wide">Notes<textarea id="notes-${r.id}">${escapeHtml(r.notes||'')}</textarea></label>
      </div>
      ${r.submitter_instagram?`<div class="meta">Submitted by ${escapeHtml(r.submitter_instagram)}</div>`:""}
      <div class="meta" id="coordstatus-${r.id}" hidden></div>
      <div class="reject-box" id="rejectbox-${r.id}" hidden>
        <label>Reject reason<select id="reason-${r.id}"><option value="Unreadable thermometer">Unreadable thermometer</option><option value="No thermometer visible">No thermometer visible</option><option value="Submitted temperature does not match photo">Temperature doesn't match photo</option><option value="Duplicate submission">Duplicate submission</option><option value="Wrong location">Wrong location</option><option value="Other">Other</option></select></label>
        <label>Optional detail<textarea id="rejectnotes-${r.id}" placeholder="Add details if useful"></textarea></label>
      </div>
      <div class="actions"><button class="danger" id="reject-${r.id}">Reject</button><button class="approve" id="approve-${r.id}" ${hasStoredCoords(r)?"":"disabled"}>Approve</button></div>
    </div></article>`;
}

function wireCard(r) {
  document.getElementById(`approve-${r.id}`).addEventListener("click",()=>approveSubmission(r));
  document.getElementById(`reject-${r.id}`).addEventListener("click",()=>toggleOrReject(r));

  if (hasStoredCoords(r)) {
    geocodes.set(r.id,{lat:Number(r.latitude),lng:Number(r.longitude)});
  } else {
    // Legacy submission from before venue coordinates were stored:
    // resolve it automatically in the background instead of asking the admin
    // to perform a second location check.
    locateLegacySubmission(r);
  }
}

function edited(r) {
  return {
    bar_name:document.getElementById(`bar-${r.id}`).value.trim(), address:document.getElementById(`address-${r.id}`).value.trim(),
    city:document.getElementById(`city-${r.id}`).value.trim(), state:document.getElementById(`state-${r.id}`).value.trim()||"CA",
    beer_name:document.getElementById(`beer-${r.id}`).value.trim(), temperature_f:Number(document.getElementById(`temp-${r.id}`).value),
    measured_at:document.getElementById(`when-${r.id}`).value, notes:document.getElementById(`notes-${r.id}`).value.trim()||null
  };
}

async function locateLegacySubmission(r) {
  const e=edited(r);
  const searches=[
    `${e.address}, ${e.city}, ${e.state}, USA`,
    `${e.address}, ${e.city}, USA`,
    `${e.bar_name}, ${e.city}, ${e.state}, USA`
  ];

  try {
    let result=null;
    for (const search of searches) {
      const params=new URLSearchParams({format:"jsonv2",limit:"1",countrycodes:"us",addressdetails:"1",q:search});
      const response=await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`,{headers:{Accept:"application/json"}});
      if (response.ok) {
        const found=await response.json();
        if (found&&found.length){result=found[0];break;}
      }
      await new Promise(resolve=>setTimeout(resolve,1100));
    }

    if(!result) throw new Error("Address not found");

    const lat=Number(result.lat),lng=Number(result.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) throw new Error("Invalid coordinates");

    geocodes.set(r.id,{lat,lng});
    document.getElementById(`approve-${r.id}`).disabled=false;
  } catch(err) {
    const status=document.getElementById(`coordstatus-${r.id}`);
    status.hidden=false;
    status.textContent="Could not verify this older submission's venue automatically. Check the address and refresh.";
    status.style.color="#b42318";
    status.style.fontWeight="800";
  }
}

async function approveSubmission(r) {
  const coords=geocodes.get(r.id),e=edited(r); if(!coords)return;
  if(!e.bar_name||!e.address||!e.city||!e.beer_name||!e.measured_at||!Number.isInteger(e.temperature_f)||e.temperature_f<20||e.temperature_f>80){alert("Check the review fields. Bar, address, city, beer, date/time and a whole-number temperature from 20–80°F are required.");return;}
  if(!confirm(`Approve ${e.bar_name} — ${e.beer_name} at ${e.temperature_f}°F?`))return;
  const card=document.getElementById(`card-${r.id}`);card.classList.add("busy");
  const {error}=await client.rpc("approve_submission_v2",{p_submission_id:r.id,p_latitude:coords.lat,p_longitude:coords.lng,p_bar_name:e.bar_name,p_address:e.address,p_city:e.city,p_state:e.state,p_beer_name:e.beer_name,p_temperature_f:e.temperature_f,p_measured_at:new Date(e.measured_at).toISOString(),p_notes:e.notes});
  if(error){card.classList.remove("busy");alert(`Approval failed: ${error.message}`);return;} await loadQueue();
}
async function toggleOrReject(r) {
  const box=document.getElementById(`rejectbox-${r.id}`),btn=document.getElementById(`reject-${r.id}`);
  if(box.hidden){box.hidden=false;btn.textContent="Confirm Reject";return;}
  const reason=document.getElementById(`reason-${r.id}`).value,detail=document.getElementById(`rejectnotes-${r.id}`).value.trim(); const reviewNotes=detail?`${reason}: ${detail}`:reason;
  if(!confirm(`Reject this submission?\n\n${reviewNotes}`))return;
  const card=document.getElementById(`card-${r.id}`);card.classList.add("busy");
  const {error}=await client.rpc("reject_submission",{p_submission_id:r.id,p_review_notes:reviewNotes});
  if(error){card.classList.remove("busy");alert(`Reject failed: ${error.message}`);return;} await loadQueue();
}

el.login.addEventListener("click",login); el.password.addEventListener("keydown",e=>{if(e.key==="Enter")login();}); el.signOut.addEventListener("click",signOut); checkAdmin();
