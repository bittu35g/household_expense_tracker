// js/app.js
// Responsibility: Application controller connecting UI, StatementParsers, Categorizer, ChartsView, and StorageService.

document.addEventListener("DOMContentLoaded", async () => {
  const SUPPORTED_BANKS = ["Rabobank", "ABN AMRO", "Revolut", "bunq", "Wise"];
  let appDb = null;
  let stagedItems = [];
  let stagedFileMeta = null;

  // Set default statement month input to current YYYY-MM
  const monthInput = document.getElementById("upload-month-input");
  if (monthInput) {
    monthInput.value = new Date().toISOString().slice(0, 7);
  }

  // 1. Load Database from GitHub Repo or Device Cache
  const { db, source } = await StorageService.loadDatabase();
  appDb = db;
  updateSyncStatus(source);

  // 2. Check 2-User Household Access Control Gate
  checkHouseholdAccessGate();

  // 3. Initialize Navigation, Filters, Forms, and Views
  initNavigation();
  initDashboardFilters();
  initUploadHandlers();
  initSettingsForms();
  refreshAllViews();

  function updateSyncStatus(text) {
    const el = document.getElementById("sync-status");
    if (el) el.textContent = text;
  }

  // --- 2-USER HOUSEHOLD ACCESS CONTROL ---
  function checkHouseholdAccessGate() {
    const ac = appDb.accessControl || {};
    const pinRequired = Boolean(ac.pin && ac.pin.trim() !== "");
    const activeUser = StorageService.getActiveSession();

    const gateModal = document.getElementById("auth-gate");
    const userPill = document.getElementById("active-user-pill");

    if (activeUser) {
      userPill.textContent = `👤 ${activeUser.name}`;
      gateModal.classList.add("hidden");
      return;
    }

    if (!pinRequired) {
      const firstUser = (ac.allowedUsers && ac.allowedUsers[0]) || { name: "Household Admin", email: "" };
      userPill.textContent = `👤 ${firstUser.name}`;
      gateModal.classList.add("hidden");
      return;
    }

    gateModal.classList.remove("hidden");
  }

  document.getElementById("auth-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim().toLowerCase();
    const pin = document.getElementById("auth-pin").value.trim();
    const errEl = document.getElementById("auth-error");

    const ac = appDb.accessControl || {};
    const matchedUser = (ac.allowedUsers || []).find(u => u.email.toLowerCase() === email);
    const pinMatches = !ac.pin || ac.pin === pin;

    if (matchedUser && pinMatches) {
      StorageService.setActiveSession(matchedUser);
      errEl.classList.add("hidden");
      checkHouseholdAccessGate();
    } else {
      errEl.classList.remove("hidden");
    }
  });

  // --- TAB NAVIGATION ---
  function initNavigation() {
    const buttons = document.querySelectorAll(".nav-btn");
    const panels = document.querySelectorAll(".tab-panel");

    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        panels.forEach(p => p.classList.add("hidden"));
        btn.classList.add("active");
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.remove("hidden");
      });
    });
  }

  // --- DASHBOARD & FILTERS ---
  function initDashboardFilters() {
    ["filter-timeline-mode", "filter-period", "filter-bank", "chart-type-toggle"].forEach(id => {
      document.getElementById(id).addEventListener("change", () => renderDashboard());
    });

    document.getElementById("tx-search-input").addEventListener("input", () => renderTransactionsTable());

    document.getElementById("btn-sync-now").addEventListener("click", async () => {
      updateSyncStatus("Syncing with GitHub...");
      const { db: freshDb, source: src } = await StorageService.loadDatabase();
      appDb = freshDb;
      updateSyncStatus(src);
      refreshAllViews();
    });
  }

  function populatePeriodDropdown() {
    const select = document.getElementById("filter-period");
    const currentVal = select.value;
    const months = Array.from(new Set(appDb.transactions.map(t => t.month))).sort().reverse();
    const years = Array.from(new Set(appDb.transactions.map(t => t.year))).sort().reverse();

    select.innerHTML = `<option value="ALL">All Time</option>`;
    years.forEach(y => {
      select.innerHTML += `<option value="YEAR:${y}">Year ${y}</option>`;
    });
    months.forEach(m => {
      select.innerHTML += `<option value="${m}">Month ${m}</option>`;
    });

    if ([...select.options].some(o => o.value === currentVal)) {
      select.value = currentVal;
    }
  }

  function getFilteredTransactions() {
    const period = document.getElementById("filter-period").value;
    const bank = document.getElementById("filter-bank").value;

    return appDb.transactions.filter(t => {
      const bankMatch = bank === "ALL" || t.bank === bank;
      let periodMatch = true;
      if (period.startsWith("YEAR:")) {
        periodMatch = t.year === period.replace("YEAR:", "");
      } else if (period !== "ALL") {
        periodMatch = t.month === period;
      }
      return bankMatch && periodMatch;
    });
  }

  function renderDashboard() {
    const timelineMode = document.getElementById("filter-timeline-mode").value;
    const chartStyle = document.getElementById("chart-type-toggle").value;
    const filtered = getFilteredTransactions();
    const expenses = filtered.filter(t => t.amount < 0);

    const totalExpense = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    document.getElementById("kpi-expenses").textContent = `€${totalExpense.toFixed(2)}`;
    document.getElementById("kpi-tx-count").textContent = String(expenses.length);

    // Top Category calculation
    const byCat = {};
    expenses.forEach(t => {
      byCat[t.category] = (byCat[t.category] || { count: 0, total: 0 });
      byCat[t.category].count += 1;
      byCat[t.category].total += Math.abs(t.amount);
    });

    const sortedCats = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total);
    if (sortedCats.length > 0) {
      document.getElementById("kpi-top-category").textContent = sortedCats[0][0];
      document.getElementById("kpi-top-category-amount").textContent = `€${sortedCats[0][1].total.toFixed(2)}`;
    } else {
      document.getElementById("kpi-top-category").textContent = "—";
      document.getElementById("kpi-top-category-amount").textContent = "€0.00";
    }

    // Category summary table
    const tbody = document.getElementById("category-summary-tbody");
    tbody.innerHTML = sortedCats.map(([cat, stats]) => {
      const pct = totalExpense > 0 ? ((stats.total / totalExpense) * 100).toFixed(1) : "0.0";
      return `
        <tr>
          <td><strong>${cat}</strong></td>
          <td>${stats.count}</td>
          <td>€${stats.total.toFixed(2)}</td>
          <td>${pct}%</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="4">No expenses for selected filters.</td></tr>`;

    ChartsView.renderCharts(filtered, timelineMode, chartStyle);
  }

  // --- STATEMENT UPLOAD & STAGING (PDF / CSV) ---
  function initUploadHandlers() {
    const fileInput = document.getElementById("statement-file-input");
    const dropzone = document.getElementById("statement-dropzone");

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#2563eb";
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.style.borderColor = "#94a3b8";
    });
    dropzone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropzone.style.borderColor = "#94a3b8";
      if (e.dataTransfer.files.length) {
        await handleFilesSelected(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener("change", async (e) => {
      if (e.target.files.length) {
        await handleFilesSelected(e.target.files);
      }
    });

    document.getElementById("btn-cancel-staging").addEventListener("click", () => {
      stagedItems = [];
      stagedFileMeta = null;
      document.getElementById("staging-container").classList.add("hidden");
    });

    document.getElementById("btn-commit-staging").addEventListener("click", async () => {
      if (!stagedItems.length) return;
      const batchId = `batch-${Date.now()}`;
      const totalExp = stagedItems.reduce((s, t) => s + Math.abs(t.amount), 0);

      stagedItems.forEach(t => { t.batchId = batchId; });
      appDb.transactions.unshift(...stagedItems);

      appDb.batches.unshift({
        id: batchId,
        fileName: stagedFileMeta.fileName,
        bank: stagedFileMeta.bank,
        statementMonth: stagedFileMeta.statementMonth,
        uploadedAt: new Date().toISOString(),
        uploadedBy: (StorageService.getActiveSession() || { name: "Household Admin" }).name,
        txCount: stagedItems.length,
        totalExpense: Number(totalExp.toFixed(2))
      });

      const status = await StorageService.saveDatabase(
        appDb,
        `Upload ${stagedFileMeta.bank} statement (${stagedFileMeta.statementMonth})`
      );
      updateSyncStatus(status);

      stagedItems = [];
      document.getElementById("staging-container").classList.add("hidden");
      refreshAllViews();
      alert(`Saved ${appDb.batches[0].txCount} transactions to backend database.`);
    });
  }

  async function handleFilesSelected(fileList) {
    const selectedBank = document.getElementById("upload-bank-select").value;
    const fallbackMonth = document.getElementById("upload-month-input").value;
    stagedItems = [];

    for (const file of fileList) {
      const { bank, transactions } = await StatementParsers.parseStatementFile(
        file,
        selectedBank,
        fallbackMonth,
        appDb.customRules || {}
      );
      stagedItems.push(...transactions);
      stagedFileMeta = {
        fileName: file.name,
        bank,
        statementMonth: transactions[0] ? transactions[0].month : fallbackMonth
      };
    }

    renderStagingTable();
  }

  function renderStagingTable() {
    const container = document.getElementById("staging-container");
    const tbody = document.getElementById("staging-tbody");
    const title = document.getElementById("staging-title");

    container.classList.remove("hidden");
    title.textContent = `Extracted ${stagedItems.length} Expense Transactions (${stagedFileMeta ? stagedFileMeta.bank : ""})`;

    tbody.innerHTML = stagedItems.map((tx, idx) => `
      <tr>
        <td>${tx.date}</td>
        <td><span class="badge-bank">${tx.bank}</span></td>
        <td>${tx.merchant}</td>
        <td>
          <select data-stage-idx="${idx}" class="stage-cat-select">
            ${Categorizer.CATEGORIES.map(c => `<option value="${c}" ${c === tx.category ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </td>
        <td>€${Math.abs(tx.amount).toFixed(2)}</td>
      </tr>
    `).join("") || `<tr><td colspan="5">No expense rows detected in statement. Check bank/format.</td></tr>`;

    tbody.querySelectorAll(".stage-cat-select").forEach(sel => {
      sel.addEventListener("change", (e) => {
        const i = Number(e.target.dataset.stageIdx);
        stagedItems[i].category = e.target.value;
      });
    });
  }

  // --- TRANSACTIONS TABLE & SMART RULE LEARNING ---
  function renderTransactionsTable() {
    const query = (document.getElementById("tx-search-input").value || "").toLowerCase();
    const tbody = document.getElementById("transactions-tbody");

    const rows = appDb.transactions.filter(t => {
      if (!query) return true;
      return (
        t.merchant.toLowerCase().includes(query) ||
        t.category.toLowerCase().includes(query) ||
        t.bank.toLowerCase().includes(query) ||
        t.date.includes(query)
      );
    });

    tbody.innerHTML = rows.map(tx => `
      <tr>
        <td>${tx.date}</td>
        <td><span class="badge-bank">${tx.bank}</span></td>
        <td><strong>${tx.merchant}</strong></td>
        <td>
          <select data-tx-id="${tx.id}" class="tx-cat-select">
            ${Categorizer.CATEGORIES.map(c => `<option value="${c}" ${c === tx.category ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </td>
        <td>€${Math.abs(tx.amount).toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete-tx" data-tx-id="${tx.id}">Delete</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6">No transactions found.</td></tr>`;

    // Category change teaches custom rule & persists
    tbody.querySelectorAll(".tx-cat-select").forEach(sel => {
      sel.addEventListener("change", async (e) => {
        const txId = e.target.dataset.txId;
        const newCat = e.target.value;
        const tx = appDb.transactions.find(t => t.id === txId);
        if (!tx) return;

        tx.category = newCat;
        const keyword = tx.merchant.toLowerCase().trim();
        appDb.customRules = appDb.customRules || {};
        appDb.customRules[keyword] = newCat;

        // Also update matching merchants
        appDb.transactions.forEach(item => {
          if (item.merchant.toLowerCase().trim() === keyword) {
            item.category = newCat;
          }
        });

        const status = await StorageService.saveDatabase(appDb, `Categorize ${tx.merchant} as ${newCat}`);
        updateSyncStatus(status);
        refreshAllViews();
      });
    });

    tbody.querySelectorAll(".btn-delete-tx").forEach(btn => {
      btn.addEventListener("click", async () => {
        const txId = btn.dataset.txId;
        appDb.transactions = appDb.transactions.filter(t => t.id !== txId);
        const status = await StorageService.saveDatabase(appDb, "Delete transaction");
        updateSyncStatus(status);
        refreshAllViews();
      });
    });
  }

  // --- MONTHLY STATEMENT HISTORY & COVERAGE MATRIX ---
  function renderHistoryTab() {
    const months = Array.from(new Set(appDb.transactions.map(t => t.month))).sort().reverse();
    const matrixBody = document.getElementById("coverage-matrix-tbody");

    matrixBody.innerHTML = months.map(m => {
      const monthTxs = appDb.transactions.filter(t => t.month === m && t.amount < 0);
      const total = monthTxs.reduce((s, t) => s + Math.abs(t.amount), 0);

      const bankCells = SUPPORTED_BANKS.map(bank => {
        const count = monthTxs.filter(t => t.bank === bank).length;
        return count > 0
          ? `<td class="status-ok">✔ (${count})</td>`
          : `<td class="status-missing">—</td>`;
      }).join("");

      return `
        <tr>
          <td><strong>${m}</strong></td>
          ${bankCells}
          <td><strong>€${total.toFixed(2)}</strong></td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="7">No monthly data yet.</td></tr>`;

    const batchesBody = document.getElementById("batches-tbody");
    batchesBody.innerHTML = (appDb.batches || []).map(b => `
      <tr>
        <td>${b.statementMonth}</td>
        <td><span class="badge-bank">${b.bank}</span></td>
        <td>${b.fileName}</td>
        <td>${b.txCount}</td>
        <td>€${Number(b.totalExpense || 0).toFixed(2)}</td>
        <td>${(b.uploadedAt || "").slice(0, 10)}</td>
        <td>
          <button class="btn btn-sm btn-danger btn-delete-batch" data-batch-id="${b.id}">Rollback</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="7">No statement batches uploaded yet.</td></tr>`;

    batchesBody.querySelectorAll(".btn-delete-batch").forEach(btn => {
      btn.addEventListener("click", async () => {
        const batchId = btn.dataset.batchId;
        appDb.batches = appDb.batches.filter(b => b.id !== batchId);
        appDb.transactions = appDb.transactions.filter(t => t.batchId !== batchId);
        const status = await StorageService.saveDatabase(appDb, `Rollback batch ${batchId}`);
        updateSyncStatus(status);
        refreshAllViews();
      });
    });
  }

  // --- GITHUB REPO BACKEND & ACCESS SETTINGS ---
  function initSettingsForms() {
    const ghCfg = StorageService.getGitHubConfig();
    document.getElementById("gh-owner").value = ghCfg.owner || "";
    document.getElementById("gh-repo").value = ghCfg.repo || "";
    document.getElementById("gh-branch").value = ghCfg.branch || "main";
    document.getElementById("gh-path").value = ghCfg.path || "data/db.json";
    document.getElementById("gh-token").value = ghCfg.token || "";

    document.getElementById("github-config-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      StorageService.saveGitHubConfig({
        owner: document.getElementById("gh-owner").value.trim(),
        repo: document.getElementById("gh-repo").value.trim(),
        branch: document.getElementById("gh-branch").value.trim() || "main",
        path: document.getElementById("gh-path").value.trim() || "data/db.json",
        token: document.getElementById("gh-token").value.trim()
      });
      const { db: syncedDb, source: src } = await StorageService.loadDatabase();
      appDb = syncedDb;
      updateSyncStatus(src);
      refreshAllViews();
      alert("GitHub Repository Backend connected!");
    });

    document.getElementById("btn-push-db").addEventListener("click", async () => {
      try {
        await StorageService.pushToGitHubRepo(appDb, "Manual push from Huishoudboekje UI");
        updateSyncStatus("Pushed to GitHub Repo");
        alert("Successfully committed data/db.json to your GitHub repository!");
      } catch (err) {
        alert(err.message);
      }
    });

    // Populate 2-User Household Access Form
    const users = (appDb.accessControl && appDb.accessControl.allowedUsers) || [];
    if (users[0]) {
      document.getElementById("user1-name").value = users[0].name || "";
      document.getElementById("user1-email").value = users[0].email || "";
    }
    if (users[1]) {
      document.getElementById("user2-name").value = users[1].name || "";
      document.getElementById("user2-email").value = users[1].email || "";
    }
    document.getElementById("household-pin").value = (appDb.accessControl && appDb.accessControl.pin) || "";

    document.getElementById("access-control-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      appDb.accessControl = {
        allowedUsers: [
          {
            name: document.getElementById("user1-name").value.trim(),
            email: document.getElementById("user1-email").value.trim()
          },
          {
            name: document.getElementById("user2-name").value.trim(),
            email: document.getElementById("user2-email").value.trim()
          }
        ],
        pin: document.getElementById("household-pin").value.trim()
      };
      const status = await StorageService.saveDatabase(appDb, "Update household access control");
      updateSyncStatus(status);
      alert("2-User Household Access settings saved.");
    });

    document.getElementById("btn-lock-now").addEventListener("click", () => {
      StorageService.setActiveSession(null);
      document.getElementById("auth-gate").classList.remove("hidden");
    });

    // Export / Import JSON Backup
    document.getElementById("btn-export-json").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(appDb, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "db.json";
      a.click();
    });

    document.getElementById("import-json-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const imported = JSON.parse(await file.text());
      appDb = imported;
      const status = await StorageService.saveDatabase(appDb, "Restore db.json backup");
      updateSyncStatus(status);
      refreshAllViews();
    });
  }

  function refreshAllViews() {
    populatePeriodDropdown();
    renderDashboard();
    renderTransactionsTable();
    renderHistoryTab();
  }
});
