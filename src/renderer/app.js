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
    activeHostingSection: 'overview',
    hostingModsSubView: 'browse',
    hostingModrinthHits: [],
    hostingModrinthTotalHits: 0,
    hostingModrinthHasMore: false,
    hostingModrinthLoading: false,
    hostingModrinthQuery: '',
    hostingModrinthCategory: 'all',
    hostingModrinthSort: 'auto',
    hostingModrinthOffset: 0,
    hostingModsByServer: {},
    hostingStatuses: {},
    hostingLogsByServer: {},
    hostingCmdHistory: [],
    hostingCmdHistIdx: -1,
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
    } else if (viewName === 'hosting') {
      loadHostingView();
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
    if ($('topbar-premium-dot')) {
      $('topbar-premium-dot').classList.toggle('hidden', account?.type !== 'microsoft');
    }

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

    const pcPill = $('btn-hero-peak-client');
    if (pcPill) {
      const s = state.appState.settings || {};
      const mcVer = String(profile.mcVersion || '');
      const hasFullClient = profile.loader === 'fabric' && (/^26\.3(\.|$)/.test(mcVer) || mcVer === '1.21.4');
      const isEnabled = hasFullClient ? s.peakClientEnabled !== false : s.peakResourcePack !== false;
      pcPill.classList.toggle('is-off', !isEnabled);
      const lbl = $('btn-hero-peak-client-label');
      if (lbl) {
        lbl.textContent = !isEnabled
          ? 'PEAK CLIENT: OFF'
          : hasFullClient
            ? 'PEAK CLIENT · F3 + GUI'
            : 'PEAK UI PACK';
      }
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
    document.querySelectorAll('#view-console .settings-nav-item').forEach((btn) => {
      const isMatch = btn.dataset.settingSection === name;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-selected', String(isMatch));
    });
    document.querySelectorAll('#view-console .settings-pane').forEach((pane) => {
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
        jvmArgs: $('setting-jvm-args').value,
        peakClientEnabled: $('setting-peak-client') ? $('setting-peak-client').checked : true,
        peakResourcePack: $('setting-peak-pack') ? $('setting-peak-pack').checked : true,
        peakBetterF3: $('setting-peak-f3') ? $('setting-peak-f3').checked : true,
        peakMainMenu: $('setting-peak-menu') ? $('setting-peak-menu').checked : true,
        peakDarkButtons: $('setting-peak-buttons') ? $('setting-peak-buttons').checked : true,
        peakAccentColor: state.appState?.settings?.peakAccentColor || '#38BDF8'
      });
      renderSettingsView();
      renderPlayView();
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

    const pcActive = s.peakClientEnabled !== false;
    if ($('setting-peak-client')) $('setting-peak-client').checked = pcActive;
    if ($('setting-peak-pack')) $('setting-peak-pack').checked = s.peakResourcePack !== false;
    if ($('setting-peak-f3')) $('setting-peak-f3').checked = s.peakBetterF3 !== false;
    if ($('setting-peak-menu')) $('setting-peak-menu').checked = s.peakMainMenu !== false;
    if ($('setting-peak-buttons')) $('setting-peak-buttons').checked = s.peakDarkButtons !== false;
    const navPcPill = $('nav-peakclient-pill');
    if (navPcPill) navPcPill.textContent = pcActive || s.peakResourcePack !== false ? 'ON' : 'OFF';

    const curAccent = String(s.peakAccentColor || '#38BDF8').toUpperCase();
    document.querySelectorAll('#peak-accent-swatches .peakclient-swatch').forEach((btn) => {
      const match = String(btn.dataset.accent || '').toUpperCase() === curAccent;
      btn.classList.toggle('active', match);
      btn.textContent = match ? '✓' : '';
    });

    const pcNote = $('peakclient-support-note');
    if (pcNote) {
      const prof = getActiveProfile();
      const mcVer = String(prof?.mcVersion || '');
      const fullMod = prof?.loader === 'fabric' && (/^26\.3(\.|$)/.test(mcVer) || mcVer === '1.21.4');
      pcNote.textContent = fullMod
        ? t('pc_support_full', { name: prof.name, ver: mcVer })
        : prof?.loader === 'vanilla'
          ? t('pc_support_pack_only', { name: prof.name, ver: mcVer })
          : t('pc_support_pack_generic', { name: prof?.name || '', ver: mcVer });
    }

    const navAccCount = $('nav-accounts-count');
    if (navAccCount) navAccCount.textContent = String((state.appState.accounts || []).length);

    if ($('diag-version')) $('diag-version').textContent = 'v1.7.1';
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

      const isMs = acc.type === 'microsoft';
      const titleRow = document.createElement('div');
      titleRow.className = 'account-manager-title';
      const title = document.createElement('span');
      title.textContent = acc.username;
      titleRow.appendChild(title);
      if (isMs) {
        const msBadge = document.createElement('span');
        msBadge.className = 'account-badge-premium';
        msBadge.textContent = 'Premium';
        titleRow.appendChild(msBadge);
      }
      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'account-badge-active';
        badge.textContent = t('account_active_badge');
        titleRow.appendChild(badge);
      }

      const sub = document.createElement('span');
      sub.className = 'account-manager-uuid';
      sub.textContent = `${isMs ? t('account_premium_badge') : t('account_offline_badge')} · ${acc.uuid}`;
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

      if (isMs) {
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'btn-outline';
        refreshBtn.type = 'button';
        refreshBtn.title = t('btn_refresh_ms');
        refreshBtn.textContent = '↻';
        refreshBtn.addEventListener('click', async () => {
          refreshBtn.disabled = true;
          try {
            const res = await api.refreshMicrosoftAccount(acc.id);
            state.appState = res.state;
            renderAll();
            showToast(t('toast_ms_refreshed', { name: res.account.username }), 'success');
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            refreshBtn.disabled = false;
          }
        });
        actions.appendChild(refreshBtn);
      } else {
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-outline';
        editBtn.type = 'button';
        editBtn.textContent = t('btn_edit_account');
        editBtn.addEventListener('click', () => {
          openAccountsModal({ editAccount: acc, focusInput: true });
        });
        actions.appendChild(editBtn);
      }

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
      const kindLabel = acc.type === 'microsoft' ? 'Premium' : t('account_offline_badge');
      sub.textContent = isActive ? `${t('account_active_badge')} · ${kindLabel}` : kindLabel;
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

      const isMs = acc.type === 'microsoft';
      const titleRow = document.createElement('div');
      titleRow.className = 'account-manager-title';
      const nickSpan = document.createElement('span');
      nickSpan.textContent = acc.username;
      titleRow.appendChild(nickSpan);
      if (isMs) {
        const msBadge = document.createElement('span');
        msBadge.className = 'account-badge-premium';
        msBadge.textContent = 'Premium';
        titleRow.appendChild(msBadge);
      }
      if (isActive) {
        const badge = document.createElement('span');
        badge.className = 'account-badge-active';
        badge.textContent = t('account_active_badge');
        titleRow.appendChild(badge);
      }

      const uuidSpan = document.createElement('span');
      uuidSpan.className = 'account-manager-uuid';
      uuidSpan.textContent = `${isMs ? t('account_premium_badge') : t('account_offline_badge')} · ${acc.uuid}`;

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

      if (isMs) {
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'btn-outline';
        refreshBtn.type = 'button';
        refreshBtn.title = t('btn_refresh_ms');
        refreshBtn.textContent = '↻';
        refreshBtn.addEventListener('click', async () => {
          refreshBtn.disabled = true;
          try {
            const res = await api.refreshMicrosoftAccount(acc.id);
            state.appState = res.state;
            renderAll();
            showToast(t('toast_ms_refreshed', { name: res.account.username }), 'success');
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            refreshBtn.disabled = false;
          }
        });
        actions.appendChild(refreshBtn);
      } else {
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
      }

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
          showToast(
            res.mojangSynced
              ? t('toast_ms_skin_synced', { name: acc.username })
              : t('toast_skin_applied', { name: acc.username }),
            'success'
          );
          if (res.mojangSyncError) {
            showToast(res.mojangSyncError, 'info');
          }
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
      $('skin-badge-source').textContent =
        targetAcc?.type === 'microsoft'
          ? t('skin_premium_active')
          : hasCustom
            ? t('skin_custom_active')
            : t('skin_no_custom');
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
    renderHostingNavDot();
    if (state.activeView === 'hosting') {
      renderHostingView();
    }
  }

  /* ==================== HOSTING .PEAK ==================== */

  function sanitizeSlugClient(val) {
    return (
      String(val || '')
        .replace(/ł/g, 'l')
        .replace(/Ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\.peak$/i, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24)
        .replace(/-+$/g, '') || 'szczyt'
    );
  }

  function getActiveServer() {
    const servers = state.appState?.servers || [];
    return servers.find((s) => s.id === state.appState?.activeServerId) || servers[0] || null;
  }

  function getServerStatusObj(serverId) {
    return (
      state.hostingStatuses[serverId] ||
      state.appState?.serverStatuses?.[serverId] || {
        serverId,
        state: 'offline',
        players: [],
        playerCount: 0,
        tunnel: { active: false, connecting: false, address: '', provider: '', note: '' }
      }
    );
  }

  function renderHostingNavDot() {
    const liveDot = $('nav-hosting-live');
    if (!liveDot) return;
    const servers = state.appState?.servers || [];
    const anyOnline = servers.some((s) => getServerStatusObj(s.id).state !== 'offline');
    liveDot.classList.toggle('hidden', !anyOnline);
  }

  function switchHostingSection(sectionName) {
    state.activeHostingSection = sectionName;
    document.querySelectorAll('.hosting-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.hostingSection === sectionName);
    });
    document.querySelectorAll('#view-hosting .hosting-content .settings-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `hosting-pane-${sectionName}`);
    });
    if (sectionName === 'mods' && state.hostingModsSubView === 'browse' && state.hostingModrinthHits.length === 0) {
      searchHostingModrinth({ append: false });
    }
  }

  function appendHostingLog(entry) {
    if (!entry || !entry.serverId) return;
    const arr = state.hostingLogsByServer[entry.serverId] || [];
    arr.push(entry);
    if (arr.length > 500) arr.shift();
    state.hostingLogsByServer[entry.serverId] = arr;

    const activeSrv = getActiveServer();
    if (activeSrv && activeSrv.id === entry.serverId) {
      const out = $('hosting-console-output');
      if (out) {
        out.appendChild(createLogRow(entry));
        out.scrollTop = out.scrollHeight;
      }
    }
  }

  function renderHostingConsole(serverId) {
    const out = $('hosting-console-output');
    if (!out) return;
    const logs = state.hostingLogsByServer[serverId] || [];
    const frag = document.createDocumentFragment();
    if (logs.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'log-line log-SYSTEM';
      placeholder.textContent = '[PEAK] Gotowy. Kliknij „Uruchom serwer”, aby wystartować własny świat .peak.';
      frag.appendChild(placeholder);
    } else {
      for (const entry of logs) {
        frag.appendChild(createLogRow(entry));
      }
    }
    out.replaceChildren(frag);
    out.scrollTop = out.scrollHeight;
  }

  function renderHostingInstalledMods(server) {
    const listEl = $('hosting-installed-mods-list');
    const mods = state.hostingModsByServer[server.id] || [];
    if ($('nav-hosting-mods-count')) $('nav-hosting-mods-count').textContent = String(mods.length);
    if ($('hosting-installed-count')) $('hosting-installed-count').textContent = String(mods.length);
    if (!listEl) return;

    listEl.innerHTML = '';
    if (mods.length === 0) {
      listEl.innerHTML = `<div class="empty-state">${t('hempty_server_mods')}</div>`;
      return;
    }

    for (const mod of mods) {
      const row = document.createElement('div');
      row.className = `installed-mod-row ${mod.enabled ? '' : 'disabled'}`;
      const sizeKb = Math.max(1, Math.round((mod.size || 0) / 1024));
      const serverOnlyTag = mod.clientSide === 'unsupported';
      row.innerHTML = `
        <div class="installed-mod-main">
          <div class="installed-mod-icon">
            ${mod.iconUrl ? `<img src="${mod.iconUrl}" alt="" style="width:100%;height:100%;border-radius:8px;object-fit:cover" />` : (mod.name || 'M').slice(0, 1).toUpperCase()}
          </div>
          <div class="installed-mod-info">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <strong></strong>
              ${mod.clientSide ? `<span class="compat-pill ${serverOnlyTag ? 'server-only' : ''}">${serverOnlyTag ? t('hcompat_server_only') : t('hcompat_both')}</span>` : ''}
            </div>
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
      row.querySelector('.installed-mod-info strong').textContent = mod.name || mod.fileName;
      row.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
        try {
          state.hostingModsByServer[server.id] = await api.hostingToggleMod(
            server.id,
            mod.fileName,
            e.target.checked
          );
          renderHostingInstalledMods(server);
          renderHostingModrinthGrid(server);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      row.querySelector('.btn-danger-sm').addEventListener('click', async () => {
        try {
          state.hostingModsByServer[server.id] = await api.hostingDeleteMod(server.id, mod.fileName);
          renderHostingInstalledMods(server);
          renderHostingModrinthGrid(server);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      listEl.appendChild(row);
    }
  }

  function renderHostingModrinthGrid(server) {
    const grid = $('hosting-modrinth-grid');
    const moreWrap = $('hosting-modrinth-more-wrap');
    const totalEl = $('hosting-modrinth-total');
    if (!grid || !server) return;

    if (totalEl) {
      totalEl.textContent = state.hostingModrinthTotalHits
        ? t('results_count', { count: state.hostingModrinthTotalHits.toLocaleString() })
        : '';
    }

    if (state.hostingModrinthLoading && state.hostingModrinthOffset === 0) {
      grid.innerHTML = `<div class="empty-state">${t('searching_modrinth')}</div>`;
      moreWrap.classList.add('hidden');
      return;
    }

    if (!state.hostingModrinthHits || state.hostingModrinthHits.length === 0) {
      grid.innerHTML = `<div class="empty-state">${t('hempty_server_search', { mc: server.mcVersion })}</div>`;
      moreWrap.classList.add('hidden');
      return;
    }

    const installed = state.hostingModsByServer[server.id] || [];
    const installedIds = new Set(installed.map((m) => m.projectId).filter(Boolean));
    grid.innerHTML = '';

    for (const hit of state.hostingModrinthHits) {
      const isInstalled = installedIds.has(hit.projectId);
      const isServerOnly = hit.clientSide === 'unsupported';
      const card = document.createElement('div');
      card.className = 'mod-card';
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
          <div style="display:flex;flex-direction:column;gap:3px;">
            <span class="compat-pill ${isServerOnly ? 'server-only' : ''}">${isServerOnly ? t('hcompat_server_only') : t('hcompat_both')}</span>
            <span class="mod-downloads">${t('downloads_fmt', { val: formatCount(hit.downloads) })}</span>
          </div>
          <button class="${isInstalled ? 'btn-outline' : 'btn-accent'}" type="button" ${isInstalled ? 'disabled' : ''}>
            ${isInstalled ? t('btn_added') : t('btn_add')}
          </button>
        </div>
      `;
      card.querySelector('.mod-title-wrap strong').textContent = hit.title;
      card.querySelector('.mod-author').textContent = hit.author || '';
      card.querySelector('.mod-desc').textContent = hit.description || '';

      const addBtn = card.querySelector('button');
      if (!isInstalled) {
        addBtn.addEventListener('click', async () => {
          addBtn.disabled = true;
          addBtn.textContent = t('btn_downloading');
          try {
            if (server.loader !== 'fabric') {
              const upd = await api.hostingUpdateServer(server.id, { loader: 'fabric', fabricVersion: 'latest' });
              state.appState = upd.state;
            }
            const res = await api.hostingInstallModrinthMod({
              serverId: server.id,
              projectId: hit.projectId,
              projectMeta: hit
            });
            state.hostingModsByServer[server.id] = res.mods;
            showToast(t('toast_server_mod_added', { title: hit.title }), 'success');
            renderHostingView();
          } catch (err) {
            addBtn.disabled = false;
            addBtn.textContent = t('btn_add');
            showToast(err.message, 'error');
          }
        });
      }
      grid.appendChild(card);
    }

    if (state.hostingModrinthHasMore) {
      moreWrap.classList.remove('hidden');
      const left = Math.max(0, state.hostingModrinthTotalHits - state.hostingModrinthHits.length);
      $('btn-hosting-modrinth-more').textContent = t('btn_show_more', { left: left.toLocaleString() });
    } else {
      moreWrap.classList.add('hidden');
    }
  }

  async function searchHostingModrinth({ append = false } = {}) {
    const server = getActiveServer();
    if (!server) return;
    if (!append) state.hostingModrinthOffset = 0;
    state.hostingModrinthLoading = true;
    if (!append) renderHostingModrinthGrid(server);
    try {
      const res = await api.hostingSearchModrinth({
        query: state.hostingModrinthQuery,
        mcVersion: server.mcVersion,
        category: state.hostingModrinthCategory,
        sort: state.hostingModrinthSort,
        offset: state.hostingModrinthOffset,
        limit: 24
      });
      state.hostingModrinthTotalHits = res.totalHits || 0;
      state.hostingModrinthHasMore = Boolean(res.hasMore);
      state.hostingModrinthHits = append ? [...state.hostingModrinthHits, ...res.hits] : res.hits;
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      state.hostingModrinthLoading = false;
      renderHostingModrinthGrid(server);
    }
  }

  function renderPeakRoutesList() {
    const container = $('hosting-routes-list');
    if (!container || !state.appState) return;
    container.innerHTML = '';

    const localServers = state.appState.servers || [];
    for (const s of localServers) {
      const rt = getServerStatusObj(s.id);
      const row = document.createElement('div');
      row.className = 'peak-route-row';
      row.innerHTML = `
        <div class="peak-route-info">
          <span class="peak-route-domain"></span>
          <span class="peak-route-arrow">→</span>
          <span class="peak-route-target"></span>
          <span class="peak-route-tag"></span>
        </div>
        <div class="peak-route-actions">
          <button class="btn-outline btn-copy-route" type="button"></button>
        </div>
      `;
      row.querySelector('.peak-route-domain').textContent = s.peakDomain;
      row.querySelector('.peak-route-target').textContent = `127.0.0.1:${rt.bindPort || s.port}`;
      row.querySelector('.peak-route-tag').textContent = t('route_badge_local');
      const copyBtn = row.querySelector('.btn-copy-route');
      copyBtn.textContent = t('btn_copy');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(s.peakDomain);
        showToast(`${t('toast_copied')} (${s.peakDomain})`, 'info');
      });
      container.appendChild(row);
    }

    const externalRoutes = state.appState.peakRoutes || [];
    for (const r of externalRoutes) {
      const row = document.createElement('div');
      row.className = 'peak-route-row';
      row.innerHTML = `
        <div class="peak-route-info">
          <span class="peak-route-domain"></span>
          <span class="peak-route-arrow">→</span>
          <span class="peak-route-target"></span>
          <span class="peak-route-tag external"></span>
        </div>
        <div class="peak-route-actions">
          <button class="btn-outline btn-copy-route" type="button"></button>
          <button class="btn-danger-sm btn-del-route" type="button">✕</button>
        </div>
      `;
      row.querySelector('.peak-route-domain').textContent = r.domain;
      row.querySelector('.peak-route-target').textContent = `${r.targetHost}:${r.targetPort}`;
      row.querySelector('.peak-route-tag').textContent = t('route_badge_external');
      const copyBtn = row.querySelector('.btn-copy-route');
      copyBtn.textContent = t('btn_copy');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(r.domain);
        showToast(`${t('toast_copied')} (${r.domain})`, 'info');
      });
      row.querySelector('.btn-del-route').addEventListener('click', async () => {
        state.appState = await api.hostingDeletePeakRoute(r.domain);
        renderHostingView();
        showToast(t('toast_route_deleted', { domain: r.domain }), 'info');
      });
      container.appendChild(row);
    }

    if (externalRoutes.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'field-hint';
      hint.textContent = t('route_empty');
      container.appendChild(hint);
    }
  }

  function renderHostingView() {
    if (!state.appState) return;
    renderHostingNavDot();
    const servers = state.appState.servers || [];
    const activeSrv = getActiveServer();
    if (!activeSrv) return;

    const listEl = $('hosting-servers-list');
    if (listEl) {
      listEl.innerHTML = '';
      for (const srv of servers) {
        const st = getServerStatusObj(srv.id);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `hosting-server-item ${srv.id === activeSrv.id ? 'active' : ''}`;
        const dotClass =
          st.state === 'online'
            ? 'online'
            : st.state === 'starting' || st.state === 'preparing'
              ? 'starting'
              : '';
        btn.innerHTML = `
          <span class="hosting-server-dot ${dotClass}"></span>
          <div class="hosting-server-item-meta">
            <strong></strong>
            <span class="hosting-server-domain"></span>
            <span class="hosting-server-sub"></span>
          </div>
        `;
        btn.querySelector('strong').textContent = srv.name;
        btn.querySelector('.hosting-server-domain').textContent = srv.peakDomain;
        btn.querySelector('.hosting-server-sub').textContent = `${srv.loader === 'fabric' ? 'Fabric' : 'Vanilla'} · ${srv.mcVersion} · :${srv.port}`;
        btn.addEventListener('click', async () => {
          if (srv.id === activeSrv.id) return;
          const res = await api.hostingSelectServer(srv.id);
          state.appState = res.state;
          await loadHostingView();
        });
        listEl.appendChild(btn);
      }
    }

    const rt = getServerStatusObj(activeSrv.id);
    const isOffline = rt.state === 'offline';
    const isRunning = !isOffline;

    const dotEl = $('nav-hosting-status-dot');
    const cdotEl = $('hosting-console-dot');
    for (const d of [dotEl, cdotEl]) {
      if (!d) continue;
      d.classList.toggle('running', rt.state === 'online');
      d.classList.toggle('preparing', rt.state === 'preparing' || rt.state === 'starting' || rt.state === 'stopping');
    }

    $('hosting-srv-name').textContent = activeSrv.name;
    $('hosting-srv-domain').textContent = activeSrv.peakDomain;
    $('hosting-srv-engine').textContent = `${activeSrv.loader === 'fabric' ? 'Fabric' : 'Vanilla'} · ${activeSrv.mcVersion}`;
    $('hosting-srv-port-pill').textContent = `:${activeSrv.port}`;
    $('hosting-srv-ram-pill').textContent = `${(Number(activeSrv.ramMb || 2048) / 1024).toFixed(1)} GB RAM`;

    const statusBadge = $('hosting-status-badge');
    statusBadge.className = `hosting-status-pill ${rt.state}`;
    statusBadge.textContent = t(`hstatus_${rt.state}`) || rt.state;
    $('hosting-players-badge').textContent = t('hplayers_fmt', {
      count: rt.playerCount || 0,
      max: activeSrv.maxPlayers || 10
    });

    $('btn-hosting-start').classList.toggle('hidden', isRunning);
    $('btn-hosting-stop').classList.toggle('hidden', isOffline);
    $('btn-hosting-restart').classList.toggle('hidden', isOffline);
    $('hosting-cmd-input').disabled = isOffline;
    $('btn-hosting-send-cmd').disabled = isOffline;

    const lanIp = state.appState.lanIp || '127.0.0.1';
    const routerSt = state.appState.peakRouterStatus || { listening: false, port: 25565 };
    for (const badge of [$('hosting-router-badge'), $('hshare-router-pill')]) {
      if (!badge) continue;
      badge.classList.toggle('active', Boolean(routerSt.listening));
      badge.classList.toggle('inactive', !routerSt.listening);
      badge.textContent = routerSt.listening
        ? t('router_active_badge', { port: routerSt.port || 25565 })
        : t('router_inactive_badge');
    }

    $('hosting-addr-peak').textContent = activeSrv.peakDomain;
    $('hosting-addr-loopback').textContent = routerSt.listening
      ? t('addr_peak_direct_hint', { port: rt.bindPort || activeSrv.port })
      : `127.0.0.1:${activeSrv.port}`;
    $('hosting-addr-lan').textContent = `${lanIp}:${activeSrv.port}`;
    renderPeakRoutesList();

    const tun = rt.tunnel || {};
    const rawRow = $('hshare-tunnel-raw-row');
    if (tun.active && (tun.publicDomain || tun.address)) {
      const displayTunnelAddr = tun.publicDomain || tun.address;
      $('hosting-addr-tunnel').textContent = displayTunnelAddr;
      $('hosting-addr-tunnel-sub').textContent = tun.registryActive
        ? t('addr_tunnel_peak_live')
        : tun.provider || 'Pinggy TCP';
      $('btn-hosting-toggle-tunnel-quick').textContent = t('btn_disable_tunnel');
      $('btn-copy-addr-tunnel').classList.remove('hidden');
      $('hshare-tunnel-address').textContent = displayTunnelAddr;
      $('btn-hosting-tunnel-toggle').textContent = t('btn_disable_tunnel');
      if (rawRow) {
        const showRaw = Boolean(tun.registryActive && tun.rawAddress);
        rawRow.classList.toggle('hidden', !showRaw);
        if (showRaw && $('hshare-tunnel-raw')) {
          $('hshare-tunnel-raw').textContent = tun.rawAddress;
        }
      }
    } else if (tun.connecting) {
      $('hosting-addr-tunnel').textContent = t('tunnel_connecting');
      $('btn-hosting-toggle-tunnel-quick').textContent = t('tunnel_connecting');
      $('btn-copy-addr-tunnel').classList.add('hidden');
      $('hshare-tunnel-address').textContent = t('tunnel_connecting');
      $('btn-hosting-tunnel-toggle').textContent = t('tunnel_connecting');
      if (rawRow) rawRow.classList.add('hidden');
    } else {
      $('hosting-addr-tunnel').textContent = t('tunnel_off');
      $('hosting-addr-tunnel-sub').textContent = t('addr_tunnel_sub');
      $('btn-hosting-toggle-tunnel-quick').textContent = t('btn_enable_tunnel');
      $('btn-copy-addr-tunnel').classList.add('hidden');
      $('hshare-tunnel-address').textContent = t('tunnel_off');
      $('btn-hosting-tunnel-toggle').textContent = t('btn_enable_tunnel');
      if (rawRow) rawRow.classList.add('hidden');
    }

    renderHostingConsole(activeSrv.id);

    $('hosting-vanilla-callout').classList.toggle('hidden', activeSrv.loader === 'fabric');
    $('hosting-mods-restart-banner').classList.toggle('hidden', isOffline);

    for (const selId of ['hosting-sync-profile-select', 'hosting-dat-profile-select']) {
      const sel = $(selId);
      if (!sel) continue;
      sel.innerHTML = '';
      for (const p of state.appState.profiles || []) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.mcVersion})`;
        if (p.mcVersion === activeSrv.mcVersion && p.loader === activeSrv.loader) opt.selected = true;
        sel.appendChild(opt);
      }
    }

    renderHostingInstalledMods(activeSrv);
    renderHostingModrinthGrid(activeSrv);

    $('hset-name').value = activeSrv.name || '';
    $('hset-slug').value = activeSrv.slug || '';
    $('hset-loader').value = activeSrv.loader || 'fabric';
    const mcSel = $('hset-mc-version');
    if (mcSel) {
      const list = state.manifest?.versions?.filter((v) => v.type === 'release').map((v) => v.id) || ['26.3', '1.21.4', '1.20.4', '1.19.4', '1.16.5', '1.12.2'];
      if (!list.includes(activeSrv.mcVersion)) list.unshift(activeSrv.mcVersion);
      mcSel.innerHTML = '';
      for (const v of list.slice(0, 80)) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        if (v === activeSrv.mcVersion) opt.selected = true;
        mcSel.appendChild(opt);
      }
    }
    $('hset-port').value = String(activeSrv.port || 25565);
    $('hset-maxplayers').value = String(activeSrv.maxPlayers || 10);
    const maxSafe = state.appState.systemMemory?.maxSafeMb || 16384;
    $('hset-ram-slider').max = String(Math.max(2048, maxSafe));
    $('hset-ram-slider').value = String(activeSrv.ramMb || 2048);
    $('hset-ram-val').textContent = `${activeSrv.ramMb || 2048} MB · ${((activeSrv.ramMb || 2048) / 1024).toFixed(1)} GB`;
    $('hset-gamemode').value = activeSrv.gamemode || 'survival';
    $('hset-difficulty').value = activeSrv.difficulty || 'normal';
    $('hset-viewdist').value = String(activeSrv.viewDistance || 10);
    $('hset-seed').value = activeSrv.seed || '';
    $('hset-motd').value = activeSrv.motd || '';
    $('hset-nonpremium').checked = !activeSrv.onlineMode;
    $('hset-pvp').checked = activeSrv.pvp !== false;
    $('hset-whitelist').checked = Boolean(activeSrv.whitelist);
    $('hset-cmdblocks').checked = Boolean(activeSrv.commandBlocks);
    $('hset-eula').checked = Boolean(activeSrv.eulaAccepted);
    $('btn-hosting-delete-server').disabled = servers.length <= 1;
    switchHostingSection(state.activeHostingSection || 'overview');
  }

  async function loadHostingView() {
    const activeSrv = getActiveServer();
    if (!activeSrv) return;
    try {
      const [mods, status, logs] = await Promise.all([
        api.hostingListMods(activeSrv.id),
        api.hostingGetStatus(activeSrv.id),
        api.hostingGetLogs(activeSrv.id)
      ]);
      state.hostingModsByServer[activeSrv.id] = mods;
      state.hostingStatuses[activeSrv.id] = status;
      state.hostingLogsByServer[activeSrv.id] = logs;
    } catch {
      // Render available cached state
    }
    renderHostingView();
    if (state.activeHostingSection === 'mods' && state.hostingModsSubView === 'browse') {
      searchHostingModrinth({ append: false });
    }
  }

  function populateNewServerModalVersions(filter = '') {
    const sel = $('msrv-mc-select');
    if (!sel) return;
    const f = filter.trim().toLowerCase();
    const list = (state.manifest?.versions || [])
      .filter((v) => v.type === 'release')
      .map((v) => v.id);
    const items = (list.length ? list : ['26.3', '1.21.4', '1.20.4', '1.16.5', '1.12.2'])
      .filter((id) => !f || id.toLowerCase().includes(f))
      .slice(0, 60);
    sel.innerHTML = '';
    for (const id of items) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      if (!f && id === '1.21.4') opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function openNewServerModal() {
    $('msrv-name').value = '';
    $('msrv-slug').value = '';
    $('msrv-domain-preview').textContent = 'ekipa-szczyt.peak';
    $('msrv-mc-filter').value = '';
    populateNewServerModalVersions('');
    const ports = new Set((state.appState?.servers || []).map((s) => Number(s.port)));
    let nextPort = 25565;
    while (ports.has(nextPort) && nextPort < 65535) nextPort++;
    $('msrv-port').value = String(nextPort);
    $('msrv-ram').value = '3072';
    $('msrv-nonpremium').checked = true;
    $('msrv-eula').checked = true;
    $('modal-server').classList.remove('hidden');
    $('msrv-name').focus();
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
        $('modal-server').classList.add('hidden');
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

    const triggerMicrosoftLogin = async (btnEl, isShort = false) => {
      if (!btnEl) return;
      closeAccountPopover();
      const labelEl = btnEl.querySelector('span');
      const prevText = labelEl ? labelEl.textContent : '';
      btnEl.disabled = true;
      if (labelEl) labelEl.textContent = t('ms_login_waiting');
      try {
        const res = await api.loginMicrosoftAccount();
        if (!res || res.canceled) return;
        state.appState = res.state;
        renderAccountsModalList();
        renderAll();
        showToast(t('toast_ms_logged_in', { name: res.account.username }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnEl.disabled = false;
        if (labelEl) {
          labelEl.textContent = isShort ? t('btn_login_microsoft_short') : prevText || t('btn_login_microsoft');
        }
      }
    };
    $('btn-popover-ms-login')?.addEventListener('click', () =>
      triggerMicrosoftLogin($('btn-popover-ms-login'), true)
    );
    $('btn-modal-ms-login')?.addEventListener('click', () =>
      triggerMicrosoftLogin($('btn-modal-ms-login'), false)
    );
    $('btn-settings-ms-login')?.addEventListener('click', () =>
      triggerMicrosoftLogin($('btn-settings-ms-login'), false)
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

    for (const id of ['setting-peak-client', 'setting-peak-pack', 'setting-peak-f3', 'setting-peak-menu', 'setting-peak-buttons']) {
      const el = $(id);
      if (el) el.addEventListener('change', () => saveSettingsNow({ showNotification: false }));
    }
    const swatchesEl = $('peak-accent-swatches');
    if (swatchesEl) {
      swatchesEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('.peakclient-swatch');
        if (!btn || !btn.dataset.accent) return;
        try {
          state.appState = await api.updateSettings({ peakAccentColor: btn.dataset.accent });
          renderSettingsView();
          flashSavedBadge();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }
    const heroPcBtn = $('btn-hero-peak-client');
    if (heroPcBtn) {
      heroPcBtn.addEventListener('click', () => {
        switchView('console');
        switchSettingSection('peakclient');
      });
    }

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
          jvmArgs: '',
          peakClientEnabled: true,
          peakResourcePack: true,
          peakBetterF3: true,
          peakMainMenu: true,
          peakDarkButtons: true,
          peakAccentColor: '#38BDF8'
        });
        renderSettingsView();
        renderPlayView();
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
          showToast(
            res.mojangSynced
              ? t('toast_ms_skin_synced', { name: acc.username })
              : t('toast_skin_applied', { name: acc.username }),
            'success'
          );
          if (res.mojangSyncError) {
            showToast(res.mojangSyncError, 'info');
          }
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
        showToast(
          res.mojangSynced
            ? t('toast_ms_skin_synced', { name: acc.username })
            : t('toast_skin_applied', { name: acc.username }),
          'success'
        );
        if (res.mojangSyncError) {
          showToast(res.mojangSyncError, 'info');
        }
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
        showToast(
          res.mojangSynced
            ? t('toast_ms_skin_synced', { name: acc.username })
            : t('toast_skin_applied', { name: acc.username }),
          'success'
        );
        if (res.mojangSyncError) {
          showToast(res.mojangSyncError, 'info');
        }
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

    /* ==================== HOSTING .PEAK EVENTS ==================== */
    document.querySelectorAll('.hosting-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchHostingSection(btn.dataset.hostingSection));
    });

    $('btn-hosting-new-server').addEventListener('click', openNewServerModal);
    $('modal-server-close').addEventListener('click', () => $('modal-server').classList.add('hidden'));
    $('modal-server-cancel').addEventListener('click', () => $('modal-server').classList.add('hidden'));
    $('msrv-name').addEventListener('input', (e) => {
      if (!$('msrv-slug').dataset.userEdited) {
        const s = sanitizeSlugClient(e.target.value);
        $('msrv-slug').value = e.target.value.trim() ? s : '';
        $('msrv-domain-preview').textContent = `${e.target.value.trim() ? s : 'ekipa-szczyt'}.peak`;
      }
    });
    $('msrv-slug').addEventListener('input', (e) => {
      e.target.dataset.userEdited = e.target.value.trim() ? '1' : '';
      const s = sanitizeSlugClient(e.target.value || $('msrv-name').value);
      $('msrv-domain-preview').textContent = `${s}.peak`;
    });
    $('msrv-mc-filter').addEventListener('input', (e) => populateNewServerModalVersions(e.target.value));
    $('modal-server-save').addEventListener('click', async () => {
      try {
        const loader = document.querySelector('input[name="msrv-loader"]:checked')?.value || 'fabric';
        const res = await api.hostingCreateServer({
          name: $('msrv-name').value,
          slug: $('msrv-slug').value || $('msrv-name').value,
          mcVersion: $('msrv-mc-select').value,
          loader,
          port: Number($('msrv-port').value) || 25565,
          ramMb: Number($('msrv-ram').value) || 3072,
          onlineMode: !$('msrv-nonpremium').checked,
          eulaAccepted: $('msrv-eula').checked
        });
        state.appState = res.state;
        $('msrv-slug').dataset.userEdited = '';
        $('modal-server').classList.add('hidden');
        showToast(t('toast_server_created', { domain: res.server.peakDomain }), 'success');
        await loadHostingView();
        switchHostingSection('overview');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-import-peak').addEventListener('click', async () => {
      try {
        const res = await api.hostingImportPeakFile({});
        if (res.canceled) return;
        state.appState = res.state;
        renderAll();
        showToast(
          t('toast_imported_peak', {
            name: res.invite.serverName || res.invite.peakDomain,
            mods: (res.installedMods || []).length
          }),
          'success'
        );
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-start').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        if (!srv.eulaAccepted) {
          if (!window.confirm(t('confirm_auto_eula'))) {
            switchHostingSection('settings');
            return;
          }
          const upd = await api.hostingUpdateServer(srv.id, { eulaAccepted: true });
          state.appState = upd.state;
        }
        showToast(t('toast_server_started', { domain: srv.peakDomain }), 'info');
        const res = await api.hostingStartServer(srv.id);
        state.appState = res.state;
        state.hostingStatuses[srv.id] = res.status;
        renderHostingView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-stop').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const st = await api.hostingStopServer(srv.id);
        state.hostingStatuses[srv.id] = st;
        showToast(t('toast_server_stopped', { domain: srv.peakDomain }), 'info');
        renderHostingView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-restart').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingRestartServer(srv.id);
        if (res.state) state.appState = res.state;
        state.hostingStatuses[srv.id] = res.status || res;
        renderHostingView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-join').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingJoinServer(srv.id);
        state.appState = res.state;
        renderPlayView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-open-folder').addEventListener('click', () => {
      const srv = getActiveServer();
      if (srv) api.hostingOpenFolder(srv.id);
    });

    const copyLocal = () => {
      const srv = getActiveServer();
      if (!srv) return;
      const routerOn = Boolean(state.appState?.peakRouterStatus?.listening);
      const addr = routerOn ? srv.peakDomain : `127.0.0.1:${srv.port}`;
      navigator.clipboard.writeText(addr);
      showToast(`${t('toast_copied')} (${addr})`, 'info');
    };
    $('btn-hosting-copy-domain').addEventListener('click', copyLocal);
    $('btn-copy-addr-local').addEventListener('click', copyLocal);
    $('btn-copy-addr-lan').addEventListener('click', () => {
      const txt = $('hosting-addr-lan').textContent;
      navigator.clipboard.writeText(txt);
      showToast(`${t('toast_copied')} (${txt})`, 'info');
    });
    const copyTunnel = () => {
      const srv = getActiveServer();
      if (!srv) return;
      const tun = getServerStatusObj(srv.id).tunnel;
      const addr = tun?.publicDomain || tun?.address;
      if (!addr) return;
      navigator.clipboard.writeText(addr);
      showToast(`${t('toast_copied')} (${addr})`, 'info');
    };
    $('btn-copy-addr-tunnel').addEventListener('click', copyTunnel);
    $('btn-hshare-copy-tunnel').addEventListener('click', copyTunnel);
    $('btn-hshare-copy-raw')?.addEventListener('click', () => {
      const srv = getActiveServer();
      if (!srv) return;
      const raw = getServerStatusObj(srv.id).tunnel?.rawAddress;
      if (!raw) return;
      navigator.clipboard.writeText(raw);
      showToast(`${t('toast_copied')} (${raw})`, 'info');
    });

    const toggleTunnelHandler = async () => {
      const srv = getActiveServer();
      if (!srv) return;
      const rt = getServerStatusObj(srv.id);
      try {
        if (rt.tunnel?.active || rt.tunnel?.connecting) {
          await api.hostingStopTunnel(srv.id);
          showToast(t('toast_tunnel_closed'), 'info');
        } else {
          const tun = await api.hostingStartTunnel(srv.id);
          showToast(t('toast_tunnel_ready', { address: tun.address }), 'success');
        }
        state.hostingStatuses[srv.id] = await api.hostingGetStatus(srv.id);
        renderHostingView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    $('btn-hosting-toggle-tunnel-quick').addEventListener('click', toggleTunnelHandler);
    $('btn-hosting-tunnel-toggle').addEventListener('click', toggleTunnelHandler);

    const writeServersDatHandler = async (profileId) => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const rt = getServerStatusObj(srv.id);
        const routerOn = Boolean(state.appState?.peakRouterStatus?.listening);
        const customAddr = routerOn
          ? (rt.tunnel?.active && rt.tunnel?.publicDomain ? rt.tunnel.publicDomain : srv.peakDomain)
          : rt.tunnel?.active && (rt.tunnel?.rawAddress || rt.tunnel?.address)
            ? rt.tunnel.rawAddress || rt.tunnel.address
            : `127.0.0.1:${srv.port}`;
        const res = await api.hostingAddToServersDat(srv.id, profileId || null, customAddr);
        state.appState = res.state;
        showToast(t('toast_added_serversdat', { domain: srv.peakDomain }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    $('btn-hosting-add-serversdat').addEventListener('click', () => writeServersDatHandler(null));
    $('btn-hosting-write-serversdat').addEventListener('click', () =>
      writeServersDatHandler($('hosting-dat-profile-select').value)
    );

    const submitHostingCmd = async () => {
      const srv = getActiveServer();
      const input = $('hosting-cmd-input');
      const cmd = input.value.trim();
      if (!srv || !cmd) return;
      try {
        await api.hostingSendCommand(srv.id, cmd);
        state.hostingCmdHistory.unshift(cmd);
        if (state.hostingCmdHistory.length > 30) state.hostingCmdHistory.pop();
        state.hostingCmdHistIdx = -1;
        input.value = '';
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    $('btn-hosting-send-cmd').addEventListener('click', submitHostingCmd);
    $('hosting-cmd-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitHostingCmd();
      } else if (e.key === 'ArrowUp' && state.hostingCmdHistory.length > 0) {
        e.preventDefault();
        state.hostingCmdHistIdx = Math.min(state.hostingCmdHistory.length - 1, state.hostingCmdHistIdx + 1);
        $('hosting-cmd-input').value = state.hostingCmdHistory[state.hostingCmdHistIdx] || '';
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.hostingCmdHistIdx = Math.max(-1, state.hostingCmdHistIdx - 1);
        $('hosting-cmd-input').value =
          state.hostingCmdHistIdx >= 0 ? state.hostingCmdHistory[state.hostingCmdHistIdx] : '';
      }
    });
    $('btn-cmd-op').addEventListener('click', async () => {
      const srv = getActiveServer();
      const acc = getActiveAccount();
      if (srv && acc) {
        try {
          await api.hostingSendCommand(srv.id, `op ${acc.username}`);
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
    $('btn-cmd-save').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (srv) {
        try {
          await api.hostingSendCommand(srv.id, 'save-all');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
    $('btn-cmd-day').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (srv) {
        try {
          await api.hostingSendCommand(srv.id, 'time set day');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });
    $('btn-hosting-clear-console').addEventListener('click', () => {
      const srv = getActiveServer();
      if (srv) {
        state.hostingLogsByServer[srv.id] = [];
        renderHostingConsole(srv.id);
      }
    });

    // Server Mods pane
    $('btn-hosting-switch-fabric').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingUpdateServer(srv.id, { loader: 'fabric', fabricVersion: 'latest' });
        state.appState = res.state;
        renderHostingView();
        showToast(t('toast_server_saved', { domain: res.server.peakDomain }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    $('btn-hosting-mods-restart').addEventListener('click', () => $('btn-hosting-restart').click());
    $('btn-hosting-open-mods').addEventListener('click', () => {
      const srv = getActiveServer();
      if (srv) api.hostingOpenModsFolder(srv.id);
    });
    $('btn-hosting-pick-jars').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingPickAndImportMods(srv.id);
        if (res.canceled) return;
        state.hostingModsByServer[srv.id] = res.mods;
        renderHostingView();
        if (res.imported.length > 0) {
          showToast(t('toast_server_mods_imported', { count: res.imported.length }), 'success');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const hDrop = $('hosting-mods-dropzone');
    hDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      hDrop.classList.add('dragover');
    });
    hDrop.addEventListener('dragleave', () => hDrop.classList.remove('dragover'));
    hDrop.addEventListener('drop', async (e) => {
      e.preventDefault();
      hDrop.classList.remove('dragover');
      const srv = getActiveServer();
      if (!srv) return;
      const paths = Array.from(e.dataTransfer.files || [])
        .map((f) => api.getFilePath(f))
        .filter(Boolean);
      if (paths.length === 0) return;
      try {
        const res = await api.hostingImportModPaths(srv.id, paths);
        state.hostingModsByServer[srv.id] = res.mods;
        renderHostingView();
        showToast(t('toast_server_mods_imported', { count: res.imported.length }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const installServerPackBtn = async (packId) => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        if (srv.loader !== 'fabric') {
          const upd = await api.hostingUpdateServer(srv.id, { loader: 'fabric', fabricVersion: 'latest' });
          state.appState = upd.state;
        }
        const res = await api.hostingInstallServerPack(srv.id, packId);
        state.hostingModsByServer[srv.id] = res.mods;
        renderHostingView();
        showToast(t('toast_server_pack_installed', { count: res.installed.length }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    $('btn-hpack-perf').addEventListener('click', () => installServerPackBtn('server_perf'));
    $('btn-hpack-tools').addEventListener('click', () => installServerPackBtn('server_tools'));

    $('btn-hosting-copy-from-profile').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingCopyFromProfile(srv.id, $('hosting-sync-profile-select').value);
        state.hostingModsByServer[srv.id] = res.mods;
        renderHostingView();
        showToast(
          t('toast_copied_from_profile', {
            copied: res.copied.length,
            skipped: res.skippedClientOnly.length
          }),
          'success'
        );
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-sync-to-profile').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingSyncToProfile(srv.id, $('hosting-sync-profile-select').value);
        showToast(t('toast_synced_to_profile', { copied: res.copied.length }), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const switchHostingModTab = (sub) => {
      state.hostingModsSubView = sub;
      $('btn-hosting-modtab-browse').classList.toggle('active', sub === 'browse');
      $('btn-hosting-modtab-installed').classList.toggle('active', sub === 'installed');
      $('hosting-modtab-browse').classList.toggle('active', sub === 'browse');
      $('hosting-modtab-installed').classList.toggle('active', sub === 'installed');
    };
    $('btn-hosting-modtab-browse').addEventListener('click', () => switchHostingModTab('browse'));
    $('btn-hosting-modtab-installed').addEventListener('click', () => switchHostingModTab('installed'));

    let hSearchTimer = null;
    $('hosting-modrinth-search').addEventListener('input', (e) => {
      state.hostingModrinthQuery = e.target.value;
      clearTimeout(hSearchTimer);
      hSearchTimer = setTimeout(() => searchHostingModrinth({ append: false }), 260);
    });
    $('hosting-modrinth-sort').addEventListener('change', (e) => {
      state.hostingModrinthSort = e.target.value;
      searchHostingModrinth({ append: false });
    });
    document.querySelectorAll('#hosting-modrinth-cats .filter-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#hosting-modrinth-cats .filter-pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        state.hostingModrinthCategory = pill.dataset.cat || 'all';
        searchHostingModrinth({ append: false });
      });
    });
    $('btn-hosting-modrinth-more').addEventListener('click', () => {
      state.hostingModrinthOffset += 24;
      searchHostingModrinth({ append: true });
    });

    // Server Settings pane
    $('hset-ram-slider').addEventListener('input', (e) => {
      const mb = Number(e.target.value);
      $('hset-ram-val').textContent = `${mb} MB · ${(mb / 1024).toFixed(1)} GB`;
    });
    $('link-eula-external').addEventListener('click', (e) => {
      e.preventDefault();
      api.openExternal('https://aka.ms/MinecraftEULA');
    });
    $('btn-hosting-save-settings').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingUpdateServer(srv.id, {
          name: $('hset-name').value,
          slug: $('hset-slug').value,
          loader: $('hset-loader').value,
          mcVersion: $('hset-mc-version').value,
          port: Number($('hset-port').value) || 25565,
          maxPlayers: Number($('hset-maxplayers').value) || 10,
          ramMb: Number($('hset-ram-slider').value) || 2048,
          gamemode: $('hset-gamemode').value,
          difficulty: $('hset-difficulty').value,
          viewDistance: Number($('hset-viewdist').value) || 10,
          seed: $('hset-seed').value,
          motd: $('hset-motd').value,
          onlineMode: !$('hset-nonpremium').checked,
          pvp: $('hset-pvp').checked,
          whitelist: $('hset-whitelist').checked,
          commandBlocks: $('hset-cmdblocks').checked,
          eulaAccepted: $('hset-eula').checked
        });
        state.appState = res.state;
        renderHostingView();
        showToast(
          res.restartRequired
            ? t('toast_server_restart_req')
            : t('toast_server_saved', { domain: res.server.peakDomain }),
          'success'
        );
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    $('btn-hosting-delete-server').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      const msg = t('confirm_delete_server', { name: srv.name, domain: srv.peakDomain });
      if (!window.confirm(msg)) return;
      try {
        state.appState = await api.hostingDeleteServer(srv.id, true);
        showToast(t('toast_server_deleted'), 'info');
        await loadHostingView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-hosting-export-peak').addEventListener('click', async () => {
      const srv = getActiveServer();
      if (!srv) return;
      try {
        const res = await api.hostingExportPeakFile(srv.id);
        if (!res.canceled) {
          showToast(t('toast_exported_peak', { domain: srv.peakDomain }), 'success');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const submitPeakRoute = async () => {
      const domainEl = $('route-domain-input');
      const targetEl = $('route-target-input');
      const nameEl = $('route-name-input');
      const domain = domainEl?.value.trim() || '';
      const targetHost = targetEl?.value.trim() || '';
      const name = nameEl?.value.trim() || '';
      if (!domain || !targetHost) {
        showToast(`${t('route_domain_ph')} / ${t('route_target_ph')}`, 'error');
        return;
      }
      try {
        const res = await api.hostingSavePeakRoute({ domain, targetHost, name });
        state.appState = res.state;
        if (domainEl) domainEl.value = '';
        if (targetEl) targetEl.value = '';
        if (nameEl) nameEl.value = '';
        renderHostingView();
        showToast(
          t('toast_route_saved', {
            domain: res.route.domain,
            target: `${res.route.targetHost}:${res.route.targetPort}`
          }),
          'success'
        );
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    $('btn-route-add')?.addEventListener('click', submitPeakRoute);
    for (const elId of ['route-domain-input', 'route-target-input', 'route-name-input']) {
      $(elId)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitPeakRoute();
        }
      });
    }

    api.onHostingStatus((st) => {
      if (!st || !st.serverId) return;
      state.hostingStatuses[st.serverId] = st;
      renderHostingNavDot();
      if (state.activeView === 'hosting') {
        const active = getActiveServer();
        if (active && active.id === st.serverId) {
          renderHostingView();
        }
      }
    });
    api.onHostingLog((entry) => appendHostingLog(entry));
    api.onHostingProgress((p) => {
      const active = getActiveServer();
      if (!p || (p.serverId && active && p.serverId !== active.id)) return;
      const box = $('hosting-progress-box');
      if (!box) return;
      if (p.percent >= 100) {
        setTimeout(() => box.classList.add('hidden'), 1200);
      } else {
        box.classList.remove('hidden');
      }
      if (p.message) $('hosting-progress-label').textContent = p.message;
      if (typeof p.percent === 'number') {
        $('hosting-progress-bar').style.width = `${p.percent}%`;
        $('hosting-progress-pct').textContent = `${p.percent}%`;
      }
    });
    api.onHostingTunnel((payload) => {
      if (!payload || !payload.serverId) return;
      const cur = state.hostingStatuses[payload.serverId] || getServerStatusObj(payload.serverId);
      state.hostingStatuses[payload.serverId] = { ...cur, tunnel: payload.tunnel };
      if (state.activeView === 'hosting') renderHostingView();
    });
    api.onHostingRouterStatus((st) => {
      if (state.appState) state.appState.peakRouterStatus = st;
      if (state.activeView === 'hosting') renderHostingView();
    });
  }

  async function init() {
    if (window.PeakFX) {
      window.PeakFX.init('alpine-fx-canvas');
    }
    wireEvents();
    appendLog({ level: 'SYSTEM', text: 'Peak Launcher v1.7.1 started.', ts: new Date().toISOString() });

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
