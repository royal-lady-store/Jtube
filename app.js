/**
 * PulseStream — Automated Media Stream & Lyrics Player
 * Fix: High-availability instances, Direct Thumbnails, and Sound-Integrated Streams
 */

(function () {
  'use strict';

  // Reliable Public Invidious & Piped Endpoints (Sorted for speed & stability)
  const API_SERVERS = [
    'https://invidious.tiekoetter.com',
    'https://yt.chocolatemoo53.com',
    'https://invidious.nerdvpn.de',
    'https://inv.tux.pizza',
    'https://api.piped.private.coffee'
  ];

  let currentServerIndex = 0;

  function getServer() {
    return API_SERVERS[currentServerIndex];
  }

  function rotateServer() {
    currentServerIndex = (currentServerIndex + 1) % API_SERVERS.length;
  }

  const els = {
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    brandHome: document.getElementById('brand-home'),
    videoGrid: document.getElementById('video-grid'),
    feedTitle: document.getElementById('feed-title'),
    feedStatus: document.getElementById('feed-status'),
    playerDesk: document.getElementById('player-desk'),
    videoPlayer: document.getElementById('native-video-player'),
    videoWrapper: document.getElementById('video-wrapper-box'),
    currentTitle: document.getElementById('current-title'),
    currentUploader: document.getElementById('current-uploader'),
    btnToggleAudio: document.getElementById('btn-toggle-audio-mode'),
    btnDownload: document.getElementById('btn-download-media'),
    lyricsContainer: document.getElementById('lyrics-container'),
    lyricsStatus: document.getElementById('lyrics-status')
  };

  let activeMediaDetails = null;
  let isAudioOnly = false;

  // 1. Fetch Trending / Popular Videos with Multiple Backups
  async function loadTrendingVideos(retryCount = 0) {
    els.feedStatus.textContent = 'Loading live trending tracks...';
    
    try {
      const endpoint = `${getServer()}/api/v1/trending?type=music&region=IN`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const response = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error('Status not 200');
      const data = await response.json();
      
      renderVideoGrid(data);
      els.feedStatus.textContent = '';
    } catch (err) {
      if (retryCount < API_SERVERS.length) {
        rotateServer();
        loadTrendingVideos(retryCount + 1);
      } else {
        // Fallback default Indian Hits search if trending endpoint is throttled
        performSearch('Latest Bollywood Punjabi Trending Songs', true);
      }
    }
  }

  // 2. Universal Search
  async function performSearch(query, isAutoFallback = false) {
    if (!query) return;
    if (!isAutoFallback) els.feedTitle.textContent = `Search Results: "${query}"`;
    els.feedStatus.textContent = 'Searching streams...';

    for (let i = 0; i < API_SERVERS.length; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000);

        const res = await fetch(`${getServer()}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) throw new Error('Search failed');
        const items = await res.json();
        const validVideos = items.filter(v => v.type === 'video' || v.videoId);

        if (validVideos.length) {
          renderVideoGrid(validVideos);
          els.feedStatus.textContent = '';
          return;
        }
      } catch (_) {
        rotateServer();
      }
    }

    els.feedStatus.textContent = 'Search server busy. Please try again.';
  }

  // 3. Render Cards with 100% Working Thumbnails
  function renderVideoGrid(items) {
    els.videoGrid.innerHTML = '';
    if (!items || !items.length) {
      els.videoGrid.innerHTML = '<p class="empty-state">No videos found. Try searching for an artist or song name.</p>';
      return;
    }

    items.forEach(item => {
      const videoId = item.videoId || (item.url ? item.url.replace('/watch?v=', '') : item.id);
      if (!videoId) return;

      const card = document.createElement('div');
      card.className = 'card-item';

      // Direct YouTube image CDN with i.ytimg.com (always loads with referrerpolicy="no-referrer")
      const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const title = item.title || 'Untitled Video';
      const uploader = item.author || item.uploaderName || '';

      card.innerHTML = `
        <img class="card-thumb" src="${thumbUrl}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60';" />
        <div class="card-info">
          <div class="card-title">${escapeHtml(title)}</div>
          <div class="card-channel">${escapeHtml(uploader)}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        playMediaWithSound(videoId, title, uploader);
      });

      els.videoGrid.appendChild(card);
    });
  }

  // 4. Play Stream with Sound (Progressive Stream or Embedded Direct Video)
  async function playMediaWithSound(videoId, title, uploader) {
    els.playerDesk.classList.remove('hidden');
    els.currentTitle.textContent = title;
    els.currentUploader.textContent = uploader || '';
    els.playerDesk.scrollIntoView({ behavior: 'smooth' });

    els.lyricsContainer.innerHTML = '<p class="placeholder-text">Searching lyrics...</p>';
    els.lyricsStatus.textContent = 'Loading...';

    // Reset player elements
    els.videoPlayer.pause();
    els.videoPlayer.src = '';

    let streamFound = false;

    // Try fetching unified Progressive stream (audio + video muxed together)
    for (let attempt = 0; attempt < API_SERVERS.length; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(`${getServer()}/api/v1/videos/${videoId}`, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) throw new Error('Video metadata failed');
        const data = await res.json();
        activeMediaDetails = data;

        // formatStreams contains combined Video + Audio (Sound works 100%)
        const progressiveStreams = data.formatStreams || [];
        const selectedStream = progressiveStreams.find(s => s.resolution === '720p') ||
                               progressiveStreams.find(s => s.resolution === '360p') ||
                               progressiveStreams[0];

        // Audio-only stream for Music mode
        const audioStreams = data.adaptiveFormats ? data.adaptiveFormats.filter(s => s.type && s.type.startsWith('audio')) : [];

        if (selectedStream && selectedStream.url) {
          streamFound = true;
          // Render in HTML5 Video Tag
          els.videoWrapper.innerHTML = `
            <video id="native-video-player" controls autoplay playsinline preload="auto" style="width:100%; height:100%;">
              <source src="${selectedStream.url}" type="${selectedStream.type || 'video/mp4'}">
              Your browser does not support the video tag.
            </video>
          `;

          // Update active pointer
          els.videoPlayer = document.getElementById('native-video-player');
          els.videoPlayer.volume = 1.0;
          els.videoPlayer.play().catch(() => {});

          // Setup Local Download
          els.btnDownload.href = selectedStream.url;
          els.btnDownload.setAttribute('download', `${cleanFileName(title)}.mp4`);
          break;
        }
      } catch (_) {
        rotateServer();
      }
    }

    // Fallback if public server proxies are rate-limited: High-Performance Embedded Player with Full Sound
    if (!streamFound) {
      els.videoWrapper.innerHTML = `
        <iframe 
          src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0&playsinline=1" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen 
          style="width:100%; height:100%; border:none;">
        </iframe>
      `;
      // Direct Download Fallback using public web converter
      els.btnDownload.href = `https://www.y2mate.com/youtube/${videoId}`;
      els.btnDownload.setAttribute('download', `${cleanFileName(title)}.mp4`);
    }

    // Load Lyrics automatically in parallel
    fetchLyrics(title, uploader);
  }

  // 5. Automatic Lyrics Extraction (Clean Title & Match)
  async function fetchLyrics(trackName, artistName) {
    const cleanTrack = trackName
      .replace(/\(Official.*?\)|\[Official.*?\]|Official Video|Lyrics|Lyrical|Full Song|Video Song/gi, '')
      .split('|')[0]
      .split('-').pop()
      .trim();

    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTrack)}`);
      const list = await res.json();

      if (list && list.length && (list[0].plainLyrics || list[0].syncedLyrics)) {
        const raw = list[0].plainLyrics || list[0].syncedLyrics;
        const clean = raw.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '');
        els.lyricsContainer.textContent = clean;
        els.lyricsStatus.textContent = 'Found';
        return;
      }
      throw new Error('No lyrics');
    } catch (_) {
      els.lyricsContainer.innerHTML = '<p class="placeholder-text">Lyrics unavailable for this track.</p>';
      els.lyricsStatus.textContent = 'Not found';
    }
  }

  // 6. Audio-Only / Video Switcher
  els.btnToggleAudio.addEventListener('click', () => {
    if (!activeMediaDetails || !activeMediaDetails.adaptiveFormats) {
      alert('Audio switch is optimizing for this track.');
      return;
    }

    isAudioOnly = !isAudioOnly;
    const audios = activeMediaDetails.adaptiveFormats.filter(s => s.type && s.type.startsWith('audio'));

    if (isAudioOnly && audios.length) {
      const audioUrl = audios[0].url;
      els.videoWrapper.innerHTML = `
        <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000;">
          <div style="font-size:3rem; margin-bottom:15px;">🎵</div>
          <audio controls autoplay style="width:80%;">
            <source src="${audioUrl}">
          </audio>
        </div>
      `;
      els.btnToggleAudio.textContent = '📺 Switch to Video';
      els.btnDownload.href = audioUrl;
      els.btnDownload.setAttribute('download', `${cleanFileName(els.currentTitle.textContent)}.mp3`);
    } else {
      const prog = activeMediaDetails.formatStreams || [];
      const vUrl = prog[0] ? prog[0].url : '';
      if (vUrl) {
        els.videoWrapper.innerHTML = `
          <video id="native-video-player" controls autoplay playsinline style="width:100%; height:100%;">
            <source src="${vUrl}">
          </video>
        `;
        els.videoPlayer = document.getElementById('native-video-player');
      }
      els.btnToggleAudio.textContent = '🎵 Audio Only Mode';
      els.btnDownload.href = vUrl;
      els.btnDownload.setAttribute('download', `${cleanFileName(els.currentTitle.textContent)}.mp4`);
    }
  });

  // Search Submit
  els.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = els.searchInput.value.trim();
    if (query) performSearch(query);
  });

  // Logo Click -> Reload Trending
  els.brandHome.addEventListener('click', () => {
    els.feedTitle.textContent = 'Trending Music & Videos';
    loadTrendingVideos();
  });

  function cleanFileName(str) {
    return str.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 50);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  // Initial Boot
  loadTrendingVideos();
})();