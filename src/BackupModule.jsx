import { useEffect, useRef, useState } from 'react';
import {
  OFFLINE, pingServer, listDiskBackups, createDiskBackup, readDiskBackup, subscribeDiskStatus, getDiskStatus,
} from './offline';

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Backup & Restore screen.
 *  - data:        the current farm data object
 *  - summarize:   (data) => [{ label, count }]  rows shown in the preview
 *  - isBackup:    (parsed) => boolean            shape check
 *  - onDownload:  () => void                     download a backup file now
 *  - onRestore:   (parsed) => void               replace the farm with a parsed backup
 */
export default function BackupModule({ data, summarize, isBackup, onDownload, onRestore, schemaVersion, newerThanApp }) {
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState(null); // { name, parsed, rows, when }
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [backups, setBackups] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [disk, setDisk] = useState(getDiskStatus());
  const fileRef = useRef(null);
  const lastBackup = (() => { try { return localStorage.getItem('aifarms_last_backup'); } catch { return null; } })();

  async function refreshServer() {
    const i = await pingServer();
    setInfo(i);
    setBackups(i ? await listDiskBackups() : null);
  }
  useEffect(() => {
    if (!OFFLINE) return undefined;
    refreshServer();
    return subscribeDiskStatus(setDisk);
  }, []);

  function openParsed(name, parsed) {
    setError('');
    if (!isBackup(parsed)) {
      setPreview(null);
      setError('That file does not look like an AI Farms backup. Nothing was changed.');
      return;
    }
    setPreview({ name, parsed, rows: summarize(parsed), when: parsed.updatedAt || null, newer: newerThanApp(parsed) });
  }
  function readFile(file) {
    setNote('');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { openParsed(file.name, JSON.parse(reader.result)); }
      catch { setPreview(null); setError('Could not read that file. It is not a valid backup (JSON).'); }
    };
    reader.onerror = () => setError('Could not read that file from your computer. Please try again.');
    reader.readAsText(file);
  }
  async function pickDisk(name) {
    setBusy(true); setNote('');
    try { openParsed(name, await readDiskBackup(name)); }
    catch { setError('Could not open that backup from the laptop folder.'); }
    setBusy(false);
  }
  async function saveToFolder() {
    setBusy(true); setNote('');
    try {
      const r = await createDiskBackup('manual');
      setNote(`Saved ${r.name} in the backups folder.`);
      try { localStorage.setItem('aifarms_last_backup', new Date().toISOString().slice(0, 10)); } catch { /* ignore */ }
      await refreshServer();
    } catch { setNote('Could not save to the backups folder. Is the AI Farms window still open?'); }
    setBusy(false);
  }
  async function confirmRestore() {
    if (!preview) return;
    setBusy(true);
    // Safety copy of what is on screen right now, so a wrong restore can be undone.
    if (OFFLINE && info) { try { await createDiskBackup('before-restore'); } catch { /* ignore */ } }
    onRestore(preview.parsed);
    setPreview(null);
    setNote('Backup restored. Your farm now shows the data from the file.');
    setBusy(false);
    if (OFFLINE) setTimeout(refreshServer, 1500);
  }

  const cur = summarize(data);
  const curTotal = cur.reduce((s, r) => s + r.count, 0);

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginBottom: 16 };
  const h = { margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 18 };
  const dim = { color: 'var(--text-dim)', fontSize: 13.5, lineHeight: 1.5, margin: '4px 0 12px' };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="panel-head" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 20 }}>Backup &amp; Restore</h3>
      </div>

      <div style={card}>
        <h4 style={h}>Back up your data</h4>
        <p style={dim}>
          Your farm has <strong>{curTotal.toLocaleString()}</strong> records right now.
          {' '}Last backup: <strong>{lastBackup ? lastBackup : 'never'}</strong>.
          {' '}Keep a copy of the backup file on a flash drive or in your email as well.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-gold" onClick={onDownload}>⤓ Download backup file</button>
          {OFFLINE && info && <button className="btn" disabled={busy} onClick={saveToFolder}>Save a backup in the laptop folder</button>}
        </div>
        {note && <p style={{ ...dim, color: 'var(--green)', marginTop: 12 }}>{note}</p>}
      </div>

      <div style={card}>
        <h4 style={h}>Restore from a backup</h4>
        <p style={dim}>Drop a backup file here, or click to choose one. You will see what is inside before anything changes.</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files && e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current && fileRef.current.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current && fileRef.current.click(); }}
          style={{
            border: `2px dashed ${drag ? 'var(--gold)' : 'var(--border)'}`, borderRadius: 10, padding: '28px 16px',
            textAlign: 'center', cursor: 'pointer', background: drag ? 'rgba(212,165,55,0.08)' : 'var(--bg-alt)',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>Drop your backup file here</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: 4 }}>or click to browse (.json)</div>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
          onChange={(e) => { readFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        {error && <p style={{ ...dim, color: 'var(--rust)', marginTop: 12 }}>{error}</p>}

        {preview && (
          <div style={{ marginTop: 16, border: '1px solid var(--gold-dim)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{preview.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 10 }}>
              Last saved in this backup: {fmtWhen(preview.when)}
              {preview.parsed.schemaVersion ? ` · format v${preview.parsed.schemaVersion}` : ''}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>What</th><th style={{ textAlign: 'right' }}>In this backup</th><th style={{ textAlign: 'right' }}>On screen now</th></tr></thead>
                <tbody>
                  {preview.rows.map((r, i) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{r.count.toLocaleString()}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{(cur[i] ? cur[i].count : 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.newer && (
              <p style={{ ...dim, color: 'var(--rust)' }}>
                This file was saved by a newer version of the app (v{preview.parsed.schemaVersion}; this app is v{schemaVersion}). Some of it may not be understood.
              </p>
            )}
            <p style={{ ...dim, marginTop: 10 }}>
              <strong>Restoring replaces everything on screen</strong> with this backup.
              {OFFLINE && info ? ' A safety copy of your current data is saved in the backups folder first.' : ' Download a backup of your current data first if you may need it.'}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-gold" disabled={busy} onClick={confirmRestore}>Restore this backup</button>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {OFFLINE && (
        <div style={card}>
          <h4 style={h}>Automatic backups on this laptop</h4>
          {!info ? (
            <p style={{ ...dim, color: 'var(--rust)' }}>
              The AI Farms window (the black one that opens with the app) is not running, so automatic backups are paused.
              Close this page, double-click <strong>Start AI Farms</strong> and open the app again.
              Your data is still saved in this browser.
            </p>
          ) : (
            <>
              <p style={dim}>
                The app saves your data to a file and makes a backup every day (and hourly for the last 24 hours).
                To restore from your own file, drop it in this folder and it will show up here:
                <br /><code style={{ fontSize: 12 }}>{info.backupDir}</code>
                <br />Last saved to disk: <strong>{disk.lastSaved ? fmtWhen(disk.lastSaved) : 'after your next change'}</strong>
              </p>
              {backups && backups.length === 0 && <p style={dim}>No backups yet. They appear after your first entry.</p>}
              {backups && backups.length > 0 && (
                <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table className="data">
                    <thead><tr><th>File</th><th>Saved</th><th style={{ textAlign: 'right' }}>Size</th><th /></tr></thead>
                    <tbody>
                      {backups.slice(0, 60).map((b) => (
                        <tr key={b.name}>
                          <td style={{ fontSize: 12.5 }}>{b.name}</td>
                          <td>{fmtWhen(b.modified)}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{fmtSize(b.size)}</td>
                          <td><button className="link-btn" disabled={busy} onClick={() => pickDisk(b.name)}>Restore…</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ ...dim, marginTop: 10 }}>
                Live data file: <code style={{ fontSize: 12 }}>{info.dataFile}</code>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
