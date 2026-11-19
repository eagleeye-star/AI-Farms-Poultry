/**
 * Laptop (offline) build helpers.
 *
 * The offline build never talks to the cloud. Data lives in the browser as
 * before, and is ALSO written to a file on the laptop by the tiny local
 * server (server/serve.cjs). If the browser's storage is ever cleared, the
 * file on disk brings the farm back. All calls fail quietly when the server
 * is not running, so the app keeps working from browser storage alone.
 */
export const OFFLINE = import.meta.env.VITE_OFFLINE === '1';

const listeners = new Set();
let status = { server: 'unknown', lastSaved: null, error: '' };
function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
}
export function getDiskStatus() { return status; }
export function subscribeDiskStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function api(path, opts = {}, timeoutMs = 4000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...opts, signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function pingServer() {
  try {
    const info = await api('/api/ping');
    setStatus({ server: 'on', error: '' });
    return info;
  } catch {
    setStatus({ server: 'off' });
    return null;
  }
}

export async function fetchDiskState() {
  try {
    const r = await api('/api/state');
    setStatus({ server: 'on', error: '' });
    return r && r.data ? r : null;
  } catch {
    setStatus({ server: 'off' });
    return null;
  }
}

let timer = null;
let pending = null;
async function flush() {
  if (!pending) return;
  const body = JSON.stringify({ data: pending });
  pending = null;
  try {
    const r = await api('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 }, 15000);
    setStatus({ server: 'on', lastSaved: r.savedAt || new Date().toISOString(), error: '' });
  } catch (e) {
    setStatus({ server: 'off', error: 'Could not save to the laptop folder' });
  }
}
/** Queue a save to disk (about a second after the last change). */
export function pushDiskState(data) {
  pending = data;
  clearTimeout(timer);
  timer = setTimeout(flush, 900);
}
if (typeof window !== 'undefined' && OFFLINE) {
  window.addEventListener('pagehide', () => { clearTimeout(timer); flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); flush(); } });
}

export async function listDiskBackups() {
  try { return (await api('/api/backups')).backups || []; } catch { return null; }
}
export async function createDiskBackup(label) {
  return api('/api/backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) }, 15000);
}
export async function readDiskBackup(name) {
  return api('/api/backups/' + encodeURIComponent(name), {}, 20000);
}
