/**
 * PulseStream — Automated YouTube Proxy Engine
 * Automatic Stream Extraction, Ad-Free Playback, Lyrics & Direct Storage Download
 */

(function () {
  'use strict';

  // Public Piped API instance array for failover redundancy
  const API_INSTANCES = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://piped-api.lunar.icu'
  ];
  let currentInstanceIndex = 0;

  function getApiBase() {
    return API_INSTANCES[currentInstanceIndex];
  }

  function rotateInstance() {
    currentInstanceIndex = (currentInstanceIndex + 1) % API_INSTANCES.length;
  }

  const elements = {
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    videoGrid: document.getElementById('video-grid'),
    feedTitle: document.getElementById('feed-title'),
    feedStatus: document.getElementById('feed-status'),
    playerDesk: document.getElementById('player-desk'),
    videoPlayer: document.getElementById('native-video-player'),
    currentTitle: document.getElementById('current-title'),
    currentUploader: document.getElementById('current-uploader'),
    btnToggleAudio: document.getElementById('btn-toggle-audio-mode'),
    btnDownload: document.getElementById('btn-download-media'),
    lyricsContainer: document.getElementById('lyrics-container'),
    lyricsStatus: document.getElementById('lyrics-status')
  };

  let activeVideoStreams = null;
  let isAudioOnly = false;

  // 1. Automatic Trending Feed Loading
  async function loadTrendingFeed() {
    elements.feedStatus.textContent = 'Loading live trending streams...';
    try {
      const response = await fetch(`${getApiBase()}/trending?region=IN`);
      if (!response.ok) throw new Error('Failed to fetch trending');
      const data = await response.json();
      renderVideoGrid(data);
      elements.feedStatus.textContent = '';
    } catch (err) {
      rotateInstance();
      elements.feedStatus.textContent = 'Retrying connection...';
      try {
        const fallbackRes = await fetch(`${getApiBase()}/trending?region=IN`);
        const data = await fallbackRes.json();
        renderVideoGrid(data);
        elements.feedStatus.textContent = '';
      } catch (_) {
        elements.feedStatus.textContent = 'Could not load feed. Try searching.';
      }
    }
  }

  // 2. Automated Search (No Uploads Needed)
  async function performSearch(query) {
    if (!query) return;
    elements.feedTitle.textContent = `Search Results: "${query}"`;
    elements.feedStatus.textContent = 'Searching streams...';
    elements.videoGrid.innerHTML = '';

    try {
      const response = await fetch(`${getApiBase()}/search?q=${encodeURIComponent(query)}&filter=all`);
      const data = await response.json();
      const streams = data.items ? data.items.filter(i => i.type === 'stream') : [];
      renderVideoGrid(streams);
      elements.feedStatus.textContent = streams.length ? '' : 'No streams found.';
    } catch (err) {
      elements.feedStatus.textContent = 'Search error. Check connection.';
    }
  }

  function renderVideoGrid(items) {
    elements.videoGrid.innerHTML = '';
    if (!items || !items.length) {
      elements.videoGrid.innerHTML = '<p class="text-muted">No streams available.</p>';
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card-item';
      
      const videoId = item.url ? item.url.replace('/watch?v=', '') : item.id;
      const thumbnail = item.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');

      card.innerHTML = `
        <img class="card-thumb" src="${thumbnail}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <div class="card-info">
          <div class="card-title">${escapeHtml(item.title)}</div>
          <div class="card-channel">${escapeHtml(item.uploaderName || '')}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        playMediaStream(videoId, item.title, item.uploaderName);
      });

      elements.videoGrid.appendChild(card);
    });
  }

  // 3. Play Direct Stream & Setup Local Download
  async function playMediaStream(videoId, title, uploader) {
    elements.playerDesk.classList.remove('hidden');
    elements.currentTitle.textContent = title;
    elements.currentUploader.textContent = uploader || '';
    elements.playerDesk.scrollIntoView({ behavior: 'smooth' });

    elements.lyricsContainer.innerHTML = '<p class="placeholder-text">Searching synchronized lyrics...</p>';
    elements.lyricsStatus.textContent = 'Loading...';

    try {
      const res = await fetch(`${getApiBase()}/streams/${videoId}`);
      const data = await res.json();
      activeVideoStreams = data;

      // Extract high quality video and audio streams
      const videoStream = (data.videoStreams && data.videoStreams.find(s => s.quality === '720p' || s.quality === '1080p')) || (data.videoStreams && data.videoStreams[0]);
      const audioStream = (data.audioStreams && data.audioStreams[0]);

      if (videoStream && videoStream.url) {
        elements.videoPlayer.src = videoStream.url;
        elements.videoPlayer.play();

        // Direct Local Storage Download Anchor
        elements.btnDownload.href = videoStream.url;
        elements.btnDownload.setAttribute('download', `${cleanFileName(title)}.mp4`);
      } else if (audioStream && audioStream.url) {
        elements.videoPlayer.src = audioStream.url;
        elements.videoPlayer.play();
        elements.btnDownload.href = audioStream.url;
        elements.btnDownload.setAttribute('download', `${cleanFileName(title)}.mp3`);
      }

      // Fetch Lyrics automatically using cleaned track title
      fetchLyrics(title, uploader);
    } catch (err) {
      alert('Stream extraction failed on this instance. Trying backup...');
      rotateInstance();
    }
  }

  // 4. Automatic Lyrics Extraction (Lrclib API)
  async function fetchLyrics(trackName, artistName) {
    // Sanitize title (remove official video, brackets, ft.)
    const cleanTrack = trackName
      .replace(/\(Official.*?\)|\[Official.*?\]|Official Video|Lyrics|Lyrical|Audio/gi, '')
      .split('-').pop()
      .trim();

    try {
      const response = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(artistName || '')}`);
      
      if (!response.ok) {
        // Fallback search query
        const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTrack)}`);
        const searchData = await searchRes.json();
        if (searchData && searchData.length && (searchData[0].plainLyrics || searchData[0].syncedLyrics)) {
          renderLyricsText(searchData[0].plainLyrics || searchData[0].syncedLyrics);
          elements.lyricsStatus.textContent = 'Found';
          return;
        }
        throw new Error('No lyrics');
      }

      const lyricsData = await response.json();
      renderLyricsText(lyricsData.plainLyrics || lyricsData.syncedLyrics);
      elements.lyricsStatus.textContent = 'Found';
    } catch (_) {
      elements.lyricsContainer.innerHTML = '<p class="placeholder-text">Lyrics unavailable for this video stream.</p>';
      elements.lyricsStatus.textContent = 'Not found';
    }
  }

  function renderLyricsText(text) {
    if (!text) {
      elements.lyricsContainer.innerHTML = '<p class="placeholder-text">No text lyrics for this track.</p>';
      return;
    }
    // Remove timestamps if synced [00:12.30]
    const clean = text.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '');
    elements.lyricsContainer.textContent = clean;
  }

  // Audio/Video Toggle
  elements.btnToggleAudio.addEventListener('click', () => {
    if (!activeVideoStreams) return;
    isAudioOnly = !isAudioOnly;

    const currentTime = elements.videoPlayer.currentTime;
    if (isAudioOnly && activeVideoStreams.audioStreams && activeVideoStreams.audioStreams.length) {
      elements.videoPlayer.src = activeVideoStreams.audioStreams[0].url;
      elements.btnToggleAudio.textContent = '📺 Video Mode';
      elements.btnDownload.setAttribute('download', `${cleanFileName(elements.currentTitle.textContent)}.mp3`);
    } else if (activeVideoStreams.videoStreams && activeVideoStreams.videoStreams.length) {
      const vStream = activeVideoStreams.videoStreams.find(s => s.quality === '720p') || activeVideoStreams.videoStreams[0];
      elements.videoPlayer.src = vStream.url;
      elements.btnToggleAudio.textContent = '🎵 Audio Only Mode';
      elements.btnDownload.setAttribute('download', `${cleanFileName(elements.currentTitle.textContent)}.mp4`);
    }

    elements.videoPlayer.currentTime = currentTime;
    elements.videoPlayer.play();
  });

  // Search event
  elements.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = elements.searchInput.value.trim();
    if (query) performSearch(query);
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

  // Initial load
  loadTrendingFeed();
})();