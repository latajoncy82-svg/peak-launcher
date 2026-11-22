(() => {
  const api = window.peakAPI;
  const i18n = window.PeakI18n;
  const t = (key, vars) => (i18n ? i18n.t(key, vars) : key);

  const state = {
    appState: null,
    manifest: null,
    fabricVersionsSet: new Set(),
    fabricVersionsList: [],
    javaData: { list: [], byMajor: {} },
    adoptiumInfo: {},
    mods: [],
    installedContent: [],
    modrinthHits: [],
    modrinthTotalHits: 0,
    modrinthHasMore: false,
    modrinthFallbackAll: false,
    modrinthLoading: false,
    modrinthQuery: '',
    modrinthCategory: 'all',
    modrinthSort: 'auto',
    modrinthOffset: 0,
    contentProjectType: 'mod',
    modsSubView: 'browse',
    versionsFilter: 'all',
    versionsSearch: '',
    versionsLimit: 80,
    activeView: 'play',
    activeSettingSection: 'general',
    consoleLevelFilter: 'all',
    consoleSearch: '',
    saveBadgeTimer: null,
    editingProfileId: null,
    editingAccountId: null,
    activeModDetails: null,
    skinCatalog: { presets: [], library: [] },
    skinTargetAccountId: null,
    skinViewer: null,
    skinStageOptions: { autoRotate: true, walk: true, showOuterLayer: true },
    logs: [],
    javaDownloadingMajor: null
  };

  const JAVA_DESCRIPTIONS = {
    25: 'Minecraft 26.x+',
    21: 'Minecraft 1.20.5 – 1.21.11',
    17: 'Minecraft 1.17 – 1.20.4',
    8: 'Minecraft ≤ 1.16.5 (Beta/Alpha)'
  };

  const TYPE_LABELS = {
    release: 'Release',
    snapshot: 'Snapshot',
    old_beta: 'Beta',
    old_alpha: 'Alpha'
  };

  const TYPE_PILL_CLASS = {
    release: 'mods',
    snapshot: 'amber',
    old_beta: '',
    old_alpha: 'violet'
  };

  const $ = (id) => document.getElementById(id);

  function showToast(message, type = 'info') {
    const stack = $('toast-stack');
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = message;
    stack.appendChild(div);
    setTimeout(() => div.remove(), 4200);
  }

  function matchesConsoleFilters(entry) {
    const levelOk =
      state.consoleLevelFilter === 'all' || (entry.level || 'INFO') === state.consoleLevelFilter;
    if (!levelOk) return false;
    const q = state.consoleSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(entry.text || '').toLowerCase().includes(q) ||
      String(entry.level || '').toLowerCase().includes(q)
    );
  }

  function createLogRow(entry) {
    const row = document.createElement('div');
    row.className = `log-line log-${entry.level || 'INFO'}`;
    const time = entry.ts ? entry.ts.slice(11, 19) : '';
    row.textContent = `[${time}] [${entry.level || 'INFO'}] ${entry.text}`;
    return row;
  }

  function renderConsoleOutput() {
    const out = $('console-output');
    if (!out) return;
    const frag = document.createDocumentFragment();
    for (const entry of state.logs) {
      if (matchesConsoleFilters(entry)) {
        frag.appendChild(createLogRow(entry));
      }
    }
    out.replaceChildren(frag);
    out.scrollTop = out.scrollHeight;
  }

  function appendLog(entry) {
    state.logs.push(entry);
    if (state.logs.length > 500) state.logs.shift();
    const out = $('console-output');
    if (!out) return;
    if (!matchesConsoleFilters(entry)) return;
    out.appendChild(createLogRow(entry));
    out.scrollTop = out.scrollHeight;
  }

  function getActiveProfile() {
    if (!state.appState) return null;
    const id = state.appState.activeProfileId;
    return state.appState.profiles.find((p) => p.id === id) || state.appState.profiles[0];
  }

  function getActiveAccount() {
    if (!state.appState) return null;
    const id = state.appState.activeAccountId;
    return state.appState.accounts.find((a) => a.id === id) || state.appState.accounts[0];
  }

  function getRequiredJavaForMc(mcVersion) {
    if (state.manifest) {
      const found = state.manifest.versions.find((v) => v.id === mcVersion);
      if (found) return found.recommendedJava;
    }
    if (/^(2[6-9]|[3-9]\d)\./.test(String(mcVersion))) return 25;
    if (/^1\.21|^1\.20\.[56]/.test(String(mcVersion))) return 21;
    if (/^1\.(1[7-9]|20)/.test(String(mcVersion))) return 17;
    return 8;
  }

  function applyLanguageUI(lang) {
    if (!i18n) return;
    const clean = i18n.setLanguage(lang);
    const codeEl = $('topbar-lang-code');
    if (codeEl) codeEl.textContent = clean.toUpperCase();
    document.querySelectorAll('[data-lang-item]').forEach((item) => {
      item.classList.toggle('active', item.dataset.langItem === clean);
    });
    document.querySelectorAll('.lang-tile').forEach((tile) => {
      tile.classList.toggle('active', tile.dataset.langChoice === clean);
    });
  }

  function applyTheme(theme) {
    const mode = theme === 'alpine-light' ? 'alpine-light' : 'alpine-dark';
    document.documentElement.dataset.theme = mode;
    $('icon-sun').classList.toggle('hidden', mode !== 'alpine-dark');
    $('icon-moon').classList.toggle('hidden', mode === 'alpine-dark');
    document.querySelectorAll('.theme-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeChoice === mode);
    });
    if (window.PeakFX) {
      window.PeakFX.setTheme(mode);
    }
  }

  function renderAvatarElement(container, username, skinDataUrl = null) {
    if (!container) return;
    const safeName = (username || 'PeakPlayer').trim() || 'PeakPlayer';
    const token = `${safeName}|${skinDataUrl ? skinDataUrl.slice(-24) : ''}`;
    container.dataset.avatarToken = token;

    const letter = safeName.slice(0, 1).toUpperCase();
    let hash = 0;
    for (let i = 0; i < safeName.length; i++) {
      hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    container.style.background = `linear-gradient(135deg, hsl(${hue}, 68%, 45%), hsl(${(hue + 38) % 360}, 75%, 34%))`;
    container.textContent = letter;

    if (skinDataUrl && window.PeakSkin3D) {
      window.PeakSkin3D.extractHeadDataUrl(skinDataUrl)
        .then((headUrl) => {
          if (!headUrl || container.dataset.avatarToken !== token) return;
          const img = new Image();
          img.alt = safeName;
          img.src = headUrl;
          img.style.imageRendering = 'pixelated';
          container.style.background = 'rgba(15, 23, 42, 0.45)';
          container.textContent = '';
          container.appendChild(img);
        })
        .catch(() => {
          // Keep monogram fallback on malformed image
        });
      return;
    }

    if (/^[a-zA-Z0-9_]{3,16}$/.test(safeName)) {
      const img = new Image();
      img.alt = safeName;
      img.style.imageRendering = 'pixelated';
      img.onload = () => {
        if (img.naturalWidth >= 8 && container.dataset.avatarToken === token) {
          container.style.background = 'rgba(15, 23, 42, 0.45)';
          container.textContent = '';
          container.appendChild(img);
        }
      };
      img.src = `https://minotar.net/helm/${encodeURIComponent(safeName)}/64.png`;
    }
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.body.classList.toggle('overlay-open', viewName !== 'play');
    document.querySelectorAll('.top-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.querySelectorAll('.view').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });
    if (viewName === 'mods') {
      loadModsAndCatalog();
    } else if (viewName === 'skins') {
      loadSkinsCatalog();
      requestAnimationFrame(() => state.skinViewer?.resize());
    } else if (viewName === 'java') {
      renderJavaAndFabricView();
    } else if (viewName === 'versions') {
      renderVersionsTable();
    }
  }

  function renderPlayView() {
    if (!state.appState) return;
    const profile = getActiveProfile();
    const account = getActiveAccount();
    if (!profile) return;

    renderAvatarElement($('topbar-avatar'), account?.username, account?.skinDataUrl);
    $('topbar-username').textContent = account?.username || 'PeakPlayer';

    $('hero-profile-name').textContent = profile.name;
    $('hero-mc-badge').textContent = `MINECRAFT ${profile.mcVersion.toUpperCase()}`;
    $('hero-loader-badge').textContent =
      profile.loader === 'fabric'
        ? profile.fabricVersion && profile.fabricVersion !== 'latest'
          ? `FABRIC ${profile.fabricVersion}`
          : 'FABRIC'
        : 'VANILLA';

    const modCount = state.mods.length;
    const modWord =
      modCount === 1
        ? t('mod_singular')
        : modCount >= 2 && modCount <= 4
          ? t('mod_few')
          : t('mod_many');
    $('btn-hero-go-mods').textContent = `${modCount} ${modWord}`;

    const reqJava = getRequiredJavaForMc(profile.mcVersion);
    const hasJava = Boolean(state.javaData.byMajor[reqJava]);
    const javaBtn = $('btn-quick-install-java');
    if (hasJava) {
      javaBtn.classList.add('hidden');
      $('nav-java-alert').classList.add('hidden');
    } else {
      javaBtn.textContent = t('btn_install_java', { major: reqJava });
      javaBtn.dataset.major = String(reqJava);
      javaBtn.classList.remove('hidden');
      $('nav-java-alert').classList.remove('hidden');
    }

    const fabBtn = $('btn-quick-install-fabric');
    if (profile.loader === 'fabric') {
      const installed = (state.appState.installedFabric || []).find(
        (f) => f.inheritsFrom === profile.mcVersion
      );
      fabBtn.classList.toggle('hidden', Boolean(installed));
      fabBtn.textContent = t('btn_install_fabric');
    } else {
      fabBtn.classList.add('hidden');
    }

    $('btn-hero-delete-profile').classList.toggle('hidden', state.appState.profiles.length <= 1);

    const strip = $('profiles-strip');
    strip.innerHTML = '';
    for (const p of state.appState.profiles) {
      const isActive = p.id === profile.id;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `profile-pill ${isActive ? 'active' : ''}`;
      pill.innerHTML = `<span class="profile-pill-name"></span><span class="profile-pill-ver">${p.mcVersion}</span>`;
      pill.querySelector('.profile-pill-name').textContent = p.name;
      pill.addEventListener('click', () => selectProfile(p.id));
      strip.appendChild(pill);
    }

    updateLaunchButtonUI(state.appState.launchStatus);
  }

  function updateLaunchButtonUI(launchStatus) {
    const btn = $('btn-play');
    const lbl = $('btn-play-label');
    const progBox = $('launch-progress-box');

    if (launchStatus && launchStatus.running) {
      btn.disabled = false;
      btn.classList.add('running');
      lbl.textContent = t('btn_stop');
      progBox.classList.add('hidden');
    } else if (launchStatus && launchStatus.preparing) {
      btn.disabled = true;
      btn.classList.remove('running');
      lbl.textContent = t('btn_starting');
      progBox.classList.remove('hidden');
    } else {
      btn.disabled = false;
      btn.classList.remove('running');
      lbl.textContent = t('btn_play');
    }
  }

  function renderVersionsTable() {
    const tbody = $('versions-tbody');
    if (!state.manifest) {
      tbody.innerHTML = '<tr><td colspan="7">...</td></tr>';
      return;
    }

    const installedSet = new Set(state.appState?.installedVersions || []);
    const q = state.versionsSearch.trim().toLowerCase();
    const filter = state.versionsFilter;

    const filtered = state.manifest.versions.filter((v) => {
      if (q && !v.id.toLowerCase().includes(q)) return false;
      if (filter === 'installed') return installedSet.has(v.id);
      if (filter === 'fabric') return state.fabricVersionsSet.has(v.id);
      if (filter !== 'all' && v.type !== filter) return false;
      return true;
    });

    $('versions-subtitle').textContent = t('versions_sub', {
      shown: Math.min(filtered.length, state.versionsLimit),
      filtered: filtered.length,
      total: state.manifest.versions.length
    });

    const slice = filtered.slice(0, state.versionsLimit);
    tbody.innerHTML = '';

    for (const v of slice) {
      const tr = document.createElement('tr');
      const isInstalled = installedSet.has(v.id);
      const hasFabric = state.fabricVersionsSet.has(v.id);
      const locale = i18n ? i18n.getLanguage() : 'pl';
      const dateStr = v.releaseTime
        ? new Date(v.releaseTime).toLocaleDateString(locale)
        : '—';
      const pillClass = TYPE_PILL_CLASS[v.type] ?? 'vanilla';
      tr.innerHTML = `
        <td><strong>${v.id}</strong></td>
        <td><span class="tag-pill ${pillClass}">${TYPE_LABELS[v.type] || v.type}</span></td>
        <td>${dateStr}</td>
        <td>Java ${v.recommendedJava}</td>
        <td>${hasFabric ? '<span class="tag-pill mods">Fabric OK</span>' : '<span style="color:var(--text-dim)">—</span>'}</td>
        <td>${isInstalled ? `<span class="readiness-ok">${t('status_installed')}</span>` : `<span style="color:var(--text-dim)">${t('status_to_download')}</span>`}</td>
        <td class="td-actions">
          <button class="btn-outline" type="button" data-ver-create="${v.id}">${t('btn_create_profile')}</button>
        </td>
      `;
      tr.querySelector('button[data-ver-create]').addEventListener('click', () => {
        openProfileModal({
          id: null,
          name: hasFabric ? `Szczyt ${v.id}` : `Minecraft ${v.id}`,
          mcVersion: v.id,
          loader: hasFabric ? 'fabric' : 'vanilla',
          fabricVersion: 'latest'
        });
      });
      tbody.appendChild(tr);
    }

    const moreWrap = $('versions-more-wrap');
    if (filtered.length > slice.length) {
      moreWrap.classList.remove('hidden');
      $('btn-versions-more').textContent = t('btn_show_more', {
        left: filtered.length - slice.length
      });
    } else {
      moreWrap.classList.add('hidden');
    }
  }

  function renderModsHeaderAndInstalled() {
    if (!state.appState) return;
    const profile = getActiveProfile();
    const sel = $('mods-profile-select');
    sel.innerHTML = '';
    for (const p of state.appState.profiles) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.mcVersion})`;
      opt.selected = p.id === profile.id;
      sel.appendChild(opt);
    }

    const ptype = state.contentProjectType;
    const folderBtn = $('btn-mods-open-folder');
    folderBtn.textContent =
      ptype === 'shader'
        ? t('folder_shaders')
        : ptype === 'resourcepack'
          ? t('folder_resourcepacks')
          : t('folder_mods');

    $('mods-vanilla-callout').classList.toggle(
      'hidden',
      profile.loader === 'fabric' || ptype !== 'mod'
    );
    $('curated-packs-bar').classList.toggle('hidden', ptype !== 'mod');
    $('modrinth-category-pills').classList.toggle('hidden', ptype !== 'mod');
    $('btn-check-updates').classList.toggle('hidden', ptype !== 'mod');

    $('mods-mc-pill').textContent = `${profile.loader === 'fabric' ? 'Fabric' : 'Vanilla'} · MC ${profile.mcVersion}`;
    const activeList = state.installedContent || state.mods;
    $('mods-tab-count').textContent = String(activeList.length);

    const listEl = $('installed-mods-list');
    listEl.innerHTML = '';
    if (activeList.length === 0) {
      listEl.innerHTML = `<div class="empty-state">${t('empty_installed', { name: profile.name })}</div>`;
      return;
    }

    for (const mod of activeList) {
      const row = document.createElement('div');
      row.className = `installed-mod-row ${mod.enabled ? '' : 'disabled'}`;
      const sizeKb = Math.max(1, Math.round(mod.size / 1024));
      row.innerHTML = `
        <div class="installed-mod-main">
          <div class="installed-mod-icon">
            ${mod.iconUrl ? `<img src="${mod.iconUrl}" alt="" style="width:100%;height:100%;border-radius:8px;object-fit:cover" />` : mod.name.slice(0, 1).toUpperCase()}
          </div>
          <div class="installed-mod-info">
            <strong></strong>
            <span>${mod.fileName} · ${mod.version ? `v${mod.version} · ` : ''}${sizeKb} KB</span>
          </div>
        </div>
        <div class="installed-mod-actions">
          <label class="switch">
            <input type="checkbox" ${mod.enabled ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
          <button class="btn-danger-sm" type="button">${t('btn_remove')}</button>
        </div>
      `;
      row.querySelector('.installed-mod-info strong').textContent = mod.name;
      row.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
        try {
          const updated = await api.toggleContent(
            profile.id,
            mod.fileName,
            e.target.checked,
            ptype
          );
          state.installedContent = updated;
          if (ptype === 'mod') state.mods = updated;
          renderModsHeaderAndInstalled();
          renderPlayView();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      row.querySelector('.btn-danger-sm').addEventListener('click', async () => {
        try {
          const updated = await api.deleteContent(profile.id, mod.fileName, ptype);
          state.installedContent = updated;
          if (ptype === 'mod') state.mods = updated;
          renderModsHeaderAndInstalled();
          renderModrinthGrid();
          renderPlayView();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      listEl.appendChild(row);
    }
  }

  function formatCount(num) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k`;
    return String(num);
  }

  function renderModrinthGrid() {
    const grid = $('modrinth-grid');
    const profile = getActiveProfile();
    const totalEl = $('mods-total-count');
    const moreWrap = $('modrinth-more-wrap');

    if (totalEl) {
      totalEl.textContent = state.modrinthTotalHits
        ? state.modrinthFallbackAll
          ? `${t('results_count', { count: state.modrinthTotalHits.toLocaleString() })} · ${t('fallback_all_versions')}`
          : t('results_count', { count: state.modrinthTotalHits.toLocaleString() })
        : '';
    }

    if (state.modrinthLoading && state.modrinthOffset === 0) {
      grid.innerHTML = `<div class="empty-state">${t('searching_modrinth')}</div>`;
      moreWrap.classList.add('hidden');
      return;
    }

    if (!state.modrinthHits || state.modrinthHits.length === 0) {
      grid.innerHTML = `<div class="empty-state">${t('empty_search', { mc: profile?.mcVersion || '' })}</div>`;
      moreWrap.classList.add('hidden');
      return;
    }

    const activeInstalled = state.installedContent || state.mods;
    const installedIds = new Set(activeInstalled.map((m) => m.projectId).filter(Boolean));
    grid.innerHTML = '';

    for (const hit of state.modrinthHits) {
      const isInstalled = installedIds.has(hit.projectId);
      const card = document.createElement('div');
      card.className = 'mod-card clickable';
      card.innerHTML = `
        <div class="mod-card-head">
          <img class="mod-icon" src="${hit.iconUrl || '../../assets/icon-64.png'}" alt="" loading="lazy" />
          <div class="mod-title-wrap">
            <strong></strong>
            <span class="mod-author"></span>
          </div>
        </div>
        <p class="mod-desc"></p>
        <div class="mod-card-foot">
          <span class="mod-downloads">${t('downloads_fmt', { val: formatCount(hit.downloads) })}</span>
          <button class="${isInstalled ? 'btn-outline' : 'btn-accent'}" type="button" ${isInstalled ? 'disabled' : ''}>
            ${isInstalled ? t('btn_added') : t('btn_add')}
          </button>
        </div>
      `;
      card.querySelector('.mod-title-wrap strong').textContent = hit.title;
      card.querySelector('.mod-author').textContent = hit.author;
      card.querySelector('.mod-desc').textContent = hit.description || '';

      const addBtn = card.querySelector('button');
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openModDetailsModal(hit);
      });

      if (!isInstalled) {
        addBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await installHitDirect(hit, null, addBtn);
        });
      }
      grid.appendChild(card);
    }

    if (state.modrinthHasMore) {
      moreWrap.classList.remove('hidden');
      const left = Math.max(0, state.modrinthTotalHits - state.modrinthHits.length);
      $('btn-modrinth-more').textContent = t('btn_show_more', { left: left.toLocaleString() });
    } else {
      moreWrap.classList.add('hidden');
    }
  }

  async function installHitDirect(hit, versionId = null, btnEl = null) {
    const profile = getActiveProfile();
    if (!profile) return;
    const ptype = hit.projectType || state.contentProjectType || 'mod';
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = t('btn_downloading');
    }
    try {
      if (ptype === 'mod' && profile.loader !== 'fabric') {
        await api.enableFabricOnProfile(profile.id, 'latest');
        state.appState = await api.getState();
      }
      const res = await api.installModrinthMod({
        projectId: hit.projectId,
        versionId,
        projectType: ptype,
        mcVersion: profile.mcVersion,
        profileId: profile.id,
        projectMeta: hit
      });
      state.installedContent = res.mods;
      if (ptype === 'mod') state.mods = res.mods;
      showToast(t('toast_mod_added', { title: hit.title }), 'success');
      renderModsHeaderAndInstalled();
      renderModrinthGrid();
      renderPlayView();
    } catch (err) {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = t('btn_add');
      }
      showToast(err.message, 'error');
    }
  }

  async function openModDetailsModal(hit) {
    const profile = getActiveProfile();
    const ptype = hit.projectType || state.contentProjectType || 'mod';
    $('mod-details-icon').src = hit.iconUrl || '../../assets/icon-64.png';
    $('mod-details-title').textContent = hit.title;
    $('mod-details-author').textContent = hit.author || '';
    $('mod-details-desc').textContent = hit.description || '';
    $('mod-details-downloads').textContent = t('downloads_fmt', { val: formatCount(hit.downloads || 0) });
    $('mod-details-followers').textContent = '';
    $('mod-details-license').textContent = '';
    $('mod-details-version-select').innerHTML = `<option value="">${t('searching_modrinth')}</option>`;
    $('mod-details-deps').textContent = '';
    $('mod-details-install-btn').disabled = true;
    $('modal-mod-details').classList.remove('hidden');

    try {
      const details = await api.getModDetails({
        projectId: hit.projectId,
        mcVersion: profile?.mcVersion || '',
        projectType: ptype
      });
      state.activeModDetails = details;
      if (details.author) $('mod-details-author').textContent = details.author;
      $('mod-details-downloads').textContent = t('downloads_fmt', { val: formatCount(details.downloads) });
      $('mod-details-followers').textContent = t('followers_fmt', { val: formatCount(details.followers) });
      $('mod-details-license').textContent = details.license || '';

      const sel = $('mod-details-version-select');
      sel.innerHTML = '';
      if (!details.versions || details.versions.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = t('details_no_versions');
        sel.appendChild(opt);
        $('mod-details-install-btn').disabled = true;
      } else {
        for (const v of details.versions) {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = `${v.versionNumber} (${v.versionType})`;
          sel.appendChild(opt);
        }
        $('mod-details-install-btn').disabled = false;
        const firstDeps = details.versions[0]?.dependencies?.length || 0;
        $('mod-details-deps').textContent = firstDeps > 0 ? t('details_deps', { count: firstDeps }) : '';
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function searchModrinthCatalog({ append = false } = {}) {
    const profile = getActiveProfile();
    if (!profile) return;
    if (!append) {
      state.modrinthOffset = 0;
      state.modrinthHits = [];
    }
    state.modrinthLoading = true;
    renderModrinthGrid();
    try {
      const res = await api.searchModrinth({
        query: state.modrinthQuery,
        mcVersion: profile.mcVersion,
        category: state.contentProjectType === 'mod' ? state.modrinthCategory : 'all',
        projectType: state.contentProjectType,
        sort: state.modrinthSort,
        offset: state.modrinthOffset,
        limit: 24
      });
      state.modrinthHits = append ? [...state.modrinthHits, ...(res.hits || [])] : res.hits || [];
      state.modrinthTotalHits = res.totalHits || state.modrinthHits.length;
      state.modrinthHasMore = Boolean(res.hasMore);
      state.modrinthFallbackAll = Boolean(res.fallbackAllVersions);
    } catch (err) {
      if (!append) state.modrinthHits = [];
      showToast(`${t('error_prefix')}: ${err.message}`, 'error');
    } finally {
      state.modrinthLoading = false;
      renderModrinthGrid();
    }
  }

  async function refreshActiveContent() {
    const profile = getActiveProfile();
    if (!profile) return;
    const [modsList, contentList] = await Promise.all([
      api.listMods(profile.id),
      state.contentProjectType === 'mod'
        ? Promise.resolve(null)
        : api.listContent(profile.id, state.contentProjectType)
    ]);
    state.mods = modsList;
    state.installedContent = contentList || modsList;
  }

  async function loadModsAndCatalog() {
    await refreshActiveContent();
    renderModsHeaderAndInstalled();
    if (state.modsSubView === 'browse') {
      await searchModrinthCatalog({ append: false });
    }
  }

  async function runCuratedPackInstall(packId, triggerBtn) {
    const profile = getActiveProfile();
    if (!profile) return;
    const origText = triggerBtn ? triggerBtn.textContent : '';
    document.querySelectorAll('.pack-btn').forEach((b) => (b.disabled = true));
    if (triggerBtn) triggerBtn.textContent = t('installing');
    try {
      if (profile.loader !== 'fabric') {
        await api.enableFabricOnProfile(profile.id, 'latest');
        state.appState = await api.getState();
      }
      const res = await api.installPack(profile.id, packId);
      state.mods = res.mods;
      state.installedContent = res.mods;
      renderModsHeaderAndInstalled();
      renderModrinthGrid();
      renderPlayView();
      showToast(
        t('toast_pack_done', { title: res.packTitle, count: res.installed.length }),
        'success'
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      document.querySelectorAll('.pack-btn').forEach((b) => (b.disabled = false));
      if (triggerBtn) triggerBtn.textContent = origText;
    }
  }

  async function renderJavaAndFabricView() {
    const grid = $('java-cards-grid');
    grid.innerHTML = '';

    for (const major of [25, 21, 17, 8]) {
      const detected = state.javaData.byMajor[major];
      const adoptium = state.adoptiumInfo[major];
      const isManaged = detected && detected.source === 'managed';
      const busy = state.javaDownloadingMajor === major;

      const card = document.createElement('div');
      card.className = `java-card ${detected ? 'ready' : ''}`;
      card.innerHTML = `
        <div class="java-card-top">
          <strong>Java ${major}</strong>
          <span class="tag-pill ${detected ? 'mods' : 'vanilla'}">${detected ? t('java_ready') : t('java_missing')}</span>
        </div>
        <div class="java-card-sub">${JAVA_DESCRIPTIONS[major]}</div>
        <div class="java-status ${detected ? 'readiness-ok' : 'readiness-warn'}">
          ${detected ? `${detected.rawVersion} (${detected.source === 'managed' ? 'Peak' : 'System'})` : t('java_not_detected')}
        </div>
        <div class="java-card-sub">
          ${adoptium && adoptium.size ? `Adoptium Temurin · ${(adoptium.size / 1048576).toFixed(1)} MB` : 'Eclipse Temurin JRE x64'}
        </div>
        <div class="java-card-actions"></div>
      `;

      const actionsEl = card.querySelector('.java-card-actions');
      if (isManaged) {
        const rmBtn = document.createElement('button');
        rmBtn.className = 'btn-danger-sm';
        rmBtn.type = 'button';
        rmBtn.textContent = t('java_remove_peak');
        rmBtn.addEventListener('click', async () => {
          const res = await api.removeJava(major);
          state.javaData = res.detected;
          renderJavaAndFabricView();
          renderPlayView();
        });
        actionsEl.appendChild(rmBtn);
      } else {
        const dlBtn = document.createElement('button');
        dlBtn.className = detected ? 'btn-outline' : 'btn-accent';
        dlBtn.type = 'button';
        dlBtn.disabled = busy || state.javaDownloadingMajor !== null;
        dlBtn.textContent = busy
          ? t('btn_downloading')
          : detected
            ? t('java_get_peak')
            : t('java_get', { major });
        dlBtn.addEventListener('click', () => triggerJavaInstall(major));
        actionsEl.appendChild(dlBtn);
      }
      grid.appendChild(card);
    }

    const detList = $('detected-java-list');
    detList.innerHTML = '';
    if (state.javaData.list.length === 0) {
      detList.innerHTML = `<div class="compact-row">${t('no_java_detected')}</div>`;
    } else {
      for (const j of state.javaData.list) {
        const row = document.createElement('div');
        row.className = 'compact-row';
        row.innerHTML = `
          <div class="compact-row-meta">
            <strong>Java ${j.major} (${j.rawVersion}) · ${j.vendor}</strong>
            <span>${j.path}</span>
          </div>
          <span class="tag-pill">${j.source}</span>
        `;
        detList.appendChild(row);
      }
    }

    const fabSelect = $('fabric-mc-select');
    if (fabSelect.options.length === 0 && state.fabricVersionsList.length > 0) {
      for (const fv of state.fabricVersionsList.slice(0, 120)) {
        const opt = document.createElement('option');
        opt.value = fv.version;
        opt.textContent = fv.stable ? `${fv.version} (Release)` : `${fv.version} (Snapshot)`;
        fabSelect.appendChild(opt);
      }
      const active = getActiveProfile();
      if (active && state.fabricVersionsSet.has(active.mcVersion)) {
        fabSelect.value = active.mcVersion;
      }
      await loadFabricLoaderOptions(fabSelect.value, $('fabric-loader-select'));
    }

    const fabList = $('installed-fabric-list');
    fabList.innerHTML = '';
    const installedFab = state.appState?.installedFabric || [];
    if (installedFab.length === 0) {
      fabList.innerHTML = `<div class="compact-row">${t('no_fabric_installed')}</div>`;
    } else {
      for (const f of installedFab) {
        const row = document.createElement('div');
        row.className = 'compact-row';
        row.innerHTML = `
          <div class="compact-row-meta">
            <strong>Minecraft ${f.inheritsFrom} · Fabric ${f.loaderVersion}</strong>
            <span>${f.id}</span>
          </div>
          <span class="tag-pill mods">OK</span>
        `;
        fabList.appendChild(row);
      }
    }
  }

  async function loadFabricLoaderOptions(mcVersion, selectEl) {
    if (!mcVersion) return;
    selectEl.innerHTML = `<option value="latest">${t('fabric_latest_stable')}</option>`;
    try {
      const loaders = await api.getFabricLoaders(mcVersion);
      for (const l of loaders.slice(0, 15)) {
        const opt = document.createElement('option');
        opt.value = l.version;
        opt.textContent = l.stable ? `${l.version} (Stable)` : `${l.version} (Beta)`;
        selectEl.appendChild(opt);
      }
    } catch {
      // Keep default 'latest'
    }
  }

  async function triggerJavaInstall(major) {
    state.javaDownloadingMajor = Number(major);
    $('java-install-progress').classList.remove('hidden');
    $('java-progress-label').textContent = `Java ${major}...`;
    $('java-progress-pct').textContent = '0%';
    $('java-progress-bar').style.width = '2%';
    renderJavaAndFabricView();

    try {
      const res = await api.installJava(Number(major));
      state.javaData = res.detected;
      showToast(`Java ${major} (${res.installed.rawVersion}) ✓`, 'success');
    } catch (err) {
      showToast(`${t('error_prefix')}: ${err.message}`, 'error');
    } finally {
      state.javaDownloadingMajor = null;
      $('java-install-progress').classList.add('hidden');
      renderJavaAndFabricView();
      renderPlayView();
    }
  }

  function switchSettingSection(sectionName) {
    const name = sectionName || 'general';
    state.activeSettingSection = name;
    document.querySelectorAll('.settings-nav-item').forEach((btn) => {
      const isMatch = btn.dataset.settingSection === name;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', String(isMatch));
    });
    document.querySelectorAll('.settings-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `setting-pane-${name}`);
    });
    if (name === 'console') {
      const out = $('console-output');
      if (out) out.scrollTop = out.scrollHeight;
    }
  }

  function updateRamVisuals(ramMb) {
    const mem = state.appState?.systemMemory || { totalMb: 8192, maxSafeMb: 6144 };
    const slider = $('setting-ram-slider');
    const minVal = Number(slider?.min || 1024);
    const maxVal = Number(slider?.max || 16384);
    const clamped = Math.max(minVal, Math.min(maxVal, Number(ramMb) || 4096));
    const gbStr = `${(clamped / 1024).toFixed(1)} GB`;

    $('setting-ram-value').textContent = `${clamped} MB · ${gbStr}`;
    const navPill = $('nav-ram-pill');
    if (navPill) navPill.textContent = gbStr;

    const rangePct = maxVal > minVal ? ((clamped - minVal) / (maxVal - minVal)) * 100 : 0;
    if (slider) slider.style.setProperty('--range-pct', `${rangePct.toFixed(1)}%`);

    const sysRatio = mem.totalMb > 0 ? Math.min(100, (clamped / mem.totalMb) * 100) : 40;
    const fill = $('ram-meter-fill');
    if (fill) {
      fill.style.width = `${sysRatio.toFixed(1)}%`;
      fill.classList.toggle('warn', sysRatio > 75);
    }

    document.querySelectorAll('#ram-preset-chips .preset-chip').forEach((chip) => {
      const val = Number(chip.dataset.ram);
      chip.disabled = val > mem.maxSafeMb;
      chip.classList.toggle('active', val === clamped);
    });
  }

  function updateResolutionVisuals() {
    const enabled = Boolean($('setting-custom-res')?.checked);
    const wrap = $('resolution-fields-wrap');
    if (wrap) wrap.classList.toggle('is-disabled', !enabled);
    const curKey = `${$('setting-width')?.value || ''}x${$('setting-height')?.value || ''}`;
    document.querySelectorAll('#res-preset-chips .preset-chip').forEach((chip) => {
      chip.classList.toggle('active', enabled && chip.dataset.res === curKey);
    });
  }

  function flashSavedBadge() {
    const badge = $('settings-save-badge');
    if (!badge) return;
    badge.classList.remove('hidden');
    clearTimeout(state.saveBadgeTimer);
    state.saveBadgeTimer = setTimeout(() => badge.classList.add('hidden'), 2200);
  }

  async function saveSettingsNow({ showNotification = false } = {}) {
    try {
      state.appState = await api.updateSettings({
        ramMb: Number($('setting-ram-slider').value),
        customResolution: $('setting-custom-res').checked,
        width: Number($('setting-width').value),
        height: Number($('setting-height').value),
        autoInstallJava: $('setting-auto-java').checked,
        autoInstallFabric: $('setting-auto-fabric').checked,
        closeOnLaunch: $('setting-close-launch').checked,
        jvmArgs: $('setting-jvm-args').value
      });
      renderSettingsView();
      flashSavedBadge();
      if (showNotification) {
        showToast(t('toast_saved_settings'), 'success');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderSettingsView() {
    if (!state.appState) return;
    const s = state.appState.settings;
    const mem = state.appState.systemMemory || { totalMb: 8192, maxSafeMb: 6144 };

    applyTheme(state.appState.theme);
    applyLanguageUI(state.appState.language || 'pl');
    switchSettingSection(state.activeSettingSection);

    const slider = $('setting-ram-slider');
    slider.max = String(Math.max(2048, mem.maxSafeMb));
    slider.value = String(s.ramMb);
    $('setting-ram-hint').textContent = t('ram_hint', {
      gb: (mem.totalMb / 1024).toFixed(1),
      max: mem.maxSafeMb
    });
    updateRamVisuals(s.ramMb);

    $('setting-custom-res').checked = Boolean(s.customResolution);
    $('setting-width').value = String(s.width || 1280);
    $('setting-height').value = String(s.height || 720);
    updateResolutionVisuals();

    $('setting-auto-java').checked = Boolean(s.autoInstallJava);
    $('setting-auto-fabric').checked = Boolean(s.autoInstallFabric);
    $('setting-close-launch').checked = Boolean(s.closeOnLaunch);
    $('setting-jvm-args').value = s.jvmArgs || '';
    document.querySelectorAll('#jvm-preset-chips .preset-chip').forEach((chip) => {
      chip.classList.toggle('active', Boolean(chip.dataset.jvm) && chip.dataset.jvm === (s.jvmArgs || '').trim());
    });
    $('setting-datadir-path').textContent = state.appState.dataDir || '';

    const navAccCount = $('nav-accounts-count');
    if (navAccCount) navAccCount.textContent = String((state.appState.accounts || []).length);

    if ($('diag-version')) $('diag-version').textContent = 'v1.4.1';
    if ($('diag-ram')) $('diag-ram').textContent = `${(mem.totalMb / 1024).toFixed(1)} GB`;
    if ($('diag-profiles')) $('diag-profiles').textContent = String((state.appState.profiles || []).length);
    if ($('diag-javas')) $('diag-javas').textContent = String((state.javaData?.list || []).length);

    const newAccInput = $('new-account-input');
    if ($('settings-new-acc-avatar') && (!newAccInput || !newAccInput.value.trim())) {
      renderAvatarElement(
        $('settings-new-acc-avatar'),
        getActiveAccount()?.username || 'PeakPlayer',
        getActiveAccount()?.skinDataUrl
      );
    }

    const accList = $('settings-accounts-list');
    accList.innerHTML = '';
    for (const acc of state.appState.accounts) {
      const isActive = acc.id === state.appState.activeAccountId;
      const row = document.createElement('div');
      row.className = `account-manager-row ${isActive ? 'active' : ''}`;

      const left = document.createElement('div');
      left.className = 'account-manager-left';

      const av = document.createElement('span');
      av.className = 'account-avatar-md';
      renderAvatarElement(av, acc.username, acc.skinDataUrl);

      const meta = document.createElement('div');
      meta.className = 'account-manager-meta';

      const titleRow = document.createElement('div');
      titleRow.className = 'account-manager-title';
      const title = document.createElement('span');
      title.textContent = acc.username;
      titleRow.appendChild(title);
      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'account-badge-active';
        badge.textContent = t('account_active_badge');
        titleRow.appendChild(badge);
      }

      const sub = document.createElement('span');
      sub.className = 'account-manager-uuid';
      sub.textContent = `${t('account_offline_badge')} · ${acc.uuid}`;
      meta.append(titleRow, sub);

      left.append(av, meta);

      const actions = document.createElement('div');
      actions.className = 'account-manager-actions';

      if (!isActive) {
        const useBtn = document.createElement('button');
        useBtn.className = 'btn-outline';
        useBtn.type = 'button';
        useBtn.textContent = t('btn_use_account');
        useBtn.addEventListener('click', async () => {
          const res = await api.selectAccount(acc.id);
          state.appState = res.state;
          renderAll();
          showToast(t('toast_account_switched', { name: acc.username }), 'success');
        });
        actions.appendChild(useBtn);
      }

      const copyUuidBtn = document.createElement('button');
      copyUuidBtn.className = 'btn-outline';
      copyUuidBtn.type = 'button';
      copyUuidBtn.textContent = t('btn_copy_uuid');
      copyUuidBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(acc.uuid);
        showToast(t('toast_copied'), 'info');
      });
      actions.appendChild(copyUuidBtn);

      const editBtn = document.createElement('button');
      editBtn.className = 'btn-outline';
      editBtn.type = 'button';
      editBtn.textContent = t('btn_edit_account');
      editBtn.addEventListener('click', () => {
        openAccountsModal({ editAccount: acc, focusInput: true });
      });
      actions.appendChild(editBtn);

      if (state.appState.accounts.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-danger-sm';
        delBtn.type = 'button';
        delBtn.textContent = t('btn_remove');
        delBtn.addEventListener('click', async () => {
          try {
            state.appState = await api.deleteAccount(acc.id);
            renderAll();
            showToast(t('toast_account_deleted'), 'info');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
        actions.appendChild(delBtn);
      }

      row.append(left, actions);
      accList.appendChild(row);
    }
  }

  function closeLangPopover() {
    const pop = $('topbar-lang-popover');
    const btn = $('topbar-lang-btn');
    if (pop) pop.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleLangPopover() {
    const pop = $('topbar-lang-popover');
    const btn = $('topbar-lang-btn');
    if (!pop || !btn) return;
    const willOpen = pop.classList.contains('hidden');
    if (willOpen) closeAccountPopover();
    pop.classList.toggle('hidden', !willOpen);
    btn.setAttribute('aria-expanded', String(willOpen));
  }

  function closeAccountPopover() {
    const pop = $('topbar-account-popover');
    const btn = $('topbar-account-btn');
    if (pop) pop.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleAccountPopover() {
    const pop = $('topbar-account-popover');
    const btn = $('topbar-account-btn');
    if (!pop || !btn) return;
    const willOpen = pop.classList.contains('hidden');
    if (willOpen) {
      closeLangPopover();
      renderAccountPopover();
    }
    pop.classList.toggle('hidden', !willOpen);
    btn.setAttribute('aria-expanded', String(willOpen));
  }

  function renderAccountPopover() {
    if (!state.appState) return;
    const accounts = state.appState.accounts || [];
    const activeId = state.appState.activeAccountId;
    const countEl = $('popover-accounts-count');
    const listEl = $('popover-accounts-list');
    if (!listEl) return;

    if (countEl) countEl.textContent = String(accounts.length);
    listEl.innerHTML = '';

    for (const acc of accounts) {
      const isActive = acc.id === activeId;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `account-popover-item ${isActive ? 'active' : ''}`;
      item.setAttribute('role', 'menuitem');

      const av = document.createElement('span');
      av.className = 'player-avatar-mini';
      renderAvatarElement(av, acc.username, acc.skinDataUrl);

      const meta = document.createElement('div');
      meta.className = 'account-popover-item-meta';
      const strong = document.createElement('strong');
      strong.textContent = acc.username;
      const sub = document.createElement('span');
      sub.textContent = isActive ? t('account_active_badge') : t('account_offline_badge');
      meta.append(strong, sub);

      item.append(av, meta);

      if (isActive) {
        const check = document.createElement('span');
        check.className = 'account-popover-check';
        check.textContent = '✓';
        item.appendChild(check);
      }

      item.addEventListener('click', async () => {
        closeAccountPopover();
        if (isActive) return;
        try {
          const res = await api.selectAccount(acc.id);
          state.appState = res.state;
          renderAll();
          showToast(t('toast_account_switched', { name: acc.username }), 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      listEl.appendChild(item);
    }
  }

  function setAccountModalMode(accountToEdit = null) {
    state.editingAccountId = accountToEdit && accountToEdit.id ? accountToEdit.id : null;
    const heading = $('account-form-heading');
    const input = $('account-nick-input');
    const saveBtn = $('modal-account-save');
    const cancelBtn = $('modal-account-cancel-edit');
    const previewAv = $('account-preview-avatar');

    if (state.editingAccountId && accountToEdit) {
      heading.textContent = t('account_form_edit', { name: accountToEdit.username });
      input.value = accountToEdit.username;
      saveBtn.textContent = t('btn_save_changes');
      cancelBtn.classList.remove('hidden');
      renderAvatarElement(previewAv, accountToEdit.username, accountToEdit.skinDataUrl);
    } else {
      heading.textContent = t('account_form_add');
      input.value = '';
      saveBtn.textContent = t('btn_create_account');
      cancelBtn.classList.add('hidden');
      renderAvatarElement(
        previewAv,
        getActiveAccount()?.username || 'PeakPlayer',
        getActiveAccount()?.skinDataUrl
      );
    }
  }

  function renderAccountsModalList() {
    if (!state.appState) return;
    const listEl = $('modal-accounts-list');
    if (!listEl) return;

    const accounts = state.appState.accounts || [];
    const activeId = state.appState.activeAccountId;
    listEl.innerHTML = '';

    for (const acc of accounts) {
      const isActive = acc.id === activeId;
      const row = document.createElement('div');
      row.className = `account-manager-row ${isActive ? 'active' : ''}`;

      const left = document.createElement('div');
      left.className = 'account-manager-left';

      const av = document.createElement('span');
      av.className = 'account-avatar-md';
      renderAvatarElement(av, acc.username, acc.skinDataUrl);

      const meta = document.createElement('div');
      meta.className = 'account-manager-meta';

      const titleRow = document.createElement('div');
      titleRow.className = 'account-manager-title';
      const nickSpan = document.createElement('span');
      nickSpan.textContent = acc.username;
      titleRow.appendChild(nickSpan);
      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'account-badge-active';
        badge.textContent = t('account_active_badge');
        titleRow.appendChild(badge);
      }

      const uuidSpan = document.createElement('span');
      uuidSpan.className = 'account-manager-uuid';
      uuidSpan.textContent = `${t('account_offline_badge')} · ${acc.uuid}`;

      meta.append(titleRow, uuidSpan);
      left.append(av, meta);

      const actions = document.createElement('div');
      actions.className = 'account-manager-actions';

      if (!isActive) {
        const useBtn = document.createElement('button');
        useBtn.className = 'btn-outline';
        useBtn.type = 'button';
        useBtn.textContent = t('btn_use_account');
        useBtn.addEventListener('click', async () => {
          try {
            const res = await api.selectAccount(acc.id);
            state.appState = res.state;
            renderAll();
            showToast(t('toast_account_switched', { name: acc.username }), 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
        actions.appendChild(useBtn);
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'btn-outline';
      editBtn.type = 'button';
      editBtn.title = t('btn_edit_account');
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', () => {
        setAccountModalMode(acc);
        $('account-nick-input').focus();
        $('account-nick-input').select();
      });
      actions.appendChild(editBtn);

      if (accounts.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-danger-sm';
        delBtn.type = 'button';
        delBtn.textContent = t('btn_remove');
        delBtn.addEventListener('click', async () => {
          try {
            state.appState = await api.deleteAccount(acc.id);
            if (state.editingAccountId === acc.id) {
              setAccountModalMode(null);
            }
            renderAll();
            showToast(t('toast_account_deleted'), 'info');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
        actions.appendChild(delBtn);
      }

      row.append(left, actions);
      listEl.appendChild(row);
    }
  }

  function openAccountsModal({ editAccount = null, focusInput = false } = {}) {
    closeAccountPopover();
    renderAccountsModalList();
    setAccountModalMode(editAccount);
    $('modal-account').classList.remove('hidden');
    if (focusInput) {
      $('account-nick-input').focus();
      if (editAccount) $('account-nick-input').select();
    }
  }

  function populateProfileModalVersions(filterText = '', selectedMc = '') {
    const sel = $('prof-mc-select');
    const q = filterText.trim().toLowerCase();
    const list = (state.manifest?.versions || []).filter((v) =>
      !q || v.id.toLowerCase().includes(q)
    );
    sel.innerHTML = '';
    for (const v of list.slice(0, 200)) {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = `${v.id} (${TYPE_LABELS[v.type] || v.type})`;
      sel.appendChild(opt);
    }
    if (selectedMc && !Array.from(sel.options).some((o) => o.value === selectedMc)) {
      const opt = document.createElement('option');
      opt.value = selectedMc;
      opt.textContent = selectedMc;
      sel.prepend(opt);
    }
    if (selectedMc) {
      sel.value = selectedMc;
    }
  }

  async function openProfileModal(existingProfile = null) {
    state.editingProfileId = existingProfile && existingProfile.id ? existingProfile.id : null;
    $('modal-profile-title').textContent = state.editingProfileId
      ? t('modal_profile_edit')
      : t('modal_profile_new');
    $('prof-name-input').value = existingProfile?.name || '';
    $('prof-mc-filter').value = '';
    const defaultMc = existingProfile?.mcVersion || state.manifest?.latest?.release || '26.3';
    populateProfileModalVersions('', defaultMc);

    const loader = existingProfile?.loader || 'fabric';
    document.querySelectorAll('input[name="prof-loader"]').forEach((r) => {
      r.checked = r.value === loader;
    });
    $('prof-fabric-options').classList.toggle('hidden', loader !== 'fabric');
    $('prof-ram-input').value = existingProfile?.ramMb ? String(existingProfile.ramMb) : '';

    $('modal-profile').classList.remove('hidden');
    await loadFabricLoaderOptions($('prof-mc-select').value, $('prof-fabric-select'));
    if (existingProfile?.fabricVersion) {
      $('prof-fabric-select').value = existingProfile.fabricVersion;
    }
  }

  async function selectProfile(profileId) {
    const res = await api.selectProfile(profileId);
    state.appState = await api.getState();
    await refreshActiveContent();
    renderAll();
    if (state.activeView === 'mods' && state.modsSubView === 'browse') {
      await searchModrinthCatalog({ append: false });
    }
    return res.profile;
  }

  async function startOrStopGame() {
    const status = await api.getLaunchStatus();
    if (status.running) {
      await api.stopGame();
      return;
    }
    const profile = getActiveProfile();
    if (!profile) return;
    updateLaunchButtonUI({ preparing: true });
    $('dock-progress-label').textContent = t('preparing_game');
    $('dock-progress-pct').textContent = '5%';
    $('dock-progress-bar').style.width = '5%';
    try {
      const res = await api.launchProfile(profile.id);
      state.appState = res.state;
      updateLaunchButtonUI({ running: true });
      $('dock-progress-label').textContent = t('mc_running', { ver: profile.mcVersion });
      $('dock-progress-bar').style.width = '100%';
      $('dock-progress-pct').textContent = '100%';
    } catch (err) {
      updateLaunchButtonUI({ running: false });
      $('dock-progress-label').textContent = `${t('error_prefix')}: ${err.message}`;
      showToast(err.message, 'error');
    }
  }

  async function changeLanguage(lang) {
    await api.setLanguage(lang);
    state.appState.language = lang;
    applyLanguageUI(lang);
    renderAll();
    if (state.activeView === 'java') {
      renderJavaAndFabricView();
    } else if (state.activeView === 'mods') {
      renderModrinthGrid();
    }
  }

  function getSkinTargetAccount() {
    if (!state.appState) return null;
    const accounts = state.appState.accounts || [];
    if (state.skinTargetAccountId) {
      const found = accounts.find((a) => a.id === state.skinTargetAccountId);
      if (found) return found;
    }
    const active = getActiveAccount();
    state.skinTargetAccountId = active?.id || null;
    return active;
  }

  function ensureSkinViewer() {
    const canvas = $('skin-3d-canvas');
    if (!canvas || !window.PeakSkin3D) return null;
    if (!state.skinViewer) {
      state.skinViewer = window.PeakSkin3D.createViewer(canvas);
      state.skinViewer.setOptions(state.skinStageOptions);
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => state.skinViewer?.resize());
        ro.observe(canvas.parentElement || canvas);
      }
    }
    return state.skinViewer;
  }

  function renderSkinCatalogGrid(container, items, isPreset, targetAcc) {
    if (!container) return;
    container.innerHTML = '';
    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button';
      const isSelected = isPreset
        ? targetAcc?.skinSource === `preset:${item.id}`
        : Boolean(targetAcc?.hasCustomSkin && targetAcc.skinDataUrl === item.dataUrl);
      card.className = `skin-preset-card ${isSelected ? 'active' : ''}`;

      const thumb = document.createElement('span');
      thumb.className = 'skin-thumb-head';
      if (window.PeakSkin3D && item.dataUrl) {
        window.PeakSkin3D.extractHeadDataUrl(item.dataUrl)
          .then((headUrl) => {
            if (!headUrl) return;
            const img = new Image();
            img.alt = item.name;
            img.src = headUrl;
            thumb.appendChild(img);
          })
          .catch(() => {});
      }

      const meta = document.createElement('div');
      meta.className = 'skin-preset-meta';
      const title = document.createElement('strong');
      title.textContent = item.name;
      const sub = document.createElement('span');
      sub.textContent = item.model === 'slim' ? 'Slim · 3px' : 'Classic · 4px';
      meta.append(title, sub);

      card.append(thumb, meta);
      card.addEventListener('click', async () => {
        const acc = getSkinTargetAccount();
        if (!acc) return;
        try {
          const res = isPreset
            ? await api.applySkinPreset({ accountId: acc.id, presetId: item.id })
            : await api.applySkinLibrary({ accountId: acc.id, hash: item.hash });
          state.appState = res.state;
          if (res.catalog) state.skinCatalog = res.catalog;
          renderAll();
          renderSkinsView();
          showToast(t('toast_skin_applied', { name: acc.username }), 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      container.appendChild(card);
    }
  }

  function renderSkinsView() {
    if (!state.appState) return;
    const accounts = state.appState.accounts || [];
    const targetAcc = getSkinTargetAccount();
    const sel = $('skins-account-select');
    if (sel) {
      sel.innerHTML = '';
      for (const acc of accounts) {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent =
          acc.id === state.appState.activeAccountId
            ? `${acc.username} (${t('account_active_badge')})`
            : acc.username;
        opt.selected = targetAcc && acc.id === targetAcc.id;
        sel.appendChild(opt);
      }
    }

    const hasCustom = Boolean(targetAcc?.hasCustomSkin && targetAcc?.skinDataUrl);
    const model = targetAcc?.skinModel === 'slim' ? 'slim' : 'classic';

    if ($('skin-badge-source')) {
      $('skin-badge-source').textContent = hasCustom ? t('skin_custom_active') : t('skin_no_custom');
    }
    if ($('skin-badge-model')) {
      $('skin-badge-model').textContent = model === 'slim' ? 'Slim 3px' : 'Classic 4px';
    }
    if ($('skin-empty-hint')) {
      $('skin-empty-hint').classList.toggle('hidden', hasCustom);
    }
    if ($('btn-reset-skin')) {
      $('btn-reset-skin').disabled = !hasCustom;
    }
    if ($('skin-model-classic')) {
      $('skin-model-classic').classList.toggle('active', model === 'classic');
    }
    if ($('skin-model-slim')) {
      $('skin-model-slim').classList.toggle('active', model === 'slim');
    }

    const viewer = ensureSkinViewer();
    if (viewer) {
      viewer.setSkin(hasCustom ? targetAcc.skinDataUrl : null, model);
      viewer.resize();
    }

    renderSkinCatalogGrid($('skin-presets-grid'), state.skinCatalog.presets || [], true, targetAcc);
    const libItems = state.skinCatalog.library || [];
    renderSkinCatalogGrid($('skin-library-grid'), libItems, false, targetAcc);
    if ($('skin-library-empty')) {
      $('skin-library-empty').classList.toggle('hidden', libItems.length > 0);
    }
  }

  async function loadSkinsCatalog() {
    try {
      state.skinCatalog = await api.listSkins();
    } catch {
      state.skinCatalog = { presets: [], library: [] };
    }
    renderSkinsView();
  }

  function renderAll() {
    renderPlayView();
    renderAccountPopover();
    renderVersionsTable();
    renderModsHeaderAndInstalled();
    renderSettingsView();
    if (!$('modal-account').classList.contains('hidden')) {
      renderAccountsModalList();
    }
    if (state.activeView === 'skins') {
      renderSkinsView();
    } else if (state.activeView === 'java') {
      renderJavaAndFabricView();
    }
  }

  function wireEvents() {
    $('btn-win-min').addEventListener('click', () => api.minimizeWindow());
    $('btn-win-max').addEventListener('click', () => api.maximizeWindow());
    $('btn-win-close').addEventListener('click', () => api.closeWindow());
    $('btn-theme-toggle').addEventListener('click', async () => {
      const next = document.documentElement.dataset.theme === 'alpine-dark' ? 'alpine-light' : 'alpine-dark';
      await api.setTheme(next);
      state.appState.theme = next;
      applyTheme(next);
    });

    $('topbar-lang-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLangPopover();
    });
    document.querySelectorAll('[data-lang-item]').forEach((item) => {
      item.addEventListener('click', async () => {
        closeLangPopover();
        await changeLanguage(item.dataset.langItem);
      });
    });
    document.querySelectorAll('.lang-tile').forEach((tile) => {
      tile.addEventListener('click', () => changeLanguage(tile.dataset.langChoice));
    });

    document.querySelectorAll('.top-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeAccountPopover();
        closeLangPopover();
        switchView(btn.dataset.view);
      });
    });

    $('topbar-account-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAccountPopover();
    });
    document.addEventListener('click', (e) => {
      const wrap = $('topbar-account-wrap');
      if (wrap && !wrap.contains(e.target)) {
        closeAccountPopover();
      }
      const langWrap = $('topbar-lang-wrap');
      if (langWrap && !langWrap.contains(e.target)) {
        closeLangPopover();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAccountPopover();
        closeLangPopover();
        $('modal-account').classList.add('hidden');
        $('modal-profile').classList.add('hidden');
        $('modal-mod-details').classList.add('hidden');
      }
    });
    $('btn-popover-add-account').addEventListener('click', () =>
      openAccountsModal({ editAccount: null, focusInput: true })
    );
    $('btn-popover-skin').addEventListener('click', () => {
      closeAccountPopover();
      state.skinTargetAccountId = getActiveAccount()?.id || null;
      switchView('skins');
    });
    $('btn-popover-manage-accounts').addEventListener('click', () =>
      openAccountsModal({ editAccount: null, focusInput: false })
    );
    $('modal-account-close').addEventListener('click', () => $('modal-account').classList.add('hidden'));
    $('modal-account-done').addEventListener('click', () => $('modal-account').classList.add('hidden'));
    $('modal-account-cancel-edit').addEventListener('click', () => setAccountModalMode(null));

    let previewDebounce = null;
    $('account-nick-input').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(previewDebounce);
      previewDebounce = setTimeout(() => {
        renderAvatarElement(
          $('account-preview-avatar'),
          val.length >= 1 ? val : getActiveAccount()?.username || 'PeakPlayer'
        );
      }, 150);
    });
    $('account-nick-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('modal-account-save').click();
      }
    });

    $('modal-account-save').addEventListener('click', async () => {
      const wasEditing = Boolean(state.editingAccountId);
      try {
        const res = await api.saveAccount({
          id: state.editingAccountId || undefined,
          username: $('account-nick-input').value
        });
        state.appState = res.state;
        setAccountModalMode(null);
        renderAccountsModalList();
        renderAll();
        showToast(
          t(wasEditing ? 'toast_account_updated' : 'toast_account_added', { name: res.account.username }),
          'success'
        );
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-new-profile').addEventListener('click', () => openProfileModal(null));
    $('btn-hero-edit-profile').addEventListener('click', () => openProfileModal(getActiveProfile()));
    $('btn-hero-open-folder').addEventListener('click', () => api.openProfileFolder(getActiveProfile()?.id));
    $('btn-hero-delete-profile').addEventListener('click', async () => {
      const active = getActiveProfile();
      if (!active || state.appState.profiles.length <= 1) return;
      state.appState = await api.deleteProfile(active.id);
      await refreshActiveContent();
      renderAll();
      showToast(t('toast_deleted_profile'), 'info');
    });
    $('btn-hero-go-mods').addEventListener('click', () => switchView('mods'));

    $('btn-quick-install-java').addEventListener('click', async () => {
      const major = Number($('btn-quick-install-java').dataset.major || 21);
      switchView('java');
      await triggerJavaInstall(major);
    });

    $('btn-quick-install-fabric').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      const btn = $('btn-quick-install-fabric');
      btn.disabled = true;
      btn.textContent = t('installing');
      try {
        const res = await api.enableFabricOnProfile(profile.id, profile.fabricVersion || 'latest');
        state.appState = res.state;
        renderAll();
        showToast(`Fabric ${res.installed.loaderVersion} ✓`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = t('btn_install_fabric');
      }
    });

    $('btn-play').addEventListener('click', startOrStopGame);

    $('btn-refresh-manifest').addEventListener('click', async () => {
      state.manifest = await api.getManifest(true);
      renderVersionsTable();
    });
    $('versions-search').addEventListener('input', (e) => {
      state.versionsSearch = e.target.value;
      state.versionsLimit = 80;
      renderVersionsTable();
    });
    $('versions-filter-pills').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      document.querySelectorAll('#versions-filter-pills .filter-pill').forEach((b) =>
        b.classList.toggle('active', b === btn)
      );
      state.versionsFilter = btn.dataset.filter;
      state.versionsLimit = 80;
      renderVersionsTable();
    });
    $('btn-versions-more').addEventListener('click', () => {
      state.versionsLimit += 120;
      renderVersionsTable();
    });

    // Mods view
    $('mods-profile-select').addEventListener('change', (e) => selectProfile(e.target.value));
    $('btn-mods-open-folder').addEventListener('click', () =>
      api.openContentFolder(getActiveProfile()?.id, state.contentProjectType)
    );
    $('btn-switch-profile-fabric').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      try {
        const res = await api.enableFabricOnProfile(profile.id, 'latest');
        state.appState = res.state;
        renderAll();
        await searchModrinthCatalog({ append: false });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('mods-type-tabs').addEventListener('click', async (e) => {
      const tab = e.target.closest('.subtab');
      if (!tab) return;
      document.querySelectorAll('#mods-type-tabs .subtab').forEach((el) =>
        el.classList.toggle('active', el === tab)
      );
      const viewMode = tab.dataset.contentView || 'browse';
      state.modsSubView = viewMode;
      if (tab.dataset.ptype) {
        state.contentProjectType = tab.dataset.ptype;
      }
      $('modtab-browse').classList.toggle('active', viewMode === 'browse');
      $('modtab-installed').classList.toggle('active', viewMode === 'installed');
      await refreshActiveContent();
      renderModsHeaderAndInstalled();
      if (viewMode === 'browse') {
        await searchModrinthCatalog({ append: false });
      }
    });

    $('curated-packs-bar').addEventListener('click', (e) => {
      const btn = e.target.closest('.pack-btn');
      if (btn && btn.dataset.pack) {
        runCuratedPackInstall(btn.dataset.pack, btn);
      }
    });

    let searchDebounce = null;
    $('modrinth-search-input').addEventListener('input', (e) => {
      state.modrinthQuery = e.target.value;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => searchModrinthCatalog({ append: false }), 280);
    });
    $('modrinth-sort-select').addEventListener('change', (e) => {
      state.modrinthSort = e.target.value;
      searchModrinthCatalog({ append: false });
    });
    $('modrinth-category-pills').addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      document.querySelectorAll('#modrinth-category-pills .filter-pill').forEach((p) =>
        p.classList.toggle('active', p === pill)
      );
      state.modrinthCategory = pill.dataset.cat;
      searchModrinthCatalog({ append: false });
    });

    $('btn-modrinth-more').addEventListener('click', () => {
      state.modrinthOffset += 24;
      searchModrinthCatalog({ append: true });
    });

    $('btn-check-updates').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      const btn = $('btn-check-updates');
      btn.disabled = true;
      btn.textContent = t('checking_updates');
      try {
        const res = await api.updateAllMods(profile.id);
        state.mods = res.mods;
        state.installedContent = res.mods;
        renderModsHeaderAndInstalled();
        if (res.updated && res.updated.length > 0) {
          showToast(t('updates_done', { count: res.updated.length }), 'success');
        } else {
          showToast(t('updates_none', { count: res.checked }), 'info');
        }
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = t('btn_check_updates');
      }
    });

    $('btn-pick-jar-mods').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      const res = await api.pickAndImportContent(profile.id, state.contentProjectType);
      if (!res.canceled) {
        state.installedContent = res.mods;
        if (state.contentProjectType === 'mod') state.mods = res.mods;
        renderModsHeaderAndInstalled();
        renderPlayView();
      }
    });

    const dz = $('mods-dropzone');
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.add('dragover');
    });
    dz.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
    });
    dz.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.remove('dragover');
      const files = Array.from(e.dataTransfer?.files || []);
      const paths = files.map((f) => api.getFilePath(f)).filter(Boolean);
      if (paths.length === 0) return;
      const profile = getActiveProfile();
      const res = await api.importContentPaths(profile.id, paths, state.contentProjectType);
      state.installedContent = res.mods;
      if (state.contentProjectType === 'mod') state.mods = res.mods;
      renderModsHeaderAndInstalled();
      renderPlayView();
    });

    // Mod details modal
    $('modal-details-close').addEventListener('click', () => $('modal-mod-details').classList.add('hidden'));
    $('mod-details-open-web').addEventListener('click', () => {
      if (state.activeModDetails?.projectUrl) {
        api.openExternal(state.activeModDetails.projectUrl);
      }
    });
    $('mod-details-version-select').addEventListener('change', (e) => {
      const v = state.activeModDetails?.versions?.find((item) => item.id === e.target.value);
      const depCount = v?.dependencies?.length || 0;
      $('mod-details-deps').textContent = depCount > 0 ? t('details_deps', { count: depCount }) : '';
    });
    $('mod-details-install-btn').addEventListener('click', async () => {
      const details = state.activeModDetails;
      const versionId = $('mod-details-version-select').value;
      if (!details || !versionId) return;
      const btn = $('mod-details-install-btn');
      btn.disabled = true;
      btn.textContent = t('btn_downloading');
      try {
        await installHitDirect(details, versionId, null);
        $('modal-mod-details').classList.add('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = t('details_install_btn');
      }
    });

    $('btn-rescan-java').addEventListener('click', async () => {
      state.javaData = await api.detectJava();
      renderJavaAndFabricView();
      renderPlayView();
    });
    $('fabric-mc-select').addEventListener('change', (e) =>
      loadFabricLoaderOptions(e.target.value, $('fabric-loader-select'))
    );
    $('btn-install-fabric-manual').addEventListener('click', async () => {
      const mcVer = $('fabric-mc-select').value;
      const loaderVer = $('fabric-loader-select').value;
      const alsoApi = $('fabric-also-api').checked;
      if (!mcVer) return;
      $('fabric-progress-box').classList.remove('hidden');
      try {
        const res = await api.installFabric(mcVer, loaderVer);
        state.appState = res.state;
        if (alsoApi) {
          const active = getActiveProfile();
          if (active && active.mcVersion === mcVer && active.loader === 'fabric') {
            try {
              await api.installModrinthMod({
                projectId: 'P7dR8mSH',
                mcVersion: mcVer,
                profileId: active.id
              });
              await refreshActiveContent();
            } catch {
              // Ignore if Fabric API doesn't exist for snapshot
            }
          }
        }
        renderAll();
        showToast(`Fabric ${res.installed.loaderVersion} (${mcVer}) ✓`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setTimeout(() => $('fabric-progress-box').classList.add('hidden'), 1200);
      }
    });

    document.querySelectorAll('.settings-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchSettingSection(btn.dataset.settingSection));
    });

    document.querySelectorAll('.theme-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.themeChoice;
        await api.setTheme(theme);
        state.appState.theme = theme;
        applyTheme(theme);
        flashSavedBadge();
      });
    });

    $('setting-ram-slider').addEventListener('input', (e) => {
      updateRamVisuals(Number(e.target.value));
    });
    $('setting-ram-slider').addEventListener('change', () => saveSettingsNow({ showNotification: false }));

    $('ram-preset-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip || chip.disabled) return;
      $('setting-ram-slider').value = chip.dataset.ram;
      updateRamVisuals(Number(chip.dataset.ram));
      saveSettingsNow({ showNotification: false });
    });

    $('setting-custom-res').addEventListener('change', () => {
      updateResolutionVisuals();
      saveSettingsNow({ showNotification: false });
    });

    $('res-preset-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip || !chip.dataset.res) return;
      const [w, h] = chip.dataset.res.split('x');
      $('setting-custom-res').checked = true;
      $('setting-width').value = w;
      $('setting-height').value = h;
      updateResolutionVisuals();
      saveSettingsNow({ showNotification: false });
    });

    $('setting-width').addEventListener('change', () => {
      updateResolutionVisuals();
      saveSettingsNow({ showNotification: false });
    });
    $('setting-height').addEventListener('change', () => {
      updateResolutionVisuals();
      saveSettingsNow({ showNotification: false });
    });

    $('jvm-preset-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip) return;
      $('setting-jvm-args').value = chip.dataset.jvm || '';
      saveSettingsNow({ showNotification: false });
    });
    $('setting-jvm-args').addEventListener('change', () => saveSettingsNow({ showNotification: false }));

    $('setting-close-launch').addEventListener('change', () => saveSettingsNow({ showNotification: false }));
    $('setting-auto-java').addEventListener('change', () => saveSettingsNow({ showNotification: false }));
    $('setting-auto-fabric').addEventListener('change', () => saveSettingsNow({ showNotification: false }));

    $('btn-save-settings').addEventListener('click', () => saveSettingsNow({ showNotification: true }));

    $('btn-reset-settings').addEventListener('click', async () => {
      const mem = state.appState?.systemMemory || { maxSafeMb: 6144 };
      const defRam = Math.min(4096, Math.max(2048, mem.maxSafeMb));
      try {
        state.appState = await api.updateSettings({
          ramMb: defRam,
          customResolution: false,
          width: 1280,
          height: 720,
          autoInstallJava: true,
          autoInstallFabric: true,
          closeOnLaunch: false,
          jvmArgs: ''
        });
        renderSettingsView();
        flashSavedBadge();
        showToast(t('toast_settings_reset'), 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    let settingsAccDebounce = null;
    $('new-account-input').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(settingsAccDebounce);
      settingsAccDebounce = setTimeout(() => {
        renderAvatarElement(
          $('settings-new-acc-avatar'),
          val.length >= 1 ? val : getActiveAccount()?.username || 'PeakPlayer'
        );
      }, 150);
    });
    $('btn-open-accounts-modal').addEventListener('click', () =>
      openAccountsModal({ editAccount: null, focusInput: false })
    );

    $('btn-add-account').addEventListener('click', async () => {
      try {
        const res = await api.saveAccount({ username: $('new-account-input').value });
        state.appState = res.state;
        $('new-account-input').value = '';
        renderAll();
        showToast(t('toast_account_added', { name: res.account.username }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    $('new-account-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('btn-add-account').click();
      }
    });

    $('btn-copy-datadir').addEventListener('click', () => {
      if (state.appState?.dataDir) {
        navigator.clipboard.writeText(state.appState.dataDir);
        showToast(t('toast_copied'), 'info');
      }
    });
    $('btn-open-datadir').addEventListener('click', () => api.openPath(state.appState?.dataDir));
    $('btn-change-datadir').addEventListener('click', async () => {
      const picked = await api.pickDirectory();
      if (!picked) return;
      state.appState = await api.updateSettings({ dataDir: picked });
      renderAll();
    });

    // Skin Studio
    $('skins-account-select').addEventListener('change', (e) => {
      state.skinTargetAccountId = e.target.value;
      renderSkinsView();
    });
    const syncStageBtn = (btnId, key) => {
      const btn = $(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        state.skinStageOptions[key] = !state.skinStageOptions[key];
        btn.classList.toggle('active', state.skinStageOptions[key]);
        state.skinViewer?.setOptions(state.skinStageOptions);
      });
    };
    syncStageBtn('btn-skin-rotate', 'autoRotate');
    syncStageBtn('btn-skin-walk', 'walk');
    syncStageBtn('btn-skin-outer', 'showOuterLayer');
    $('btn-skin-cam-reset').addEventListener('click', () => state.skinViewer?.resetCamera());

    $('btn-pick-skin').addEventListener('click', async () => {
      const acc = getSkinTargetAccount();
      if (!acc) return;
      try {
        const res = await api.pickAndUploadSkin({
          accountId: acc.id,
          model: acc.skinModel || 'classic'
        });
        if (!res.canceled) {
          state.appState = res.state;
          if (res.catalog) state.skinCatalog = res.catalog;
          renderAll();
          renderSkinsView();
          showToast(t('toast_skin_applied', { name: acc.username }), 'success');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const skinDz = $('skin-dropzone');
    skinDz.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      skinDz.classList.add('dragover');
    });
    skinDz.addEventListener('dragleave', (e) => {
      e.preventDefault();
      skinDz.classList.remove('dragover');
    });
    skinDz.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      skinDz.classList.remove('dragover');
      const file = (e.dataTransfer?.files || [])[0];
      const filePath = file ? api.getFilePath(file) : '';
      if (!filePath) return;
      const acc = getSkinTargetAccount();
      if (!acc) return;
      try {
        const res = await api.uploadSkinPath({
          accountId: acc.id,
          filePath,
          model: acc.skinModel || 'classic'
        });
        state.appState = res.state;
        if (res.catalog) state.skinCatalog = res.catalog;
        renderAll();
        renderSkinsView();
        showToast(t('toast_skin_applied', { name: acc.username }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const runFetchByNick = async () => {
      const acc = getSkinTargetAccount();
      const nick = $('skin-fetch-input').value.trim();
      if (!acc || !nick) return;
      const btn = $('btn-fetch-skin');
      btn.disabled = true;
      btn.textContent = t('btn_downloading');
      try {
        const res = await api.fetchSkinByNick({
          accountId: acc.id,
          username: nick,
          model: acc.skinModel || 'classic'
        });
        state.appState = res.state;
        if (res.catalog) state.skinCatalog = res.catalog;
        $('skin-fetch-input').value = '';
        renderAll();
        renderSkinsView();
        showToast(t('toast_skin_applied', { name: acc.username }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = t('btn_fetch_skin');
      }
    };
    $('btn-fetch-skin').addEventListener('click', runFetchByNick);
    $('skin-fetch-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runFetchByNick();
      }
    });

    for (const btn of [$('skin-model-classic'), $('skin-model-slim')]) {
      btn.addEventListener('click', async () => {
        const acc = getSkinTargetAccount();
        const model = btn.dataset.model === 'slim' ? 'slim' : 'classic';
        if (!acc) return;
        try {
          const res = await api.setSkinModel({ accountId: acc.id, model });
          state.appState = res.state;
          renderAll();
          renderSkinsView();
          showToast(t('toast_skin_model', { model: model === 'slim' ? 'Slim 3px' : 'Classic 4px' }), 'info');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    $('btn-reset-skin').addEventListener('click', async () => {
      const acc = getSkinTargetAccount();
      if (!acc) return;
      try {
        const res = await api.resetAccountSkin({ accountId: acc.id });
        state.appState = res.state;
        if (res.catalog) state.skinCatalog = res.catalog;
        renderAll();
        renderSkinsView();
        showToast(t('toast_skin_reset', { name: acc.username }), 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Console & logs filters
    $('console-level-filters').addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      document.querySelectorAll('#console-level-filters .filter-pill').forEach((p) =>
        p.classList.toggle('active', p === pill)
      );
      state.consoleLevelFilter = pill.dataset.level || 'all';
      renderConsoleOutput();
    });
    $('console-search-input').addEventListener('input', (e) => {
      state.consoleSearch = e.target.value;
      renderConsoleOutput();
    });
    $('btn-copy-logs').addEventListener('click', () => {
      const text = state.logs.map((l) => `[${l.level}] ${l.text}`).join('\n');
      navigator.clipboard.writeText(text);
      showToast(t('toast_copied'), 'info');
    });
    $('btn-clear-logs').addEventListener('click', () => {
      state.logs = [];
      $('console-output').innerHTML = '';
    });

    $('modal-profile-close').addEventListener('click', () => $('modal-profile').classList.add('hidden'));
    $('modal-profile-cancel').addEventListener('click', () => $('modal-profile').classList.add('hidden'));
    $('prof-mc-filter').addEventListener('input', (e) => {
      populateProfileModalVersions(e.target.value, $('prof-mc-select').value);
    });
    $('prof-mc-select').addEventListener('change', (e) => {
      loadFabricLoaderOptions(e.target.value, $('prof-fabric-select'));
    });
    document.querySelectorAll('input[name="prof-loader"]').forEach((r) => {
      r.addEventListener('change', () => {
        const val = document.querySelector('input[name="prof-loader"]:checked')?.value;
        $('prof-fabric-options').classList.toggle('hidden', val !== 'fabric');
      });
    });
    $('modal-profile-save').addEventListener('click', async () => {
      const name = $('prof-name-input').value.trim();
      const mcVersion = $('prof-mc-select').value;
      const loader = document.querySelector('input[name="prof-loader"]:checked')?.value || 'fabric';
      const fabricVersion = $('prof-fabric-select').value || 'latest';
      const ramRaw = $('prof-ram-input').value.trim();
      const ramMb = ramRaw ? Number(ramRaw) : null;

      try {
        if (state.editingProfileId) {
          const res = await api.updateProfile(state.editingProfileId, {
            name,
            mcVersion,
            loader,
            fabricVersion,
            ramMb
          });
          state.appState = res.state;
        } else {
          const res = await api.createProfile({
            name: name || `Minecraft ${mcVersion}`,
            mcVersion,
            loader,
            fabricVersion,
            ramMb
          });
          state.appState = res.state;
        }
        $('modal-profile').classList.add('hidden');
        await refreshActiveContent();
        renderAll();
        showToast(t('toast_saved_profile'), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    api.onLauncherProgress((p) => {
      $('launch-progress-box').classList.remove('hidden');
      $('dock-progress-label').textContent = p.message || '...';
      if (typeof p.percent === 'number') {
        $('dock-progress-bar').style.width = `${p.percent}%`;
        $('dock-progress-pct').textContent = `${p.percent}%`;
      }
    });

    api.onLauncherLog((entry) => appendLog(entry));

    api.onLauncherStatus(async (st) => {
      $('console-status-text').textContent =
        st.state === 'running'
          ? t('console_running', { pid: st.pid })
          : st.state === 'preparing'
            ? t('console_preparing')
            : t('console_ready');
      for (const dot of [$('nav-console-dot'), $('console-live-dot')]) {
        if (!dot) continue;
        dot.classList.toggle('running', st.state === 'running');
        dot.classList.toggle('preparing', st.state === 'preparing');
      }
      if (st.state === 'idle') {
        updateLaunchButtonUI({ running: false });
        if (st.error) {
          $('launch-progress-box').classList.remove('hidden');
          $('dock-progress-label').textContent = `${t('error_prefix')}: ${st.error}`;
        } else {
          $('launch-progress-box').classList.add('hidden');
          $('dock-progress-bar').style.width = '0%';
        }
        state.appState = await api.getState();
        renderPlayView();
      } else if (st.state === 'running') {
        updateLaunchButtonUI({ running: true });
      }
    });

    api.onJavaProgress((p) => {
      $('java-install-progress').classList.remove('hidden');
      $('java-progress-label').textContent = p.message || '...';
      $('java-progress-pct').textContent = `${p.percent || 0}%`;
      $('java-progress-bar').style.width = `${p.percent || 0}%`;
    });

    api.onFabricProgress((p) => {
      $('fabric-progress-box').classList.remove('hidden');
      $('fabric-progress-label').textContent = p.message || '...';
      $('fabric-progress-pct').textContent = `${p.percent || 0}%`;
      $('fabric-progress-bar').style.width = `${p.percent || 0}%`;
    });

    api.onModsProgress((p) => {
      if (p && p.message) {
        $('launch-progress-box').classList.remove('hidden');
        $('dock-progress-label').textContent = p.message;
      }
    });
  }

  async function init() {
    if (window.PeakFX) {
      window.PeakFX.init('alpine-fx-canvas');
    }
    wireEvents();
    appendLog({ level: 'SYSTEM', text: 'Peak Launcher v1.4.1 started.', ts: new Date().toISOString() });

    state.appState = await api.getState();
    applyTheme(state.appState.theme);
    applyLanguageUI(state.appState.language || 'pl');
    await refreshActiveContent();
    renderAll();

    const [manifestRes, fabricRes, javaRes, adoptiumRes] = await Promise.allSettled([
      api.getManifest(false),
      api.getFabricVersions(false),
      api.detectJava(),
      api.getAdoptiumInfo()
    ]);

    if (manifestRes.status === 'fulfilled') state.manifest = manifestRes.value;
    if (fabricRes.status === 'fulfilled' && Array.isArray(fabricRes.value)) {
      state.fabricVersionsList = fabricRes.value;
      state.fabricVersionsSet = new Set(fabricRes.value.map((f) => f.version));
    }
    if (javaRes.status === 'fulfilled') state.javaData = javaRes.value;
    if (adoptiumRes.status === 'fulfilled' && Array.isArray(adoptiumRes.value)) {
      for (const item of adoptiumRes.value) {
        if (item && item.major) state.adoptiumInfo[item.major] = item;
      }
    }

    renderAll();
    window.__peakReady = true;
  }

  window.__peakTestNavigate = async (view, theme, lang, settingSection) => {
    if (lang) {
      await changeLanguage(lang);
    }
    if (theme) {
      await api.setTheme(theme);
      state.appState.theme = theme;
      applyTheme(theme);
    }
    switchView(view || 'play');
    if (settingSection) {
      switchSettingSection(settingSection);
    }
  };

  init().catch((err) => {
    appendLog({ level: 'ERROR', text: err.message, ts: new Date().toISOString() });
    showToast(err.message, 'error');
    window.__peakReady = true;
  });
})();
