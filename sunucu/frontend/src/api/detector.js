// Detector'ın kendi HTTP sunucusu (config.yaml -> server.port ile AYNI olmalı).
// server.py CORS'u zaten açık gönderiyor (Access-Control-Allow-Origin: *),
// bu yüzden Vite proxy'sine gerek yok — doğrudan bu adrese konuşuyoruz.
export const DETECTOR = `http://${window.location.hostname}:8090`;

export async function fetchCameras() {
  const res = await fetch(`${DETECTOR}/api/cameras`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function fetchMetrics() {
  const res = await fetch(`${DETECTOR}/api/metrics`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function fetchEngineState() {
  const res = await fetch(`${DETECTOR}/api/engine`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function pauseEngine() {
  const res = await fetch(`${DETECTOR}/api/engine/pause`, { method: "POST" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function resumeEngine() {
  const res = await fetch(`${DETECTOR}/api/engine/resume`, { method: "POST" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function updateBatchSize(batchSize) {
  const res = await fetch(`${DETECTOR}/api/capture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ batchSize }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || `Hata ${res.status}`), { data });
  return data;
}

export async function selectCamera(id) {
  const res = await fetch(`${DETECTOR}/api/cameras/${encodeURIComponent(id)}/select`, { method: "POST" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function releaseCamera() {
  const res = await fetch(`${DETECTOR}/api/cameras/active/release`, { method: "POST" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function addCamera({ id, name, uri, previewUri }) {
  const res = await fetch(`${DETECTOR}/api/cameras`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, uri, preview_uri: previewUri }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || `Hata ${res.status}`), { data });
  return data;
}

export async function updateCamera(currentId, { id, name, uri, previewUri }) {
  const res = await fetch(`${DETECTOR}/api/cameras/${encodeURIComponent(currentId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name, uri, preview_uri: previewUri }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || `Hata ${res.status}`), { data });
  return data;
}

export async function deleteCamera(id) {
  const res = await fetch(`${DETECTOR}/api/cameras/${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || `Hata ${res.status}`), { data });
  return data;
}

export async function testCamera(id) {
  const res = await fetch(`${DETECTOR}/api/cameras/${encodeURIComponent(id)}/test`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  return res.json();
}

export function snapshotUrl(id, width) {
  return `${DETECTOR}/api/cameras/${encodeURIComponent(id)}/snapshot.jpg?w=${width}&t=${Date.now()}`;
}

export function liveUrl(id, labelsOn = true, trailsOn = false, width) {
  const w = width ? `&w=${width}` : "";
  return `${DETECTOR}/api/cameras/${encodeURIComponent(id)}/live.mjpg?labels=${labelsOn ? 1 : 0}&trails=${trailsOn ? 1 : 0}${w}`;
}

export async function fetchSettings() {
  const res = await fetch(`${DETECTOR}/api/settings`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function updateMinConfidence(minConfidence) {
  const res = await fetch(`${DETECTOR}/api/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minConfidence }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || `Hata ${res.status}`), { data });
  return data;
}

export function connectEvents(handlers) {
  const source = new EventSource(`${DETECTOR}/api/events`);
  for (const [type, fn] of Object.entries(handlers)) {
    if (type === "open") source.onopen = fn;
    else if (type === "error") source.onerror = fn;
    else source.addEventListener(type, (e) => fn(JSON.parse(e.data)));
  }
  return source;
}
