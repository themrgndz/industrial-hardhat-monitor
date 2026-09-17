export const fmt = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Istanbul",
});

export const timeFmt = new Intl.DateTimeFormat("tr-TR", {
  timeStyle: "medium",
  timeZone: "Europe/Istanbul",
});

export function msText(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function cameraStatusText(cam, paused) {
  if (!cam.connected) return "bağlı değil";
  if (paused) return "duraklatıldı";
  if (cam.keepingUp == null) return "analiz bekleniyor";
  return cam.keepingUp ? "yetişiyor" : "gecikiyor";
}

export function cameraStatusClass(cam, paused) {
  if (!cam.connected) return "";
  if (paused) return "warn";
  if (cam.keepingUp == null) return "warn";
  return cam.keepingUp ? "on" : "off";
}
