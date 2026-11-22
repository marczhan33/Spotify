'use strict';
/* Pocket Player — an ad-free, offline music player for your own files.
 * Everything is stored on-device in IndexedDB. No accounts, no servers, no ads. */

// ---------------------------------------------------------------- helpers
const $ = (s, r = document) => r.querySelector(s);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // only ever used with trusted icon markup
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};
const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const byText = (k) => (a, b) => (a[k] || '').localeCompare(b[k] || '', undefined, { sensitivity: 'base', numeric: true });
function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify(val)); } catch { return null; } }

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M5 6.2v11.6a.8.8 0 0 0 1.2.7l8.6-5.8a.8.8 0 0 0 0-1.4L6.2 5.5A.8.8 0 0 0 5 6.2z"/><rect x="16.5" y="5" width="2.6" height="14" rx="1"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M19 6.2v11.6a.8.8 0 0 1-1.2.7l-8.6-5.8a.8.8 0 0 1 0-1.4l8.6-5.8a.8.8 0 0 1 1.2.7z"/><rect x="4.9" y="5" width="2.6" height="14" rx="1"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M17 3l4 4-4 4V8h-2.2c-1.2 0-2.3.6-3 1.6l-4.3 6.2A5.5 5.5 0 0 1 3 18H2v-2h1c1.2 0 2.3-.6 3-1.6l4.3-6.2A5.5 5.5 0 0 1 14.8 6H17V3zm0 10l4 4-4 4v-3h-2.2a5.5 5.5 0 0 1-3.8-1.6l1.4-1.6c.6.8 1.5 1.2 2.4 1.2H17v-3zM2 6h1c1.4 0 2.8.5 3.8 1.5l-1.3 1.7C4.9 8.4 4 8 3 8H2V6z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M17 1l4 4-4 4V6H7a3 3 0 0 0-3 3v2H2V9a5 5 0 0 1 5-5h10V1zM7 23l-4-4 4-4v3h10a3 3 0 0 0 3-3v-2h2v2a5 5 0 0 1-5 5H7v3z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M5.3 8.3a1 1 0 0 1 1.4 0L12 13.6l5.3-5.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15.7 4.3a1 1 0 0 1 0 1.4L9.4 12l6.3 6.3a1 1 0 1 1-1.4 1.4l-7-7a1 1 0 0 1 0-1.4l7-7a1 1 0 0 1 1.4 0z"/></svg>',
  queue: '<svg viewBox="0 0 24 24"><path d="M3 5h14v2H3zm0 6h14v2H3zm0 6h9v2H3zm13 0v-4l6 3-6 3z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
};

// ---------------------------------------------------------------- database
const DB_NAME = 'pocket-player';
let dbPromise;
function db() {
  return dbPromise ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('tracks', { keyPath: 'id' });
      d.createObjectStore('audio');
      d.createObjectStore('art');
      d.createObjectStore('playlists', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error || new Error('Transaction failed')); });
async function dbGetAll(name) { return reqP((await db()).transaction(name).objectStore(name).getAll()); }
async function dbGet(name, key) { return reqP((await db()).transaction(name).objectStore(name).get(key)); }
async function dbPut(name, val, key) { const t = (await db()).transaction(name, 'readwrite'); t.objectStore(name).put(val, key); return txDone(t); }

// ---------------------------------------------------------------- tag readers
const dec = (enc) => new TextDecoder(enc);
const latin1 = (b) => dec('latin1').decode(b);
const utf8 = (b) => dec('utf-8').decode(b);
const bytes = async (file, start, len) => new Uint8Array(await file.slice(start, start + len).arrayBuffer());
const be32 = (b, p) => ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
const syncsafe = (b, p) => (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3];
const str4 = (b, p) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
const clean = (s) => (s || '').replace(/\0.*$/s, '').trim();

function unsync(b) {
  const out = [];
  for (let i = 0; i < b.length; i++) { out.push(b[i]); if (b[i] === 0xff && b[i + 1] === 0) i++; }
  return Uint8Array.from(out);
}
function id3Text(b, enc) {
  if (enc === 0) return latin1(b);
  if (enc === 3) return utf8(b);
  if (enc === 2) return dec('utf-16be').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return dec('utf-16be').decode(b.subarray(2));
  if (b[0] === 0xff && b[1] === 0xfe) return dec('utf-16le').decode(b.subarray(2));
  return dec('utf-16le').decode(b);
}
function afterTerminator(b, start, enc) {
  if (enc === 1 || enc === 2) { for (let i = start; i + 1 < b.length; i += 2) if (!b[i] && !b[i + 1]) return i + 2; }
  else { for (let i = start; i < b.length; i++) if (!b[i]) return i + 1; }
  return b.length;
}

