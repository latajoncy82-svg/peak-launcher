(() => {
  const REPO = 'latajoncy82-svg/peak-launcher';
  const DEFAULT_RELEASES_URL = `https://github.com/${REPO}/releases`;
  const GITHUB_API_RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

  const i18n = window.PeakSiteI18n || {
    getLanguage: () => 'pl',
    setLanguage: () => 'pl',
    getLocale: () => 'pl-PL',
    t: (k) => k,
    applyDomTranslations: () => {}
  };

  const state = {
    releases: [],
    source: 'fallback',
    latestTag: 'v1.5.1'
  };

  const el = {
    langSelect: document.getElementById('site-lang-select'),
    themeToggle: document.getElementById('site-theme-toggle'),
    sunIcon: document.getElementById('theme-icon-sun'),
    moonIcon: document.getElementById('theme-icon-moon'),

    heroMetaKicker: document.getElementById('hero-meta-kicker'),
    previewCaption: document.getElementById('preview-caption'),
    primaryDownloadBtn: document.getElementById('primary-download-btn'),
    primaryDownloadMeta: document.getElementById('primary-download-meta'),
    downloadMenuWrap: document.getElementById('download-menu-wrap'),
    downloadMenuToggle: document.getElementById('download-menu-toggle'),
    downloadDropdown: document.getElementById('download-dropdown'),
    menuInstallerLink: document.getElementById('menu-installer-link'),
    menuInstallerSize: document.getElementById('menu-installer-size'),
    menuPortableLink: document.getElementById('menu-portable-link'),
    menuPortableSize: document.getElementById('menu-portable-size'),
    menuGithubReleases: document.getElementById('menu-github-releases'),

    previewTabs: Array.from(document.querySelectorAll('.preview-tab')),
    previewImages: {
      dark: document.getElementById('preview-img-dark'),
      light: document.getElementById('preview-img-light'),
      mods: document.getElementById('preview-img-mods'),
      skins: document.getElementById('preview-img-skins'),
      hosting: document.getElementById('preview-img-hosting'),
      java: document.getElementById('preview-img-java')
    },

    releasesList: document.getElementById('releases-list'),
    releasesSourceNote: document.getElementById('releases-source-note')
  };

  function isLocalEnvironment() {
    return (
      window.location.protocol === 'file:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return 'Windows x64';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(i18n.getLocale(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function resolveAssetUrl(asset, fallbackUrl) {
    if (!asset) return fallbackUrl || DEFAULT_RELEASES_URL;
    const name = asset.name;
    if (name && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return `/dist/${encodeURIComponent(name)}`;
    }
    if (name && window.location.protocol === 'file:') {
      return `../dist/${encodeURIComponent(name)}`;
    }
    return asset.downloadUrl || fallbackUrl || DEFAULT_RELEASES_URL;
  }

  function mapGithubRelease(release) {
    const rawAssets = Array.isArray(release.assets)
      ? release.assets.map((asset) => ({
          name: asset.name,
          size: typeof asset.size === 'number' ? asset.size : 0,
          downloadUrl: asset.browser_download_url,
          downloadCount: typeof asset.download_count === 'number' ? asset.download_count : 0
        }))
      : [];
    const exeAssets = rawAssets.filter((a) => /\.exe$/i.test(a.name));
    const installer =
      exeAssets.find((a) => /setup/i.test(a.name)) ||
      exeAssets.find((a) => !/portable/i.test(a.name)) ||
      null;
    const portable = exeAssets.find((a) => /portable/i.test(a.name)) || null;

    return {
      tag: release.tag_name,
      name: release.name || release.tag_name,
      publishedAt: release.published_at || release.created_at || null,
      body: release.body || '',
      htmlUrl:
        release.html_url ||
        `${DEFAULT_RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}`,
      prerelease: Boolean(release.prerelease),
      assets: {
        installer,
        portable,
        all: rawAssets
      }
    };
  }

  function setSiteTheme(theme) {
    document.documentElement.dataset.theme = theme;
    el.sunIcon.classList.toggle('hidden', theme !== 'dark');
    el.moonIcon.classList.toggle('hidden', theme === 'dark');
    if (window.PeakSiteFX) {
      window.PeakSiteFX.setTheme(theme);
    }
    try {
      localStorage.setItem('peak-launcher-site-theme', theme);
    } catch {
      // Ignore storage failures
    }
  }

  function setPreviewTab(mode) {
    for (const tab of el.previewTabs) {
      tab.classList.toggle('active', tab.dataset.preview === mode);
    }
    for (const [key, img] of Object.entries(el.previewImages)) {
      if (img) img.classList.toggle('hidden', key !== mode);
    }
  }

  function appendFormattedInline(parent, text) {
    const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        const strong = document.createElement('strong');
        strong.textContent = token.slice(2, -2);
        parent.appendChild(strong);
      } else if (token.startsWith('`') && token.endsWith('`')) {
        const code = document.createElement('code');
        code.textContent = token.slice(1, -1);
        parent.appendChild(code);
      }
      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function renderMarkdownNotes(container, markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    let currentList = null;

    const flushList = () => {
      if (currentList) {
        container.appendChild(currentList);
        currentList = null;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        flushList();
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        flushList();
        const heading = document.createElement('h4');
        heading.textContent = line.replace(/^#{1,4}\s+/, '');
        container.appendChild(heading);
        continue;
      }
      if (/^[-*•]\s+/.test(line)) {
        if (!currentList) currentList = document.createElement('ul');
        const li = document.createElement('li');
        appendFormattedInline(li, line.replace(/^[-*•]\s+/, ''));
        currentList.appendChild(li);
        continue;
      }
      flushList();
      const p = document.createElement('p');
      appendFormattedInline(p, line);
      container.appendChild(p);
    }
    flushList();
  }

  function formatShortVer(tag) {
    return String(tag || 'v1.5.1').replace(/^v/i, '').split('.').slice(0, 2).join('.') || '1.5';
  }

  function populateHeroDownload(latest) {
    if (!latest) return;
    const tag = latest.tag || 'v1.5.1';
    state.latestTag = tag;
    const installer = latest.assets && latest.assets.installer;
    const portable = latest.assets && latest.assets.portable;

    const installerUrl = resolveAssetUrl(installer, latest.htmlUrl);
    const portableUrl = resolveAssetUrl(portable, latest.htmlUrl);
    const primarySize = installer && installer.size ? formatSize(installer.size) : '';

    el.heroMetaKicker.textContent = i18n.t('hero.kicker', { tag });
    if (el.previewCaption) {
      el.previewCaption.textContent = i18n.t('preview.caption', { ver: formatShortVer(tag) });
    }
    el.primaryDownloadBtn.href = installerUrl;
    if (installer && installer.name) el.primaryDownloadBtn.setAttribute('download', installer.name);
    el.primaryDownloadMeta.textContent = primarySize ? `${tag} · ${primarySize}` : tag;

    el.menuInstallerLink.href = installerUrl;
    if (installer && installer.name) el.menuInstallerLink.setAttribute('download', installer.name);
    el.menuInstallerSize.textContent = formatSize(installer && installer.size);

    el.menuPortableLink.href = portableUrl;
    if (portable && portable.name) el.menuPortableLink.setAttribute('download', portable.name);
    el.menuPortableSize.textContent = formatSize(portable && portable.size);

    if (el.menuGithubReleases) {
      el.menuGithubReleases.href = DEFAULT_RELEASES_URL;
    }
  }

  function renderReleasesList(releases, source) {
    if (!Array.isArray(releases) || releases.length === 0) {
      el.releasesList.innerHTML = `<div class="release-card"><p>${i18n.t('releases.empty')}</p></div>`;
      return;
    }

    el.releasesSourceNote.textContent =
      source === 'github'
        ? i18n.t('releases.sourceGithub')
        : i18n.t('releases.sourceFallback');

    const frag = document.createDocumentFragment();

    releases.forEach((rel, index) => {
      const card = document.createElement('article');
      card.className = 'release-card spotlight-card';

      const header = document.createElement('div');
      header.className = 'release-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'release-title-group';

      const tagSpan = document.createElement('span');
      tagSpan.className = 'release-tag';
      tagSpan.textContent = rel.tag || 'v1.5.1';
      titleGroup.appendChild(tagSpan);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'release-name';
      nameSpan.textContent = rel.name || rel.tag;
      titleGroup.appendChild(nameSpan);

      if (index === 0) {
        const badge = document.createElement('span');
        badge.className = 'release-badge';
        badge.textContent = i18n.t('releases.latestBadge');
        titleGroup.appendChild(badge);
      }

      const dateSpan = document.createElement('span');
      dateSpan.className = 'release-date';
      dateSpan.textContent = formatDate(rel.publishedAt);

      header.append(titleGroup, dateSpan);
      card.appendChild(header);

      const notesDiv = document.createElement('div');
      notesDiv.className = 'release-notes';
      renderMarkdownNotes(notesDiv, rel.body || '');
      card.appendChild(notesDiv);

      const downloadsRow = document.createElement('div');
      downloadsRow.className = 'release-downloads';

      const installer = rel.assets && rel.assets.installer;
      const portable = rel.assets && rel.assets.portable;

      if (installer) {
        const link = document.createElement('a');
        link.className = 'dl-chip primary';
        link.href = resolveAssetUrl(installer, rel.htmlUrl);
        if (installer.name) link.setAttribute('download', installer.name);
        const label = document.createElement('span');
        label.textContent = i18n.t('releases.downloadInstaller');
        const size = document.createElement('span');
        size.className = 'dl-chip-size';
        size.textContent = formatSize(installer.size);
        link.append(label, size);
        downloadsRow.appendChild(link);
      }

      if (portable) {
        const link = document.createElement('a');
        link.className = 'dl-chip';
        link.href = resolveAssetUrl(portable, rel.htmlUrl);
        if (portable.name) link.setAttribute('download', portable.name);
        const label = document.createElement('span');
        label.textContent = i18n.t('releases.downloadPortable');
        const size = document.createElement('span');
        size.className = 'dl-chip-size';
        size.textContent = formatSize(portable.size);
        link.append(label, size);
        downloadsRow.appendChild(link);
      }

      const ghLink = document.createElement('a');
      ghLink.className = 'dl-chip';
      ghLink.href = rel.htmlUrl || DEFAULT_RELEASES_URL;
      ghLink.target = '_blank';
      ghLink.rel = 'noopener noreferrer';
      ghLink.textContent = i18n.t('releases.viewGithub');
      downloadsRow.appendChild(ghLink);

      card.appendChild(downloadsRow);
      frag.appendChild(card);
    });

    el.releasesList.replaceChildren(frag);
  }

  function applySiteLanguage(lang) {
    const active = i18n.setLanguage(lang);
    if (el.langSelect) el.langSelect.value = active;
    i18n.applyDomTranslations(document, {
      tag: state.latestTag,
      ver: formatShortVer(state.latestTag)
    });
    if (state.releases.length > 0) {
      populateHeroDownload(state.releases[0]);
      renderReleasesList(state.releases, state.source);
    } else if (el.heroMetaKicker) {
      el.heroMetaKicker.textContent = i18n.t('hero.kicker', { tag: state.latestTag });
    }
  }

  async function loadReleases() {
    let payload = null;

    if (!isLocalEnvironment()) {
      try {
        const apiRes = await fetch('/api/releases');
        if (apiRes.ok) {
          const contentType = apiRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const json = await apiRes.json();
            if (json && Array.isArray(json.releases) && json.releases.length > 0) {
              payload = json;
            }
          }
        }
      } catch {
        // Ignore when hosted statically
      }

      if (!payload) {
        try {
          const ghRes = await fetch(GITHUB_API_RELEASES, {
            headers: { Accept: 'application/vnd.github+json' }
          });
          if (ghRes.ok) {
            const list = await ghRes.json();
            if (Array.isArray(list)) {
              const published = list.filter((r) => r && !r.draft).map(mapGithubRelease);
              if (published.length > 0) {
                payload = { source: 'github', releases: published };
              }
            }
          }
        } catch {
          // Ignore network errors
        }
      }
    }

    if (!payload) {
      try {
        const localRes = await fetch('./data/releases.json');
        if (localRes.ok) {
          const list = await localRes.json();
          payload = { source: 'fallback', releases: Array.isArray(list) ? list : [] };
        }
      } catch {
        payload = { source: 'fallback', releases: [] };
      }
    }

    state.releases = Array.isArray(payload?.releases) ? payload.releases : [];
    state.source = payload?.source || 'fallback';
    populateHeroDownload(state.releases[0]);
    renderReleasesList(state.releases, state.source);
  }

  function bindEvents() {
    if (el.langSelect) {
      el.langSelect.addEventListener('change', (e) => {
        applySiteLanguage(e.target.value);
      });
    }

    el.themeToggle.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setSiteTheme(next);
    });

    for (const tab of el.previewTabs) {
      tab.addEventListener('click', () => setPreviewTab(tab.dataset.preview));
    }

    el.downloadMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = el.downloadDropdown.classList.contains('hidden');
      el.downloadDropdown.classList.toggle('hidden', !willOpen);
      el.downloadMenuToggle.setAttribute('aria-expanded', String(willOpen));
    });

    document.addEventListener('click', (e) => {
      if (!el.downloadMenuWrap.contains(e.target)) {
        el.downloadDropdown.classList.add('hidden');
        el.downloadMenuToggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        el.downloadDropdown.classList.add('hidden');
        el.downloadMenuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function init() {
    try {
      const saved = localStorage.getItem('peak-launcher-site-theme');
      if (saved === 'dark' || saved === 'light') {
        setSiteTheme(saved);
      }
    } catch {
      // Ignore
    }
    if (window.PeakSiteFX) {
      window.PeakSiteFX.init('website-fx-canvas');
    }
    applySiteLanguage(i18n.getLanguage());
    bindEvents();
    loadReleases();
  }

  init();
})();
