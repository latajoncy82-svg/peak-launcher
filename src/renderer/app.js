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
    editingProfileId: null,
    activeModDetails: null,
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

  function appendLog(entry) {
    state.logs.push(entry);
    if (state.logs.length > 500) state.logs.shift();
    const out = $('console-output');
    if (!out) return;
    const row = document.createElement('div');
    row.className = `log-line log-${entry.level || 'INFO'}`;
    const time = entry.ts ? entry.ts.slice(11, 19) : '';
    row.textContent = `[${time}] [${entry.level || 'INFO'}] ${entry.text}`;
    out.appendChild(row);
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
    const topSel = $('topbar-lang-select');
    const setSel = $('setting-lang-select');
    if (topSel) topSel.value = clean;
    if (setSel) setSel.value = clean;
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

  function renderAvatarElement(container, username) {
    if (!container) return;
    const safeName = (username || 'PeakPlayer').trim() || 'PeakPlayer';
    const letter = safeName.slice(0, 1).toUpperCase();
    let hash = 0;
    for (let i = 0; i < safeName.length; i++) {
      hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    container.style.background = `linear-gradient(135deg, hsl(${hue}, 68%, 45%), hsl(${(hue + 38) % 360}, 75%, 34%))`;
    container.textContent = letter;

    if (/^[a-zA-Z0-9_]{3,16}$/.test(safeName)) {
      const img = new Image();
      img.alt = safeName;
      img.onload = () => {
        if (img.naturalWidth >= 8) {
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

    renderAvatarElement($('topbar-avatar'), account?.username);
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

  function renderSettingsView() {
    if (!state.appState) return;
    const s = state.appState.settings;
    const mem = state.appState.systemMemory || { totalMb: 8192, maxSafeMb: 6144 };

    applyTheme(state.appState.theme);
    applyLanguageUI(state.appState.language || 'pl');

    const slider = $('setting-ram-slider');
    slider.max = String(Math.max(2048, mem.maxSafeMb));
    slider.value = String(s.ramMb);
    $('setting-ram-value').textContent = `${s.ramMb} MB`;
    $('setting-ram-hint').textContent = t('ram_hint', {
      gb: (mem.totalMb / 1024).toFixed(1),
      max: mem.maxSafeMb
    });

    $('setting-custom-res').checked = Boolean(s.customResolution);
    $('setting-width').value = String(s.width || 1280);
    $('setting-height').value = String(s.height || 720);
    $('setting-auto-java').checked = Boolean(s.autoInstallJava);
    $('setting-auto-fabric').checked = Boolean(s.autoInstallFabric);
    $('setting-close-launch').checked = Boolean(s.closeOnLaunch);
    $('setting-jvm-args').value = s.jvmArgs || '';
    $('setting-datadir-path').textContent = state.appState.dataDir || '';

    const accList = $('settings-accounts-list');
    accList.innerHTML = '';
    for (const acc of state.appState.accounts) {
      const isActive = acc.id === state.appState.activeAccountId;
      const row = document.createElement('div');
      row.className = 'compact-row';
      row.innerHTML = `
        <div class="compact-row-meta">
          <strong>${acc.username} ${isActive ? '· ✓' : ''}</strong>
          <span>UUID: ${acc.uuid}</span>
        </div>
        <div style="display:flex;gap:6px">
          ${!isActive ? '<button class="btn-outline" type="button" data-use>✓</button>' : ''}
          ${state.appState.accounts.length > 1 ? `<button class="btn-danger-sm" type="button" data-del>${t('btn_remove')}</button>` : ''}
        </div>
      `;
      const useBtn = row.querySelector('[data-use]');
      if (useBtn) {
        useBtn.addEventListener('click', async () => {
          const res = await api.selectAccount(acc.id);
          state.appState = res.state;
          renderAll();
        });
      }
      const delBtn = row.querySelector('[data-del]');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          state.appState = await api.deleteAccount(acc.id);
          renderAll();
        });
      }
      accList.appendChild(row);
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

  function renderAll() {
    renderPlayView();
    renderVersionsTable();
    renderModsHeaderAndInstalled();
    renderSettingsView();
    if (state.activeView === 'java') {
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

    $('topbar-lang-select').addEventListener('change', (e) => changeLanguage(e.target.value));
    $('setting-lang-select').addEventListener('change', (e) => changeLanguage(e.target.value));

    document.querySelectorAll('.top-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    $('topbar-account-btn').addEventListener('click', () => {
      $('account-nick-input').value = getActiveAccount()?.username || 'PeakPlayer';
      $('modal-account').classList.remove('hidden');
      $('account-nick-input').focus();
    });
    $('modal-account-close').addEventListener('click', () => $('modal-account').classList.add('hidden'));
    $('modal-account-cancel').addEventListener('click', () => $('modal-account').classList.add('hidden'));
    $('modal-account-save').addEventListener('click', async () => {
      try {
        const res = await api.saveAccount({
          id: getActiveAccount()?.id,
          username: $('account-nick-input').value
        });
        state.appState = res.state;
        $('modal-account').classList.add('hidden');
        renderAll();
        showToast(res.account.username, 'success');
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

    document.querySelectorAll('[data-consoletab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.consoletab;
        document.querySelectorAll('[data-consoletab]').forEach((t) =>
          t.classList.toggle('active', t === tab)
        );
        $('consoletab-settings').classList.toggle('active', name === 'settings');
        $('consoletab-logs').classList.toggle('active', name === 'logs');
      });
    });

    document.querySelectorAll('.theme-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.themeChoice;
        await api.setTheme(theme);
        state.appState.theme = theme;
        applyTheme(theme);
      });
    });

    $('setting-ram-slider').addEventListener('input', (e) => {
      $('setting-ram-value').textContent = `${e.target.value} MB`;
    });

    $('btn-save-settings').addEventListener('click', async () => {
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
        renderAll();
        showToast(t('toast_saved_settings'), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-add-account').addEventListener('click', async () => {
      try {
        const res = await api.saveAccount({ username: $('new-account-input').value });
        state.appState = res.state;
        $('new-account-input').value = '';
        renderAll();
        showToast(res.account.username, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    $('btn-open-datadir').addEventListener('click', () => api.openPath(state.appState?.dataDir));
    $('btn-change-datadir').addEventListener('click', async () => {
      const picked = await api.pickDirectory();
      if (!picked) return;
      state.appState = await api.updateSettings({ dataDir: picked });
      renderAll();
    });

    $('btn-copy-logs').addEventListener('click', () => {
      const text = state.logs.map((l) => `[${l.level}] ${l.text}`).join('\n');
      navigator.clipboard.writeText(text);
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
    appendLog({ level: 'SYSTEM', text: 'Peak Launcher v1.3.0 started.', ts: new Date().toISOString() });

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

  window.__peakTestNavigate = async (view, theme, lang) => {
    if (lang) {
      await changeLanguage(lang);
    }
    if (theme) {
      await api.setTheme(theme);
      state.appState.theme = theme;
      applyTheme(theme);
    }
    switchView(view || 'play');
  };

  init().catch((err) => {
    appendLog({ level: 'ERROR', text: err.message, ts: new Date().toISOString() });
    showToast(err.message, 'error');
    window.__peakReady = true;
  });
})();