async function parseID3(file) {
  const head = await bytes(file, 0, 10);
  if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
  const ver = head[3], flags = head[5];
  let data = await bytes(file, 10, syncsafe(head, 6));
  if (flags & 0x80 && ver < 4) data = unsync(data);
  let p = 0;
  if (flags & 0x40 && ver >= 3) p = ver === 3 ? 4 + be32(data, 0) : syncsafe(data, 0);
  const idLen = ver === 2 ? 3 : 4, hdrLen = ver === 2 ? 6 : 10;
  const out = {};
  let pic = null, picType = -1;
  while (p + hdrLen <= data.length) {
    const id = latin1(data.subarray(p, p + idLen));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const size = ver === 2 ? (data[p + 3] << 16) | (data[p + 4] << 8) | data[p + 5]
      : ver === 4 ? syncsafe(data, p + 4) : be32(data, p + 4);
    const ff = ver === 2 ? 0 : data[p + 9];
    p += hdrLen;
    if (size <= 0 || p + size > data.length) break;
    let fr = data.subarray(p, p + size);
    p += size;
    if (ver === 3) { if (ff & 0xc0) continue; if (ff & 0x20) fr = fr.subarray(1); }
    if (ver === 4) {
      if (ff & 0x0c) continue;
      if (ff & 0x40) fr = fr.subarray(1);
      if (ff & 0x01) fr = fr.subarray(4);
      if (ff & 0x02) fr = unsync(fr);
    }
    const key = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album',
      TPE2: 'albumArtist', TP2: 'albumArtist', TRCK: 'track', TRK: 'track', TPOS: 'disc', TPA: 'disc' }[id];
    if (key) { out[key] = clean(id3Text(fr.subarray(1), fr[0])); continue; }
    if (id === 'APIC' || id === 'PIC') {
      const enc = fr[0];
      let mime, i;
      if (id === 'PIC') { const f = latin1(fr.subarray(1, 4)).toLowerCase(); mime = f === 'png' ? 'image/png' : 'image/jpeg'; i = 4; }
      else { const e = afterTerminator(fr, 1, 0); mime = latin1(fr.subarray(1, e - 1)) || 'image/jpeg'; i = e; }
      const type = fr[i];
      const start = afterTerminator(fr, i + 1, enc);
      if (!pic || (type === 3 && picType !== 3)) {
        if (!mime.includes('/')) mime = 'image/' + mime.toLowerCase();
        pic = new Blob([fr.slice(start)], { type: mime }); picType = type;
      }
    }
  }
  if (pic) out.picture = pic;
  return out;
}

async function parseFLAC(file) {
  if (latin1(await bytes(file, 0, 4)) !== 'fLaC') return null;
  const out = {};
  let p = 4;
  for (let n = 0; n < 128; n++) {
    const bh = await bytes(file, p, 4);
    if (bh.length < 4) break;
    const last = bh[0] & 0x80, type = bh[0] & 0x7f, len = (bh[1] << 16) | (bh[2] << 8) | bh[3];
    p += 4;
    if (type === 4 || (type === 6 && !out.picture)) {
      const b = await bytes(file, p, len);
      const dv = new DataView(b.buffer);
      if (type === 4) {
        let q = 4 + dv.getUint32(0, true);
        const count = dv.getUint32(q, true); q += 4;
        for (let i = 0; i < count && q + 4 <= b.length; i++) {
          const l = dv.getUint32(q, true);
          const s = utf8(b.subarray(q + 4, q + 4 + l)); q += 4 + l;
          const eq = s.indexOf('=');
          const key = { TITLE: 'title', ARTIST: 'artist', ALBUM: 'album', ALBUMARTIST: 'albumArtist',
            'ALBUM ARTIST': 'albumArtist', TRACKNUMBER: 'track', DISCNUMBER: 'disc' }[s.slice(0, eq).toUpperCase()];
          if (key && !out[key]) out[key] = s.slice(eq + 1).trim();
        }
      } else {
        const ml = dv.getUint32(4);
        const mime = latin1(b.subarray(8, 8 + ml));
        let q = 8 + ml; q += 4 + dv.getUint32(q); q += 16;
        const dl = dv.getUint32(q); q += 4;
        out.picture = new Blob([b.slice(q, q + dl)], { type: mime || 'image/jpeg' });
      }
    }
    p += len;
    if (last) break;
  }
  return out;
}

async function parseMP4(file) {
  const head = await bytes(file, 0, 8);
  if (head.length < 8 || str4(head, 4) !== 'ftyp') return null;
  let p = 0, moov = null;
  while (p + 8 <= file.size) {
    const hd = await bytes(file, p, 16);
    let size = be32(hd, 0), hl = 8;
    const type = str4(hd, 4);
    if (size === 1) { size = be32(hd, 8) * 2 ** 32 + be32(hd, 12); hl = 16; } else if (size === 0) size = file.size - p;
    if (size < hl) break;
    if (type === 'moov') { moov = await bytes(file, p + hl, size - hl); break; }
    p += size;
  }
  if (!moov) return null;
  const find = (s, e, t) => {
    for (let q = s; q + 8 <= e;) { const sz = be32(moov, q); if (sz < 8) return null; if (str4(moov, q + 4) === t) return { s: q + 8, e: Math.min(q + sz, e) }; q += sz; }
    return null;
  };
  const out = {};
  const udta = find(0, moov.length, 'udta'); if (!udta) return out;
  const meta = find(udta.s, udta.e, 'meta'); if (!meta) return out;
  const ms = str4(moov, meta.s + 4) === 'hdlr' ? meta.s : meta.s + 4;
  const ilst = find(ms, meta.e, 'ilst'); if (!ilst) return out;
  for (let q = ilst.s; q + 8 <= ilst.e;) {
    const sz = be32(moov, q); if (sz < 8) break;
    const name = str4(moov, q + 4);
    const d = find(q + 8, q + sz, 'data');
    if (d) {
      const val = moov.subarray(d.s + 8, d.e), dtype = be32(moov, d.s) & 0xffffff;
      const key = { '\xa9nam': 'title', '\xa9ART': 'artist', '\xa9alb': 'album', aART: 'albumArtist' }[name];
      if (key) out[key] = utf8(val).trim();
      else if (name === 'trkn' && val.length >= 4) out.track = String((val[2] << 8) | val[3]);
      else if (name === 'disk' && val.length >= 4) out.disc = String((val[2] << 8) | val[3]);
      else if (name === 'covr' && !out.picture) out.picture = new Blob([val.slice()], { type: dtype === 14 ? 'image/png' : 'image/jpeg' });
    }
    q += sz;
  }
  return out;
}

