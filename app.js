
const readings=[
{id:1,bar:"Harbor Sample Taproom",city:"San Pedro",temp:29,beer:"Modelo Especial",date:"2026-08-24",lat:33.7361,lng:-118.2922},
{id:2,bar:"South Bay Sample Tavern",city:"Torrance",temp:31,beer:"Coors Light",date:"2026-08-22",lat:33.8358,lng:-118.3406},
{id:3,bar:"Beach Sample Bar",city:"Redondo Beach",temp:33,beer:"Pacifico",date:"2026-08-20",lat:33.8492,lng:-118.3884},
{id:4,bar:"Peninsula Sample Pub",city:"Rancho Palos Verdes",temp:34,beer:"805",date:"2026-08-18",lat:33.7445,lng:-118.3870},
{id:5,bar:"Harbor Sample Grill",city:"Long Beach",temp:30,beer:"Bud Light",date:"2026-08-25",lat:33.7701,lng:-118.1937},
{id:6,bar:"Old Town Sample",city:"Lomita",temp:36,beer:"Michelob Ultra",date:"2026-08-16",lat:33.7922,lng:-118.3151}
];
let user=null,markers=[],userMarker=null;
const map=L.map("map").setView([33.80,-118.32],11);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
const els={sort:document.querySelector("#sort"),temp:document.querySelector("#temp"),city:document.querySelector("#city"),cards:document.querySelector("#cards"),status:document.querySelector("#status"),count:document.querySelector("#count"),locate:document.querySelector("#locate"),submit:document.querySelector("#submit"),dialog:document.querySelector("#dialog"),close:document.querySelector("#close"),form:document.querySelector("#form")};
[...new Set(readings.map(x=>x.city))].sort().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;els.city.appendChild(o)});
function miles(a,b){const R=3958.8,r=x=>x*Math.PI/180,dlat=r(b.lat-a.lat),dlng=r(b.lng-a.lng),q=Math.sin(dlat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dlng/2)**2;return 2*R*Math.asin(Math.sqrt(q))}
function cls(t){return t<=30?"elite":t<=35?"cold":"warm"}
function render(){
 markers.forEach(m=>map.removeLayer(m));markers=[];
 let list=readings.filter(r=>r.temp<=Number(els.temp.value)&&(els.city.value==="all"||r.city===els.city.value)).map(r=>({...r,distance:user?miles(user,r):null}));
 if(els.sort.value==="coldest")list.sort((a,b)=>a.temp-b.temp);
 if(els.sort.value==="recent")list.sort((a,b)=>new Date(b.date)-new Date(a.date));
 if(els.sort.value==="nearest"){if(user)list.sort((a,b)=>a.distance-b.distance);else els.status.textContent="Tap Use My Location to sort by distance."}
 els.cards.innerHTML="";
 list.forEach(r=>{
   const m=L.marker([r.lat,r.lng]).addTo(map).bindPopup(`<b>${r.bar}</b><br>${r.city}<br><b>${r.temp}°F</b> · ${r.beer}`);markers.push(m);
   const c=document.createElement("article");c.className="card";
   c.innerHTML=`<div class="cardtop"><div><h3>${r.bar}</h3><div class="meta">${r.city}, CA</div></div><div class="temperature ${cls(r.temp)}">${r.temp}°F</div></div><div class="details"><div class="row"><span>Beer</span><b>${r.beer}</b></div><div class="row"><span>Verified</span><b>${new Date(r.date+"T12:00:00").toLocaleDateString()}</b></div>${r.distance!==null?`<div class="row"><span>Distance</span><b>${r.distance.toFixed(1)} mi</b></div>`:""}</div><div class="small">Prototype sample data — replace with real SBSC readings.</div>`;
   c.addEventListener("click",()=>{map.setView([r.lat,r.lng],14);m.openPopup()});els.cards.appendChild(c)
 });
 els.count.textContent=`${list.length} result${list.length===1?"":"s"}`;
 if(els.sort.value!=="nearest"||user)els.status.textContent=user?"Using your location for distance calculations.":"Prototype sample readings.";
}
["change","input"].forEach(evt=>{els.sort.addEventListener(evt,render);els.temp.addEventListener(evt,render);els.city.addEventListener(evt,render)});
els.locate.addEventListener("click",()=>{
 if(!navigator.geolocation){els.status.textContent="Location is not supported.";return}
 els.locate.textContent="Locating…";
 navigator.geolocation.getCurrentPosition(p=>{
   user={lat:p.coords.latitude,lng:p.coords.longitude};
   if(userMarker)map.removeLayer(userMarker);
   userMarker=L.circleMarker([user.lat,user.lng],{radius:8,weight:3,fillOpacity:.7}).addTo(map).bindPopup("You are here");
   map.setView([user.lat,user.lng],12);els.locate.textContent="📍 Location On";els.sort.value="nearest";render()
 },()=>{els.locate.textContent="📍 Use My Location";els.status.textContent="Could not access location. Check browser permissions."},{enableHighAccuracy:true,timeout:8000});
});
els.submit.addEventListener("click",()=>els.dialog.showModal());
els.close.addEventListener("click",()=>els.dialog.close());
els.form.addEventListener("submit",e=>{e.preventDefault();alert("Prototype only. Next step is connecting this form to the SBSC database and approval queue.");els.form.reset();els.dialog.close()});
render();
