// js/storage.js
// Responsibility: Persist and sync application data with `data/db.json` inside the SAME GitHub repository
// using the GitHub REST API, plus browser localStorage caching for instant offline access on Laptop, Android & iPhone.

const StorageService = (() => {
  const LOCAL_DB_KEY = "huishoudboekje_db_v2";
  const GH_CONFIG_KEY = "huishoudboekje_gh_config_v2";
  const AUTH_SESSION_KEY = "huishoudboekje_auth_session_v2";

  function getGitHubConfig() {
    try {
      return JSON.parse(localStorage.getItem(GH_CONFIG_KEY)) || {
        owner: "",
        repo: "",
        branch: "main",
        path: "data/db.json",
        token: ""
      };
    } catch {
      return { owner: "", repo: "", branch: "main", path: "data/db.json", token: "" };
    }
  }

  function saveGitHubConfig(config) {
    localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(config));
  }

  function isGitHubConfigured() {
    const cfg = getGitHubConfig();
    return Boolean(cfg.owner && cfg.repo && cfg.token);
  }

  // Load database: 1) From GitHub Repo API if configured, 2) LocalStorage cache, 3) Repo's static data/db.json
  async function loadDatabase() {
    if (isGitHubConfigured()) {
      try {
        const remoteDb = await fetchFromGitHubRepo();
        if (remoteDb) {
          localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(remoteDb));
          return { db: remoteDb, source: "GitHub Repo (Live)" };
        }
      } catch (err) {
        console.warn("GitHub API fetch failed, falling back to local cache:", err.message);
      }
    }

    const cached = localStorage.getItem(LOCAL_DB_KEY);
    if (cached) {
      return { db: JSON.parse(cached), source: "Device Storage" };
    }

    // First-time load from static data/db.json in the same project
    try {
      const resp = await fetch("data/db.json", { cache: "no-store" });
      if (resp.ok) {
        const initialDb = await resp.json();
        localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(initialDb));
        return { db: initialDb, source: "Project data/db.json" };
      }
    } catch (e) {
      console.warn("Could not fetch initial data/db.json:", e);
    }

    const fallback = {
      meta: { app: "Huishoudboekje NL", version: "2.0.0", lastUpdated: new Date().toISOString() },
      accessControl: {
        allowedUsers: [
          { name: "Partner 1", email: "partner1@example.com" },
          { name: "Partner 2", email: "partner2@example.com" }
        ],
        pin: ""
      },
      customRules: {},
      batches: [],
      transactions: []
    };
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(fallback));
    return { db: fallback, source: "Default DB" };
  }

  // Save database locally and commit directly to `data/db.json` in the GitHub repository if configured
  async function saveDatabase(db, commitMessage = "Update expense database") {
    db.meta = db.meta || {};
    db.meta.lastUpdated = new Date().toISOString();
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));

    if (isGitHubConfigured()) {
      await pushToGitHubRepo(db, commitMessage);
      return "Synced to GitHub Repo";
    }
    return "Saved Locally (Configure GitHub token to sync across devices)";
  }

  // Fetch `data/db.json` from the GitHub Repository via REST API
  async function fetchFromGitHubRepo() {
    const cfg = getGitHubConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}?ref=${cfg.branch}`;
    const res = await fetch(url, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${cfg.token}`
      }
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    }
    const payload = await res.json();
    const jsonString = decodeURIComponent(escape(atob(payload.content.replace(/\n/g, ""))));
    return JSON.parse(jsonString);
  }

  // Commit updated `data/db.json` directly into the GitHub Repository
  async function pushToGitHubRepo(db, commitMessage) {
    const cfg = getGitHubConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;

    // 1. Check current file SHA if it already exists in the repo
    let sha = undefined;
    const getRes = await fetch(`${url}?ref=${cfg.branch}`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${cfg.token}`
      }
    });
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    // 2. Base64 encode UTF-8 JSON content
    const prettyJson = JSON.stringify(db, null, 2);
    const base64Content = btoa(unescape(encodeURIComponent(prettyJson)));

    const putRes = await fetch(url, {
      method: "PUT",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${cfg.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: commitMessage,
        content: base64Content,
        branch: cfg.branch,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const errBody = await putRes.text();
      throw new Error(`GitHub commit failed (${putRes.status}): ${errBody}`);
    }
    return await putRes.json();
  }

  function getActiveSession() {
    try {
      return JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY));
    } catch {
      return null;
    }
  }

  function setActiveSession(user) {
    if (!user) sessionStorage.removeItem(AUTH_SESSION_KEY);
    else sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user));
  }

  return {
    getGitHubConfig,
    saveGitHubConfig,
    isGitHubConfigured,
    loadDatabase,
    saveDatabase,
    pushToGitHubRepo,
    getActiveSession,
    setActiveSession
  };
})();