async function readTags(file) {
  for (const fn of [parseID3, parseFLAC, parseMP4]) {
    try { const r = await fn(file); if (r) return r; } catch (e) { console.warn('tag parse failed', fn.name, e); }
  }
  return {};
}

function fromFilename(name) {
  let base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  base = base.replace(/^\d{1,3}(\s*[.\-)]\s*|\s+)/, '');
  const parts = base.split(/\s+[-–]\s+/);
  return parts.length >= 2 ? { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() } : { title: base };
}

const TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  wav: 'audio/wav', aif: 'audio/aiff', aiff: 'audio/aiff', ogg: 'audio/ogg', opus: 'audio/ogg' };
const guessType = (name) => TYPES[(name.split('.').pop() || '').toLowerCase()] || 'audio/mpeg';

function probeDuration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    const finish = (v) => { clearTimeout(timer); a.removeAttribute('src'); a.load(); URL.revokeObjectURL(url); resolve(v); };
    const timer = setTimeout(() => finish(0), 8000); // unknown, but don't reject
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => finish(null); // this browser can't play the file
    a.src = url;
  });
}

async function shrinkArt(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    if (s === 1 && blob.size < 200_000) return blob;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || blob), 'image/jpeg', 0.85));
  } catch { return blob; }
}

// ---------------------------------------------------------------- state
const state = {
  tracks: [], byId: new Map(), playlists: [],
  stack: [{ type: 'songs' }], search: '',
};
const TAB_TITLES = { songs: 'Songs', albums: 'Albums', artists: 'Artists', playlists: 'Playlists', get: 'Get Music', search: 'Search' };
const view = () => state.stack[state.stack.length - 1];
const albumKey = (t) => norm(t.albumArtist) + '\u0000' + norm(t.album);
const trackNum = (s) => parseInt(String(s || '').split('/')[0], 10) || 0;
const albumSort = (a, b) => trackNum(a.disc) - trackNum(b.disc) || trackNum(a.trackNo) - trackNum(b.trackNo) || byText('title')(a, b);

function albums() {
  const m = new Map();
  for (const t of state.tracks) {
    const k = albumKey(t);
    if (!m.has(k)) m.set(k, { key: k, name: t.album, artist: t.albumArtist, tracks: [] });
    m.get(k).tracks.push(t);
  }
  for (const a of m.values()) { a.tracks.sort(albumSort); a.artId = (a.tracks.find((t) => t.hasArt) || {}).id; }
  return [...m.values()].sort(byText('name'));
}
function artists() {
  const m = new Map();
  for (const t of state.tracks) {
    const k = norm(t.artist);
    if (!m.has(k)) m.set(k, { key: k, name: t.artist, tracks: [] });
    m.get(k).tracks.push(t);
  }
  for (const a of m.values()) { a.tracks.sort((x, y) => byText('album')(x, y) || albumSort(x, y)); a.artId = (a.tracks.find((t) => t.hasArt) || {}).id; }
  return [...m.values()].sort(byText('name'));
}

// ---------------------------------------------------------------- artwork (lazy)
const artUrls = new Map();
async function artUrl(id) {
  if (!id) return '';
  if (artUrls.has(id)) return artUrls.get(id);
  const p = dbGet('art', id).then((b) => (b ? URL.createObjectURL(b) : ''));
  artUrls.set(id, p);
  return p;
}
const artObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    artObserver.unobserve(e.target);
    artUrl(e.target.dataset.art).then((u) => { if (u) e.target.src = u; });
  }
}, { rootMargin: '300px' }) : null;
function artImg(id, cls) {
  const img = h('img', { class: 'art ' + cls, alt: '', loading: 'lazy' });
  if (id) { img.dataset.art = id; if (artObserver) artObserver.observe(img); else artUrl(id).then((u) => u && (img.src = u)); }
  return img;
}

// ---------------------------------------------------------------- import
async function importFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const seen = new Set(state.tracks.map((t) => t.fileName + '|' + t.size));
  let added = 0, skipped = 0;
  const failed = [];
  for (const [i, file] of files.entries()) {
    toast(`Adding ${i + 1} of ${files.length}…`, 0);
    if (seen.has(file.name + '|' + file.size)) { skipped++; continue; }
    try {
      const type = file.type || guessType(file.name);
      const blob = new Blob([await file.arrayBuffer()], { type });
      const duration = await probeDuration(blob);
      if (duration === null) { failed.push(file.name); continue; }
      const tags = await readTags(file);
      const fn = fromFilename(file.name);
      const id = uid();
      const art = tags.picture ? await shrinkArt(tags.picture) : null;
      const t = {
        id, title: tags.title || fn.title || file.name,
        artist: tags.artist || fn.artist || 'Unknown Artist',
        album: tags.album || 'Unknown Album',
        albumArtist: tags.albumArtist || tags.artist || fn.artist || 'Unknown Artist',
        trackNo: tags.track || '', disc: tags.disc || '', duration,
        fileName: file.name, size: file.size, type, addedAt: Date.now() + i, hasArt: !!art,
      };
      const tx = (await db()).transaction(['tracks', 'audio', 'art'], 'readwrite');
      tx.objectStore('tracks').put(t);
      tx.objectStore('audio').put(blob, id);
      if (art) tx.objectStore('art').put(art, id);
      await txDone(tx);
      state.tracks.push(t); state.byId.set(id, t); seen.add(file.name + '|' + file.size);
      added++;
    } catch (e) {
      console.error('import failed', file.name, e);
      failed.push(file.name);
      if (e && e.name === 'QuotaExceededError') { toast('Out of storage space on this device.'); break; }
    }
  }
  render();
  const parts = [`Added ${added} song${added === 1 ? '' : 's'}`];
  if (skipped) parts.push(`${skipped} already in library`);
  if (failed.length) parts.push(`${failed.length} couldn't be played`);
  toast(parts.join(' · '), 4000);
}

