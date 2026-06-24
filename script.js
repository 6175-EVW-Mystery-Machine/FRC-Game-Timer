// ----------------------------------------------------
// DOM References                                      */
// ----------------------------------------------------
const detailsPanel = document.getElementById('active-alliance-details');
const scoreBoxDisplay = document.getElementById('active-score-display');
const allianceNameDisplay = document.getElementById('active-alliance-name-display');
const teamNumDisplay = document.getElementById('active-team-number-display');
const timerDisplay = document.getElementById('timer-val');
const phaseBanner = document.getElementById('phase-banner-val');
const timerBar = document.getElementById('timer-bar');
const startBtn = document.getElementById('btn-start-match');
const matchNameDisplay = document.getElementById('match-name-display');
const matchSubDisplay = document.getElementById('match-sub-display');
const adminPanel = document.getElementById('admin-panel');
const adminToggle = document.getElementById('admin-toggle');
const musicWrapper = document.getElementById('music-player-wrapper');
const musicPlaylist = document.getElementById('music-playlist');
const musicTrackNameLarge = document.getElementById('music-track-name-large');
const musicTrackArtistLarge = document.getElementById('music-track-artist-large');
let currentTrackTitle = 'Now Playing';
const musicPlayBtn = document.getElementById('music-play-btn');
const musicPlayIcon = document.getElementById('music-play-icon');
const musicPrevBtn = document.getElementById('music-prev-btn');
const musicNextBtn = document.getElementById('music-next-btn');
const musicProgressBar = document.getElementById('music-progress-bar');
const musicTimeCurrent = document.getElementById('music-time-current');
const musicTimeTotal = document.getElementById('music-time-total');
const musicCollapseBtn = document.getElementById('music-collapse-btn');
const musicCloseBtn = document.getElementById('music-close-btn');
const expCollapseBtn = document.getElementById('exp-collapse-btn');
const expCloseBtn = document.getElementById('exp-close-btn');
const compactTrackName = document.getElementById('compact-track-name');
const compactTrackArtist = document.getElementById('compact-track-artist');
const compactPlayBtn = document.getElementById('compact-play-btn');
const compactPlayIcon = document.getElementById('compact-play-icon');
const compactPrevBtn = document.getElementById('compact-prev-btn');
const compactNextBtn = document.getElementById('compact-next-btn');
const compactProgressFill = document.getElementById('compact-progress-fill');
const compactThumbImg = document.getElementById('compact-thumb-img');
const compactThumbFallback = document.querySelector('.compact-thumb-fallback');

// Visualizer DOM References
const visualizerCanvas = document.getElementById('visualizer-canvas');

// ----------------------------------------------------
// Sound Management                                    */
// ----------------------------------------------------
const sounds = {
  start: document.getElementById('sound-start'),
  resume: document.getElementById('sound-resume'),
  shiftChange: document.getElementById('sound-shift-change'),
  warning: document.getElementById('sound-warning'),
  end: document.getElementById('sound-end')
};

function playAudioClip(clipKey) {
  const audio = sounds[clipKey];
  if (audio) {
    audio.volume = 1.0;
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio playback blocked until user interaction:', e));
    duckMusicForEventSound(audio);

    // Visualizer pulse trigger
    if (window.audioVisualizer) {
      let pulseAmount = 1.0;
      if (clipKey === 'end') pulseAmount = 2.5;
      else if (clipKey === 'warning') pulseAmount = 1.8;
      window.audioVisualizer.triggerPulse(pulseAmount);
    }
  }
}

// Initialize Audio Context on click to prevent browser restrictions
document.addEventListener('click', () => {
  Object.keys(sounds).forEach(key => {
    const audio = sounds[key];
    if (audio && audio.paused && audio.currentTime === 0) {
      audio.volume = 0;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {});
    }
  });
  // Unlock match music audio as well (only if it has a src)
  if (matchMusicAudio && matchMusicAudio.paused && matchMusicAudio.currentTime === 0 && matchMusicAudio.src) {
    matchMusicAudio.volume = 0;
    matchMusicAudio.play().then(() => {
      matchMusicAudio.pause();
      matchMusicAudio.volume = MUSIC_VOLUME;
    }).catch(() => {});
  }

  // Initialize Audio Visualizer Context
  if (window.audioVisualizer) {
    window.audioVisualizer.initAudio();
  }
}, { once: true });

// ----------------------------------------------------
// Match Music Playlist (user-imported songs)          */
// ----------------------------------------------------
const MUSIC_VOLUME = 1.0;
let matchMusicAudio = new Audio();
let playlist = [];               // [{ name, blob }] - music player songs
let matchPlaylist = [];          // [{ name, blob }] - match background songs
let currentSongIndex = 0;
let matchSongIndex = 0;
let playingFromMusicPlayer = false; // true when current song is from the music player playlist
let playQueue = [];              // shuffled indices into playlist
let matchPlayQueue = [];         // shuffled indices into matchPlaylist
let isMusicFadingOut = false;
let isMusicDucked = false;
let activeEventSounds = new Set();
let musicVolumeTransitionInterval = null;
let currentObjectUrl = null;     // active blob: URL, revoked on next song
let adminPages = {};             // pagination state for admin song list sections
let queuePage = 1;               // pagination state for Song Queue

