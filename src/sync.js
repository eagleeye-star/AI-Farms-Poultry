/**
 * Cloud sync for the AI Farms tracker.
 *
 * The whole farm state is stored as ONE JSON document in a Supabase table,
 * keyed by farm_id. That keeps sync simple and reliable for a single operator
 * moving between phone and PC.
 *
 * Trade-off to know about: this is last-write-wins at the document level.
 * If you log on your phone AND your PC without syncing in between, the
 * device that pushes last overwrites the other. In practice: hit Sync when
 * you arrive at the farm and again when you finish, and you're fine.
 * The UI warns you when the cloud copy is newer than your local one.
 */

const URL_ENV = import.meta.env.VITE_SUPABASE_URL;
const KEY_ENV = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FARM_ENV = import.meta.env.VITE_FARM_ID;

// Settings can also be entered in-app (handy on the phone) and kept locally.
const SETTINGS_KEY = 'aifarms_sync_settings_v1';

export function getSyncSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch (e) { saved = {}; }
  return {
    url: saved.url || URL_ENV || '',
    key: saved.key || KEY_ENV || '',
    farmId: saved.farmId || FARM_ENV || 'ai-farms-eikwe',
    autoSync: saved.autoSync !== false,
  };
}

export function saveSyncSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function isSyncConfigured() {
  const s = getSyncSettings();
  return Boolean(s.url && s.key && s.farmId);
}

function endpoint(s) {
  return `${s.url.replace(/\/$/, '')}/rest/v1/farm_state`;
}

function headers(s) {
  return {
    'Content-Type': 'application/json',
    apikey: s.key,
    Authorization: `Bearer ${s.key}`,
  };
}

/** Fetch the cloud copy. Returns { state, updatedAt } or null if none saved yet. */
export async function pullRemote() {
  const s = getSyncSettings();
  if (!s.url || !s.key) throw new Error('Cloud sync is not set up yet.');

  const res = await fetch(
    `${endpoint(s)}?farm_id=eq.${encodeURIComponent(s.farmId)}&select=state,updated_at`,
    { headers: headers(s) }
  );
  if (!res.ok) throw new Error(await describeError(res));

  const rows = await res.json();
  if (!rows.length) return null;
  return { state: rows[0].state, updatedAt: rows[0].updated_at };
}

/** Write the local state up to the cloud, replacing whatever is there. */
export async function pushRemote(data) {
  const s = getSyncSettings();
  if (!s.url || !s.key) throw new Error('Cloud sync is not set up yet.');

  const updatedAt = new Date().toISOString();
  const body = [{ farm_id: s.farmId, state: { ...data, updatedAt }, updated_at: updatedAt }];

  const res = await fetch(`${endpoint(s)}?on_conflict=farm_id`, {
    method: 'POST',
    headers: { ...headers(s), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await describeError(res));
  return updatedAt;
}

/** Turn a failed response into something a farmer can act on. */
async function describeError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body.message || body.hint || '';
  } catch (e) { /* response had no JSON body */ }

  if (res.status === 401 || res.status === 403) {
    return 'Cloud rejected the key — check the anon key and that the table policy allows access.';
  }
  if (res.status === 404) {
    return 'Table "farm_state" not found — run the setup SQL in your Supabase project first.';
  }
  return `Sync failed (${res.status}). ${detail}`.trim();
}
