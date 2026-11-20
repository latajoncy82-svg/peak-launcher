const fallbackReleases = require('../data/releases.json');

const REPO = 'latajoncy82-svg/peak-launcher';
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=20`;

function normalizeAsset(asset) {
  return {
    name: asset.name,
    size: typeof asset.size === 'number' ? asset.size : 0,
    downloadUrl: asset.browser_download_url,
    downloadCount: typeof asset.download_count === 'number' ? asset.download_count : 0
  };
}

function mapGithubRelease(release) {
  const rawAssets = Array.isArray(release.assets) ? release.assets.map(normalizeAsset) : [];
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
      `https://github.com/${REPO}/releases/tag/${encodeURIComponent(release.tag_name)}`,
    prerelease: Boolean(release.prerelease),
    assets: {
      installer,
      portable,
      all: rawAssets
    }
  };
}

async function fetchGithubReleases() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'peak-launcher-site'
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(GITHUB_RELEASES_URL, {
      headers,
      signal: controller.signal
    });
    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return null;
    }

    const published = data.filter((r) => r && !r.draft).map(mapGithubRelease);
    return published.length > 0 ? published : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(_req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

  const githubReleases = await fetchGithubReleases();
  if (githubReleases) {
    res.status(200).json({
      source: 'github',
      repo: REPO,
      releases: githubReleases
    });
    return;
  }

  res.status(200).json({
    source: 'fallback',
    repo: REPO,
    releases: fallbackReleases
  });
};