// ---------------------------------------------------------------- library edits
async function deleteTrack(id) {
  const tx = (await db()).transaction(['tracks', 'audio', 'art', 'playlists'], 'readwrite');
  tx.objectStore('tracks').delete(id); tx.objectStore('audio').delete(id); tx.objectStore('art').delete(id);
  for (const pl of state.playlists) {
    if (pl.trackIds.includes(id)) { pl.trackIds = pl.trackIds.filter((x) => x !== id); tx.objectStore('playlists').put(pl); }
  }
  await txDone(tx);
  state.tracks = state.tracks.filter((t) => t.id !== id); state.byId.delete(id);
  removeFromQueue(id);
  render();
}
async function savePlaylist(pl) { await dbPut('playlists', pl); if (!state.playlists.includes(pl)) state.playlists.push(pl); }
async function newPlaylist(firstTrack) {
  const name = (prompt('Playlist name') || '').trim();
  if (!name) return null;
  const pl = { id: uid(), name, trackIds: firstTrack ? [firstTrack] : [], createdAt: Date.now() };
  await savePlaylist(pl);
  toast(firstTrack ? `Added to “${name}”` : `Created “${name}”`);
  render();
  return pl;
}

// ---------------------------------------------------------------- player
const audio = $('#audio');
const P = { queue: [], order: null, index: -1, shuffle: !!store('pp.shuffle'), repeat: store('pp.repeat') || 'off', url: null, prefetch: null };
const current = () => state.byId.get(P.queue[P.index]);

function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function playList(ids, start = 0, forceShuffle) {
  if (!ids.length) return;
  if (forceShuffle !== undefined) { P.shuffle = forceShuffle; store('pp.shuffle', P.shuffle); }
  if (P.shuffle) {
    const fi = forceShuffle ? Math.floor(Math.random() * ids.length) : start;
    P.order = ids.slice();
    P.queue = [ids[fi], ...shuffled(ids.filter((_, i) => i !== fi))];
    P.index = 0;
  } else { P.order = null; P.queue = ids.slice(); P.index = start; }
  load(true);
}

async function load(autoplay, seekTo) {
  const t = current();
  if (!t) { stop(); return; }
  let blob = P.prefetch && P.prefetch.id === t.id ? P.prefetch.blob : null;
  if (!blob) blob = await dbGet('audio', t.id);
  if (!blob || current() !== t) return;
  unlockPending = false;
  if (P.url) URL.revokeObjectURL(P.url);
  P.url = URL.createObjectURL(blob);
  if (seekTo) audio.addEventListener('loadedmetadata', () => { audio.currentTime = seekTo; }, { once: true });
  audio.src = P.url;
  if (autoplay) audio.play().catch((e) => console.warn('play blocked', e));
  updateNowPlaying();
  saveSession();
  prefetchNext();
}
function nextIndex(dir) {
  const n = P.queue.length;
  let i = P.index + dir;
  if (i >= n) i = P.repeat === 'all' ? 0 : -1;
  if (i < 0 && dir < 0) i = P.repeat === 'all' ? n - 1 : 0;
  return i;
}
async function prefetchNext() {
  const i = nextIndex(1), id = P.queue[i];
  if (i < 0 || !id || (P.prefetch && P.prefetch.id === id)) return;
  const blob = await dbGet('audio', id);
  P.prefetch = blob ? { id, blob } : null;
}
function next(auto) {
  if (auto && P.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
  const i = nextIndex(1);
  if (i < 0) { P.index = 0; load(false); audio.pause(); return; }
  P.index = i; load(true);
}
function prev() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  P.index = nextIndex(-1); load(true);
}
function toggle() {
  unlockPending = false;
  if (!current()) { if (state.tracks.length) playList(sortedSongs().map((t) => t.id)); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}
function stop() { audio.pause(); audio.removeAttribute('src'); P.queue = []; P.index = -1; updateNowPlaying(); saveSession(); }
function setShuffle(on) {
  const cur = P.queue[P.index];
  P.shuffle = on; store('pp.shuffle', on);
  if (cur === undefined) return updateButtons();
  if (on) { P.order = P.queue.slice(); P.queue = [cur, ...shuffled(P.queue.filter((_, i) => i !== P.index))]; P.index = 0; }
  else if (P.order) { P.queue = P.order.filter((id) => state.byId.has(id)); P.order = null; P.index = Math.max(0, P.queue.indexOf(cur)); }
  P.prefetch = null; prefetchNext(); updateButtons(); saveSession();
}
function cycleRepeat() { P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat]; store('pp.repeat', P.repeat); updateButtons(); prefetchNext(); }
function playNext(id) {
  if (!current()) return playList([id]);
  P.queue.splice(P.index + 1, 0, id); if (P.order) P.order.push(id); P.prefetch = null; prefetchNext(); saveSession(); toast('Playing next');
}
function addToQueue(id) {
  if (!current()) return playList([id]);
  P.queue.push(id); if (P.order) P.order.push(id); saveSession(); toast('Added to queue');
}
function removeFromQueue(id) {
  const wasCurrent = P.queue[P.index] === id;
  const before = P.queue.slice(0, P.index).filter((x) => x === id).length;
  P.queue = P.queue.filter((x) => x !== id);
  if (P.order) P.order = P.order.filter((x) => x !== id);
  P.index -= before;
  if (!P.queue.length) return stop();
  if (wasCurrent) { if (P.index >= P.queue.length) P.index = 0; load(!audio.paused); }
  saveSession();
}
function saveSession() {
  store('pp.session', { queue: P.queue, order: P.order, index: P.index, time: audio.currentTime || 0 });
}

