
const SUPABASE_URL="https://horiiomkrvjtmcaoinlj.supabase.co";
const SUPABASE_KEY="sb_publishable_0beNsBeuCwfaVbk8jGDWZg_nNiicK0O";
const db=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let readings=[],user=null,markers=[],userMarker=null;
const map=L.map("map").setView([33.80,-118.32],11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
const e={sort:document.querySelector("#sort"),temp:document.querySelector("#temp"),city:document.querySelector("#city"),cards:document.querySelector("#cards"),status:document.querySelector("#status"),count:document.querySelector("#count"),locate:document.querySelector("#locate"),submit:document.querySelector("#submit"),dialog:document.querySelector("#dialog"),close:document.querySelector("#close"),form:document.querySelector("#form")};
function miles(a,b){const R=3958.8,r=x=>x*Math.PI/180,dlat=r(b.lat-a.lat),dlng=r(b.lng-a.lng),q=Math.sin(dlat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dlng/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function cls(t){return t<=30?"elite":t<=35?"cold":"warm"}
function date(v){const d=new Date(v);return Number.isNaN(d.getTime())?"Unknown":d.toLocaleDateString()}
function rebuildCities(){const current=e.city.value;e.city.innerHTML='<option value="all">All South Bay</option>';[...new Set(readings.map(x=>x.city).filter(Boolean))].sort().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;e.city.appendChild(o)});if([...e.city.options].some(o=>o.value===current))e.city.value=current}
async function load(){
 const {data,error}=await db.from("readings").select("id,beer_name,temperature_f,photo_url,measured_at,notes,bars(id,name,address,city,state,latitude,longitude)").eq("approved",true).order("measured_at",{ascending:false});
 if(error){console.error(error);e.status.textContent="Could not load readings from the SBSC database.";e.cards.innerHTML='<div class="empty">Database connection error.</div>';return}
 readings=(data||[]).filter(r=>r.bars).map(r=>({id:r.id,bar:r.bars.name,address:r.bars.address||"",city:r.bars.city,state:r.bars.state||"CA",temp:Number(r.temperature_f),beer:r.beer_name,date:r.measured_at,notes:r.notes||"",lat:Number(r.bars.latitude),lng:Number(r.bars.longitude)})).filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lng)&&Number.isFinite(r.temp));
 rebuildCities();render();if(!readings.length)e.status.textContent="Database connected. No approved readings yet.";
}
function render(){
 markers.forEach(m=>map.removeLayer(m));markers=[];
 let list=readings.filter(r=>r.temp<=Number(e.temp.value)&&(e.city.value==="all"||r.city===e.city.value)).map(r=>({...r,distance:user?miles(user,r):null}));
 if(e.sort.value==="coldest")list.sort((a,b)=>a.temp-b.temp);
 if(e.sort.value==="recent")list.sort((a,b)=>new Date(b.date)-new Date(a.date));
 if(e.sort.value==="nearest"){if(user)list.sort((a,b)=>a.distance-b.distance);else e.status.textContent="Tap Use My Location to sort by distance."}
 e.cards.innerHTML="";
 if(!list.length)e.cards.innerHTML=readings.length?'<div class="empty">No verified readings match these filters.</div>':'<div class="empty">SBSC is connected to the live database. Add your first approved reading in Supabase and it will appear here automatically.</div>';
 list.forEach(r=>{
  const m=L.marker([r.lat,r.lng]).addTo(map).bindPopup(`<b>${r.bar}</b><br>${r.city}, ${r.state}<br><b>${r.temp.toFixed(1)}°F</b> · ${r.beer}`);markers.push(m);
  const c=document.createElement("article");c.className="card";c.innerHTML=`<div class="cardtop"><div><h3>${r.bar}</h3><div class="meta">${r.city}, ${r.state}</div></div><div class="temperature ${cls(r.temp)}">${r.temp.toFixed(1)}°F</div></div><div class="details"><div class="row"><span>Beer</span><b>${r.beer}</b></div><div class="row"><span>Verified</span><b>${date(r.date)}</b></div>${r.distance!==null?`<div class="row"><span>Distance</span><b>${r.distance.toFixed(1)} mi</b></div>`:""}</div>${r.notes?`<div class="small">${r.notes}</div>`:""}`;
  c.addEventListener("click",()=>{map.setView([r.lat,r.lng],14);m.openPopup()});e.cards.appendChild(c);
 });
 e.count.textContent=`${list.length} result${list.length===1?"":"s"}`;
 if(list.length&&(e.sort.value!=="nearest"||user))e.status.textContent=user?"Live SBSC readings · using your location for distance.":"Live approved SBSC readings.";
}
e.sort.addEventListener("change",render);e.temp.addEventListener("change",render);e.city.addEventListener("change",render);
e.locate.addEventListener("click",()=>{if(!navigator.geolocation){e.status.textContent="Location is not supported.";return}e.locate.textContent="Locating…";navigator.geolocation.getCurrentPosition(p=>{user={lat:p.coords.latitude,lng:p.coords.longitude};if(userMarker)map.removeLayer(userMarker);userMarker=L.circleMarker([user.lat,user.lng],{radius:8,weight:3,fillOpacity:.7}).addTo(map).bindPopup("You are here");map.setView([user.lat,user.lng],12);e.locate.textContent="📍 Location On";e.sort.value="nearest";render()},()=>{e.locate.textContent="📍 Use My Location";e.status.textContent="Could not access location. Check browser permissions."},{enableHighAccuracy:true,timeout:8000})});
e.submit.addEventListener("click",()=>e.dialog.showModal());e.close.addEventListener("click",()=>e.dialog.close());e.form.addEventListener("submit",x=>{x.preventDefault();alert("The live submission queue is the next feature.")});
load();
