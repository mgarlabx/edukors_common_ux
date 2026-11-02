// Update checks (the shared default: on, nothing to enable). The app asks GitHub for the repository's latest release
// and, when it is newer than the running version, tells the page, which offers to open the release page. Nothing is
// downloaded or installed by the app. Versions are the release dates: 26.11.1 for v.26.11.01 (year, month, day).
// Not checked: unpackaged runs, Microsoft Store installs (the Store updates them), and EDUKORS_NO_UPDATES=1.

/** [year, month, day] from "26.11.1", "v26.11.01", or "v.26.11.01"; null for anything else (pre-releases included). */
export function parseVersion(text) {
  const match = /^v?\.?(\d{1,4})\.(\d{1,2})\.(\d{1,3})$/.exec(String(text ?? "").trim());
  return match ? match.slice(1, 4).map(Number) : null;
}

export function isNewer(candidate, current) {
  const a = parseVersion(candidate), b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * { owner, repo } from the app's package.json field `"edukors": { "updates": "owner/repo" }`: the GitHub repository whose
 * releases the app checks. Each app names its own; Common names none (it is never installed by itself), so it never checks.
 */
export function updatesOf(pkg) {
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(typeof pkg?.edukors?.updates === "string" ? pkg.edukors.updates : "");
  return match ? { owner: match[1], repo: match[2] } : null;
}

/**
 * Checks now (after `delayMs`) and every `everyMs`; calls notify({ version, url }) once per newer version.
 * `fetch` is injected (Electron's net.fetch in the app, a fake in tests). Returns stop().
 */
export function startUpdateChecks({ current, owner, repo, fetch, notify, log = () => {}, delayMs = 10_000, everyMs = 6 * 3600_000 }) {
  const told = new Set();
  async function check() {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Edukors" } });
      if (!response.ok) { log(`update check: HTTP ${response.status}`); return; }
      const release = await response.json();
      const version = parseVersion(release?.tag_name)?.join(".");
      const url = typeof release?.html_url === "string" && release.html_url.startsWith(`https://github.com/${owner}/${repo}/`) ? release.html_url : null;
      if (!version || !url || release.draft || release.prerelease || !isNewer(version, current) || told.has(version)) return;
      told.add(version);
      notify({ version, url });
    } catch (error) { log(`update check failed: ${error?.message ?? error}`); }
  }
  const first = setTimeout(check, delayMs), timer = setInterval(check, everyMs);
  first.unref?.(); timer.unref?.();
  return { check, stop: () => { clearTimeout(first); clearInterval(timer); } };
}