// UI sync
function updateButtons() {
  const playing = !audio.paused;
  $('#playBtn').innerHTML = playing ? I.pause : I.play;
  $('#miniPlay').innerHTML = playing ? I.pause : I.play;
  $('#shuffleBtn').classList.toggle('on', P.shuffle);
  $('#repeatBtn').classList.toggle('on', P.repeat !== 'off');
  $('#repeatBtn').innerHTML = I.repeat + (P.repeat === 'one' ? '<span class="badge">1</span>' : '');
}
let mediaArtId = null;
async function updateNowPlaying() {
  const t = current();
  $('#mini').classList.toggle('hidden', !t);
  document.querySelectorAll('.row[data-id]').forEach((r) => r.classList.toggle('playing', !!t && r.dataset.id === t.id));
  updateButtons();
  if (!t) { $('#player').classList.add('hidden'); return; }
  $('#miniTitle').textContent = $('#playerTitle').textContent = t.title;
  $('#miniArtist').textContent = t.artist;
  $('#playerArtist').textContent = `${t.artist} — ${t.album}`;
  document.title = `${t.title} · ${t.artist}`;
  const url = t.hasArt ? await artUrl(t.id) : '';
  if (current() !== t) return;
  for (const img of [$('#miniArt'), $('#playerArt')]) { if (url) img.src = url; else img.removeAttribute('src'); }
  if ('mediaSession' in navigator) {
    const meta = { title: t.title, artist: t.artist, album: t.album, artwork: [{ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }] };
    navigator.mediaSession.metadata = new MediaMetadata(meta);
    mediaArtId = t.id;
    if (t.hasArt) {
      // Lock screens are more reliable with data: URLs than blob: URLs.
      const blob = await dbGet('art', t.id);
      if (blob && mediaArtId === t.id) {
        const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        if (mediaArtId === t.id) navigator.mediaSession.metadata = new MediaMetadata({ ...meta, artwork: [{ src: dataUrl, sizes: '512x512', type: blob.type || 'image/jpeg' }] });
      }
    }
  }
}
let seeking = false;
function updateProgress() {
  const d = audio.duration, c = audio.currentTime;
  const pct = isFinite(d) && d > 0 ? (c / d) * 100 : 0;
  $('#miniBar').style.width = pct + '%';
  if (!seeking) { $('#seek').value = String(Math.round(pct * 10)); $('#seek').style.setProperty('--p', pct + '%'); $('#curTime').textContent = fmt(c); }
  $('#durTime').textContent = fmt(d);
}

audio.addEventListener('play', updateButtons);
audio.addEventListener('pause', () => { updateButtons(); saveSession(); });
audio.addEventListener('ended', () => next(true));
let lastSave = 0, lastPos = 0;
audio.addEventListener('timeupdate', () => {
  updateProgress();
  const now = Date.now();
  if (now - lastSave > 5000) { lastSave = now; saveSession(); }
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && now - lastPos > 1000 && isFinite(audio.duration)) {
    lastPos = now;
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate }); } catch {}
  }
});
audio.addEventListener('loadedmetadata', updateProgress);
audio.addEventListener('error', () => { if (audio.getAttribute('src')) { toast('Could not play this song — skipping'); setTimeout(() => next(false), 800); } });

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
  set('play', () => audio.play());
  set('pause', () => audio.pause());
  set('previoustrack', prev);
  set('nexttrack', () => next(false));
  set('seekto', (e) => { audio.currentTime = e.seekTime; });
  set('seekbackward', (e) => { audio.currentTime = Math.max(0, audio.currentTime - (e.seekOffset || 10)); });
  set('seekforward', (e) => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (e.seekOffset || 10)); });
}

// iOS only lets a media element start playing from a tap. "Unlock" it on the first touch
// so that later programmatic plays (after async DB reads, auto-advance) are allowed.
let unlocked = false, unlockPending = false;
function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const silent = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';
  if (!audio.getAttribute('src')) audio.src = silent;
  const wasMuted = audio.muted;
  audio.muted = true;
  unlockPending = true;
  audio.play()
    .then(() => { if (unlockPending) { audio.pause(); if (audio.src === silent) audio.removeAttribute('src'); } })
    .catch(() => {})
    .finally(() => { audio.muted = wasMuted; unlockPending = false; });
}
document.addEventListener('touchend', unlockAudio, { capture: true, once: true });
document.addEventListener('click', unlockAudio, { capture: true, once: true });

// ---------------------------------------------------------------- rendering
function sortedSongs() { return state.tracks.slice().sort(byText('title')); }

