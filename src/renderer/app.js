(() => {
  const api = window.peakAPI;

  const state = {
    appState: null,
    manifest: null,
    fabricVersionsSet: new Set(),
    fabricVersionsList: [],
    javaData: { list: [], byMajor: {} },
    adoptiumInfo: {},
    mods: [],
    modrinthHits: [],
    modrinthLoading: false,
    modrinthQuery: '',
    modrinthCategory: 'all',
    versionsFilter: 'all',
    versionsSearch: '',
    versionsLimit: 80,
    activeView: 'play',
    editingProfileId: null,
    logs: [],
    javaDownloadingMajor: null
  };

  const JAVA_DESCRIPTIONS = {
    25: 'Minecraft 26.x i najnowsze snapshoty',
    21: 'Minecraft 1.20.5 – 1.21.11',
    17: 'Minecraft 1.17 – 1.20.4',
    8: 'Minecraft 1.16.5 i starsze (Beta/Alpha)'
  };

  const TYPE_LABELS = {
    release: 'Stabilna',
    snapshot: 'Snapshot',
    old_beta: 'Stara Beta',
    old_alpha: 'Stara Alpha'
  };

  const $ = (id) => document.getElementById(id);

  function showToast(message, type = 'info') {
    const stack = $('toast-stack');
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = message;
    stack.appendChild(div);
    setTimeout(() => {
      div.remove();
    }, 4200);
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

  function applyTheme(theme) {
    const mode = theme === 'alpine-light' ? 'alpine-light' : 'alpine-dark';
    document.documentElement.dataset.theme = mode;
    $('icon-sun').classList.toggle('hidden', mode !== 'alpine-dark');
    $('icon-moon').classList.toggle('hidden', mode === 'alpine-dark');
    document.querySelectorAll('.theme-option').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeChoice === mode);
    });
  }

  function renderAvatar(username) {
    const el = $('sidebar-avatar');
    const letter = (username || 'P').slice(0, 1).toUpperCase();
    let hash = 0;
    for (let i = 0; i < (username || '').length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    el.style.background = `linear-gradient(135deg, hsl(${hue}, 68%, 45%), hsl(${(hue + 38) % 360}, 75%, 36%))`;
    el.textContent = letter;
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.nav-item').forEach((btn) => {
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

    renderAvatar(account?.username);
    $('sidebar-username').textContent = account?.username || 'PeakPlayer';

    $('hero-profile-name').textContent = profile.name;
    $('hero-profile-sub').textContent =
      profile.loader === 'fabric'
        ? `Izolowana ekspedycja Fabric dla Minecraft ${profile.mcVersion} — gotowa na mody Modrinth i pliki .jar.`
        : `Czyste wydanie Minecraft ${profile.mcVersion} (Vanilla) z własnym katalogiem zapisów.`;
    $('hero-mc-badge').textContent = `Minecraft ${profile.mcVersion}`;
    $('hero-loader-badge').textContent =
      profile.loader === 'fabric'
        ? `Fabric (${profile.fabricVersion === 'latest' ? 'najnowszy' : profile.fabricVersion})`
        : 'Vanilla (bez modloadera)';
    $('hero-mods-badge').textContent = `${state.mods.length} ${state.mods.length === 1 ? 'mod' : state.mods.length >= 2 && state.mods.length <= 4 ? 'mody' : 'modów'}`;
    $('nav-mods-count').textContent = String(state.mods.length);

    // Java readiness
    const reqJava = getRequiredJavaForMc(profile.mcVersion);
    const hasJava = Boolean(state.javaData.byMajor[reqJava]);
    const javaText = $('readiness-java-text');
    const javaBtn = $('btn-quick-install-java');
    if (hasJava) {
      const j = state.javaData.byMajor[reqJava];
      javaText.className = 'readiness-ok';
      javaText.textContent = `Java ${reqJava} gotowa (${j.rawVersion})`;
      javaBtn.classList.add('hidden');
      $('nav-java-alert').classList.add('hidden');
    } else {
      javaText.className = 'readiness-warn';
      javaText.textContent = `Wymagana Java ${reqJava} (pobierze się sama lub kliknij)`;
      javaBtn.textContent = `Pobierz Javę ${reqJava}`;
      javaBtn.dataset.major = String(reqJava);
      javaBtn.classList.remove('hidden');
      $('nav-java-alert').classList.remove('hidden');
    }

    // Fabric readiness
    const fabText = $('readiness-fabric-text');
    const fabBtn = $('btn-quick-install-fabric');
    if (profile.loader !== 'fabric') {
      fabText.className = '';
      fabText.textContent = 'Nie dotyczy (profil Vanilla)';
      fabBtn.classList.add('hidden');
    } else {
      const installed = (state.appState.installedFabric || []).find(
        (f) => f.inheritsFrom === profile.mcVersion
      );
      if (installed) {
        fabText.className = 'readiness-ok';
        fabText.textContent = `Fabric ${installed.loaderVersion} zainstalowany`;
        fabBtn.classList.add('hidden');
      } else {
        fabText.className = 'readiness-warn';
        fabText.textContent = `Fabric gotowy do pobrania dla ${profile.mcVersion}`;
        fabBtn.classList.remove('hidden');
      }
    }

    // Profiles Grid
    const grid = $('profiles-grid');
    grid.innerHTML = '';
    for (const p of state.appState.profiles) {
      const isActive = p.id === profile.id;
      const card = document.createElement('div');
      card.className = `profile-card ${isActive ? 'active' : ''}`;
      card.innerHTML = `
        <div class="profile-card-top">
          <strong class="profile-card-title"></strong>
          ${isActive ? '<span class="profile-active-tag">AKTYWNY</span>' : ''}
        </div>
        <div class="profile-card-meta">
          <span class="tag-pill">MC ${p.mcVersion}</span>
          <span class="tag-pill ${p.loader === 'vanilla' ? 'vanilla' : ''}">${p.loader === 'fabric' ? 'Fabric' : 'Vanilla'}</span>
          <span class="tag-pill mods">Java ${getRequiredJavaForMc(p.mcVersion)}</span>
        </div>
        <div class="profile-card-actions">
          <button type="button" data-act="mods">Mody</button>
          <button type="button" data-act="edit">Edytuj</button>
          <button type="button" data-act="folder">Folder</button>
          ${state.appState.profiles.length > 1 ? '<button type="button" data-act="delete">Usuń</button>' : ''}
        </div>
      `;
      card.querySelector('.profile-card-title').textContent = p.name;
      card.addEventListener('click', async (e) => {
        const actBtn = e.target.closest('button[data-act]');
        if (actBtn) {
          e.stopPropagation();
          const act = actBtn.dataset.act;
          if (act === 'mods') {
            await selectProfile(p.id);
            switchView('mods');
          } else if (act === 'edit') {
            openProfileModal(p);
          } else if (act === 'folder') {
            await api.openProfileFolder(p.id);
          } else if (act === 'delete') {
            const nextState = await api.deleteProfile(p.id);
            state.appState = nextState;
            await refreshActiveProfileMods();
            renderAll();
            showToast('Usunięto profil.', 'info');
          }
          return;
        }
        await selectProfile(p.id);
      });
      grid.appendChild(card);
    }

    // Dock account select & RAM
    const accSelect = $('dock-account-select');
    accSelect.innerHTML = '';
    for (const acc of state.appState.accounts) {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = acc.username;
      opt.selected = acc.id === state.appState.activeAccountId;
      accSelect.appendChild(opt);
    }

    const ram = profile.ramMb || state.appState.settings.ramMb;
    $('dock-ram-badge').textContent = `${ram} MB RAM`;
    updateLaunchButtonUI(state.appState.launchStatus);
  }

  function updateLaunchButtonUI(launchStatus) {
    const btn = $('btn-play');
    const lbl = $('btn-play-label');
    if (launchStatus && launchStatus.running) {
      btn.disabled = false;
      btn.classList.add('running');
      lbl.textContent = 'ZATRZYMAJ';
    } else if (launchStatus && launchStatus.preparing) {
      btn.disabled = true;
      btn.classList.remove('running');
      lbl.textContent = 'PRZYGOTOWANIE...';
    } else {
      btn.disabled = false;
      btn.classList.remove('running');
      lbl.textContent = 'GRAJ';
    }
  }

  function renderVersionsTable() {
    const tbody = $('versions-tbody');
    if (!state.manifest) {
      tbody.innerHTML = '<tr><td colspan="7">Ładowanie listy wersji Mojang...</td></tr>';
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

    $('nav-versions-count').textContent = String(state.manifest.versions.length);
    $('versions-subtitle').textContent =
      `Znaleziono ${filtered.length} z ${state.manifest.versions.length} wersji (najnowsza stabilna: ${state.manifest.latest.release}).`;

    const slice = filtered.slice(0, state.versionsLimit);
    tbody.innerHTML = '';

    for (const v of slice) {
      const tr = document.createElement('tr');
      const isInstalled = installedSet.has(v.id);
      const hasFabric = state.fabricVersionsSet.has(v.id);
      const dateStr = v.releaseTime
        ? new Date(v.releaseTime).toLocaleDateString('pl-PL')
        : '—';
      tr.innerHTML = `
        <td><strong>${v.id}</strong></td>
        <td><span class="tag-pill ${v.type !== 'release' ? 'vanilla' : ''}">${TYPE_LABELS[v.type] || v.type}</span></td>
        <td>${dateStr}</td>
        <td>Java ${v.recommendedJava}</td>
        <td>${hasFabric ? '<span class="tag-pill mods">Fabric OK</span>' : '<span style="color:var(--text-dim)">—</span>'}</td>
        <td>${isInstalled ? '<span class="readiness-ok">Zainstalowana</span>' : '<span style="color:var(--text-dim)">Do pobrania</span>'}</td>
        <td class="td-actions">
          <button class="btn-outline" type="button" data-ver-create="${v.id}">Utwórz profil</button>
        </td>
      `;
      tr.querySelector('button[data-ver-create]').addEventListener('click', () => {
        openProfileModal({
          id: null,
          name: hasFabric ? `Szczyt ${v.id} (Fabric)` : `Minecraft ${v.id}`,
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
      $('btn-versions-more').textContent = `Pokaż więcej (${filtered.length - slice.length} pozostało)`;
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

    $('mods-vanilla-callout').classList.toggle('hidden', profile.loader === 'fabric');
    $('mods-mc-pill').textContent = `${profile.loader === 'fabric' ? 'Fabric' : 'Vanilla'} · MC ${profile.mcVersion}`;
    $('mods-tab-count').textContent = String(state.mods.length);
    $('nav-mods-count').textContent = String(state.mods.length);

    const listEl = $('installed-mods-list');
    listEl.innerHTML = '';
    if (state.mods.length === 0) {
      listEl.innerHTML = `<div class="empty-state">Brak zainstalowanych modów w profilu <strong>${profile.name}</strong>. Przejdź do zakładki „Przeglądaj Modrinth” lub przeciągnij plik <code>.jar</code> powyżej!</div>`;
      return;
    }

    for (const mod of state.mods) {
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
          <label class="switch" title="${mod.enabled ? 'Wyłącz mod' : 'Włącz mod'}">
            <input type="checkbox" ${mod.enabled ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
          <button class="btn-danger-sm" type="button">Usuń</button>
        </div>
      `;
      row.querySelector('.installed-mod-info strong').textContent = mod.name;
      row.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
        try {
          state.mods = await api.toggleMod(profile.id, mod.fileName, e.target.checked);
          renderModsHeaderAndInstalled();
          renderPlayView();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      row.querySelector('.btn-danger-sm').addEventListener('click', async () => {
        try {
          state.mods = await api.deleteMod(profile.id, mod.fileName);
          renderModsHeaderAndInstalled();
          renderModrinthGrid();
          renderPlayView();
          showToast(`Usunięto mod ${mod.name}.`, 'info');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      listEl.appendChild(row);
    }
  }

  function formatDownloads(num) {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M pobrań`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}k pobrań`;
    return `${num} pobrań`;
  }

  function renderModrinthGrid() {
    const grid = $('modrinth-grid');
    const profile = getActiveProfile();
    if (state.modrinthLoading) {
      grid.innerHTML = '<div class="empty-state">Wyszukiwanie modów na Modrinth...</div>';
      return;
    }
    if (!state.modrinthHits || state.modrinthHits.length === 0) {
      grid.innerHTML = `<div class="empty-state">Brak wyników dla Minecraft ${profile?.mcVersion || ''} w wybranym filtrze. Spróbuj innej frazy lub kategorii.</div>`;
      return;
    }

    const installedIds = new Set(state.mods.map((m) => m.projectId).filter(Boolean));
    grid.innerHTML = '';

    for (const hit of state.modrinthHits) {
      const isInstalled = installedIds.has(hit.projectId);
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
          <span class="mod-downloads">${formatDownloads(hit.downloads)}</span>
          <button class="${isInstalled ? 'btn-outline' : 'btn-accent'}" type="button" ${isInstalled ? 'disabled' : ''}>
            ${isInstalled ? 'Dodany ✓' : 'Dodaj mod'}
          </button>
        </div>
      `;
      card.querySelector('.mod-title-wrap strong').textContent = hit.title;
      card.querySelector('.mod-author').textContent = `autor: ${hit.author}`;
      card.querySelector('.mod-desc').textContent = hit.description || '';

      const addBtn = card.querySelector('button');
      if (!isInstalled) {
        addBtn.addEventListener('click', async () => {
          addBtn.disabled = true;
          addBtn.textContent = 'Pobieranie...';
          try {
            if (profile.loader !== 'fabric') {
              await api.enableFabricOnProfile(profile.id, 'latest');
              state.appState = await api.getState();
            }
            const res = await api.installModrinthMod({
              projectId: hit.projectId,
              mcVersion: profile.mcVersion,
              profileId: profile.id,
              projectMeta: hit
            });
            state.mods = res.mods;
            const depCount = res.dependenciesInstalled?.length || 0;
            showToast(
              depCount > 0
                ? `Dodano ${hit.title} (+${depCount} wymagane zależności)!`
                : `Dodano mod ${hit.title}!`,
              'success'
            );
            renderModsHeaderAndInstalled();
            renderModrinthGrid();
            renderPlayView();
          } catch (err) {
            addBtn.disabled = false;
            addBtn.textContent = 'Dodaj mod';
            showToast(err.message, 'error');
          }
        });
      }
      grid.appendChild(card);
    }
  }

  async function searchModrinthCatalog() {
    const profile = getActiveProfile();
    if (!profile) return;
    state.modrinthLoading = true;
    renderModrinthGrid();
    try {
      const res = await api.searchModrinth({
        query: state.modrinthQuery,
        mcVersion: profile.mcVersion,
        category: state.modrinthCategory,
        limit: 24
      });
      state.modrinthHits = res.hits || [];
    } catch (err) {
      state.modrinthHits = [];
      showToast(`Błąd wyszukiwania Modrinth: ${err.message}`, 'error');
    } finally {
      state.modrinthLoading = false;
      renderModrinthGrid();
    }
  }

  async function loadModsAndCatalog() {
    await refreshActiveProfileMods();
    renderModsHeaderAndInstalled();
    await searchModrinthCatalog();
  }

  async function refreshActiveProfileMods() {
    const profile = getActiveProfile();
    if (!profile) return;
    state.mods = await api.listMods(profile.id);
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
      card.className = 'java-card';
      card.innerHTML = `
        <div class="java-card-top">
          <strong>Java ${major}</strong>
          <span class="tag-pill ${detected ? 'mods' : 'vanilla'}">${detected ? 'Gotowa' : 'Brak'}</span>
        </div>
        <div class="java-card-sub">${JAVA_DESCRIPTIONS[major]}</div>
        <div class="java-status ${detected ? 'readiness-ok' : 'readiness-warn'}">
          ${detected ? `${detected.rawVersion} (${detected.source === 'managed' ? 'Peak' : 'System'})` : 'Nie wykryto w systemie'}
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
        rmBtn.textContent = 'Usuń wersję Peak';
        rmBtn.addEventListener('click', async () => {
          const res = await api.removeJava(major);
          state.javaData = res.detected;
          renderJavaAndFabricView();
          renderPlayView();
          showToast(`Usunięto Javę ${major} z folderu Peak.`, 'info');
        });
        actionsEl.appendChild(rmBtn);
      } else {
        const dlBtn = document.createElement('button');
        dlBtn.className = detected ? 'btn-outline' : 'btn-accent';
        dlBtn.type = 'button';
        dlBtn.disabled = busy || state.javaDownloadingMajor !== null;
        dlBtn.textContent = busy
          ? 'Pobieranie...'
          : detected
            ? `Pobierz też dla Peak`
            : `Pobierz Javę ${major}`;
        dlBtn.addEventListener('click', () => triggerJavaInstall(major));
        actionsEl.appendChild(dlBtn);
      }
      grid.appendChild(card);
    }

    // Detected Javas list
    const detList = $('detected-java-list');
    detList.innerHTML = '';
    if (state.javaData.list.length === 0) {
      detList.innerHTML = '<div class="compact-row">Nie wykryto jeszcze żadnej Javy na komputerze.</div>';
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

    // Fabric MC select
    const fabSelect = $('fabric-mc-select');
    if (fabSelect.options.length === 0 && state.fabricVersionsList.length > 0) {
      for (const fv of state.fabricVersionsList.slice(0, 120)) {
        const opt = document.createElement('option');
        opt.value = fv.version;
        opt.textContent = fv.stable ? `${fv.version} (Stabilna)` : `${fv.version} (Snapshot)`;
        fabSelect.appendChild(opt);
      }
      const active = getActiveProfile();
      if (active && state.fabricVersionsSet.has(active.mcVersion)) {
        fabSelect.value = active.mcVersion;
      }
      await loadFabricLoaderOptions(fabSelect.value, $('fabric-loader-select'));
    }

    // Installed Fabric list
    const fabList = $('installed-fabric-list');
    fabList.innerHTML = '';
    const installedFab = state.appState?.installedFabric || [];
    if (installedFab.length === 0) {
      fabList.innerHTML = '<div class="compact-row">Brak pobranych wersji Fabric (zainstaluje się automatycznie przy starcie gry lub kliknij obok).</div>';
    } else {
      for (const f of installedFab) {
        const row = document.createElement('div');
        row.className = 'compact-row';
        row.innerHTML = `
          <div class="compact-row-meta">
            <strong>Minecraft ${f.inheritsFrom} · Fabric ${f.loaderVersion}</strong>
            <span>${f.id}</span>
          </div>
          <span class="tag-pill mods">Gotowy</span>
        `;
        fabList.appendChild(row);
      }
    }
  }

  async function loadFabricLoaderOptions(mcVersion, selectEl) {
    if (!mcVersion) return;
    selectEl.innerHTML = '<option value="latest">Najnowszy stabilny (zalecane)</option>';
    try {
      const loaders = await api.getFabricLoaders(mcVersion);
      for (const l of loaders.slice(0, 15)) {
        const opt = document.createElement('option');
        opt.value = l.version;
        opt.textContent = l.stable ? `${l.version} (Stabilny)` : `${l.version} (Beta)`;
        selectEl.appendChild(opt);
      }
    } catch {
      // Keep default 'latest'
    }
  }

  async function triggerJavaInstall(major) {
    state.javaDownloadingMajor = Number(major);
    $('java-install-progress').classList.remove('hidden');
    $('java-progress-label').textContent = `Rozpoczynanie pobierania Java ${major}...`;
    $('java-progress-pct').textContent = '0%';
    $('java-progress-bar').style.width = '2%';
    renderJavaAndFabricView();

    try {
      const res = await api.installJava(Number(major));
      state.javaData = res.detected;
      showToast(`Zainstalowano Java ${major} (${res.installed.rawVersion})!`, 'success');
    } catch (err) {
      showToast(`Błąd pobierania Javy ${major}: ${err.message}`, 'error');
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
    const slider = $('setting-ram-slider');
    slider.max = String(Math.max(2048, mem.maxSafeMb));
    slider.value = String(s.ramMb);
    $('setting-ram-value').textContent = `${s.ramMb} MB`;
    $('setting-ram-hint').textContent = `Pamięć w komputerze: ${(mem.totalMb / 1024).toFixed(1)} GB (zalecane maks. ${mem.maxSafeMb} MB)`;

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
          <strong>${acc.username} ${isActive ? '· (Aktywny)' : ''}</strong>
          <span>UUID: ${acc.uuid}</span>
        </div>
        <div style="display:flex;gap:6px">
          ${!isActive ? '<button class="btn-outline" type="button" data-use>Wybierz</button>' : ''}
          ${state.appState.accounts.length > 1 ? '<button class="btn-danger-sm" type="button" data-del>Usuń</button>' : ''}
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
      ? 'Edytuj profil'
      : 'Nowy profil (Ekspedycja)';
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
    await refreshActiveProfileMods();
    renderAll();
    if (state.activeView === 'mods') {
      await searchModrinthCatalog();
    }
    return res.profile;
  }

  function renderAll() {
    renderPlayView();
    renderVersionsTable();
    renderModsHeaderAndInstalled();
    renderSettingsView();
  }

  function wireEvents() {
    // Titlebar
    $('btn-win-min').addEventListener('click', () => api.minimizeWindow());
    $('btn-win-max').addEventListener('click', () => api.maximizeWindow());
    $('btn-win-close').addEventListener('click', () => api.closeWindow());
    $('btn-theme-toggle').addEventListener('click', async () => {
      const next = document.documentElement.dataset.theme === 'alpine-dark' ? 'alpine-light' : 'alpine-dark';
      await api.setTheme(next);
      state.appState.theme = next;
      applyTheme(next);
    });

    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $('btn-open-data-dir').addEventListener('click', () => api.openPath(state.appState?.dataDir));

    // Account modal
    const openAccModal = () => {
      $('account-nick-input').value = getActiveAccount()?.username || 'PeakPlayer';
      $('modal-account').classList.remove('hidden');
      $('account-nick-input').focus();
    };
    $('sidebar-account-btn').addEventListener('click', openAccModal);
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
        showToast(`Ustawiono nick gracza: ${res.account.username}`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Play view actions
    $('btn-new-profile').addEventListener('click', () => openProfileModal(null));
    $('btn-hero-edit-profile').addEventListener('click', () => openProfileModal(getActiveProfile()));
    $('btn-hero-open-folder').addEventListener('click', () => api.openProfileFolder(getActiveProfile()?.id));
    $('btn-hero-go-mods').addEventListener('click', () => switchView('mods'));

    $('btn-quick-install-java').addEventListener('click', async () => {
      const major = Number($('btn-quick-install-java').dataset.major || 21);
      switchView('java');
      await triggerJavaInstall(major);
    });

    $('btn-quick-install-fabric').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      $('btn-quick-install-fabric').disabled = true;
      $('btn-quick-install-fabric').textContent = 'Instalowanie...';
      try {
        const res = await api.enableFabricOnProfile(profile.id, profile.fabricVersion || 'latest');
        state.appState = res.state;
        renderAll();
        showToast(`Zainstalowano Fabric ${res.installed.loaderVersion} dla ${profile.mcVersion}!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        $('btn-quick-install-fabric').disabled = false;
      }
    });

    $('dock-account-select').addEventListener('change', async (e) => {
      const res = await api.selectAccount(e.target.value);
      state.appState = res.state;
      renderAll();
    });

    $('btn-play').addEventListener('click', async () => {
      const status = await api.getLaunchStatus();
      if (status.running) {
        await api.stopGame();
        return;
      }
      const profile = getActiveProfile();
      if (!profile) return;
      updateLaunchButtonUI({ preparing: true });
      $('dock-progress-label').textContent = 'Przygotowywanie gry...';
      $('dock-progress-bar').style.width = '5%';
      try {
        const res = await api.launchProfile(profile.id);
        state.appState = res.state;
        updateLaunchButtonUI({ running: true });
        $('dock-progress-label').textContent = `Minecraft ${profile.mcVersion} uruchomiony (PID ${res.pid})`;
        $('dock-progress-bar').style.width = '100%';
        $('dock-progress-pct').textContent = '100%';
      } catch (err) {
        updateLaunchButtonUI({ running: false });
        $('dock-progress-label').textContent = `Błąd: ${err.message}`;
        showToast(err.message, 'error');
      }
    });

    // Versions view
    $('btn-refresh-manifest').addEventListener('click', async () => {
      state.manifest = await api.getManifest(true);
      renderVersionsTable();
      showToast('Odświeżono katalog wersji Mojang.', 'info');
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
    $('btn-mods-open-folder').addEventListener('click', () => api.openModsFolder(getActiveProfile()?.id));
    $('btn-switch-profile-fabric').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      try {
        const res = await api.enableFabricOnProfile(profile.id, 'latest');
        state.appState = res.state;
        renderAll();
        await searchModrinthCatalog();
        showToast(`Profil "${profile.name}" przełączony na Fabric!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.querySelectorAll('[data-modtab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.modtab;
        document.querySelectorAll('[data-modtab]').forEach((t) =>
          t.classList.toggle('active', t === tab)
        );
        $('modtab-browse').classList.toggle('active', name === 'browse');
        $('modtab-installed').classList.toggle('active', name === 'installed');
      });
    });

    let searchDebounce = null;
    $('modrinth-search-input').addEventListener('input', (e) => {
      state.modrinthQuery = e.target.value;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(searchModrinthCatalog, 280);
    });
    $('modrinth-category-pills').addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      document.querySelectorAll('#modrinth-category-pills .filter-pill').forEach((p) =>
        p.classList.toggle('active', p === pill)
      );
      state.modrinthCategory = pill.dataset.cat;
      searchModrinthCatalog();
    });

    $('btn-install-fps-pack').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      const btn = $('btn-install-fps-pack');
      btn.disabled = true;
      btn.textContent = 'Instalowanie pakietu...';
      try {
        if (profile.loader !== 'fabric') {
          await api.enableFabricOnProfile(profile.id, 'latest');
          state.appState = await api.getState();
        }
        const res = await api.installPeakFpsPack(profile.id);
        state.mods = res.mods;
        renderModsHeaderAndInstalled();
        renderModrinthGrid();
        renderPlayView();
        showToast(`Zainstalowano ${res.installed.length} modów z pakietu Peak FPS!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Zainstaluj Pakiet FPS';
      }
    });

    $('btn-pick-jar-mods').addEventListener('click', async () => {
      const profile = getActiveProfile();
      if (!profile) return;
      const res = await api.pickAndImportMods(profile.id);
      if (!res.canceled) {
        state.mods = res.mods;
        renderModsHeaderAndInstalled();
        renderPlayView();
        showToast(`Dodano ${res.imported.length} plików .jar.`, 'success');
      }
    });

    // Drag & Drop .jar mods
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
      if (paths.length === 0) {
        showToast('Upuść pliki .jar bezpośrednio z Eksploratora Windows.', 'error');
        return;
      }
      const profile = getActiveProfile();
      const res = await api.importModPaths(profile.id, paths);
      state.mods = res.mods;
      renderModsHeaderAndInstalled();
      renderPlayView();
      showToast(`Zaimportowano ${res.imported.length} modów (.jar).`, 'success');
    });

    // Java & Fabric view
    $('btn-rescan-java').addEventListener('click', async () => {
      state.javaData = await api.detectJava();
      renderJavaAndFabricView();
      renderPlayView();
      showToast('Zeskanowano środowiska Java w systemie.', 'info');
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
              await refreshActiveProfileMods();
            } catch {
              // Ignore if Fabric API doesn't exist for snapshot
            }
          }
        }
        renderAll();
        renderJavaAndFabricView();
        showToast(`Zainstalowano Fabric ${res.installed.loaderVersion} dla MC ${mcVer}!`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setTimeout(() => $('fabric-progress-box').classList.add('hidden'), 1200);
      }
    });

    // Console & Settings view
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
        showToast('Zapisano ustawienia launchera.', 'success');
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
        showToast(`Dodano konto ${res.account.username}.`, 'success');
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
      showToast('Zmieniono katalog danych Peak Launcher.', 'success');
    });

    $('btn-copy-logs').addEventListener('click', () => {
      const text = state.logs.map((l) => `[${l.level}] ${l.text}`).join('\n');
      navigator.clipboard.writeText(text);
      showToast('Skopiowano logi do schowka.', 'info');
    });
    $('btn-clear-logs').addEventListener('click', () => {
      state.logs = [];
      $('console-output').innerHTML = '';
    });

    // Profile Modal
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
        await refreshActiveProfileMods();
        renderAll();
        showToast('Zapisano profil ekspedycji!', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Real-time Backend Subscriptions
    api.onLauncherProgress((p) => {
      $('dock-progress-label').textContent = p.message || 'Przetwarzanie...';
      if (typeof p.percent === 'number') {
        $('dock-progress-bar').style.width = `${p.percent}%`;
        $('dock-progress-pct').textContent = `${p.percent}%`;
      }
    });

    api.onLauncherLog((entry) => appendLog(entry));

    api.onLauncherStatus(async (st) => {
      $('console-status-text').textContent =
        st.state === 'running'
          ? `Status: gra uruchomiona (PID ${st.pid})`
          : st.state === 'preparing'
            ? 'Status: pobieranie i przygotowanie plików...'
            : 'Status: gotowy';
      if (st.state === 'idle') {
        updateLaunchButtonUI({ running: false });
        $('dock-progress-label').textContent = st.error ? `Błąd: ${st.error}` : 'Gotowy do wspinaczki';
        $('dock-progress-pct').textContent = '';
        if (!st.error) $('dock-progress-bar').style.width = '0%';
        state.appState = await api.getState();
        renderPlayView();
      } else if (st.state === 'running') {
        updateLaunchButtonUI({ running: true });
      }
    });

    api.onJavaProgress((p) => {
      $('java-install-progress').classList.remove('hidden');
      $('java-progress-label').textContent = p.message || 'Pobieranie Javy...';
      $('java-progress-pct').textContent = `${p.percent || 0}%`;
      $('java-progress-bar').style.width = `${p.percent || 0}%`;
    });

    api.onFabricProgress((p) => {
      $('fabric-progress-box').classList.remove('hidden');
      $('fabric-progress-label').textContent = p.message || 'Instalowanie Fabric...';
      $('fabric-progress-pct').textContent = `${p.percent || 0}%`;
      $('fabric-progress-bar').style.width = `${p.percent || 0}%`;
    });

    api.onModsProgress((p) => {
      if (p && p.message) {
        $('dock-progress-label').textContent = p.message;
      }
    });
  }

  async function init() {
    wireEvents();
    appendLog({ level: 'SYSTEM', text: 'Uruchomiono Peak Launcher v1.0.0 (Motyw Góry PEAK).', ts: new Date().toISOString() });

    state.appState = await api.getState();
    applyTheme(state.appState.theme);
    await refreshActiveProfileMods();
    renderAll();

    // Load live manifests & Java scan in parallel
    const [manifestRes, fabricRes, javaRes, adoptiumRes] = await Promise.allSettled([
      api.getManifest(false),
      api.getFabricVersions(false),
      api.detectJava(),
      api.getAdoptiumInfo()
    ]);

    if (manifestRes.status === 'fulfilled') {
      state.manifest = manifestRes.value;
    }
    if (fabricRes.status === 'fulfilled' && Array.isArray(fabricRes.value)) {
      state.fabricVersionsList = fabricRes.value;
      state.fabricVersionsSet = new Set(fabricRes.value.map((f) => f.version));
    }
    if (javaRes.status === 'fulfilled') {
      state.javaData = javaRes.value;
    }
    if (adoptiumRes.status === 'fulfilled' && Array.isArray(adoptiumRes.value)) {
      for (const item of adoptiumRes.value) {
        if (item && item.major) state.adoptiumInfo[item.major] = item;
      }
    }

    renderAll();
    if (state.activeView === 'java') {
      renderJavaAndFabricView();
    }

    window.__peakReady = true;
  }

  // Deterministic navigation helper for automated screenshot capture
  window.__peakTestNavigate = async (view, theme) => {
    if (theme) {
      await api.setTheme(theme);
      state.appState.theme = theme;
      applyTheme(theme);
    }
    switchView(view || 'play');
  };

  init().catch((err) => {
    appendLog({ level: 'ERROR', text: `Błąd inicjalizacji: ${err.message}`, ts: new Date().toISOString() });
    showToast(`Błąd inicjalizacji: ${err.message}`, 'error');
    window.__peakReady = true;
  });
})();
