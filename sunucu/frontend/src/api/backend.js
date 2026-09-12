// Spring backend (:8080). Göreli yollar kullanılır: prod'da aynı origin'den
// (jar içindeki static bundle), dev'de Vite proxy'sinden (vite.config.js) sunulur.

export async function fetchStats() {
  const res = await fetch("/api/v1/stats/summary");
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}


export function violationsListUrl({ page, size, from, to, cameraId, status }) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("size", String(size));
  if (from) params.set("from", new Date(from).toISOString());
  if (to) params.set("to", new Date(to).toISOString());
  if (cameraId) params.set("cameraId", cameraId);
  params.set("status", status);
  return `/api/v1/violations?${params.toString()}`;
}

export async function fetchViolations(filters) {
  const res = await fetch(violationsListUrl(filters));
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function reviewViolation(id, status) {
  const res = await fetch(`/api/v1/violations/${id}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || String(res.status));
  }
  return res.json();
}

export async function deleteAllViolations() {
  const res = await fetch("/api/v1/violations", { method: "DELETE" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export async function deleteViolation(id) {
  const res = await fetch(`/api/v1/violations/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(String(res.status));
}

export function evidenceImageUrl(id) {
  return `/api/v1/violations/${id}/image`;
}

export function evidenceCropUrl(id) {
  return `/api/v1/violations/${id}/crop`;
}
