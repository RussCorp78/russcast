(() => {
"use strict";
const $ = id => document.getElementById(id);
const STORAGE_KEY = "russcast.v1";
const state = { shows: [], positions: {}, selectedShow: null, currentEpisode: null, mode: "balanced", proxy: "", audioContext: null, source: null, compressor: null, gain: null, sleepTimer: null };
const audio = $("audio");

function loadState(){
  try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); state.shows = Array.isArray(saved.shows) ? saved.shows : []; state.positions = saved.positions || {}; state.proxy = saved.proxy || ""; state.mode = saved.mode || "balanced"; }
  catch(e){ console.warn("Could not read saved player data",e); }
  $("feedProxy").value = state.proxy;
  setMode(state.mode,false);
  renderLibrary();
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify({shows:state.shows,positions:state.positions,proxy:state.proxy,mode:state.mode})); }
function esc(value){ return String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmt(seconds){ if(!Number.isFinite(seconds)||seconds<0)return "0:00"; const s=Math.floor(seconds); return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; }
function setStatus(id,msg){ $(id).textContent=msg; }
function proxyUrl(url){ return state.proxy ? state.proxy + encodeURIComponent(url) : url; }

async function searchShows(term){
  setStatus("searchStatus","Searching Apple Podcasts…"); $("searchResults").innerHTML="";
  try{
    const endpoint=`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=podcast&limit=20&country=gb`;
    const response=await fetch(endpoint); if(!response.ok) throw new Error("Catalogue request failed");
    const data=await response.json();
    if(!data.results?.length){setStatus("searchStatus","No podcasts found. Try another search.");return;}
    setStatus("searchStatus",`${data.resultCount} results. Select Add to save a show.`);
    $("searchResults").innerHTML=data.results.map(showCardHTML).join("");
    $("searchResults").querySelectorAll("[data-add]").forEach(btn=>btn.addEventListener("click",()=>addShow(data.results.find(x=>String(x.collectionId)===btn.dataset.add))));
  }catch(e){setStatus("searchStatus","Couldn't search the catalogue. Check your connection and try again.");console.error(e);}
}
function showCardHTML(s){
  const id=s.collectionId ?? s.id;
  const image=s.artworkUrl600 || s.artworkUrl100 || "icon.svg";
  const title=s.collectionName || s.trackName || "Untitled podcast";
  const author=s.artistName || "Podcast";
  return `<article class="show-card"><img src="${esc(image)}" alt=""><div class="show-info"><strong>${esc(title)}</strong><small>${esc(author)}</small><div class="card-actions"><button class="small-button" data-add="${esc(id)}">＋ Add</button></div></div></article>`;
}
function addShow(s){
  if(!s)return;
  const id=String(s.collectionId);
  if(state.shows.some(x=>String(x.collectionId)===id)){setStatus("searchStatus","That podcast is already in your library.");return;}
  state.shows.unshift({collectionId:s.collectionId,title:s.collectionName,artist:s.artistName,artwork:s.artworkUrl600||s.artworkUrl100||"icon.svg",feedUrl:s.feedUrl||"",addedAt:Date.now()});
  saveState();renderLibrary();setStatus("searchStatus",`Added “${s.collectionName}”.`);
}
function renderLibrary(){
  $("libraryCount").textContent=`${state.shows.length} ${state.shows.length===1?"show":"shows"}`;
  if(!state.shows.length){$("library").className="show-grid empty-state";$("library").textContent="Search for a podcast above to get started.";return;}
  $("library").className="show-grid";
  $("library").innerHTML=state.shows.map(s=>`<article class="show-card"><img src="${esc(s.artwork)}" alt=""><div class="show-info"><strong>${esc(s.title)}</strong><small>${esc(s.artist||"")}</small><div class="card-actions"><button class="small-button" data-open="${esc(s.collectionId)}">Episodes</button><button class="small-button" data-remove="${esc(s.collectionId)}" aria-label="Remove ${esc(s.title)}">Remove</button></div></div></article>`).join("");
  $("library").querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click",()=>openShow(b.dataset.open)));
  $("library").querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>removeShow(b.dataset.remove)));
}
function removeShow(id){state.shows=state.shows.filter(s=>String(s.collectionId)!==String(id));saveState();renderLibrary();if(state.selectedShow&&String(state.selectedShow.collectionId)===String(id))closeEpisodes();}
async function openShow(id){
  const show=state.shows.find(s=>String(s.collectionId)===String(id));if(!show)return;
  state.selectedShow=show;$("episodesSection").classList.remove("hidden");$("selectedShowTitle").textContent=show.title;$("episodes").innerHTML="";setStatus("feedStatus","Loading episodes…");
  $("episodesSection").scrollIntoView({behavior:"smooth",block:"start"});
  try{
    if(!show.feedUrl) throw new Error("No public RSS feed URL was supplied for this show.");
    const response=await fetch(proxyUrl(show.feedUrl),{headers:{Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml, */*"}});
    if(!response.ok)throw new Error(`Feed returned HTTP ${response.status}`);
    const xmlText=await response.text();const doc=new DOMParser().parseFromString(xmlText,"text/xml");
    if(doc.querySelector("parsererror"))throw new Error("The RSS feed could not be read.");
    const items=[...doc.querySelectorAll("item")].map(item=>{
      const enclosure=item.querySelector("enclosure");
      const media=item.getElementsByTagName("media:content")[0];
      const audioUrl=enclosure?.getAttribute("url")||media?.getAttribute("url")||"";
      const description=item.querySelector("description")?.textContent||item.getElementsByTagName("content:encoded")[0]?.textContent||"";
      return {title:item.querySelector("title")?.textContent||"Untitled episode",date:item.querySelector("pubDate")?.textContent||"",description:stripHTML(description).slice(0,220),url:audioUrl,duration:item.getElementsByTagName("itunes:duration")[0]?.textContent||"",guid:item.querySelector("guid")?.textContent||audioUrl};
    }).filter(x=>x.url);
    if(!items.length)throw new Error("No playable audio episodes were found in this RSS feed.");
    setStatus("feedStatus",`${items.length} episodes loaded.`);
    $("episodes").innerHTML=items.map((ep,i)=>`<article class="episode"><div class="episode-main"><strong>${esc(ep.title)}</strong><p>${esc(ep.date?new Date(ep.date).toLocaleDateString("en-GB"):"")}${ep.duration?" · "+esc(ep.duration):""}</p>${ep.description?`<p>${esc(ep.description)}</p>`:""}${state.positions[ep.guid]?'<span class="played">Saved listening position</span>':""}</div><button class="small-button" data-play="${i}">▶ Play</button></article>`).join("");
    $("episodes").querySelectorAll("[data-play]").forEach(b=>b.addEventListener("click",()=>playEpisode(items[Number(b.dataset.play)],show)));
  }catch(e){setStatus("feedStatus",`${e.message} ${state.proxy?"":"If the podcast host blocks browser access, configure the optional Cloudflare Worker proxy in Settings."}`);console.error(e);}
}
function stripHTML(s){const d=document.createElement("div");d.innerHTML=s;return d.textContent||d.innerText||"";}
function closeEpisodes(){$("episodesSection").classList.add("hidden");state.selectedShow=null;}
function playEpisode(ep,show){
  if(!ep.url){setStatus("playerMessage","This episode has no playable audio URL.");return;}
  state.currentEpisode={...ep,show};
  $("nowTitle").textContent=ep.title;$("nowShow").textContent=show.title;$("nowArtwork").src=show.artwork||"icon.svg";
  audio.src=ep.url;audio.load();
  audio.addEventListener("loadedmetadata",function restore(){audio.removeEventListener("loadedmetadata",restore);const saved=state.positions[ep.guid];if(saved&&saved.duration===audio.duration&&saved.time<audio.duration-10)audio.currentTime=saved.time;});
  audio.play().then(()=>{$("playButton").textContent="Ⅱ";setStatus("playerMessage","");}).catch(()=>setStatus("playerMessage","Tap Play to start audio. Some feeds may not allow direct playback."));
  initAudioProcessing();
}
function initAudioProcessing(){
  if(state.audioContext)return;
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx){setStatus("playerMessage","Audio processing isn't supported in this browser; original audio will play.");return;}
  try{
    state.audioContext=new Ctx();
    state.source=state.audioContext.createMediaElementSource(audio);
    state.compressor=state.audioContext.createDynamicsCompressor();
    state.gain=state.audioContext.createGain();
    state.source.connect(state.compressor);state.compressor.connect(state.gain);state.gain.connect(state.audioContext.destination);
    applyCompression();
  }catch(e){console.warn("Audio processing unavailable",e);state.audioContext=null;}
}
function applyCompression(){
  if(!state.compressor||!state.audioContext)return;
  const presets={off:{threshold:0,knee:0,ratio:1,attack:.003,release:.25},balanced:{threshold:-20,knee:18,ratio:3,attack:.006,release:.25},strong:{threshold:-28,knee:24,ratio:6,attack:.003,release:.3}};
  const p=presets[state.mode],now=state.audioContext.currentTime;
  for(const [key,value] of Object.entries(p))state.compressor[key].setTargetAtTime(value,now,.04);
}
function setMode(mode,persist=true){
  state.mode=mode;document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("audioModeLabel").textContent=mode[0].toUpperCase()+mode.slice(1);
  applyCompression();if(persist)saveState();
}
function savePosition(){
  if(!state.currentEpisode||!Number.isFinite(audio.currentTime))return;
  state.positions[state.currentEpisode.guid]={time:audio.currentTime,duration:audio.duration||0};
  saveState();
}
function updateTimeline(){
  const duration=audio.duration||0;const current=audio.currentTime||0;
  $("seek").value=duration?Math.round(current/duration*1000):0;
  $("currentTime").textContent=fmt(current);$("duration").textContent=fmt(duration);
}
function sleepTimer(){
  const choice=prompt("Stop playback after how many minutes? Enter 15, 30, 45 or 60. Enter 0 to cancel.","30");
  if(choice===null)return;const mins=Number(choice);
  if(mins===0){clearTimeout(state.sleepTimer);state.sleepTimer=null;setStatus("playerMessage","Sleep timer cancelled.");return;}
  if(![15,30,45,60].includes(mins)){setStatus("playerMessage","Choose 15, 30, 45 or 60 minutes.");return;}
  clearTimeout(state.sleepTimer);state.sleepTimer=setTimeout(()=>{audio.pause();$("playButton").textContent="▶";setStatus("playerMessage","Sleep timer finished.");},mins*60000);setStatus("playerMessage",`Sleep timer set for ${mins} minutes.`);
}

$("searchForm").addEventListener("submit",e=>{e.preventDefault();const term=$("searchInput").value.trim();if(term)searchShows(term);});
$("backToLibrary").addEventListener("click",closeEpisodes);
$("playButton").addEventListener("click",async()=>{if(!audio.src){setStatus("playerMessage","Choose an episode first.");return;}if(audio.paused){try{if(state.audioContext?.state==="suspended")await state.audioContext.resume();await audio.play();$("playButton").textContent="Ⅱ";}catch(e){setStatus("playerMessage","Playback could not start. Try tapping Play again.");}}else{audio.pause();$("playButton").textContent="▶";}});
$("back15").addEventListener("click",()=>audio.currentTime=Math.max(0,audio.currentTime-15));
$("forward30").addEventListener("click",()=>audio.currentTime=Math.min(audio.duration||Infinity,audio.currentTime+30));
$("seek").addEventListener("input",()=>{if(audio.duration)audio.currentTime=audio.duration*Number($("seek").value)/1000;});
$("speed").addEventListener("change",()=>audio.playbackRate=Number($("speed").value));
$("volume").addEventListener("input",()=>{audio.volume=Number($("volume").value);$("volumeValue").textContent=Math.round(audio.volume*100)+"%";});
document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));
$("sleepButton").addEventListener("click",sleepTimer);
audio.addEventListener("timeupdate",()=>{updateTimeline();if(Math.floor(audio.currentTime)%5===0)savePosition();});
audio.addEventListener("loadedmetadata",updateTimeline);
audio.addEventListener("play",()=>{$("playButton").textContent="Ⅱ";});
audio.addEventListener("pause",()=>{$("playButton").textContent="▶";savePosition();});
audio.addEventListener("ended",()=>{savePosition();$("playButton").textContent="▶";});
audio.volume=.85;
$("settingsButton").addEventListener("click",()=>$("settingsDialog").showModal());
$("closeSettings").addEventListener("click",()=>$("settingsDialog").close());
$("saveSettings").addEventListener("click",()=>{state.proxy=$("feedProxy").value.trim();if(state.proxy&&!state.proxy.endsWith("url=")){setStatus("playerMessage","Proxy URL should end with ?url= (or &url=).");return;}saveState();$("settingsDialog").close();});
$("clearData").addEventListener("click",()=>{if(confirm("Remove all saved podcasts and listening positions from this device?")){localStorage.removeItem(STORAGE_KEY);state.shows=[];state.positions={};renderLibrary();$("settingsDialog").close();closeEpisodes();}});
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(e=>console.warn("Service worker registration failed",e));
loadState();
})();