function generatePlayQueue() {
  const indices = Array.from({ length: playlist.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  playQueue = indices;
  currentSongIndex = 0;
}

function generateMatchPlayQueue() {
  const indices = Array.from({ length: matchPlaylist.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  matchPlayQueue = indices;
  matchSongIndex = 0;
}

function getCurrentSong() {
  if (playlist.length === 0) return null;
  if (playQueue.length === 0) generatePlayQueue();
  return playlist[playQueue[currentSongIndex]];
}

function getCurrentMatchSong() {
  if (matchPlaylist.length === 0) return null;
  if (matchPlayQueue.length === 0) generateMatchPlayQueue();
  return matchPlaylist[matchPlayQueue[matchSongIndex]];
}

// ----------------------------------------------------
// Song Import (avoids CORS on file://)                */
// ----------------------------------------------------
const songFileInput = document.getElementById('song-file-input');
songFileInput.setAttribute('multiple', '');

async function extractMetadataFromFile(file) {
  try {
    const buffer = await file.slice(0, 2 * 1024 * 1024).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2]) !== 'ID3') return { cover: null, title: null, artist: null };
    const majorVer = bytes[3];
    const tagSize = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    let offset = 10;
    const tagEnd = Math.min(offset + tagSize, bytes.length);
    const decoder = new TextDecoder();
    let cover = null;
    let title = null;
    let artist = null;
    while (offset + 10 <= tagEnd) {
      const frameId = decoder.decode(bytes.slice(offset, offset + 4));
      const sizeBytes = bytes.slice(offset + 4, offset + 8);
      const frameSize = majorVer >= 4
        ? (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3]
        : (sizeBytes[0] << 24) | (sizeBytes[1] << 16) | (sizeBytes[2] << 8) | sizeBytes[3];
      const frameEnd = Math.min(offset + 10 + frameSize, tagEnd);
      if (frameId === 'APIC' && frameSize > 4 && !cover) {
        let pos = offset + 10;
        const encoding = bytes[pos]; pos++;
        let mimeStart = pos;
        while (pos < frameEnd && bytes[pos] !== 0) pos++;
        const mime = decoder.decode(bytes.slice(mimeStart, pos));
        pos++;
        pos++;
        if (encoding === 0 || encoding === 3) {
          while (pos < frameEnd && bytes[pos] !== 0) pos++;
          pos++;
        } else {
          while (pos + 1 < frameEnd && !(bytes[pos] === 0 && bytes[pos+1] === 0)) pos += 2;
          pos += 2;
        }
        if (pos < frameEnd) {
          const imgBytes = bytes.slice(pos, frameEnd);
          const imgBlob = new Blob([imgBytes], { type: mime || 'image/jpeg' });
          cover = URL.createObjectURL(imgBlob);
        }
      } else if ((frameId === 'TIT2' || frameId === 'TPE1') && frameSize > 1) {
        let pos = offset + 10;
        const encoding = bytes[pos]; pos++;
        const textBuf = bytes.slice(pos, frameEnd);
        let value;
        if (encoding === 1 || encoding === 2) {
          value = new TextDecoder('utf-16le').decode(textBuf).replace(/\0.*$/, '').trim();
        } else {
          value = decoder.decode(textBuf).replace(/\0.*$/, '').trim();
        }
        if (frameId === 'TIT2') title = value;
        else artist = value;
      }
      offset = frameEnd;
    }
    return { cover, title, artist };
  } catch(e) { return { cover: null, title: null, artist: null }; }
}

songFileInput.addEventListener('change', async () => {
  const files = Array.from(songFileInput.files);
  songFileInput.value = '';
  const results = await Promise.all(files.map(async f => {
    const name = f.name.replace(/\.(mp3|wav|ogg|flac|m4a)$/i, '');
    if (matchPlaylist.some(s => s.name === name && s.blob === f)) return null;
    const meta = await extractMetadataFromFile(f);
    return { name, blob: f, cover: meta.cover, title: meta.title, artist: meta.artist, source: 'import' };
  }));
  results.forEach(s => { if (s) matchPlaylist.push(s); });
  renderPlaylistUI();
  saveMatchSongsToDB();
});

const folderInput = document.getElementById('folder-input');
if (folderInput) {
  folderInput.addEventListener('change', async () => {
    const files = Array.from(folderInput.files).filter(f => /\.(mp3|wav|ogg|flac|m4a)$/i.test(f.name));
    folderInput.value = '';
    if (files.length === 0) return;
    const results = await Promise.all(files.map(async f => {
      const name = f.name.replace(/\.(mp3|wav|ogg|flac|m4a)$/i, '');
      if (playlist.some(s => s.name === name && s.blob === f)) return null;
      const folderName = (f.webkitRelativePath || '').split('/')[0] || 'Unknown Folder';
      const meta = await extractMetadataFromFile(f);
      return { name, blob: f, cover: meta.cover, title: meta.title, artist: meta.artist, source: 'folder:' + folderName };
    }));
    results.forEach(s => { if (s) playlist.push(s); });
    renderPlaylistUI();
    renderMusicPlaylist();
    saveSongsToDB();
  });
}

// ----------------------------------------------------
// IndexedDB persistence for imported songs             */
// ----------------------------------------------------
const DB_NAME = 'FRCTimerMusic';
const DB_VERSION = 2;
const STORE_NAME = 'songs';
const MATCH_STORE_NAME = 'matchSongs';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db2 = req.result;
      if (!db2.objectStoreNames.contains(STORE_NAME)) {
        const store = db2.createObjectStore(STORE_NAME, { keyPath: 'name' });
        store.createIndex('name', 'name', { unique: true });
      }
      if (!db2.objectStoreNames.contains(MATCH_STORE_NAME)) {
        db2.createObjectStore(MATCH_STORE_NAME, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

async function saveSongsToDB() {
  try {
    const d = await openDB();
    const tx = d.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const song of playlist) {
      store.put({ name: song.name, blob: song.blob, source: song.source || 'folder', title: song.title || null, artist: song.artist || null });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

async function saveMatchSongsToDB() {
  try {
    const d = await openDB();
    const tx = d.transaction(MATCH_STORE_NAME, 'readwrite');
    const store = tx.objectStore(MATCH_STORE_NAME);
    store.clear();
    for (const song of matchPlaylist) {
      store.put({ name: song.name, blob: song.blob, source: song.source || 'import', title: song.title || null, artist: song.artist || null });
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

async function loadSongsFromDB() {
  try {
    const d = await openDB();
    const tx = d.transaction([STORE_NAME, MATCH_STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (all && all.length > 0) {
      playlist = all.map(entry => ({ name: entry.name, blob: entry.blob, cover: null, title: entry.title || null, artist: entry.artist || null, source: entry.source || 'folder' }));
      Promise.all(playlist.map(async s => {
        const meta = await extractMetadataFromFile(s.blob);
        s.cover = meta.cover;
        if (meta.title) s.title = meta.title;
        if (meta.artist) s.artist = meta.artist;
      }));
    }
    const matchStore = tx.objectStore(MATCH_STORE_NAME);
    const allMatch = await new Promise((resolve, reject) => {
      const req = matchStore.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (allMatch && allMatch.length > 0) {
      matchPlaylist = allMatch.map(entry => ({ name: entry.name, blob: entry.blob, cover: null, title: entry.title || null, artist: entry.artist || null, source: entry.source || 'import' }));
      Promise.all(matchPlaylist.map(async s => {
        const meta = await extractMetadataFromFile(s.blob);
        s.cover = meta.cover;
        if (meta.title) s.title = meta.title;
        if (meta.artist) s.artist = meta.artist;
      }));
    }
  } catch (e) {}
  renderMusicPlaylist();
}

function removeSongFromPlaylist(index) {
  playlist.splice(index, 1);
  renderPlaylistUI();
  saveSongsToDB();
}

function removeMatchSong(index) {
  matchPlaylist.splice(index, 1);
  renderPlaylistUI();
  saveMatchSongsToDB();
}

function clearAllSongs() {
  if (matchPlaylist.length === 0 && playlist.length === 0) return;
  if (!confirm('Remove all songs from the match and player playlists?')) return;
  matchPlaylist.length = 0;
  playlist.length = 0;
  if (matchMusicAudio) { matchMusicAudio.pause(); matchMusicAudio.src = ''; }
  if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
  adminPages = {};
  queuePage = 1;
  renderPlaylistUI();
  updateMusicPlayerUI();
  saveMatchSongsToDB();
  saveSongsToDB();
}

const ADMIN_PAGE_SIZE = 13;
const MATCH_PAGE_SIZE = 14;

function renderPlaylistUI() {
  const container = document.getElementById('music-song-list');
  if (!container) return;
  if (matchPlaylist.length === 0) {
    container.innerHTML = '<div style="color:#888;font-style:italic;padding:4px 0;">No match songs imported yet. Click Import MP3 below.</div>' +
      '<div style="margin-top:6px;display:flex;gap:4px;">' +
        '<button class="btn btn-small" onclick="document.getElementById(\'song-file-input\').click()" style="flex:1;">Import MP3</button>' +
        '<button class="btn btn-small btn-danger" onclick="clearAllSongs()" style="flex:1;">Clear All</button>' +
      '</div>';
    return;
  }

  const imported = matchPlaylist.filter(s => s.source === 'import');
  const folderSongs = matchPlaylist.filter(s => s.source && s.source.startsWith('folder:'));
  const folderGroups = {};
  folderSongs.forEach(s => {
    const fName = s.source.replace('folder:', '');
    if (!folderGroups[fName]) folderGroups[fName] = [];
    folderGroups[fName].push(s);
  });

  let html = '';
  const renderSection = (title, songs, pageKey) => {
    if (songs.length === 0) return;
    const totalPages = Math.max(1, Math.ceil(songs.length / MATCH_PAGE_SIZE));
    if (!adminPages[pageKey]) adminPages[pageKey] = 1;
    if (adminPages[pageKey] > totalPages) adminPages[pageKey] = totalPages;
    const page = adminPages[pageKey];
    const start = (page - 1) * MATCH_PAGE_SIZE;
    const pageSongs = songs.slice(start, start + MATCH_PAGE_SIZE);

    if (title) html += '<div style="font-size:10px;color:#b0b0b0;margin:6px 0 2px 0;font-weight:600;">' + title + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;">';
    html += pageSongs.map((s) => {
      const realIdx = matchPlaylist.indexOf(s);
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 4px;background:rgba(255,255,255,0.03);border-radius:3px;">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:10px;">' + (s.title || s.name) + '</span>' +
        '<a href="#" onclick="removeMatchSong(' + realIdx + ');return false;" style="color:#ff5252;font-weight:600;font-size:10px;flex-shrink:0;margin-left:4px;">✕</a>' +
      '</div>';
    }).join('');
    html += '</div>';

    if (totalPages > 1) {
      html += '<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:4px;font-size:10px;">' +
        '<a href="#" onclick="adminPages[\'' + pageKey + '\'] = Math.max(1, adminPages[\'' + pageKey + '\'] - 1);renderPlaylistUI();return false;" style="color:#888;text-decoration:none;' + (page <= 1 ? 'pointer-events:none;opacity:0.3;' : '') + '">◀ Prev</a>' +
        '<span style="color:#ccc;">' + page + ' / ' + totalPages + '</span>' +
        '<a href="#" onclick="adminPages[\'' + pageKey + '\'] = Math.min(' + totalPages + ', adminPages[\'' + pageKey + '\'] + 1);renderPlaylistUI();return false;" style="color:#888;text-decoration:none;' + (page >= totalPages ? 'pointer-events:none;opacity:0.3;' : '') + '">Next ▶</a>' +
      '</div>';
    }
  };

  if (imported.length > 0) renderSection('', imported, 'imported');
  Object.keys(folderGroups).sort().forEach(fName => {
    renderSection('Folder: ' + fName, folderGroups[fName], 'match_' + fName.replace(/\s+/g, '_'));
  });

  html += '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;display:flex;gap:4px;">' +
    '<button class="btn btn-small" onclick="document.getElementById(\'song-file-input\').click()" style="flex:1;">Import MP3</button>' +
    '<button class="btn btn-small btn-danger" onclick="clearAllSongs()" style="flex:1;">Clear All</button>' +
  '</div>';

  container.innerHTML = html;
}

function loadAndPlaySong(song) {
  if (!song) return;
  playingFromMusicPlayer = true;
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(song.blob);
  matchMusicAudio.src = currentObjectUrl;
  matchMusicAudio.volume = isMusicDucked ? MUSIC_VOLUME * 0.5 : MUSIC_VOLUME;
  matchMusicAudio.play().catch(e => console.log('Music playback error:', e));
  if (window.audioVisualizer) {
    window.audioVisualizer.loadAndDecodeSong(song.blob);
  }
}

function playNextSong() {
  isMusicFadingOut = false;
  if (playlist.length === 0) return;
  if (playQueue.length === 0) generatePlayQueue();
  currentSongIndex = (currentSongIndex + 1) % playQueue.length;
  loadAndPlaySong(getCurrentSong());
  updateMusicPlayerUI();
}

function loadAndPlayMatchSong(song) {
  if (!song) return;
  playingFromMusicPlayer = false;
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(song.blob);
  matchMusicAudio.src = currentObjectUrl;
  matchMusicAudio.volume = isMusicDucked ? MUSIC_VOLUME * 0.5 : MUSIC_VOLUME;
  matchMusicAudio.load();
  if (window.audioVisualizer && window.audioVisualizer.audioCtx && window.audioVisualizer.audioCtx.state === 'suspended') {
    window.audioVisualizer.audioCtx.resume();
  }
  matchMusicAudio.play().catch(() => {
    matchMusicAudio.addEventListener('canplaythrough', () => {
      matchMusicAudio.play().catch(() => {});
    }, { once: true });
  });
  if (window.audioVisualizer) {
    window.audioVisualizer.loadAndDecodeSong(song.blob);
  }
}

function playNextMatchSong() {
  isMusicFadingOut = false;
  if (matchPlaylist.length === 0) return;
  if (matchPlayQueue.length === 0) generateMatchPlayQueue();
  matchSongIndex = (matchSongIndex + 1) % matchPlayQueue.length;
  loadAndPlayMatchSong(getCurrentMatchSong());
}

function stopMatchMusicImmediately() {
  clearInterval(musicVolumeTransitionInterval);
  isMusicFadingOut = false;
  playingFromMusicPlayer = false;
  if (matchMusicAudio) {
    matchMusicAudio.pause();
    matchMusicAudio.currentTime = 0;
    matchMusicAudio.src = '';
  }
  if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
}

function updateMusicPlayPauseButton() {}

function fadeOutMatchMusic(durationMs = 2000, onDone) {
  if (!matchMusicAudio || matchMusicAudio.paused) { if (onDone) onDone(); return; }
  clearInterval(musicVolumeTransitionInterval);
  isMusicFadingOut = true;
  const startVolume = matchMusicAudio.volume;
  const startTime = performance.now();
  function fade() {
    if (!isMusicFadingOut) return;
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    matchMusicAudio.volume = startVolume * (1 - progress);
    if (progress < 1) {
      requestAnimationFrame(fade);
    } else {
      matchMusicAudio.pause();
      matchMusicAudio.src = '';
      isMusicFadingOut = false;
      if (onDone) onDone();
    }
  }
  requestAnimationFrame(fade);
}

function transitionMusicVolume(targetVolume, durationMs = 300) {
  if (!matchMusicAudio || matchMusicAudio.paused || isMusicFadingOut) return;
  clearInterval(musicVolumeTransitionInterval);
  const startVolume = matchMusicAudio.volume;
  const startTime = performance.now();
  musicVolumeTransitionInterval = setInterval(() => {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    matchMusicAudio.volume = startVolume + (targetVolume - startVolume) * progress;
    if (progress >= 1) clearInterval(musicVolumeTransitionInterval);
  }, 30);
}

function duckMusicForEventSound(audio) {
  if (!audio || activeEventSounds.has(audio)) return;
  activeEventSounds.add(audio);
  updateMusicDucking();
  const onEndedOrPaused = () => {
    activeEventSounds.delete(audio);
    updateMusicDucking();
    audio.removeEventListener('ended', onEndedOrPaused);
    audio.removeEventListener('pause', onEndedOrPaused);
  };
  audio.addEventListener('ended', onEndedOrPaused);
  audio.addEventListener('pause', onEndedOrPaused);
}

function updateMusicDucking() {
  if (activeEventSounds.size > 0) {
    isMusicDucked = true;
    transitionMusicVolume(MUSIC_VOLUME * 0.15);
  } else {
    isMusicDucked = false;
    transitionMusicVolume(MUSIC_VOLUME);
  }
}

// Auto-advance song when ended
matchMusicAudio.addEventListener('ended', () => {
  if (timerState !== 'READY' && timerState !== 'FINISHED') {
    playNextMatchSong();
  } else {
    playNextSong();
  }
});

// ----------------------------------------------------
// Alliance Configuration State                        */
// ----------------------------------------------------
let activeAlliance = 'blue'; // blue or red

let allianceName = '';
let allianceNumber = '';
let highScore = 0;

// Configurations initialized to empty strings (blank defaults)
const allianceConfigs = {
  blue: { score: 0 },
  red: { score: 0 }
};

function renderScoreboard() {
  const config = allianceConfigs[activeAlliance];

  // Update scoreboard elements styling and classes
  detailsPanel.className = `alliance-details ${activeAlliance}`;
  scoreBoxDisplay.className = `score-box ${activeAlliance}`;

  // Update alliance switch button color
  document.getElementById('alliance-switch-btn').className = `alliance-switch-btn alliance-${activeAlliance}`;

  // Update text displays
  allianceNameDisplay.textContent = allianceName.toUpperCase();
  teamNumDisplay.textContent = allianceNumber;
  loadTeamAvatar(allianceNumber);
  fetchTeamName(allianceNumber);
  renderScoreDigits(config.score);

  document.getElementById('highscore-badge').textContent = `HIGH SCORE ${highScore}`;
  updateScoringPermissionUI();
}

const MAX_SCORE_DIGITS = 3;

// Team avatar cache
let _avatarCache = {};

let _teamNameCache = {};

const TBA_API_KEY = '6CAguRxIO4S1HDdcrbWTOR0VGI7vcawwvHV2epLH4lQSU7FAsJemIHSGl0eFHJpf';

async function fetchTeamName(number) {
  const nameInput = document.getElementById('active-alliance-name-display');
  if (!number || _teamNameCache[number] === null) return;
  if (_teamNameCache[number]) {
    allianceName = _teamNameCache[number];
    nameInput.textContent = allianceName.toUpperCase();
    saveSettings();
    return;
  }
  try {
    const res = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${encodeURIComponent(number)}`, {
      headers: { 'X-TBA-Auth-Key': TBA_API_KEY }
    });
    if (!res.ok) { _teamNameCache[number] = null; return; }
    const data = await res.json();
    const name = data.nickname || null;
    if (name) {
      _teamNameCache[number] = name;
      allianceName = name;
      nameInput.textContent = allianceName.toUpperCase();
      saveSettings();
    } else {
      _teamNameCache[number] = null;
    }
  } catch (_) {
    _teamNameCache[number] = null;
  }
}

function loadTeamAvatar(number) {
  const img = document.getElementById('team-avatar');
  if (!number) { img.style.display = 'none'; img.src = ''; return; }
  if (_avatarCache[number] === null) { img.style.display = 'none'; return; }
  if (_avatarCache[number]) { img.src = _avatarCache[number]; img.style.display = 'inline'; return; }

  const year = new Date().getFullYear();
  const url = `https://www.thebluealliance.com/avatar/${year}/frc${encodeURIComponent(number)}.png`;
  const test = new Image();
  test.onload = () => { _avatarCache[number] = url; img.src = url; img.style.display = 'inline'; };
  test.onerror = () => { _avatarCache[number] = null; img.style.display = 'none'; };
  test.src = url;
}

function formatScoreDigits(score) {
  const clamped = Math.max(0, Math.min(score, 999));
  const digits = clamped.toString().split('');
  const padding = Math.max(0, MAX_SCORE_DIGITS - digits.length);
  return Array(padding).fill('').concat(digits);
}

function renderScoreDigits(score, previousScore = null) {
  const newDigits = formatScoreDigits(score);
  const oldDigits = previousScore === null ? newDigits : formatScoreDigits(previousScore);

  scoreBoxDisplay.innerHTML = '';

  newDigits.forEach((digit, index) => {
    const wrapper = document.createElement('span');
    wrapper.className = 'score-digit-slot';

    const current = document.createElement('span');
    current.className = 'score-digit score-digit-current';
    if (previousScore !== null && digit !== oldDigits[index]) {
      current.classList.add('score-digit-new');
    }
    current.textContent = digit;
    wrapper.appendChild(current);

    if (previousScore !== null && digit !== oldDigits[index]) {
      const outgoing = document.createElement('span');
      outgoing.className = 'score-digit score-digit-old';
      outgoing.textContent = oldDigits[index];
      wrapper.appendChild(outgoing);
      outgoing.addEventListener('animationend', () => outgoing.remove(), { once: true });
    }

    scoreBoxDisplay.appendChild(wrapper);
  });
}

// ----------------------------------------------------
// Match counter state
let currentMatchNumber = 1;
let totalMatchCount = 10;

function updateMatchSubtitle() {
  matchSubDisplay.innerHTML = `Match <span id="match-current-editable">${currentMatchNumber}</span> of <span id="match-total-editable">${totalMatchCount}</span>`;
}

// localStorage Persistence                            */
// ----------------------------------------------------
const STORAGE_KEY = 'frc-scoreboard-settings';

let scoreHistory = [];
let scorePerShift = {
  auto: 0,
  transition: 0,
  shift1: 0,
  shift2: 0,
  shift3: 0,
  shift4: 0,
  endgame: 0
};
let graphMarkers = [];
let scoreSampleInterval = null;
let matchStartTimestamp = null;
let postMatchAllowed = false;
let postMatchCutoffTimeout = null;

function getCurrentShiftKey() {
  if (timerState === 'AUTO') return 'auto';
  if (timerState === 'TRANSITION') return 'transition';
  if (timerState === 'TELEOP') {
    if (timeLeft > 105) return 'shift1';
    if (timeLeft > 80) return 'shift2';
    if (timeLeft > 55) return 'shift3';
    if (timeLeft > 30) return 'shift4';
    return 'endgame';
  }
  if (timerState === 'FINISHED' && postMatchAllowed) {
    return 'endgame';
  }
  return null;
}

function getShiftLabel(shiftKey) {
  switch (shiftKey) {
    case 'auto': return 'Auto';
    case 'transition': return 'Transition';
    case 'shift1': return 'Shift 1';
    case 'shift2': return 'Shift 2';
    case 'shift3': return 'Shift 3';
    case 'shift4': return 'Shift 4';
    case 'endgame': return 'Endgame';
    default: return 'Other';
  }
}

function getAllowedShiftKeys() {
  const teleopShifts = activeAlliance === 'blue'
    ? ['shift1', 'shift3', 'endgame']
    : ['shift2', 'shift4', 'endgame'];
  return ['auto', 'transition', ...teleopShifts];
}

function resetScoreTracking() {
  scoreHistory = [{ time: 0, score: allianceConfigs[activeAlliance].score }];
  scorePerShift = { auto: 0, transition: 0, shift1: 0, shift2: 0, shift3: 0, shift4: 0, endgame: 0 };
  graphMarkers = [];
  matchStartTimestamp = Date.now();
  postMatchAllowed = false;
  if (postMatchCutoffTimeout) {
    clearTimeout(postMatchCutoffTimeout);
    postMatchCutoffTimeout = null;
  }
  stopScoreSampling();
}

function startScoreSampling() {
  stopScoreSampling();
  scoreSampleInterval = setInterval(recordScoreSample, 5000);
}

function stopScoreSampling() {
  if (scoreSampleInterval !== null) {
    clearInterval(scoreSampleInterval);
    scoreSampleInterval = null;
  }
}

function recordScoreSample() {
  if (matchStartTimestamp === null) return;
  const elapsed = Math.round((Date.now() - matchStartTimestamp) / 1000);
  scoreHistory.push({ time: elapsed, score: allianceConfigs[activeAlliance].score });
}

function logScoreChange(delta) {
  const shiftKey = getCurrentShiftKey();
  if (!shiftKey) return;
  scorePerShift[shiftKey] = Math.max(0, (scorePerShift[shiftKey] || 0) + delta);
}

function renderEndScreen() {
  updateShiftSummaryTable();
  const overlay = document.getElementById('end-screen-overlay');
  overlay.classList.remove('hidden');
  drawScoreGraph();
}

function updateHighScore() {
  const currentScore = allianceConfigs[activeAlliance].score;
  if (currentScore > highScore) {
    highScore = currentScore;
    saveSettings();
  }
  const badge = document.getElementById('highscore-badge');
  if (badge) badge.textContent = `HIGH SCORE ${highScore}`;
}

function initializeEndScreenGraph() {
  setupGraphInteractions();
  const highscoreBadge = document.getElementById('highscore-badge');
  if (highscoreBadge) {
    highscoreBadge.addEventListener('click', () => {
      const confirmed = confirm('Reset highscore?');
      if (confirmed) {
        highScore = 0;
        saveSettings();
        renderScoreboard();
      }
    });
  }
}

function closeEndScreen() {
  document.getElementById('end-screen-overlay').classList.add('hidden');
}

function updateShiftSummaryTable() {
  const table = document.getElementById('shift-summary-table');
  table.innerHTML = '';
  const header = document.createElement('tr');
  header.innerHTML = '<th>Shift</th><th>Score</th>';
  table.appendChild(header);

  const allowedShifts = getAllowedShiftKeys();
  let total = 0;

  allowedShifts.forEach((shiftKey) => {
    const row = document.createElement('tr');
    const rowScore = scorePerShift[shiftKey] || 0;
    total += rowScore;
    row.innerHTML = `<td>${getShiftLabel(shiftKey)}</td><td>${rowScore}</td>`;
    table.appendChild(row);
  });

  const totalRow = document.createElement('tr');
  totalRow.innerHTML = `<th>Total</th><th>${total}</th>`;
  table.appendChild(totalRow);
}

function getTimeframeLabel(elapsed) {
  if (elapsed <= autoDuration) return 'Auto';
  if (elapsed <= autoDuration + transitionDuration) return 'Transition';
  const teleopElapsed = elapsed - autoDuration - transitionDuration;
  if (teleopElapsed <= 25) return 'Shift 1';
  if (teleopElapsed <= 50) return 'Shift 2';
  if (teleopElapsed <= 75) return 'Shift 3';
  if (teleopElapsed <= 100) return 'Shift 4';
  return 'Endgame';
}

function formatMatchClock(elapsed) {
  if (elapsed <= autoDuration) {
    return `${formatTime(autoDuration - elapsed)}`;
  }
  if (elapsed <= autoDuration + transitionDuration) {
    return `${formatTime(autoDuration + transitionDuration - elapsed)}`;
  }
  const teleopElapsed = elapsed - autoDuration - transitionDuration;
  return formatTime(teleopDuration - teleopElapsed);
}

function drawScoreGraph() {
  const canvas = document.getElementById('score-graph-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.floor(rect.width);
  const displayHeight = Math.floor(rect.height);

  if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, displayWidth, displayHeight);
  graphMarkers = [];

  if (!scoreHistory.length) return;

  const maxScore = Math.max(...scoreHistory.map((entry) => entry.score), 1);
  const maxTime = Math.max(...scoreHistory.map((entry) => entry.time), autoDuration + transitionDuration + teleopDuration);
  const padding = 48;
  const innerWidth = displayWidth - padding * 2;
  const innerHeight = displayHeight - padding * 2;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, displayHeight);
  bgGradient.addColorStop(0, '#101316');
  bgGradient.addColorStop(1, '#0a0d11');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + (innerHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(displayWidth - padding, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#9aa6b8';
  ctx.font = '12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Score', padding - 2, padding - 14);
  ctx.textAlign = 'center';
  ctx.fillText('Time', displayWidth / 2, displayHeight - 14);

  const lineColor = activeAlliance === 'blue' ? '#68b0ff' : '#ff7b7b';
  const markerColor = activeAlliance === 'blue' ? '#8ad1ff' : '#ff9393';
  const fillGradient = ctx.createLinearGradient(0, padding, 0, displayHeight - padding);
  fillGradient.addColorStop(0, lineColor + '44');
  fillGradient.addColorStop(1, '#0d101500');

  const points = scoreHistory.map((entry) => {
    const x = padding + (entry.time / maxTime) * innerWidth;
    const y = displayHeight - padding - (entry.score / maxScore) * innerHeight;
    return {
      ...entry,
      x,
      y,
      timeframe: getTimeframeLabel(entry.time),
      clock: formatMatchClock(entry.time)
    };
  });

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 3;
  ctx.shadowColor = lineColor;
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(points[0].x, displayHeight - padding);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points[points.length - 1].x, displayHeight - padding);
  ctx.closePath();
  ctx.fillStyle = fillGradient;
  ctx.fill();

  points.forEach((point) => {
    ctx.fillStyle = markerColor;
    ctx.strokeStyle = '#0d1015';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1115';
    ctx.fill();

    graphMarkers.push(point);
  });
}

function showGraphTooltip(event, marker) {
  const tooltip = document.getElementById('graph-tooltip');
  if (!tooltip || !marker) return;

  tooltip.textContent = `${marker.score} pts · ${marker.timeframe} · ${marker.clock}`;
  tooltip.classList.remove('hidden');
  tooltip.classList.add('visible');

  const tooltipRect = tooltip.getBoundingClientRect();
  let left = event.clientX + 16;
  let top = event.clientY + 16;
  if (left + tooltipRect.width > window.innerWidth - 12) {
    left = event.clientX - tooltipRect.width - 16;
  }
  if (top + tooltipRect.height > window.innerHeight - 12) {
    top = event.clientY - tooltipRect.height - 16;
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideGraphTooltip() {
  const tooltip = document.getElementById('graph-tooltip');
  if (!tooltip) return;
  tooltip.classList.add('hidden');
  tooltip.classList.remove('visible');
}

function setupGraphInteractions() {
  const canvas = document.getElementById('score-graph-canvas');
  if (!canvas) return;
  canvas.addEventListener('mousemove', (event) => {
    if (!graphMarkers.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let hovered = null;
    for (const marker of graphMarkers) {
      const dx = x - marker.x;
      const dy = y - marker.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 12) {
        hovered = marker;
        break;
      }
    }
    if (hovered) {
      showGraphTooltip(event, hovered);
      canvas.style.cursor = 'pointer';
    } else {
      hideGraphTooltip();
      canvas.style.cursor = 'default';
    }
  });
  canvas.addEventListener('mouseleave', hideGraphTooltip);
}

function finalizeMatchTracking() {
  recordScoreSample();
  stopScoreSampling();
  updateHighScore();
  renderEndScreen();
  if (currentMatchNumber < totalMatchCount) {
    currentMatchNumber++;
    updateMatchSubtitle();
    saveSettings();
  }
}

function saveSettings() {
  const data = {
    matchName: matchNameDisplay.textContent,
    matchSub: matchSubDisplay.textContent,
    activeAlliance,
    currentMatchNumber,
    totalMatchCount,
    allianceName,
    allianceNumber,
    highScore
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSettings() {
  let data;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e) {}
  if (!data) return;

  // Restore alliance configs (legacy per-color format for migration)
  if (data.blue && data.red && data.allianceName === undefined) {
    allianceName = data.blue.name || '';
    allianceNumber = data.blue.number || '';
    highScore = Math.max(data.blue.highScore || 0, data.red.highScore || 0);
  } else {
    if (data.allianceName !== undefined) allianceName = data.allianceName;
    if (data.allianceNumber !== undefined) allianceNumber = data.allianceNumber;
    if (data.highScore !== undefined) highScore = data.highScore;
  }
  if (data.activeAlliance) {
    activeAlliance = data.activeAlliance;
  }

  // Restore match header
  if (data.matchName !== undefined) {
    matchNameDisplay.textContent = data.matchName;
  }
  if (data.matchSub !== undefined) {
    matchSubDisplay.textContent = data.matchSub;
  }
  if (data.currentMatchNumber !== undefined) {
    currentMatchNumber = data.currentMatchNumber;
  }
  if (data.totalMatchCount !== undefined) {
    totalMatchCount = data.totalMatchCount;
  }
}

// Input handlers in Admin Panel to save changes
function toggleAlliance() {
  const bar = document.getElementById('alliance-bar');
  const DURATION = 200;
  bar.style.transition = `transform ${DURATION}ms ease`;
  bar.style.transform = 'scaleY(0)';

  setTimeout(() => {
    activeAlliance = activeAlliance === 'blue' ? 'red' : 'blue';
    renderScoreboard();
    bar.style.transition = 'none';
    void bar.offsetWidth;
    bar.style.transition = `transform ${DURATION}ms ease`;
    bar.style.transform = 'scaleY(1)';
  }, DURATION);

  setTimeout(() => {
    bar.style.transition = '';
    bar.style.transform = '';
    saveSettings();
  }, DURATION * 2);
}
function makeEditable(el, onSave) {
  el.addEventListener('click', () => {
    if (el.isContentEditable) return;
    if (document.body.classList.contains('match-active')) return;
    const orig = el.textContent;
    el.contentEditable = 'plaintext-only';
    el.focus();
    const select = () => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    };
    select();
    const done = () => {
      el.contentEditable = 'false';
      const val = el.textContent.trim() || orig;
      el.textContent = val;
      onSave(val);
    };
    const cancel = () => {
      el.contentEditable = 'false';
      el.textContent = orig;
    };
    el.addEventListener('blur', done, { once: true });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
  });
}

makeEditable(matchNameDisplay, (val) => saveSettings());

// Edit match number or total via subtitle spans
matchSubDisplay.addEventListener('click', (e) => {
  if (document.body.classList.contains('match-active')) return;
  const span = e.target.closest('[id$="-editable"]');
  if (!span || span.isContentEditable) return;
  const isTotal = span.id === 'match-total-editable';
  const orig = span.textContent;
  span.contentEditable = 'plaintext-only';
  span.focus();
  const r = document.createRange();
  r.selectNodeContents(span);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
  const done = () => {
    span.contentEditable = 'false';
    const val = parseInt(span.textContent) || 1;
    if (isTotal) {
      totalMatchCount = Math.max(1, val);
    } else {
      currentMatchNumber = Math.max(1, val);
    }
    updateMatchSubtitle();
    saveSettings();
  };
  const cancel = () => {
    span.contentEditable = 'false';
    span.textContent = orig;
  };
  span.addEventListener('blur', done, { once: true });
  span.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
});

makeEditable(allianceNameDisplay, (val) => {
  allianceName = val;
  allianceNameDisplay.textContent = val.toUpperCase();
  saveSettings();
});

makeEditable(teamNumDisplay, (val) => {
  allianceNumber = val;
  teamNumDisplay.textContent = val;
  loadTeamAvatar(val);
  fetchTeamName(val);
  saveSettings();
});

// ----------------------------------------------------
// Timer State Machine & Core Match Logic               */
// ----------------------------------------------------
/*
  Custom Timing Rules:
  - READY: Displays 0:20 (Auto Start)
  - AUTO: 20 seconds. (Eligible to score)
  - TRANSITION: 10 seconds. (Eligible to score)
  - TELEOP (Shifts & Endgame): 130 seconds continuous countdown (2:10 to 0:00).
    - Shift 1: 25s (2:10 to 1:45 / 130 to 105s remaining) -> Blue Only Eligible
    - Shift 2: 25s (1:45 to 1:20 / 105 to 80s remaining) -> Red Only Eligible
    - Shift 3: 25s (1:20 to 0:55 / 80 to 55s remaining) -> Blue Only Eligible
    - Shift 4: 25s (0:55 to 0:30 / 55 to 30s remaining) -> Red Only Eligible
    - Endgame: 30s (0:30 to 0:00 / 30 to 0s remaining) -> Both Eligible to score
  - FINISHED: Match ends.
*/
let timerState = 'READY'; // READY, AUTO, TRANSITION, TELEOP, FINISHED
let timeLeft = 20;
let timerInterval = null;
let timerRunning = false; // explicit flag — more reliable than testing timerInterval ID

// Constant Match rules durations
const autoDuration = 20;
const transitionDuration = 10;
const teleopDuration = 130;

// Format seconds as M:SS
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Helper: Check if scoring is allowed for an alliance in the current state
function isAllianceScoringAllowed(alliance) {
  if (timerState === 'READY') return false;

  if (timerState === 'FINISHED') {
    return postMatchAllowed;
  }

  if (timerState === 'TELEOP') {
    if (timeLeft > 105) { // Shift 1 (130 to 105): Blue only
      return alliance === 'blue';
    } else if (timeLeft > 80) { // Shift 2 (105 to 80): Red only
      return alliance === 'red';
    } else if (timeLeft > 55) { // Shift 3 (80 to 55): Blue only
      return alliance === 'blue';
    } else if (timeLeft > 30) { // Shift 4 (55 to 30): Red only
      return alliance === 'red';
    }
    return true; // Endgame (30 to 0): Both can score
  }
  return true;
}

// Gray out scoreboard when scoring isn't allowed for the active alliance
function updateScoringPermissionUI() {
  if (timerState === 'READY') {
    detailsPanel.classList.remove('scoring-disabled', 'scoring-active');
    scoreBoxDisplay.classList.remove('scoring-disabled', 'scoring-active');
    return;
  }
  const allowed = isAllianceScoringAllowed(activeAlliance);
  if (allowed) {
    detailsPanel.classList.remove('scoring-disabled');
    detailsPanel.classList.add('scoring-active');
    scoreBoxDisplay.classList.remove('scoring-disabled');
    scoreBoxDisplay.classList.add('scoring-active');
  } else {
    detailsPanel.classList.remove('scoring-active');
    detailsPanel.classList.add('scoring-disabled');
    scoreBoxDisplay.classList.remove('scoring-active');
    scoreBoxDisplay.classList.add('scoring-disabled');
  }
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : '0, 0, 0';
}

// Update the live timer visual interface
function updateTimerUI() {
  timerDisplay.textContent = formatTime(timeLeft);

  let currentMaxTime = 1;
  let phaseColor = '#777777';
  let phaseText = 'MATCH';
  let pct = 0;

  if (timerState === 'READY') {
    currentMaxTime = autoDuration;
    timeLeft = autoDuration;
    timerDisplay.textContent = formatTime(timeLeft);
    phaseColor = '#e0a910'; // Amber/Gold
    phaseText = 'AUTO START';
    timerDisplay.classList.remove('timer-pulse');
    pct = 100;
  } else if (timerState === 'AUTO') {
    currentMaxTime = autoDuration;
    phaseColor = '#e0a910'; // Amber/Gold
    phaseText = 'AUTONOMOUS';
    timerDisplay.classList.remove('timer-pulse');
    timerDisplay.textContent = formatTime(timeLeft);
    pct = (timeLeft / currentMaxTime) * 100;
  } else if (timerState === 'TRANSITION') {
    currentMaxTime = transitionDuration;
    phaseColor = '#3880f4'; // Info Blue
    phaseText = 'TRANSITION';
    timerDisplay.classList.remove('timer-pulse');
    timerDisplay.textContent = formatTime(timeLeft);
    pct = (timeLeft / currentMaxTime) * 100;
  } else if (timerState === 'TELEOP') {
    currentMaxTime = teleopDuration;

    // Determine shifts vs endgame progress percentages, colors, and current shift remaining time
    if (timeLeft > 105) { // Shift 1
      phaseColor = '#0066b3'; // Blue theme
      phaseText = 'SHIFT 1';
      timerDisplay.classList.remove('timer-pulse');
      timerDisplay.textContent = formatTime(timeLeft - 105);
      pct = ((timeLeft - 105) / 25) * 100;
    } else if (timeLeft > 80) { // Shift 2
      phaseColor = '#cc0022'; // Red theme
      phaseText = 'SHIFT 2';
      timerDisplay.classList.remove('timer-pulse');
      timerDisplay.textContent = formatTime(timeLeft - 80);
      pct = ((timeLeft - 80) / 25) * 100;
    } else if (timeLeft > 55) { // Shift 3
      phaseColor = '#0066b3'; // Blue theme
      phaseText = 'SHIFT 3';
      timerDisplay.classList.remove('timer-pulse');
      timerDisplay.textContent = formatTime(timeLeft - 55);
      pct = ((timeLeft - 55) / 25) * 100;
    } else if (timeLeft > 30) { // Shift 4
      phaseColor = '#cc0022'; // Red theme
      phaseText = 'SHIFT 4';
      timerDisplay.classList.remove('timer-pulse');
      timerDisplay.textContent = formatTime(timeLeft - 30);
      pct = ((timeLeft - 30) / 25) * 100;
    } else { // Endgame (<= 30)
      phaseColor = '#ffc72c'; // Yellow/Gold warning
      phaseText = 'ENDGAME';
      timerDisplay.classList.add('timer-pulse');
      timerDisplay.textContent = formatTime(timeLeft);
      pct = (timeLeft / 30) * 100;
    }
  } else if (timerState === 'FINISHED') {
    currentMaxTime = 1;
    phaseColor = '#000000';
    phaseText = 'MATCH END';
    timerDisplay.classList.remove('timer-pulse');
    pct = 0;
  }

  phaseBanner.textContent = phaseText;
  phaseBanner.style.color = phaseColor;

  document.documentElement.style.setProperty('--phase-color', phaseColor);
  document.documentElement.style.setProperty('--phase-rgb', hexToRgb(phaseColor));

  timerBar.style.height = `${pct}%`;
}


// Set administrative status labels
function updateAdminStatus() {
  if (timerState === 'AUTO' || timerState === 'TRANSITION' || timerState === 'TELEOP') {
    startBtn.textContent = 'Pause Match';
    startBtn.className = 'btn btn-warning';
  } else {
    startBtn.textContent = 'Start Match';
    startBtn.className = 'btn btn-primary';
  }

  if (timerState === 'FINISHED') {
    startBtn.textContent = 'Match Completed';
    startBtn.className = 'btn btn-success';
    startBtn.disabled = false;
  } else {
    startBtn.disabled = false;
  }
}

// Core Timer Tick State Machine — drift-corrected with Date.now() anchoring
let tickOriginTime = null;   // Wall-clock ms when the current phase started
let tickOriginLeft = 0;      // timeLeft value at phase start

function scheduleNextTick() {
  if (!timerRunning) return; // timer was stopped

  const elapsed = Math.floor((Date.now() - tickOriginTime) / 1000);
  const newTimeLeft = Math.max(0, tickOriginLeft - elapsed);

  // Only act when the second actually changes
  if (newTimeLeft !== timeLeft) {
    const crossed = timeLeft; // value we're leaving
    timeLeft = newTimeLeft;

    // Trigger shift-change sound at shift boundaries in Teleop (after shifts 1-3 only)
    if (timerState === 'TELEOP') {
      if ((crossed > 105 && timeLeft <= 105) ||
          (crossed > 80  && timeLeft <= 80)  ||
          (crossed > 55  && timeLeft <= 55)) {
        playAudioClip('shiftChange');
      }
      if (crossed > 30 && timeLeft <= 30) {
        playAudioClip('warning');
      }
    }

    updateTimerUI();
    updateScoringPermissionUI();
  }

  if (timeLeft <= 0) {
    if (timerState === 'AUTO') {
      phaseBanner.textContent = 'AUTO END';
      phaseBanner.style.color = '#3880f4';
      playAudioClip('end');
      timerInterval = setTimeout(() => {
        if (!timerRunning) return;
        timerState = 'TRANSITION';
        timeLeft = transitionDuration;
        resetTickOrigin();
        playAudioClip('resume');
        updateTimerUI();
        updateAdminStatus();
        updateScoringPermissionUI();
        timerInterval = setTimeout(scheduleNextTick, 1000);
      }, 3000);
      return;
    } else if (timerState === 'TRANSITION') {
      timerState = 'TELEOP';
      timeLeft = teleopDuration;
      resetTickOrigin();
      playAudioClip('shiftChange');
      updateTimerUI();
      updateAdminStatus();
      updateScoringPermissionUI();
    } else if (timerState === 'TELEOP') {
      timerState = 'FINISHED';
      timeLeft = 0;
      timerRunning = false;
      timerInterval = null;
      playAudioClip('end');
      fadeOutMatchMusic(2000);
      postMatchAllowed = true;
      updateTimerUI();
      updateAdminStatus();
      updateScoringPermissionUI();
      postMatchCutoffTimeout = setTimeout(() => {
        postMatchAllowed = false;
        updateScoringPermissionUI();
        finalizeMatchTracking();
      }, 2000);
      return;
    }
  }

  // Schedule the next tick aligned to the next whole second boundary
  const msUntilNextSecond = 1000 - ((Date.now() - tickOriginTime) % 1000);
  timerInterval = setTimeout(scheduleNextTick, msUntilNextSecond);
}

function resetTickOrigin() {
  tickOriginTime = Date.now();
  tickOriginLeft = timeLeft;
}

// Start / Pause toggle function
function toggleTimer() {
  if (timerState === 'FINISHED') {
    const overlay = document.getElementById('end-screen-overlay');
    if (overlay.classList.contains('hidden')) {
      renderEndScreen();
    } else {
      closeEndScreen();
    }
    return;
  }

  if (timerInterval !== null) {
    // Pause timer
    timerRunning = false;
    clearTimeout(timerInterval);
    timerInterval = null;

    startBtn.textContent = 'Resume Match';
    startBtn.className = 'btn btn-primary';

    // Pause match music
    if (matchMusicAudio && !matchMusicAudio.paused) {
      matchMusicAudio.pause();
      updateMusicPlayPauseButton();
    }
  } else {
    // Start or Resume
    if (window.audioVisualizer) {
      window.audioVisualizer.initAudio();
    }

    if (timerState === 'READY') {
      timerState = 'AUTO';
      timeLeft = autoDuration; // 20s
      resetScoreTracking();
      startScoreSampling();
      playAudioClip('start'); // Charge sound

      // Start playing music (if any match songs)
      if (matchPlaylist.length > 0) {
        generateMatchPlayQueue();
        const startMatchMusic = () => loadAndPlayMatchSong(getCurrentMatchSong());
        if (matchMusicAudio && !matchMusicAudio.paused && matchMusicAudio.src !== '') {
          fadeOutMatchMusic(800, startMatchMusic);
        } else {
          startMatchMusic();
        }
      }
    } else {
      // Resume match music if paused
      if (matchMusicAudio && matchMusicAudio.paused && matchMusicAudio.src !== '') {
        matchMusicAudio.play().then(updateMusicPlayPauseButton).catch(() => {});
      }
    }

    resetTickOrigin();
    updateTimerUI();
    updateAdminStatus();
    updateScoringPermissionUI();
    timerRunning = true;
    timerInterval = setTimeout(scheduleNextTick, 1000);

    // Hide admin setup cards and center scoreboard on start
    document.body.classList.add('match-active');
  }
}

// Admin skip current phase button
function skipMatchPhase() {
  if (timerState === 'FINISHED') return;

  const wasRunning = timerInterval !== null;
  if (wasRunning) {
    clearTimeout(timerInterval);
    timerInterval = null;
  }

  if (timerState === 'READY') {
    timerState = 'AUTO';
    timeLeft = autoDuration;
    if (wasRunning) playAudioClip('start');
  } else if (timerState === 'AUTO') {
    timerState = 'TRANSITION';
    timeLeft = transitionDuration;
  } else if (timerState === 'TRANSITION') {
    timerState = 'TELEOP';
    timeLeft = teleopDuration;
    if (wasRunning) playAudioClip('resume');
  } else if (timerState === 'TELEOP') {
    // Skip through the Shifts
    if (timeLeft > 105) {
      timeLeft = 105; // Skip to Shift 2
      playAudioClip('warning');
    } else if (timeLeft > 80) {
      timeLeft = 80;  // Skip to Shift 3
      playAudioClip('warning');
    } else if (timeLeft > 55) {
      timeLeft = 55;  // Skip to Shift 4
      playAudioClip('warning');
    } else if (timeLeft > 30) {
      timeLeft = 30;  // Skip to Endgame
      playAudioClip('warning');
    } else {
      // Skip Endgame to end
      timeLeft = 0;
      timerState = 'FINISHED';
      playAudioClip('end');
      fadeOutMatchMusic(2000);
      updateTimerUI();
      updateAdminStatus();
      updateScoringPermissionUI();
      return;
    }
  }

  // Re-anchor tick origin and restart if was running
  if (wasRunning) {
    resetTickOrigin();
    timerRunning = true;
    timerInterval = setTimeout(scheduleNextTick, 1000);
  }

  updateTimerUI();
  updateAdminStatus();
  updateScoringPermissionUI();
}

// Reset Match scoreboard
function resetMatch() {
  if (timerInterval !== null) {
    clearTimeout(timerInterval);
    timerInterval = null;
  }
  if (postMatchCutoffTimeout !== null) {
    clearTimeout(postMatchCutoffTimeout);
    postMatchCutoffTimeout = null;
  }

  timerState = 'READY';
  timeLeft = autoDuration;
  timerRunning = false;
  tickOriginTime = null;
  tickOriginLeft = 0;

  // Stop music immediately on reset
  stopMatchMusicImmediately();

  resetScoreTracking();
  allianceConfigs.blue.score = 0;
  allianceConfigs.red.score = 0;

  renderScoreboard();
  updateTimerUI();
  updateAdminStatus();
  closeEndScreen();

  // Show setup panel and return scoreboard to top on reset
  document.body.classList.remove('match-active');
}

// ----------------------------------------------------
// Admin Panel Toggle                                  */
// ----------------------------------------------------
function toggleAdminPanel() {
  adminPanel.classList.toggle('hidden');
}

adminToggle.addEventListener('click', toggleMusicPlayer);

// ----------------------------------------------------
// Music Player (inline, replaces scoreboard)          */
// ----------------------------------------------------
// States: null (closed), 'full', 'compact'
let musicPlayerState = null;
let lastMusicPlayerState = 'full';

function setMusicPlayerState(state) {
  musicPlayerState = state;

  const banner = document.querySelector('.top-banner');
  const content = document.querySelector('.music-content-row');
  const progress = document.getElementById('compact-progress');

  if (state === 'full') {
    document.body.classList.add('music-full');
    document.body.classList.remove('music-mini');

    banner.style.display = 'flex';
    progress.style.display = 'block';
    banner.classList.remove('anim-collapse-in');
    void banner.offsetHeight;
    banner.classList.add('anim-expand-out');

    musicCollapseBtn.textContent = '▼';
    musicCollapseBtn.title = 'Collapse to compact view';
    updateMusicPlayerUI();

    setTimeout(() => {
      content.style.display = 'flex';
      content.classList.remove('anim-collapse-out');
      void content.offsetHeight;
      content.classList.add('anim-expand-in');
    }, 100);

    setTimeout(() => {
      banner.style.display = '';
      progress.style.display = '';
      banner.classList.remove('anim-expand-out');
      content.classList.remove('anim-expand-in');
      musicWrapper.classList.remove('compact');
      content.style.display = '';
    }, 220);

  } else if (state === 'compact') {
    document.body.classList.add('music-mini');
    document.body.classList.remove('music-full');

    content.style.display = 'flex';
    content.classList.remove('anim-expand-in');
    void content.offsetHeight;
    content.classList.add('anim-collapse-out');

    musicCollapseBtn.textContent = '▼';
    musicCollapseBtn.title = 'Expand to full view';
    updateCompactPlayer();

    setTimeout(() => {
      banner.style.display = 'flex';
      progress.style.display = 'block';
      banner.classList.remove('anim-expand-out');
      void banner.offsetHeight;
      banner.classList.add('anim-collapse-in');
    }, 100);

    setTimeout(() => {
      content.style.display = '';
      content.classList.remove('anim-collapse-out');
      banner.classList.remove('anim-collapse-in');
      musicWrapper.classList.add('compact');
      banner.style.display = '';
      progress.style.display = '';
    }, 220);

  } else {
    document.body.classList.remove('music-full', 'music-mini');
    musicWrapper.classList.remove('compact');
  }
}

function toggleMusicPlayer() {
  if (musicPlayerState === null) {
    setMusicPlayerState(lastMusicPlayerState);
  } else {
    if (musicPlayerState === 'full' || musicPlayerState === 'compact') {
      lastMusicPlayerState = musicPlayerState;
    }
    setMusicPlayerState(null);
  }
}

function openMusicPlayerAfterMatch() {
  closeEndScreen();
  resetMatch();
  lastMusicPlayerState = 'compact';
  setMusicPlayerState('compact');
  if (playlist.length > 0 && matchMusicAudio.paused) {
    generatePlayQueue();
    loadAndPlaySong(getCurrentSong());
    updateMusicPlayerUI();
  }
}

function updateMusicPlayerUI() {
  renderMusicPlaylist();
  if (playlist.length > 0 && getCurrentSong()) {
    const song = getCurrentSong();
    const displayName = song.title || song.name;
    musicTrackNameLarge.textContent = displayName;
    musicTrackArtistLarge.textContent = song.artist || '';
    currentTrackTitle = displayName;
    setCompactThumbnail(song);
    updatePlaybackState();
  }
  if (musicPlayerState === 'compact') updateCompactPlayer();
}

function updateCompactPlayer() {
  if (playlist.length > 0 && getCurrentSong()) {
    const song = getCurrentSong();
    const displayName = song.title || song.name;
    compactTrackName.textContent = displayName;
    compactTrackArtist.textContent = song.artist || '';
    currentTrackTitle = displayName;
    setCompactThumbnail(song);
    updatePlaybackState();
  } else {
    compactTrackName.textContent = 'No track';
    compactTrackArtist.textContent = '';
    currentTrackTitle = 'Now Playing';
    setCompactThumbnail(null);
    updatePlaybackState();
  }
}

function setCompactThumbnail(songOrNull) {
  if (songOrNull && songOrNull.cover) {
    compactThumbImg.src = songOrNull.cover;
    compactThumbImg.style.display = 'block';
    compactThumbFallback.style.display = 'none';
  } else {
    compactThumbImg.style.display = 'none';
    compactThumbImg.src = '';
    compactThumbFallback.style.display = 'block';
  }
}

function updatePlaybackState() {
  const isPlaying = !matchMusicAudio.paused && matchMusicAudio.currentTime > 0;
  const playSvg = isPlaying
    ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
  musicPlayIcon.innerHTML = playSvg;
  compactPlayIcon.innerHTML = playSvg;

  const duration = matchMusicAudio.duration || 0;
  const current = matchMusicAudio.currentTime || 0;
  if (duration > 0) {
    musicProgressBar.max = Math.floor(duration);
    musicProgressBar.value = Math.floor(current);
    musicTimeCurrent.textContent = formatTime(current);
    musicTimeTotal.textContent = formatTime(duration);
    compactProgressFill.style.width = (current / duration * 100) + '%';
  } else {
    musicTimeCurrent.textContent = '0:00';
    musicTimeTotal.textContent = '0:00';
    compactProgressFill.style.width = '0%';
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function renderMusicPlaylist() {
  if (!musicPlaylist) return;
  if (playlist.length === 0) {
    musicPlaylist.innerHTML = '<div style="color:#888;font-style:italic;padding:4px 0;font-size:10px;">No songs imported yet — use the Import MP3 button in Setup.</div>';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(playlist.length / ADMIN_PAGE_SIZE));
  if (queuePage > totalPages) queuePage = totalPages;
  const start = (queuePage - 1) * ADMIN_PAGE_SIZE;
  const pageSongs = playlist.slice(start, start + ADMIN_PAGE_SIZE);

  let html = pageSongs.map((s, i) => {
    const realIdx = start + i;
    const isActive = getCurrentSong() && getCurrentSong().name === s.name;
    return '<div class="music-playlist-item' + (isActive ? ' active' : '') + '" data-index="' + realIdx + '">' +
      '<span>' + (s.title || s.name) + '</span>' +
      '<span class="remove-song" data-remove-index="' + realIdx + '">✕</span>' +
    '</div>';
  }).join('');

  if (totalPages > 1) {
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:4px;font-size:10px;padding:4px 0;">' +
      '<a href="#" id="queue-prev" style="color:#888;text-decoration:none;' + (queuePage <= 1 ? 'pointer-events:none;opacity:0.3;' : '') + '">◀ Prev</a>' +
      '<span style="color:#ccc;">' + queuePage + ' / ' + totalPages + '</span>' +
      '<a href="#" id="queue-next" style="color:#888;text-decoration:none;' + (queuePage >= totalPages ? 'pointer-events:none;opacity:0.3;' : '') + '">Next ▶</a>' +
    '</div>';
  }
  musicPlaylist.innerHTML = html;

  const prevBtn = document.getElementById('queue-prev');
  const nextBtn = document.getElementById('queue-next');
  if (prevBtn) prevBtn.addEventListener('click', (e) => { e.preventDefault(); if (queuePage > 1) { queuePage--; renderMusicPlaylist(); } });
  if (nextBtn) nextBtn.addEventListener('click', (e) => { e.preventDefault(); if (queuePage < totalPages) { queuePage++; renderMusicPlaylist(); } });

  musicPlaylist.querySelectorAll('.music-playlist-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-song')) return;
      const idx = parseInt(el.dataset.index);
      const song = playlist[idx];
      if (song) {
        currentSongIndex = playQueue.indexOf(idx);
        if (currentSongIndex === -1) {
          generatePlayQueue();
          currentSongIndex = playQueue.indexOf(idx);
          if (currentSongIndex === -1) {
            playQueue = [idx];
            currentSongIndex = 0;
          }
        }
        loadAndPlaySong(song);
        updateMusicPlayerUI();
      }
    });
  });

  musicPlaylist.querySelectorAll('.remove-song').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(el.dataset.removeIndex);
      removeSongFromPlaylist(idx);
      updateMusicPlayerUI();
    });
  });
}

function toggleLocalPlayback() {
  if (playlist.length === 0) return;
  if (matchMusicAudio.paused) {
    if (matchMusicAudio.currentTime > 0) {
      matchMusicAudio.play();
    } else {
      loadAndPlaySong(getCurrentSong());
      updateMusicPlayerUI();
      if (musicPlayerState === 'compact') updateCompactPlayer();
    }
  } else {
    matchMusicAudio.pause();
  }
  updatePlaybackState();
}

musicPlayBtn.addEventListener('click', toggleLocalPlayback);
compactPlayBtn.addEventListener('click', () => musicPlayBtn.click());

musicPrevBtn.addEventListener('click', () => {
  if (playlist.length === 0) return;
  currentSongIndex = (currentSongIndex - 1 + playQueue.length) % playQueue.length;
  loadAndPlaySong(getCurrentSong());
  updateMusicPlayerUI();
});
compactPrevBtn.addEventListener('click', () => musicPrevBtn.click());

musicNextBtn.addEventListener('click', () => {
  if (playlist.length === 0) return;
  playNextSong();
  updateMusicPlayerUI();
});
compactNextBtn.addEventListener('click', () => musicNextBtn.click());

musicProgressBar.addEventListener('input', () => {
  const seekTime = parseFloat(musicProgressBar.value);
  if (matchMusicAudio.duration) {
    matchMusicAudio.currentTime = seekTime;
    musicTimeCurrent.textContent = formatTime(seekTime);
  }
});
matchMusicAudio.addEventListener('timeupdate', updatePlaybackState);

musicCollapseBtn.addEventListener('click', () => {
  const next = musicPlayerState === 'full' ? 'compact' : 'full';
  lastMusicPlayerState = next;
  setMusicPlayerState(next);
});
expCollapseBtn.addEventListener('click', () => {
  lastMusicPlayerState = 'compact';
  setMusicPlayerState('compact');
});
musicCloseBtn.addEventListener('click', () => {
  if (musicPlayerState) lastMusicPlayerState = musicPlayerState;
  setMusicPlayerState(null);
});
expCloseBtn.addEventListener('click', () => {
  if (musicPlayerState) lastMusicPlayerState = musicPlayerState;
  setMusicPlayerState(null);
});

// ----------------------------------------------------
// Score Adjusting Logic                                */
// ----------------------------------------------------
function animateScoreChange(newValue, oldValue = null) {
  if (oldValue === null) {
    oldValue = allianceConfigs[activeAlliance].score;
  }
  renderScoreDigits(newValue, oldValue);
}

function adjustScore(value) {
  if (!isAllianceScoringAllowed(activeAlliance)) {
    return; // Guard points addition when locked
  }

  const config = allianceConfigs[activeAlliance];
  const oldScore = config.score;
  config.score = Math.max(0, config.score + value);
  const delta = config.score - oldScore;
  if (delta !== 0) {
    logScoreChange(delta);
  }

  animateScoreChange(config.score, oldScore);
}

// Fullscreen toggle
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

// ----------------------------------------------------
// Keyboard Hotkey Bindings                            */
// ----------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    adjustScore(1);
  }
});

// ----------------------------------------------------
// Audio Visualizer (ported from Synthwave Bar Thingy) */
// ----------------------------------------------------
class FRCAudioVisualizer {
  constructor(canvas, audioElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = audioElement;

    this.enabled = true;

    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.bufferLength = 128;
    this.frequencyData = new Uint8Array(this.bufferLength);

    // Caps (falling dots above bars)
    this.caps = new Array(256).fill(0);

    // Smoothed bar heights (exponential interpolation per frame)
    this._smoothBars = new Float32Array(256);

    // Per-bar running max for dynamic normalization
    this._barMax = new Float32Array(256).fill(1.0);

    // Procedural fallback state
    this._phases = new Float32Array(128);
    this._energies = new Float32Array(128);
    this._speeds = new Float32Array(128);
    this._decays = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      this._phases[i] = Math.random() * Math.PI * 2;
      this._speeds[i] = 1.2 + (i / 128) * 5.0;
      this._decays[i] = 0.06 + (i / 128) * 0.08;
    }

    // FFT fallback
    this.decodedBuffer = null;
    this.fftEnabled = false;

    // Particle system
    this.particles = [];
    this._bassAvg = 0;

    // Trigger a burst on song change
    this._beatAccum = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.caps.fill(0);
    this._smoothBars.fill(0);
    this._barMax.fill(1.0);
    this._initParticles();
  }

  _initParticles() {
    this.particles = [];
    const count = Math.min(60, Math.floor(this.width / 20));
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -(Math.random() * 0.5 + 0.15),
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.4 + 0.1,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  initAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.audioCtx = new AC();
      if (window.location.protocol !== 'file:') {
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.82;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.frequencyData = new Uint8Array(this.bufferLength);
        this.caps = new Array(Math.max(this.bufferLength, 256)).fill(0);
        try {
          this.source = this.audioCtx.createMediaElementSource(this.audio);
          this.source.connect(this.analyser);
          this.analyser.connect(this.audioCtx.destination);
          if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        } catch (e) {
          this.analyser = null;
          this.source = null;
        }
      }
    } catch (e) {
      this.audioCtx = null;
    }
  }

  triggerPulse(amount) {}

  // Load audio for FFT fallback (file:// where MediaElementSource fails)
  async loadAndDecodeSong(blob) {
    this.decodedBuffer = null;
    this.fftEnabled = false;
    if (this.analyser) return;
    if (!this.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.audioCtx = new AC(); } catch (e) { return; }
    }
    try {
      this.decodedBuffer = await this.audioCtx.decodeAudioData(await blob.arrayBuffer());
      this.fftEnabled = true;
    } catch (e) {}
  }

  runFFT() {
    if (!this.decodedBuffer) return null;
    const ch = this.decodedBuffer.getChannelData(0);
    const total = ch.length;
    const dur = total / this.decodedBuffer.sampleRate;
    let t = this.audio.currentTime;
    if (t >= dur) t = dur - 0.05;
    if (t < 0) t = 0;
    const fftSize = 256;
    const center = Math.floor((t / dur) * total);
    const half = fftSize / 2;
    const real = new Float64Array(fftSize);
    const imag = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const idx = center - half + i;
      const w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
      real[i] = (idx >= 0 && idx < total) ? ch[idx] * w : 0;
      imag[i] = 0;
    }
    // FFT
    for (let i = 1, j = 0; i < fftSize; i++) {
      let bit = fftSize >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
    }
    for (let len = 2; len <= fftSize; len <<= 1) {
      const hl = len >> 1, a = -2 * Math.PI / len, wc = Math.cos(a), ws = Math.sin(a);
      for (let i = 0; i < fftSize; i += len) {
        let wr = 1, wi = 0;
        for (let j = 0; j < hl; j++) {
          const tr = wr * real[i + j + hl] - wi * imag[i + j + hl];
          const ti = wr * imag[i + j + hl] + wi * real[i + j + hl];
          real[i + j + hl] = real[i + j] - tr; imag[i + j + hl] = imag[i + j] - ti;
          real[i + j] += tr; imag[i + j] += ti;
          const nwr = wr * wc - wi * ws; wi = wr * ws + wi * wc; wr = nwr;
        }
      }
    }
    const out = new Uint8Array(this.bufferLength);
    for (let i = 0; i < this.bufferLength; i++) {
      let m = 0;
      for (let j = 0; j < 2; j++) { const idx = i * 2 + j; if (idx < fftSize / 2) m += Math.sqrt(real[idx] ** 2 + imag[idx] ** 2); }
      out[i] = Math.min(255, Math.max(0, Math.floor((m / 2) * 10)));
    }
    return out;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const w = this.width, h = this.height;
    if (!w || !h) return;

    const isPlaying = !this.audio.paused && this.audio.currentTime > 0;

    // --- Get frequency data ---
    let data = null;
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      data = this.frequencyData;
    } else if (this.fftEnabled && isPlaying) {
      data = this.runFFT();
    }

    // Procedural fallback (when playing but no analyser/FFT)
    if (!data && isPlaying) {
      const bpm = 128;
      const beatDuration = 60 / bpm;
      const audioTime = this.audio.currentTime;
      const gt = performance.now() * 0.001;

      const bp = (audioTime % beatDuration) / beatDuration;
      const hp = (audioTime % (beatDuration / 2)) / (beatDuration / 2);
      const qp = (audioTime % (beatDuration / 4)) / (beatDuration / 4);
      const beat = Math.pow(Math.sin(bp * Math.PI), 16);
      const half = Math.pow(Math.sin(hp * Math.PI), 10);
      const quart = Math.pow(Math.sin(qp * Math.PI), 8);

      data = new Uint8Array(this.bufferLength);
      for (let i = 0; i < this.bufferLength; i++) {
        const r = i / this.bufferLength;
        const ph = this._phases[i] + gt * this._speeds[i];
        const osc = Math.sin(ph) * 0.5 + 0.5;
        let v;
        if (i < 10) v = beat * 220 + osc * 40 + Math.random() * 10;
        else if (i < 24) v = half * 140 + osc * 60 + Math.random() * 15;
        else if (i < 48) v = osc * 100 + quart * 40 + Math.sin(gt * 3 + i * 0.7) * 25 + Math.random() * 15;
        else v = osc * 50 + Math.sin(gt * 6 + i * 1.5) * 20 + Math.random() * 10;
        const tv = Math.max(0, Math.min(255, v));
        this._energies[i] += (tv - this._energies[i]) * this._decays[i];
        data[i] = Math.round(this._energies[i]);
      }
    }

    // --- Color: light blue when playing from music player, alliance color otherwise ---
    let colBase, colMid, colTop, colCap, colGlow, colPartGlow;
    if (playingFromMusicPlayer) {
      colBase = [80, 150, 220]; colMid = [120, 190, 240]; colTop = [160, 215, 250];
      colCap = [180, 230, 255]; colGlow = [120, 190, 240]; colPartGlow = [160, 215, 250];
    } else if (activeAlliance === 'blue') {
      colBase = [0, 50, 120]; colMid = [0, 90, 200]; colTop = [60, 180, 255];
      colCap = [100, 200, 255]; colGlow = [60, 180, 255]; colPartGlow = [100, 200, 255];
    } else {
      colBase = [120, 0, 20]; colMid = [200, 20, 30]; colTop = [255, 60, 70];
      colCap = [255, 100, 110]; colGlow = [255, 60, 70]; colPartGlow = [255, 140, 150];
    }

    // --- Bass detection ---
    let bassAvg = 0;
    if (data) {
      for (let i = 0; i < 6; i++) bassAvg += data[i] / 255;
      bassAvg /= 6;
    }
    this._bassAvg += (bassAvg - this._bassAvg) * 0.15;

    // --- Draw background ---
    this.ctx.fillStyle = 'rgba(11, 11, 15, 0.25)';
    this.ctx.fillRect(0, 0, w, h);

    // --- Particles ---
    if (isPlaying && bassAvg > 0.15) {
      this._beatAccum += bassAvg;
      if (this._beatAccum > 0.4) {
        this._beatAccum = 0;
        // Burst of particles from bottom
        for (let i = 0; i < 3; i++) {
          this.particles.push({
            x: Math.random() * w,
            y: h + 5,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -(Math.random() * 1.5 + 0.8 + bassAvg * 2),
            size: Math.random() * 2.5 + 1,
            alpha: Math.random() * 0.5 + 0.3,
            phase: Math.random() * Math.PI * 2
          });
        }
      }
    }

    // Update & draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.008;
      p.alpha *= 0.997;
      if (p.y < -10 || p.alpha < 0.01) {
        this.particles.splice(i, 1);
        continue;
      }
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${colPartGlow[0]}, ${colPartGlow[1]}, ${colPartGlow[2]}, ${p.alpha * 0.6})`;
      this.ctx.fill();
    }

    // Keep particle count in check
    if (this.particles.length > 120) this.particles.splice(0, this.particles.length - 120);

    // --- Bars ---
    if (data) {
      const barCount = Math.min(Math.floor(w / 80), 24);
      const gap = 3;
      const barW = (w - (barCount - 1) * gap) / barCount;
      const maxH = h * 0.6;
      const minH = 3;
      const smoothFactor = 0.08;

      for (let i = 0; i < barCount; i++) {
        const idx = Math.floor((i / barCount) * 20) + 2;
        const raw = data[idx] / 255;

        // Per-bar running max normalization (all bars react proportionally)
        this._barMax[i] = Math.max(this._barMax[i] * 0.97, raw);
        const norm = this._barMax[i] > 0.01 ? raw / this._barMax[i] : 0;

        const targetH = Math.max(minH, Math.min(1, norm) * maxH);

        this._smoothBars[i] += (targetH - this._smoothBars[i]) * smoothFactor;
        let barH = this._smoothBars[i];
        if (barH < minH) barH = minH;
        if (barH > h * 0.9) barH = h * 0.9;

        const x = i * (barW + gap);
        const y = h - barH;

        const grad = this.ctx.createLinearGradient(x, h, x, y);
        grad.addColorStop(0, `rgba(${colBase[0]}, ${colBase[1]}, ${colBase[2]}, 0.35)`);
        grad.addColorStop(0.5, `rgba(${colMid[0]}, ${colMid[1]}, ${colMid[2]}, 0.55)`);
        grad.addColorStop(1, `rgba(${colTop[0]}, ${colTop[1]}, ${colTop[2]}, ${0.5 + this._bassAvg * 0.3})`);
        this.ctx.fillStyle = grad;
        this._drawRoundedRect(x, y, barW, barH, 3);

        // Rising cap from bottom: tracks bar height, falls when bar shrinks
        if (barH > this.caps[i]) {
          this.caps[i] = barH;
        } else {
          this.caps[i] -= 0.8;
        }
        if (this.caps[i] < 0) this.caps[i] = 0;

        this.ctx.fillStyle = `rgba(${colCap[0]}, ${colCap[1]}, ${colCap[2]}, ${0.5 + this._bassAvg * 0.5})`;
        this.ctx.shadowColor = `rgba(${colGlow[0]}, ${colGlow[1]}, ${colGlow[2]}, 0.6)`;
        this.ctx.shadowBlur = 6;
        this.ctx.fillRect(x, h - this.caps[i], barW, 2);
      }
      this.ctx.shadowBlur = 0;
    }

  }

  _drawRoundedRect(x, y, w, h, r) {
    if (h < 2) return;
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fill();
  }
}

window.audioVisualizer = new FRCAudioVisualizer(visualizerCanvas, matchMusicAudio);

// ----------------------------------------------------
// INITIALIZATION ON LOAD                              */
// ----------------------------------------------------
(async () => {
  loadSettings();
  renderScoreboard();
  updateTimerUI();
  updateAdminStatus();
  updateMatchSubtitle();
  initializeEndScreenGraph();
  await loadSongsFromDB();
  renderPlaylistUI();
})();