function trackRow(t, ids, index, ctx = {}) {
  return h('li', { class: 'row' + (current() && current().id === t.id ? ' playing' : ''), 'data-id': t.id, onclick: () => playList(ids, index) },
    ctx.number != null ? h('span', { class: 'muted small', style: 'width:22px;text-align:center' }, ctx.number) : artImg(t.hasArt && t.id, 'sm'),
    h('div', { class: 'text' },
      h('div', { class: 'title ellipsis' }, t.title),
      h('div', { class: 'muted small ellipsis' }, ctx.number != null ? t.artist : `${t.artist} · ${t.album}`)),
    h('span', { class: 'dur' }, fmt(t.duration)),
    h('button', { class: 'icon-btn more', 'aria-label': 'More', html: I.more, onclick: (e) => { e.stopPropagation(); trackSheet(t, ctx); } }));
}
function trackList(list, ctx) {
  const ids = list.map((t) => t.id);
  return h('ul', { class: 'list' }, list.map((t, i) => trackRow(t, ids, i, typeof ctx === 'function' ? ctx(t, i) : ctx)));
}
function playButtons(list) {
  const ids = list.map((t) => t.id);
  return h('div', { class: 'actions-row' },
    h('button', { class: 'pill primary', html: I.play + '<span>Play</span>', onclick: () => playList(ids, 0, false) }),
    h('button', { class: 'pill', html: I.shuffle + '<span>Shuffle</span>', onclick: () => playList(ids, 0, true) }));
}
function emptyLibrary() {
  return h('div', { class: 'empty' },
    h('h2', {}, 'Your library is empty'),
    h('p', {}, 'Add MP3, M4A, FLAC or WAV files from the Files app. They\'re saved on this device and play without ads or internet.'),
    h('label', { class: 'pill primary' }, '+ Add music',
      h('input', { type: 'file', multiple: true, hidden: true, accept: $('#fileInput').accept, onchange: (e) => importFiles(e.target.files) })),
    h('p', {}, h('a', { href: '#', style: 'color:var(--accent)', onclick: (e) => { e.preventDefault(); goTab('get'); } }, 'Don\'t have music files yet? Here\'s where to get them →')));
}

const VIEWS = {
  songs() {
    if (!state.tracks.length) return emptyLibrary();
    const list = sortedSongs();
    return [playButtons(list), h('p', { class: 'muted small' }, `${list.length} songs`), trackList(list)];
  },
  albums() {
    if (!state.tracks.length) return emptyLibrary();
    return h('div', { class: 'grid' }, albums().map((a) => h('div', { class: 'card', onclick: () => push({ type: 'album', key: a.key, title: a.name }) },
      artImg(a.artId, 'md'), h('div', { class: 'title ellipsis' }, a.name), h('div', { class: 'sub muted ellipsis' }, a.artist))));
  },
  artists() {
    if (!state.tracks.length) return emptyLibrary();
    return h('ul', { class: 'list' }, artists().map((a) => h('li', { class: 'row', onclick: () => push({ type: 'artist', key: a.key, title: a.name }) },
      artImg(a.artId, 'sm round'),
      h('div', { class: 'text' }, h('div', { class: 'title ellipsis' }, a.name), h('div', { class: 'muted small' }, `${a.tracks.length} song${a.tracks.length === 1 ? '' : 's'}`)))));
  },
  playlists() {
    const pls = state.playlists.slice().sort(byText('name'));
    return [
      h('div', { class: 'actions-row' }, h('button', { class: 'pill', onclick: () => newPlaylist() }, '+ New playlist')),
      pls.length ? h('ul', { class: 'list' }, pls.map((pl) => {
        const first = pl.trackIds.map((id) => state.byId.get(id)).find((t) => t && t.hasArt);
        return h('li', { class: 'row', onclick: () => push({ type: 'playlist', key: pl.id, title: pl.name }) },
          artImg(first && first.id, 'sm'),
          h('div', { class: 'text' }, h('div', { class: 'title ellipsis' }, pl.name), h('div', { class: 'muted small' }, `${pl.trackIds.length} songs`)));
      })) : h('div', { class: 'empty' }, h('p', {}, 'No playlists yet. Tap “⋯” on any song to add it to one.')),
    ];
  },
  album(v) {
    const a = albums().find((x) => x.key === v.key);
    if (!a) return pop();
    return [h('div', { class: 'detail-head' }, artImg(a.artId, 'lg'), h('h2', {}, a.name), h('div', { class: 'muted' }, a.artist)),
      playButtons(a.tracks), trackList(a.tracks, (t, i) => ({ number: trackNum(t.trackNo) || i + 1 }))];
  },
  artist(v) {
    const a = artists().find((x) => x.key === v.key);
    if (!a) return pop();
    return [h('div', { class: 'detail-head' }, artImg(a.artId, 'lg round'), h('h2', {}, a.name)), playButtons(a.tracks), trackList(a.tracks)];
  },
  playlist(v) {
    const pl = state.playlists.find((p) => p.id === v.key);
    if (!pl) return pop();
    const list = pl.trackIds.map((id) => state.byId.get(id)).filter(Boolean);
    const first = list.find((t) => t.hasArt);
    return [h('div', { class: 'detail-head' }, artImg(first && first.id, 'lg'), h('h2', {}, pl.name), h('div', { class: 'muted' }, `${list.length} songs · ${fmt(list.reduce((s, t) => s + t.duration, 0))}`)),
      list.length ? playButtons(list) : h('p', { class: 'muted', style: 'text-align:center' }, 'Empty playlist. Tap “⋯” on any song to add it here.'),
      trackList(list, (t, i) => ({ playlist: pl, position: i })),
      h('div', { class: 'actions-row', style: 'margin-top:24px' },
        h('button', { class: 'pill', onclick: async () => { const n = (prompt('Rename playlist', pl.name) || '').trim(); if (n) { pl.name = n; v.title = n; await savePlaylist(pl); render(); } } }, 'Rename'),
        h('button', { class: 'pill', style: 'color:#f87171', onclick: async () => {
          if (!confirm(`Delete playlist “${pl.name}”? Songs stay in your library.`)) return;
          const tx = (await db()).transaction('playlists', 'readwrite'); tx.objectStore('playlists').delete(pl.id); await txDone(tx);
          state.playlists = state.playlists.filter((p) => p !== pl); pop();
        } }, 'Delete'))];
  },
  search() {
    const q = norm(state.search);
    const list = sortedSongs().filter((t) => norm(`${t.title} ${t.artist} ${t.album}`).includes(q));
    return list.length ? [h('p', { class: 'muted small' }, `${list.length} result${list.length === 1 ? '' : 's'}`), trackList(list)]
      : h('div', { class: 'empty' }, h('p', {}, `No songs match “${state.search}”.`));
  },
  get() { return guide(); },
};

