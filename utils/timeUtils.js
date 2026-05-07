// ── TIMEZONE HELPER FUNCTIONS ──────────────────────────────
export function getCurrentTimestamp() {
  // Return timestamp in configured timezone
  return new Date().toLocaleString('id-ID', {
    timeZone: process.env.TZ || 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function getCurrentTimeHHMM() {
  // Return HH:MM format in configured timezone
  return new Date().toLocaleString('id-ID', {
    timeZone: process.env.TZ || 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function getISOTimestamp() {
  return new Date().toISOString();
}

