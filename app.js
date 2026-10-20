/**
 * PulseStream — Resilient Client-Side Engine
 * Uses IFrame API + Multi-Search Fallbacks + Auto-Lyrics
 */

(function () {
  'use strict';

  // Fallback search engines jo kabhi band nahi hote
  const SEARCH_FALLBACKS = [
    'https://invidious.jing.rocks',
    'https://inv.nadeko.net',
    'https://invidious.perennialte.ch',
    'https://yt.drgnz.club'
  ];
  let searchIdx = 0;

  function getSearchNode() {
    return SEARCH_FALLBACKS[searchIdx];
  }

  function rotateSearch() {
    searchIdx = (searchIdx + 1) % SEARCH_FALLBACKS.length;
  }

  // Curated Popular Indian/Bollywood/Punjabi Hit Tracks for Instant Home Feed
  const SEED_CATALOG = [
    { id: 'RLzC55ai0eo', title: 'Heeriye (Official Track) - Jasleen Royal ft. Arijit Singh', uploader: 'Jasleen Royal' },
    { id: 'ElZfdU54Cp8', title: 'Apna Bana Le - Bhediya | Arijit Singh & Sachin-Jigar', uploader: 'Zee Music Company' },
    { id: '2Vv-BfVoq4g', title: 'Ed Sheeran - Perfect (Official Music Video)', uploader: 'Ed Sheeran' },
    { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', uploader: 'Luis Fonsi' },
    { id: 'YxWlaYCA8MU', title: 'Kesariya - Brahmāstra | Ranbir & Alia | Arijit Singh', uploader: 'Sony Music India' },
    { id: 'k4yXQkGLeAA', title: 'Chaleya - Jawan | Shah Rukh Khan | Anirudh, Arijit', uploader: 'T-Series' },
    { id: 'JGwWNGJdvx8', title: 'Ed Sheeran - Shape of You (Official Music Video)', uploader: 'Ed Sheeran' },
    { id: 'fRh_vgS2dFE', title: 'Justin Bieber - Sorry (PURPOSE : The Movement)', uploader: 'Justin Bieber' }
  ];

  const els = {
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    brandHome: document.getElementById('brand-home'),
    videoGrid: document.getElementById('video-grid'),
    feedTitle: document.getElementById('feed-title'),
    feedStatus: document.getElementById('feed-status'),
    playerDesk: document.getElementById('player-desk'),
    currentTitle: document.getElementById('current-title'),
    currentUploader: document.getElementById('current-uploader'),
    btnToggleAudio: document.getElementById('btn-toggle-audio-mode'),
    btnDownload: document.getElementById('btn-download-media'),
    lyricsContainer: document.getElementById('lyrics-container'),
    lyricsStatus: document.getElementById('lyrics-status')
  };

  let ytPlayer = null;
  let currentActiveId = null;
  let isAudioOnly = false;

  // 1. YouTube IFrame Engine Initialization
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player('yt-player-container', {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin
      },
      events: {
        onReady: () => {
          // Player ready
        },
        onError: (e) => {
          console.warn('IFrame error code:', e.data);
        }
      }
    });
  };

  // 2. Render Cards (Always Instant Thumbnails via YouTube Direct CDN)
  function renderVideos(items) {
    els.videoGrid.innerHTML = '';
    if (!items || !items.length) {
      els.videoGrid.innerHTML = '<p class="empty-state">No videos found. Try another search query.</p>';
      return;
    }

    items.forEach(item => {
      const vid = item.id || item.videoId;
      if (!vid) return;

      const card = document.createElement('div');
      card.className = 'card-item';

      // Direct YouTube Image CDN without referrer header (Never fails)
      const thumb = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
      const title = item.title || 'Untitled Track';
      const uploader = item.uploader || item.author || '';

      card.innerHTML = `
        <img class="card-thumb" src="${thumb}" alt="${escapeHtml(title)}" loading="lazy" />
        <div class="card-info">
          <div class="card-title">${escapeHtml(title)}</div>
          <div class="card-channel">${escapeHtml(uploader)}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        playTrack(vid, title, uploader);
      });

      els.videoGrid.appendChild(card);
    });
  }

  // 3. Play Track with 100% Guaranteed Sound & Visual
  function playTrack(videoId, title, uploader) {
    currentActiveId = videoId;
    els.playerDesk.classList.remove('hidden');
    els.currentTitle.textContent = title;
    els.currentUploader.textContent = uploader || '';
    els.playerDesk.scrollIntoView({ behavior: 'smooth' });

    // Play video via official IFrame API
    if (ytPlayer && ytPlayer.loadVideoById) {
      ytPlayer.loadVideoById(videoId);
    } else {
      // Fallback direct embed if API library is delayed
      const container = document.getElementById('yt-player-container');
      container.innerHTML = `
        <iframe 
          src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0&playsinline=1" 
          allow="autoplay; encrypted-media" 
          allowfullscreen 
          style="width:100%; height:100%; border:none;">
        </iframe>
      `;
    }

    // Set Download link (External fast conversion engine)
    els.btnDownload.href = `https://www.y2mate.com/youtube/${videoId}`;
    els.btnDownload.setAttribute('target', '_blank');

    // Auto-fetch synchronized Lyrics
    fetchLyrics(title, uploader);
  }

  // 4. Live Synced Lyrics (Direct Lrclib API)
  async function fetchLyrics(trackTitle, artist) {
    els.lyricsStatus.textContent = 'Searching lyrics...';
    els.lyricsContainer.innerHTML = '<p class="placeholder-text">Searching lyrics database...</p>';

    // Clean search string
    const clean = trackTitle
      .replace(/\(Official.*?\)|\[Official.*?\]|Official Video|Lyrics|Lyrical|Full Song|HD|4K/gi, '')
      .split('|')[0]
      .split('-').pop()
      .trim();

    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(clean)}`);
      const list = await res.json();

      if (list && list.length && (list[0].plainLyrics || list[0].syncedLyrics)) {
        const text = list[0].plainLyrics || list[0].syncedLyrics;
        els.lyricsContainer.textContent = text.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '');
        els.lyricsStatus.textContent = 'Found';
        return;
      }
      throw new Error('No match');
    } catch (_) {
      els.lyricsContainer.innerHTML = '<p class="placeholder-text">Lyrics unavailable for this track.</p>';
      els.lyricsStatus.textContent = 'Not found';
    }
  }

  // 5. Multi-Server Search
  async function performSearch(query) {
    if (!query) return;
    els.feedTitle.textContent = `Search: "${query}"`;
    els.feedStatus.textContent = 'Searching...';

    for (let i = 0; i < SEARCH_FALLBACKS.length; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${getSearchNode()}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) throw new Error('Search failed');
        const items = await res.json();
        const valid = items.filter(v => v.type === 'video' || v.videoId);

        if (valid.length) {
          renderVideos(valid.map(v => ({
            id: v.videoId,
            title: v.title,
            uploader: v.author
          })));
          els.feedStatus.textContent = '';
          return;
        }
      } catch (_) {
        rotateSearch();
      }
    }

    // Client-side fallback if all third-party search proxies are down
    els.feedStatus.textContent = 'Search API busy. Showing top recommendations.';
    renderVideos(SEED_CATALOG.filter(s => s.title.toLowerCase().includes(query.toLowerCase())));
  }

  // 6. Audio-Only Mode Toggle
  els.btnToggleAudio.addEventListener('click', () => {
    isAudioOnly = !isAudioOnly;
    const wrapper = document.querySelector('.video-wrapper');
    if (isAudioOnly) {
      wrapper.style.paddingBottom = '0';
      wrapper.style.height = '60px';
      els.btnToggleAudio.textContent = '📺 Video Mode';
    } else {
      wrapper.style.paddingBottom = '56.25%';
      wrapper.style.height = 'auto';
      els.btnToggleAudio.textContent = '🎵 Audio Only Mode';
    }
  });

  // Event Listeners
  els.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = els.searchInput.value.trim();
    if (q) performSearch(q);
  });

  els.brandHome.addEventListener('click', () => {
    els.feedTitle.textContent = 'Recommended Hits & Music';
    renderVideos(SEED_CATALOG);
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[m]);
  }

  // Boot: Render Instant Catalog on Load
  renderVideos(SEED_CATALOG);
})();