function guide() {
  const a = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
  const el = h('div', { class: 'guide' },
    h('p', {}, 'Pocket Player plays music files you own. Here are legal ways to get DRM-free files you can keep forever — no ads, no subscription.'),

    h('h2', {}, '1. Buy & download (mainstream artists)'),
    h('div', { class: 'box' },
      h('h3', {}, a('https://bandcamp.com', 'Bandcamp')),
      h('p', {}, 'Huge catalog, and artists get most of the money. Buy an album or track, then choose MP3 320 or FLAC. Many albums are “name your price”, some free.'),
      h('h3', {}, a('https://www.qobuz.com/shop', 'Qobuz Download Store')),
      h('p', {}, 'Major-label albums in MP3 or hi-res FLAC.'),
      h('h3', {}, a('https://www.7digital.com', '7digital'), ' · ', a('https://www.amazon.com/music/mp3', 'Amazon MP3 store')),
      h('p', {}, 'Big mainstream catalogs sold as plain MP3 files.')),

    h('h2', {}, '2. Free & legal downloads'),
    h('div', { class: 'box' },
      h('h3', {}, a('https://freemusicarchive.org', 'Free Music Archive')),
      h('p', {}, 'Thousands of free, Creative Commons–licensed songs across every genre.'),
      h('h3', {}, a('https://www.jamendo.com', 'Jamendo')),
      h('p', {}, 'Independent artists who allow free personal downloads.'),
      h('h3', {}, a('https://archive.org/details/audio', 'Internet Archive — Audio')),
      h('p', {}, 'Public-domain recordings, live concerts (e.g. the ', a('https://archive.org/details/etree', 'Live Music Archive'), ') and more.'),
      h('h3', {}, a('https://www.noisetrade.com', 'NoiseTrade'), ' · ', a('https://musopen.org', 'Musopen')),
      h('p', {}, 'Free albums from artists, and free classical recordings.')),

    h('h2', {}, '3. Rip CDs you already own'),
    h('p', {}, 'Use a computer to convert your CDs to MP3 (Apple Music app on Mac/PC, or the free “fre:ac” app), then AirDrop or copy the files to your iPhone.'),

    h('h2', {}, 'Getting files into the app on iPhone'),
    h('ol', {},
      h('li', {}, 'In Safari, download the song or album. It lands in the ', h('b', {}, 'Files'), ' app → ', h('b', {}, 'Downloads'), '.'),
      h('li', {}, 'Albums often come as a .zip — tap it once in Files and iOS unzips it into a folder.'),
      h('li', {}, 'Back here, tap ', h('b', {}, '+ Add'), ', open that folder, tap ', h('b', {}, 'Select'), ', select all songs and tap ', h('b', {}, 'Open'), '.'),
      h('li', {}, 'The songs are now copied into the app — you can delete them from Files to save space.')),
    h('p', { class: 'muted small' }, 'Tip: on a computer you can also drop songs into iCloud Drive and import them from Files on your phone.'),

    h('div', { class: 'box warn' },
      h('p', {}, h('b', {}, 'Avoid “Spotify/YouTube downloader” apps and sites. '),
        'Ripping streams is piracy, often bundles malware, and gets accounts banned. Everything above is legal and safe.')),

    h('h2', {}, 'Storage'),
    h('p', { id: 'storageInfo', class: 'muted' }, 'Checking…'));
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(({ usage = 0, quota = 0 }) => {
      const mb = (n) => (n / 1048576).toFixed(n > 1e9 ? 0 : 1) + ' MB';
      const s = $('#storageInfo'); if (s) s.textContent = `${state.tracks.length} songs using ${mb(usage)}${quota ? ` of about ${mb(quota)} available to this app` : ''}.`;
    });
  } else el.lastChild.textContent = `${state.tracks.length} songs stored on this device.`;
  return el;
}

function render() {
  const v = view();
  const main = $('#main');
  const out = VIEWS[v.type](v);
  if (out === undefined) return; // view popped itself
  main.replaceChildren(...[out].flat());
  $('#title').textContent = v.title || TAB_TITLES[v.type];
  $('#backBtn').classList.toggle('hidden', state.stack.length < 2);
  $('#search').classList.toggle('hidden', v.type === 'get');
  const tab = state.stack[0].type;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}
