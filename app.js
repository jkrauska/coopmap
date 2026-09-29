const PALETTE = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#c026d3",
  "#b45309",
];

const countEl = document.getElementById("territory-count");
const searchEl = document.getElementById("territory-q");
const stateEl = document.getElementById("territory-state");
const listEl = document.getElementById("territory-results");
const emptyEl = document.getElementById("territory-empty");
const detailEl = document.getElementById("territory-detail");
const detailName = document.getElementById("detail-name");
const detailPlace = document.getElementById("detail-place");
const detailAddress = document.getElementById("detail-address");
const detailPhone = document.getElementById("detail-phone");
const detailWeb = document.getElementById("detail-web");
const zoomBtn = document.getElementById("detail-zoom");

const format = new ol.format.GeoJSON({ featureProjection: "EPSG:3857" });
const source = new ol.source.Vector({
  features: format.readFeatures(window.COOP_TERRITORIES),
});

let selectedId = null;
let hoverId = null;
let visibleIds = null;

function colorFor(name) {
  let hash = 0;
  const text = name || "";
  for (let i = 0; i < text.length; i += 1) {
    hash = (Math.imul(hash, 33) + text.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function rgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const layer = new ol.layer.Vector({
  source,
  // Rebuild during view animations so territories stay on the basemap
  // instead of being clipped to the frame where the pan started.
  updateWhileAnimating: true,
  style: (feature) => {
    const id = feature.getId();
    if (visibleIds && !visibleIds.has(id)) return null;
    const selected = id === selectedId;
    const hovered = id === hoverId;
    const color = colorFor(feature.get("name"));
    return new ol.style.Style({
      zIndex: selected ? 3 : hovered ? 2 : 1,
      fill: new ol.style.Fill({
        color: rgba(color, selected ? 0.55 : hovered ? 0.42 : 0.16),
      }),
      stroke: new ol.style.Stroke({
        color: selected ? "#0f172a" : hovered ? color : rgba(color, 0.55),
        width: selected ? 2.5 : hovered ? 1.8 : 0.7,
      }),
    });
  },
});

const tipEl = document.createElement("div");
tipEl.className = "map-tip";
tipEl.hidden = true;
const tip = new ol.Overlay({
  element: tipEl,
  offset: [12, 0],
  positioning: "center-left",
  stopEvent: false,
});

const map = new ol.Map({
  target: "map",
  layers: [
    // Default URL and "© OpenStreetMap contributors" attribution.
    new ol.layer.Tile({ source: new ol.source.OSM() }),
    layer,
  ],
  overlays: [tip],
  view: new ol.View({
    center: ol.proj.fromLonLat([-98.5, 39.8]),
    zoom: 4,
  }),
});

function featureById(id) {
  return source.getFeatureById(id);
}

function clean(value) {
  const text = (value || "").trim();
  if (!text || text.toUpperCase() === "NOT AVAILABLE") return "";
  return text;
}

const STATE_NAMES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

function stateName(code) {
  const key = (code || "").trim().toUpperCase();
  return STATE_NAMES[key] || code;
}

function zoomTo(feature, { duration = 350, padding = [32, 32, 32, 32], fraction = 1 } = {}) {
  const geometry = feature && feature.getGeometry();
  if (!geometry) return;
  const extent = geometry.getExtent().slice();
  if (fraction > 0 && fraction < 1) {
    const width = ol.extent.getWidth(extent);
    const height = ol.extent.getHeight(extent);
    const padX = (width / fraction - width) / 2;
    const padY = (height / fraction - height) / 2;
    extent[0] -= padX;
    extent[1] -= padY;
    extent[2] += padX;
    extent[3] += padY;
  }
  map.getView().fit(extent, {
    padding,
    maxZoom: 10,
    duration,
  });
}

function showDetail(feature) {
  if (!feature) {
    detailEl.hidden = true;
    return;
  }
  const name = feature.get("name") || "Unknown";
  const city = clean(feature.get("city"));
  const state = clean(feature.get("state"));
  const zip = clean(feature.get("zip"));
  const address = clean(feature.get("address"));
  const phone = clean(feature.get("telephone"));
  const website = clean(feature.get("website"));
  detailName.textContent = name;
  const place = [city, state].filter(Boolean).join(", ");
  detailPlace.textContent = [place, zip].filter(Boolean).join(" ");
  detailAddress.hidden = !address;
  detailAddress.textContent = address || "";
  detailPhone.hidden = !phone;
  detailPhone.textContent = phone || "";
  detailWeb.hidden = !website;
  detailWeb.replaceChildren();
  if (website) {
    const link = document.createElement("a");
    const href = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = website.replace(/^https?:\/\//i, "");
    detailWeb.appendChild(link);
  }
  detailEl.hidden = false;
}

function selectFeature(feature, { zoom = false, scroll = false } = {}) {
  selectedId = feature ? feature.getId() : null;
  layer.changed();
  showDetail(feature);
  for (const button of listEl.querySelectorAll("button")) {
    button.classList.toggle("is-selected", button.dataset.id === String(selectedId));
  }
  if (scroll && selectedId != null) {
    const button = listEl.querySelector(`button[data-id="${CSS.escape(String(selectedId))}"]`);
    if (button) button.scrollIntoView({ block: "nearest" });
  }
  if (zoom && feature) zoomTo(feature);
}

function matches(feature, query, state) {
  if (state && feature.get("state") !== state) return false;
  if (!query) return true;
  const haystack = `${feature.get("name") || ""} ${feature.get("city") || ""}`.toLowerCase();
  return haystack.includes(query);
}

function renderList() {
  const query = searchEl.value.trim().toLowerCase();
  const state = stateEl.value;
  const features = source.getFeatures().slice().sort((a, b) => {
    const byName = (a.get("name") || "").localeCompare(b.get("name") || "");
    if (byName !== 0) return byName;
    return (a.get("state") || "").localeCompare(b.get("state") || "");
  });
  const visible = features.filter((feature) => matches(feature, query, state));
  visibleIds = query || state ? new Set(visible.map((feature) => feature.getId())) : null;
  layer.changed();

  listEl.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const feature of visible) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = String(feature.getId());
    if (feature.getId() === selectedId) button.classList.add("is-selected");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colorFor(feature.get("name"));
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = feature.get("name") || "Unknown";
    const stateLabel = document.createElement("span");
    stateLabel.className = "state";
    stateLabel.textContent = feature.get("state") || "";
    button.append(swatch, name, stateLabel);
    button.addEventListener("click", () => selectFeature(feature, { zoom: true }));
    item.appendChild(button);
    fragment.appendChild(item);
  }
  listEl.appendChild(fragment);
  emptyEl.hidden = visible.length > 0;
  const total = features.length;
  countEl.textContent =
    visible.length === total
      ? `${total.toLocaleString()} co-ops`
      : `${visible.length.toLocaleString()} of ${total.toLocaleString()} co-ops`;
  return visible;
}

function fillStates() {
  const states = [
    ...new Set(source.getFeatures().map((feature) => feature.get("state")).filter(Boolean)),
  ].sort();
  for (const state of states) {
    const option = document.createElement("option");
    option.value = state;
    option.textContent = state;
    stateEl.appendChild(option);
  }
}

function applyStateQuery() {
  const requested = new URLSearchParams(location.search).get("state");
  if (!requested) return false;
  const code = requested.trim().toUpperCase();
  const known = [...stateEl.options].some((option) => option.value === code);
  if (!known) return false;
  stateEl.value = code;
  return true;
}

function syncStateQuery() {
  const url = new URL(location.href);
  if (stateEl.value) url.searchParams.set("state", stateEl.value.toLowerCase());
  else url.searchParams.delete("state");
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next !== current) history.replaceState(null, "", next);
}

function fitFeatures(features, maxZoom) {
  if (!features.length) return;
  const extent = ol.extent.createEmpty();
  for (const feature of features) {
    ol.extent.extend(extent, feature.getGeometry().getExtent());
  }
  map.getView().fit(extent, { padding: [28, 28, 28, 28], maxZoom, duration: 0 });
}

fillStates();
const stateFromUrl = applyStateQuery();
fitFeatures(renderList(), stateFromUrl ? 8 : 5);

searchEl.addEventListener("input", () => renderList());
stateEl.addEventListener("change", () => {
  syncStateQuery();
  fitFeatures(renderList(), 8);
  if (!slideshowOn) return;
  showSlide();
});

document.getElementById("territory-filters").addEventListener("submit", (event) => {
  event.preventDefault();
});

zoomBtn.addEventListener("click", () => {
  if (selectedId == null) return;
  zoomTo(featureById(selectedId));
});

function showTip(feature, coordinate, pixel) {
  const name = (feature.get("name") || "Unknown").trim() || "Unknown";
  tipEl.textContent = name;
  tipEl.hidden = false;
  const size = map.getSize() || [0, 0];
  const width = tipEl.offsetWidth || 180;
  const flip = pixel[0] + 16 + width > size[0] - 8;
  tip.setPositioning(flip ? "center-right" : "center-left");
  tip.setOffset(flip ? [-12, 0] : [12, 0]);
  tip.setPosition(coordinate);
}

function hideTip() {
  tipEl.hidden = true;
  tip.setPosition(undefined);
}

map.on("pointermove", (event) => {
  if (event.dragging) {
    hideTip();
    return;
  }
  const feature = map.forEachFeatureAtPixel(event.pixel, (hit) => hit);
  const next = feature ? feature.getId() : null;
  map.getTargetElement().style.cursor = feature ? "pointer" : "";
  if (feature) showTip(feature, event.coordinate, event.pixel);
  else hideTip();
  if (next !== hoverId) {
    hoverId = next;
    layer.changed();
  }
});

map.getViewport().addEventListener("pointerleave", () => {
  hideTip();
  if (hoverId == null) return;
  hoverId = null;
  map.getTargetElement().style.cursor = "";
  layer.changed();
});

map.on("click", (event) => {
  if (slideshowOn) return;
  const feature = map.forEachFeatureAtPixel(event.pixel, (hit) => hit);
  selectFeature(feature || null, { scroll: true });
});

const SLIDE_MS = 20000;
const SLIDE_LOOK_MS = SLIDE_MS * 2;
const slideToggle = document.getElementById("slideshow-toggle");
const slideOverlay = document.getElementById("slide-overlay");
const slideCoop = document.getElementById("slide-coop");
const slidePlace = document.getElementById("slide-place");
const slideFact = document.getElementById("slide-fact");
const slidePrinciple = document.getElementById("slide-principle");
const slidePrincipleSource = document.getElementById("slide-principle-source");
const slideSourceLink = document.getElementById("slide-source-link");
const slideSourceDetail = document.getElementById("slide-source-detail");
const slideSourceWhen = document.getElementById("slide-source-when");
const slideBar = document.getElementById("slide-bar");

const REGION_OF = {};
for (const [region, states] of Object.entries({
  northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NY", "NJ", "PA"],
  midwest: ["OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"],
  south: ["DE", "MD", "VA", "WV", "NC", "SC", "GA", "FL", "KY", "TN", "AL", "MS", "AR", "LA", "OK", "TX"],
  west: ["MT", "ID", "WY", "CO", "NM", "AZ", "UT", "NV", "CA", "OR", "WA", "AK", "HI"],
})) {
  for (const state of states) REGION_OF[state] = region;
}

function factsForState(state) {
  const all = window.COOP_FACTS || [];
  const national = all.filter((fact) => !(fact.states || []).length);
  const sheet = national.filter((fact) => fact.chapter === "Electric Co-op Facts & Figures");
  const tagged = all.filter((fact) => (fact.states || []).length);
  const mix = (local) => {
    if (!sheet.length) return local;
    const copies = Math.max(1, Math.ceil(sheet.length / local.length));
    const weighted = [];
    for (let i = 0; i < copies; i++) weighted.push(...local);
    return weighted.concat(sheet);
  };
  const direct = tagged.filter((fact) => fact.states.includes(state));
  if (direct.length) return mix(direct);
  const region = REGION_OF[state];
  const regional = tagged.filter((fact) =>
    fact.states.some((code) => REGION_OF[code] === region),
  );
  if (regional.length) return mix(regional);
  return national.length ? national : all;
}

let slideshowOn = false;
let slideMs = SLIDE_MS;
let slideTimer = null;
let slideHold = null;
let lastFeatureId = null;
let lastFact = null;
let lastPrinciple = null;

function pickOther(items, previous) {
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  let next = items[Math.floor(Math.random() * items.length)];
  while (next === previous) {
    next = items[Math.floor(Math.random() * items.length)];
  }
  return next;
}

function restartSlideBar() {
  slideBar.style.setProperty("--slide-ms", `${slideMs}ms`);
  slideBar.classList.remove("is-running");
  void slideBar.offsetWidth;
  slideBar.classList.add("is-running");
}

function clearSlideTimers() {
  if (slideTimer != null) {
    window.clearTimeout(slideTimer);
    slideTimer = null;
  }
  if (slideHold != null) {
    window.clearTimeout(slideHold);
    slideHold = null;
  }
}

function armSlideTimer() {
  if (slideTimer != null) window.clearTimeout(slideTimer);
  slideTimer = window.setTimeout(showSlide, slideMs);
}

// Zooming out or panning means the viewer is looking around, so restart
// the countdown at twice the usual length and wait until the gesture settles.
function holdSlideForLook() {
  if (!slideshowOn) return;
  slideMs = SLIDE_LOOK_MS;
  if (slideTimer != null) {
    window.clearTimeout(slideTimer);
    slideTimer = null;
  }
  slideBar.classList.remove("is-running");
  if (slideHold != null) window.clearTimeout(slideHold);
  slideHold = window.setTimeout(() => {
    slideHold = null;
    if (!slideshowOn) return;
    restartSlideBar();
    armSlideTimer();
  }, 450);
}

function showSlide() {
  slideMs = SLIDE_MS;
  if (slideHold != null) {
    window.clearTimeout(slideHold);
    slideHold = null;
  }
  const filterState = stateEl.value;
  const features = source.getFeatures().filter((feature) => {
    if (!feature.getGeometry()) return false;
    return !filterState || feature.get("state") === filterState;
  });
  const feature = pickOther(
    features.filter((item) => item.getId() !== lastFeatureId),
    null,
  ) || features[0];
  if (!feature) return;
  const state = clean(feature.get("state"));
  const pool = factsForState(state).filter((fact) => fact !== lastFact);
  const fact = pickOther(pool.length ? pool : factsForState(state), null);
  lastFeatureId = feature.getId();
  lastFact = fact;
  const city = clean(feature.get("city"));
  slideCoop.textContent = feature.get("name") || "Unknown co-op";
  slidePlace.textContent = [city, stateName(state)].filter(Boolean).join(", ");
  slideFact.textContent = fact ? fact.text : "";
  const principles = window.COOP_PRINCIPLES || [];
  const principle = principles.length && Math.random() < 1 / 3
    ? pickOther(principles, lastPrinciple)
    : null;
  lastPrinciple = principle;
  if (principle) {
    slidePrinciple.hidden = false;
    slidePrinciple.textContent = ` ${principle.name}. ${principle.text}`;
    slidePrincipleSource.hidden = false;
  } else {
    slidePrinciple.hidden = true;
    slidePrinciple.textContent = "";
    slidePrincipleSource.hidden = true;
  }
  slideSourceLink.textContent = (fact && fact.source) || "Rural Lines, USA";
  slideSourceLink.href = (fact && fact.href) || "https://archive.org/details/rurallinesusasto811unit_0";
  slideSourceDetail.textContent = fact && fact.chapter ? `, ${fact.chapter}` : "";
  slideSourceWhen.textContent = ` · ${(fact && fact.published) || "USDA, 1960"}`;
  slideOverlay.hidden = false;
  restartSlideBar();
  armSlideTimer();
  selectFeature(feature, { zoom: false, scroll: true });
  map.updateSize();
  zoomTo(feature, { duration: 1600, padding: [48, 48, 180, 48], fraction: 0.25 });
}

function startSlideshow() {
  slideshowOn = true;
  document.body.classList.add("is-slideshow");
  slideToggle.setAttribute("aria-label", "Stop");
  slideToggle.setAttribute("aria-pressed", "true");
  map.updateSize();
  showSlide();
}

function stopSlideshow() {
  slideshowOn = false;
  document.body.classList.remove("is-slideshow");
  slideToggle.setAttribute("aria-label", "Play");
  slideToggle.setAttribute("aria-pressed", "false");
  slideOverlay.hidden = true;
  slideBar.classList.remove("is-running");
  clearSlideTimers();
  map.updateSize();
}

slideToggle.addEventListener("click", () => {
  if (slideshowOn) stopSlideshow();
  else startSlideshow();
});

map.on("pointerdrag", holdSlideForLook);

map.getViewport().addEventListener("wheel", (event) => {
  if (event.deltaY > 0) holdSlideForLook();
}, { passive: true });

const zoomOutBtn = map.getTargetElement().querySelector(".ol-zoom-out");
if (zoomOutBtn) zoomOutBtn.addEventListener("click", holdSlideForLook);

let touchPointers = 0;
let gestureResolution = map.getView().getResolution();

function trackTouchDown(event) {
  if (event.pointerType !== "touch") return;
  touchPointers += 1;
  gestureResolution = map.getView().getResolution();
}

function trackTouchUp(event) {
  if (event.pointerType !== "touch") return;
  touchPointers = Math.max(0, touchPointers - 1);
}

map.getViewport().addEventListener("pointerdown", trackTouchDown);
map.getViewport().addEventListener("pointerup", trackTouchUp);
map.getViewport().addEventListener("pointercancel", trackTouchUp);

map.getView().on("change:resolution", () => {
  if (touchPointers < 2) return;
  const resolution = map.getView().getResolution();
  if (resolution > gestureResolution) holdSlideForLook();
  gestureResolution = resolution;
});

document.addEventListener("keydown", (event) => {
  const tag = event.target && event.target.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const zoomOut = event.key === "-" || event.key === "_" || event.key === "Subtract";
  const pan = event.key.startsWith("Arrow");
  if (zoomOut || pan) holdSlideForLook();
});

startSlideshow();
