(() => {
  'use strict';

  const STORAGE_KEYS = {
    favorites: 'recess_arcade_favorites_v1',
    recent: 'recess_arcade_recent_v1',
    customGames: 'recess_arcade_custom_games_v1',
  };

  const state = {
    baseGames: [],
    games: [],
    favorites: loadArray(STORAGE_KEYS.favorites),
    recent: loadArray(STORAGE_KEYS.recent),
    customGames: loadArray(STORAGE_KEYS.customGames),
    activeCategory: 'All',
    activeCollection: 'catalog', // 'catalog' | 'favorites' | 'recent'
    searchQuery: '',
    activeGameId: null,
    isWideTheater: false,
    loadError: null,
  };

  // DOM References
  const el = {
    navLinks: document.querySelectorAll('[data-nav]'),
    brandHome: document.getElementById('brandHome'),
    randomGameBtn: document.getElementById('randomGameBtn'),
    openAddModalBtn: document.getElementById('openAddModalBtn'),

    catalogView: document.getElementById('catalogView'),
    heroSpotlight: document.getElementById('heroSpotlight'),
    heroTitle: document.getElementById('heroTitle'),
    heroDescription: document.getElementById('heroDescription'),
    heroMeta: document.getElementById('heroMeta'),
    heroThumb: document.getElementById('heroThumb'),
    heroPlayBtn: document.getElementById('heroPlayBtn'),
    heroJsonBtn: document.getElementById('heroJsonBtn'),

    categoryTabs: document.getElementById('categoryTabs'),
    searchInput: document.getElementById('searchInput'),
    catalogCount: document.getElementById('catalogCount'),
    viewBanner: document.getElementById('viewBanner'),
    viewBannerText: document.getElementById('viewBannerText'),
    clearViewFilterBtn: document.getElementById('clearViewFilterBtn'),
    gamesGrid: document.getElementById('gamesGrid'),
    statePanel: document.getElementById('statePanel'),
    stateTitle: document.getElementById('stateTitle'),
    stateMessage: document.getElementById('stateMessage'),
    stateResetBtn: document.getElementById('stateResetBtn'),

    playerStage: document.getElementById('playerStage'),
    backToCatalogBtn: document.getElementById('backToCatalogBtn'),
    playerTitle: document.getElementById('playerTitle'),
    playerMeta: document.getElementById('playerMeta'),
    playerDescription: document.getElementById('playerDescription'),
    iframeShell: document.getElementById('iframeShell'),
    iframeContainer: document.getElementById('iframeContainer'),
    favoriteActiveBtn: document.getElementById('favoriteActiveBtn'),
    favoriteActiveLabel: document.getElementById('favoriteActiveLabel'),
    reloadGameBtn: document.getElementById('reloadGameBtn'),
    theaterToggleBtn: document.getElementById('theaterToggleBtn'),
    theaterToggleLabel: document.getElementById('theaterToggleLabel'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    inspectJsonBtn: document.getElementById('inspectJsonBtn'),

    footerJsonBtn: document.getElementById('footerJsonBtn'),
    footerDownloadBtn: document.getElementById('footerDownloadBtn'),

    addGameModal: document.getElementById('addGameModal'),
    addGameForm: document.getElementById('addGameForm'),
    closeAddModalBtn: document.getElementById('closeAddModalBtn'),
    cancelAddModalBtn: document.getElementById('cancelAddModalBtn'),
    gameTitleInput: document.getElementById('gameTitleInput'),
    gameCategoryInput: document.getElementById('gameCategoryInput'),
    gameControlsInput: document.getElementById('gameControlsInput'),
    gameIframeInput: document.getElementById('gameIframeInput'),
    gameDescInput: document.getElementById('gameDescInput'),
    addGameError: document.getElementById('addGameError'),

    jsonModal: document.getElementById('jsonModal'),
    closeJsonModalBtn: document.getElementById('closeJsonModalBtn'),
    jsonCodeBlock: document.getElementById('jsonCodeBlock'),
    copyJsonBtn: document.getElementById('copyJsonBtn'),
    downloadJsonModalBtn: document.getElementById('downloadJsonModalBtn'),
  };

  function loadArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveArray(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage quota errors
    }
  }

  function sanitizeIframeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('/')) return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.href;
      }
      return null;
    } catch {
      return null;
    }
  }

  function buildSafeIframeFromJsonEntry(game) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(game.iframe || '', 'text/html');
    const sourceIframe = doc.querySelector('iframe');
    const rawSrc = sourceIframe ? sourceIframe.getAttribute('src') : null;
    const safeSrc = sanitizeIframeUrl(rawSrc);

    if (!safeSrc) {
      return null;
    }

    const iframe = document.createElement('iframe');
    iframe.src = safeSrc;
    iframe.title = (sourceIframe && sourceIframe.getAttribute('title')) || game.title || 'Browser Game';
    iframe.setAttribute('loading', 'eager');
    iframe.setAttribute('allow', 'fullscreen; autoplay; gamepad');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('tabindex', '0');

    // Keep same-origin local games interactive with localStorage while restricting untrusted scripts
    if (!safeSrc.startsWith('/')) {
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock'
      );
    }

    return iframe;
  }

  function formatMeta(game) {
    const parts = [game.category || 'Arcade', game.players || '1 Player'];
    if (game.controls) parts.push(game.controls);
    return parts.join(' · ');
  }

  function isFavorite(gameId) {
    return state.favorites.includes(gameId);
  }

  function toggleFavorite(gameId) {
    if (isFavorite(gameId)) {
      state.favorites = state.favorites.filter((id) => id !== gameId);
    } else {
      state.favorites = [gameId, ...state.favorites];
    }
    saveArray(STORAGE_KEYS.favorites, state.favorites);

    if (state.activeGameId === gameId) {
      updateActiveFavoriteButton(gameId);
    }
    renderCatalog();
  }

  function recordRecentPlay(gameId) {
    state.recent = [gameId, ...state.recent.filter((id) => id !== gameId)].slice(0, 12);
    saveArray(STORAGE_KEYS.recent, state.recent);
  }

  function updateActiveFavoriteButton(gameId) {
    const fav = isFavorite(gameId);
    el.favoriteActiveBtn.setAttribute('aria-pressed', String(fav));
    el.favoriteActiveLabel.textContent = fav ? 'Favorited' : 'Favorite';
  }

  function getFilteredGames() {
    const query = state.searchQuery.trim().toLowerCase();

    let list = [...state.games];

    if (state.activeCollection === 'favorites') {
      list = list.filter((g) => state.favorites.includes(g.id));
    } else if (state.activeCollection === 'recent') {
      const orderMap = new Map(state.recent.map((id, idx) => [id, idx]));
      list = list
        .filter((g) => orderMap.has(g.id))
        .sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
    }

    if (state.activeCategory !== 'All') {
      list = list.filter((g) => g.category === state.activeCategory);
    }

    if (query) {
      list = list.filter((g) => {
        const haystack = [g.title, g.category, g.description, g.controls]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    return list;
  }

  function renderFeaturedSpotlight() {
    const featured = state.games.find((g) => g.featured) || state.games[0];
    if (!featured) {
      el.heroSpotlight.classList.add('hidden');
      return;
    }

    const showSpotlight =
      state.activeCollection === 'catalog' &&
      state.activeCategory === 'All' &&
      !state.searchQuery.trim();

    el.heroSpotlight.classList.toggle('hidden', !showSpotlight);
    if (!showSpotlight) return;

    el.heroTitle.textContent = featured.title;
    el.heroDescription.textContent = featured.description || '';
    el.heroMeta.textContent = formatMeta(featured);
    el.heroThumb.src = featured.thumbnail || '';
    el.heroThumb.alt = `${featured.title} game preview`;
    el.heroPlayBtn.onclick = () => launchGame(featured.id);
  }

  function createGameCard(game) {
    const card = document.createElement('article');
    card.className = 'game-card';

    const media = document.createElement('div');
    media.className = 'card-media';

    const fallback = document.createElement('div');
    fallback.className = 'thumb-fallback';
    fallback.textContent = game.title;

    if (game.thumbnail) {
      const img = document.createElement('img');
      img.src = game.thumbnail;
      img.alt = `${game.title} thumbnail`;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        img.remove();
      });
      media.appendChild(fallback);
      media.appendChild(img);
    } else {
      media.appendChild(fallback);
    }

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'card-fav-btn';
    const fav = isFavorite(game.id);
    favBtn.setAttribute('aria-pressed', String(fav));
    favBtn.setAttribute('aria-label', fav ? `Remove ${game.title} from favorites` : `Add ${game.title} to favorites`);
    favBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="' +
      (fav ? 'currentColor' : 'none') +
      '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(game.id);
    });
    media.appendChild(favBtn);

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h2');
    title.className = 'card-title';
    title.textContent = game.title;

    const meta = document.createElement('p');
    meta.className = 'card-meta';
    meta.textContent = formatMeta(game);

    const desc = document.createElement('p');
    desc.className = 'card-description';
    desc.textContent = game.description || 'Playable browser game loaded directly inside an iframe.';

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn-primary card-play-btn';
    playBtn.textContent = 'Play Game';
    playBtn.addEventListener('click', () => launchGame(game.id));

    actions.appendChild(playBtn);

    if (game.isCustom) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn-ghost btn-sm';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeCustomGame(game.id));
      actions.appendChild(removeBtn);
    }

    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(desc);
    body.appendChild(actions);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function renderCatalog() {
    renderFeaturedSpotlight();

    // Update nav active states
    el.navLinks.forEach((link) => {
      const navTarget = link.getAttribute('data-nav');
      link.classList.toggle('active', !state.activeGameId && navTarget === state.activeCollection);
    });

    // Update view banner
    if (state.activeCollection === 'favorites') {
      el.viewBanner.classList.remove('hidden');
      el.viewBannerText.textContent = 'Showing your saved favorite games.';
    } else if (state.activeCollection === 'recent') {
      el.viewBanner.classList.remove('hidden');
      el.viewBannerText.textContent = 'Showing games you played recently.';
    } else {
      el.viewBanner.classList.add('hidden');
    }

    if (state.loadError) {
      el.gamesGrid.innerHTML = '';
      el.statePanel.classList.remove('hidden');
      el.stateTitle.textContent = 'Could not load games.json';
      el.stateMessage.textContent = state.loadError;
      el.catalogCount.textContent = '0 games';
      return;
    }

    const filtered = getFilteredGames();
    el.catalogCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'game' : 'games'}`;
    el.gamesGrid.innerHTML = '';

    if (filtered.length === 0) {
      el.statePanel.classList.remove('hidden');
      if (state.activeCollection === 'favorites') {
        el.stateTitle.textContent = 'No favorite games yet';
        el.stateMessage.textContent = 'Click the heart button on any game card to save it here.';
      } else if (state.activeCollection === 'recent') {
        el.stateTitle.textContent = 'No recently played games';
        el.stateMessage.textContent = 'Launch any game from the catalog to start your recent list.';
      } else {
        el.stateTitle.textContent = 'No games match your filter';
        el.stateMessage.textContent = 'Try clearing your search or switching back to all categories.';
      }
      return;
    }

    el.statePanel.classList.add('hidden');
    const fragment = document.createDocumentFragment();
    filtered.forEach((game) => fragment.appendChild(createGameCard(game)));
    el.gamesGrid.appendChild(fragment);
  }

  function launchGame(gameId, updateHash = true) {
    const game = state.games.find((g) => g.id === gameId);
    if (!game) return;

    state.activeGameId = game.id;
    recordRecentPlay(game.id);

    el.playerTitle.textContent = game.title;
    el.playerMeta.textContent = formatMeta(game);
    el.playerDescription.textContent = game.description || '';
    updateActiveFavoriteButton(game.id);

    el.iframeContainer.innerHTML = '';
    const iframeEl = buildSafeIframeFromJsonEntry(game);
    if (iframeEl) {
      el.iframeContainer.appendChild(iframeEl);
      iframeEl.addEventListener('load', () => {
        try {
          iframeEl.focus();
        } catch {
          // Cross-origin focus ignored
        }
      });
    } else {
      const errorBox = document.createElement('div');
      errorBox.className = 'thumb-fallback';
      errorBox.textContent = 'Invalid or unsafe iframe URL in games.json entry.';
      el.iframeContainer.appendChild(errorBox);
    }

    el.catalogView.classList.add('hidden');
    el.playerStage.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (updateHash) {
      window.location.hash = `play/${encodeURIComponent(game.id)}`;
    }
    renderCatalog();
  }

  function closePlayer(updateHash = true) {
    state.activeGameId = null;
    el.iframeContainer.innerHTML = '';
    el.playerStage.classList.add('hidden');
    el.catalogView.classList.remove('hidden');

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (updateHash) {
      window.location.hash = state.activeCollection;
    }
    renderCatalog();
  }

  function setCollection(collection, updateHash = true) {
    state.activeCollection = collection;
    if (state.activeGameId) {
      closePlayer(false);
    }
    if (updateHash) {
      window.location.hash = collection;
    }
    renderCatalog();
  }

  function resetAllFilters() {
    state.activeCategory = 'All';
    state.activeCollection = 'catalog';
    state.searchQuery = '';
    el.searchInput.value = '';
    updateCategoryTabUI();
    window.location.hash = 'catalog';
    renderCatalog();
  }

  function updateCategoryTabUI() {
    const tabs = el.categoryTabs.querySelectorAll('.filter-tab');
    tabs.forEach((tab) => {
      const isActive = tab.getAttribute('data-category') === state.activeCategory;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  function removeCustomGame(gameId) {
    state.customGames = state.customGames.filter((g) => g.id !== gameId);
    saveArray(STORAGE_KEYS.customGames, state.customGames);
    rebuildGamesList();
    renderCatalog();
  }

  function rebuildGamesList() {
    state.games = [...state.baseGames, ...state.customGames];
  }

  function openJsonInspector(singleGameId = null) {
    const targetData = singleGameId
      ? state.games.find((g) => g.id === singleGameId)
      : state.games.map(({ isCustom, ...rest }) => rest);

    el.jsonCodeBlock.textContent = JSON.stringify(targetData, null, 2);
    el.jsonModal.showModal();
  }

  function downloadCatalogJson() {
    const cleanData = state.games.map(({ isCustom, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'games.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleHashRoute() {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash.startsWith('play/')) {
      const id = decodeURIComponent(hash.slice(5));
      if (state.games.some((g) => g.id === id)) {
        launchGame(id, false);
        return;
      }
    }

    if (state.activeGameId) {
      closePlayer(false);
    }

    if (hash === 'favorites' || hash === 'recent' || hash === 'catalog') {
      state.activeCollection = hash;
    }
    renderCatalog();
  }

  function bindEvents() {
    el.brandHome.addEventListener('click', (e) => {
      e.preventDefault();
      resetAllFilters();
      if (state.activeGameId) closePlayer();
    });

    el.navLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-nav');
        if (target) setCollection(target);
      });
    });

    el.randomGameBtn.addEventListener('click', () => {
      if (state.games.length === 0) return;
      const pool = state.games.length > 1
        ? state.games.filter((g) => g.id !== state.activeGameId)
        : state.games;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      launchGame(pick.id);
    });

    el.categoryTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      state.activeCategory = btn.getAttribute('data-category') || 'All';
      updateCategoryTabUI();
      renderCatalog();
    });

    el.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderCatalog();
    });

    el.clearViewFilterBtn.addEventListener('click', () => setCollection('catalog'));
    el.stateResetBtn.addEventListener('click', () => {
      if (state.loadError) {
        init();
      } else {
        resetAllFilters();
      }
    });

    // Player Controls
    el.backToCatalogBtn.addEventListener('click', () => closePlayer());

    el.favoriteActiveBtn.addEventListener('click', () => {
      if (state.activeGameId) toggleFavorite(state.activeGameId);
    });

    el.reloadGameBtn.addEventListener('click', () => {
      const iframe = el.iframeContainer.querySelector('iframe');
      if (iframe) {
        const currentSrc = iframe.src;
        iframe.src = 'about:blank';
        requestAnimationFrame(() => {
          iframe.src = currentSrc;
          iframe.focus();
        });
      }
    });

    el.theaterToggleBtn.addEventListener('click', () => {
      state.isWideTheater = !state.isWideTheater;
      el.iframeShell.classList.toggle('theater-wide', state.isWideTheater);
      el.theaterToggleBtn.setAttribute('aria-pressed', String(state.isWideTheater));
      el.theaterToggleLabel.textContent = state.isWideTheater ? 'Standard View' : 'Wide View';
    });

    el.fullscreenBtn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (el.iframeShell.requestFullscreen) {
        el.iframeShell.requestFullscreen().catch(() => {});
      }
    });

    el.inspectJsonBtn.addEventListener('click', () => openJsonInspector(state.activeGameId));
    el.heroJsonBtn.addEventListener('click', () => openJsonInspector());
    el.footerJsonBtn.addEventListener('click', () => openJsonInspector());
    el.footerDownloadBtn.addEventListener('click', downloadCatalogJson);

    // Add Game Modal
    el.openAddModalBtn.addEventListener('click', () => {
      el.addGameError.classList.add('hidden');
      el.addGameForm.reset();
      el.addGameModal.showModal();
    });

    el.closeAddModalBtn.addEventListener('click', () => el.addGameModal.close());
    el.cancelAddModalBtn.addEventListener('click', () => el.addGameModal.close());

    el.addGameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      el.addGameError.classList.add('hidden');

      const title = el.gameTitleInput.value.trim();
      const category = el.gameCategoryInput.value;
      const controls = el.gameControlsInput.value.trim() || 'Keyboard / Mouse';
      const rawIframeInput = el.gameIframeInput.value.trim();
      const description =
        el.gameDescInput.value.trim() || 'Custom iframe game added to your local catalog.';

      let iframeTag = '';
      if (rawIframeInput.toLowerCase().includes('<iframe')) {
        const doc = new DOMParser().parseFromString(rawIframeInput, 'text/html');
        const parsedIframe = doc.querySelector('iframe');
        const safeUrl = sanitizeIframeUrl(parsedIframe ? parsedIframe.getAttribute('src') : '');
        if (!safeUrl) {
          el.addGameError.textContent = 'Please provide an <iframe> with a valid http(s):// or / src URL.';
          el.addGameError.classList.remove('hidden');
          return;
        }
        iframeTag = `<iframe src="${safeUrl}" title="${title.replace(/"/g, '')}" loading="lazy" allow="fullscreen" allowfullscreen></iframe>`;
      } else {
        const safeUrl = sanitizeIframeUrl(rawIframeInput);
        if (!safeUrl) {
          el.addGameError.textContent = 'Please enter a valid <iframe> snippet or an http(s):// / local / URL.';
          el.addGameError.classList.remove('hidden');
          return;
        }
        iframeTag = `<iframe src="${safeUrl}" title="${title.replace(/"/g, '')}" loading="lazy" allow="fullscreen" allowfullscreen></iframe>`;
      }

      const id =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString().slice(-4);

      const newEntry = {
        id,
        title,
        category,
        players: '1 Player',
        controls,
        description,
        thumbnail: '',
        featured: false,
        iframe: iframeTag,
        isCustom: true,
      };

      state.customGames = [newEntry, ...state.customGames];
      saveArray(STORAGE_KEYS.customGames, state.customGames);
      rebuildGamesList();
      el.addGameModal.close();
      launchGame(newEntry.id);
    });

    // JSON Modal
    el.closeJsonModalBtn.addEventListener('click', () => el.jsonModal.close());
    el.downloadJsonModalBtn.addEventListener('click', downloadCatalogJson);
    el.copyJsonBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(el.jsonCodeBlock.textContent || '');
        const original = el.copyJsonBtn.textContent;
        el.copyJsonBtn.textContent = 'Copied';
        setTimeout(() => {
          el.copyJsonBtn.textContent = original;
        }, 1500);
      } catch {
        // Clipboard permission unavailable
      }
    });

    // Close dialogs on backdrop click
    [el.addGameModal, el.jsonModal].forEach((dialog) => {
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
      });
    });

    window.addEventListener('hashchange', handleHashRoute);
  }

  async function init() {
    state.loadError = null;
    try {
      const response = await fetch('/games.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while loading /games.json`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('games.json must contain a JSON array of game objects.');
      }
      state.baseGames = data;
      rebuildGamesList();
      handleHashRoute();
    } catch (err) {
      state.loadError = err instanceof Error ? err.message : 'Unable to fetch /games.json.';
      renderCatalog();
    }
  }

  bindEvents();
  init();
})();