function push(v) { state.stack.push(v); render(); window.scrollTo(0, 0); }
function pop() { if (state.stack.length > 1) state.stack.pop(); render(); }
function goTab(tab) {
  state.search = ''; $('#search').value = '';
  state.stack = [{ type: tab }]; store('pp.tab', tab); render(); window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- sheets & toast
function openSheet(...content) {
  const sheet = $('#sheet');
  sheet.replaceChildren(h('div', { class: 'grabber' }), ...content.flat());
  sheet.classList.remove('hidden'); $('#sheetBackdrop').classList.remove('hidden');
}
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheetBackdrop').classList.add('hidden'); }
const opt = (label, fn, cls) => h('button', { class: 'opt ' + (cls || ''), onclick: () => { closeSheet(); fn(); } }, label);

function trackSheet(t, ctx = {}) {
  openSheet(
    h('h3', { class: 'ellipsis' }, t.title), h('div', { class: 'muted small ellipsis', style: 'margin:-6px 0 6px' }, `${t.artist} · ${t.album}`),
    opt('Play next', () => playNext(t.id)),
    opt('Add to queue', () => addToQueue(t.id)),
    opt('Add to playlist…', () => playlistPicker(t)),
    ctx.playlist && opt('Remove from this playlist', async () => { ctx.playlist.trackIds.splice(ctx.position, 1); await savePlaylist(ctx.playlist); render(); }),
    opt('Go to album', () => { closePlayer(); push({ type: 'album', key: albumKey(t), title: t.album }); }),
    opt('Go to artist', () => { closePlayer(); push({ type: 'artist', key: norm(t.artist), title: t.artist }); }),
    opt('Delete from library', () => { if (confirm(`Delete “${t.title}” from this device?`)) deleteTrack(t.id); }, 'danger'));
}
function playlistPicker(t) {
  openSheet(h('h3', {}, 'Add to playlist'),
    opt('+ New playlist', () => newPlaylist(t.id)),
    state.playlists.slice().sort(byText('name')).map((pl) => opt(pl.name, async () => {
      pl.trackIds.push(t.id); await savePlaylist(pl); toast(`Added to “${pl.name}”`); if (view().type === 'playlist') render();
    })));
}
function queueSheet() {
  const items = P.queue.map((id, i) => ({ t: state.byId.get(id), i })).filter((x) => x.t && x.i >= P.index);
  openSheet(h('h3', {}, 'Up next'),
    items.map(({ t, i }) => h('button', { class: 'opt' + (i === P.index ? ' current' : ''), onclick: () => { closeSheet(); P.index = i; load(true); } },
      h('div', { style: 'min-width:0' }, h('div', { class: 'ellipsis' }, t.title), h('div', { class: 'muted small ellipsis' }, t.artist)))));
}
let toastTimer;
function toast(msg, ms = 2200) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
function openPlayer() { $('#player').classList.remove('hidden'); }
function closePlayer() { $('#player').classList.add('hidden'); }

// ---------------------------------------------------------------- wire up
function wire() {
  $('#backBtn').innerHTML = I.back;
  $('#playerClose').innerHTML = I.down;
  $('#queueBtn').innerHTML = I.queue;
  $('#prevBtn').innerHTML = I.prev;
  $('#nextBtn').innerHTML = I.next;
  $('#miniNext').innerHTML = I.next;
  $('#shuffleBtn').innerHTML = I.shuffle;

  $('#fileInput').addEventListener('change', (e) => { importFiles(e.target.files).finally(() => { e.target.value = ''; }); });
  $('#backBtn').onclick = pop;
  document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => goTab(b.dataset.tab); });
  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    if (state.search) { if (view().type === 'search') render(); else push({ type: 'search' }); }
    else if (view().type === 'search') pop();
  });

  $('#mini').onclick = openPlayer;
  $('#miniPlay').onclick = (e) => { e.stopPropagation(); toggle(); };
  $('#miniNext').onclick = (e) => { e.stopPropagation(); next(false); };
  $('#playerClose').onclick = closePlayer;
  $('#queueBtn').onclick = queueSheet;
  $('#playBtn').onclick = toggle;
  $('#nextBtn').onclick = () => next(false);
  $('#prevBtn').onclick = prev;
  $('#shuffleBtn').onclick = () => setShuffle(!P.shuffle);
  $('#repeatBtn').onclick = cycleRepeat;
  const seek = $('#seek');
  seek.addEventListener('input', () => {
    seeking = true;
    seek.style.setProperty('--p', seek.value / 10 + '%');
    $('#curTime').textContent = fmt((seek.value / 1000) * (audio.duration || 0));
  });
  seek.addEventListener('change', () => { if (isFinite(audio.duration)) audio.currentTime = (seek.value / 1000) * audio.duration; seeking = false; });
  $('#sheetBackdrop').onclick = closeSheet;

  // Swipe the full player down to close it.
  let y0 = null;
  $('#player').addEventListener('touchstart', (e) => { y0 = e.target.closest('input') ? null : e.touches[0].clientY; }, { passive: true });
  $('#player').addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) closePlayer(); y0 = null; });

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight' && e.shiftKey) next(false);
    else if (e.key === 'ArrowLeft' && e.shiftKey) prev();
    else if (e.key === 'Escape') { closeSheet(); closePlayer(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone && !store('pp.tipDismissed')) $('#installTip').classList.remove('hidden');
  $('#installTipClose').onclick = () => { $('#installTip').classList.add('hidden'); store('pp.tipDismissed', true); };
}

async function init() {
  wire();
  try {
    const [tracks, playlists] = await Promise.all([dbGetAll('tracks'), dbGetAll('playlists')]);
    state.tracks = tracks; state.playlists = playlists;
    state.byId = new Map(tracks.map((t) => [t.id, t]));
  } catch (e) {
    console.error(e);
    toast('Storage is unavailable (private browsing?). Songs won\'t be saved.', 6000);
  }
  const tab = store('pp.tab');
  if (tab && TAB_TITLES[tab] && tab !== 'search') state.stack = [{ type: tab }];
  render();

  const s = store('pp.session');
  if (s && Array.isArray(s.queue)) {
    P.queue = s.queue.filter((id) => state.byId.has(id));
    P.order = Array.isArray(s.order) ? s.order.filter((id) => state.byId.has(id)) : null;
    const curId = s.queue[s.index];
    P.index = Math.max(0, P.queue.indexOf(curId));
    if (P.queue.length) load(false, P.queue[P.index] === curId ? s.time : 0);
  }
  updateButtons();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
}

// Exposed for tests.
window.PocketPlayer = { state, P, importFiles, readTags, fromFilename, playList };
init();
