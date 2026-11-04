// js/parsers.js
// Responsibility: Extract transactions from PDF and CSV/TAB statements for:
// Rabobank, ABN AMRO, Revolut, bunq, and Wise.

const StatementParsers = (() => {
  // Configure PDF.js worker
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // Parse Dutch ("-82,45" or "1.234,56") and standard ("-82.45") amount strings
  function parseAmount(raw) {
    if (typeof raw === "number") return raw;
    if (!raw) return 0;
    let s = String(raw).trim().replace(/[€$£\s]/g, "");
    // Handle trailing minus or Af/Bij indicators
    let isNegative = false;
    if (s.endsWith("-")) {
      isNegative = true;
      s = s.slice(0, -1);
    }
    if (s.includes(",") && s.includes(".")) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (s.includes(",")) {
      s = s.replace(",", ".");
    }
    const num = parseFloat(s);
    if (isNaN(num)) return 0;
    return isNegative ? -Math.abs(num) : num;
  }

  // Normalize various date formats (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, YYYYMMDD) to YYYY-MM-DD
  function normalizeDate(raw, fallbackMonth) {
    const str = String(raw || "").trim();
    // YYYY-MM-DD
    let m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    m = str.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) {
      return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }

    // YYYYMMDD (ABN AMRO TAB format)
    m = str.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // DD MMM YYYY (e.g. "14 Oct 2026" in Revolut/Wise PDFs)
    const months = {
      jan: "01", feb: "02", mar: "03", mrt: "03", apr: "04", may: "05", mei: "05",
      jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", okt: "10", nov: "11", dec: "12"
    };
    m = str.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
    if (m && months[m[2].toLowerCase()]) {
      return `${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
    }

    if (fallbackMonth && /^\d{4}-\d{2}$/.test(fallbackMonth)) {
      return `${fallbackMonth}-01`;
    }
    return new Date().toISOString().slice(0, 10);
  }

  function detectBankFromText(text, fileName = "") {
    const sample = (`${fileName} ${text}`).toLowerCase();
    if (sample.includes("rabobank") || sample.includes("rabo ") || sample.includes("iban/bban")) return "Rabobank";
    if (sample.includes("abn amro") || sample.includes("abnamro") || sample.includes("abna")) return "ABN AMRO";
    if (sample.includes("revolut") || sample.includes("revogb")) return "Revolut";
    if (sample.includes("bunq") || sample.includes("bunqnl")) return "bunq";
    if (sample.includes("wise") || sample.includes("transferwise") || sample.includes("trwibe")) return "Wise";
    return "Rabobank";
  }

  // Split a CSV row respecting double quotes
  function splitCsvLine(line, delimiter = ",") {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  // Parse CSV / TAB files from Rabobank, ABN AMRO, Revolut, bunq, Wise
  function parseDelimitedText(text, selectedBank, fallbackMonth, customRules, fileName) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    const bank = selectedBank === "AUTO" ? detectBankFromText(text, fileName) : selectedBank;

    // Handle ABN AMRO headerless TAB format (Rekeningnummer \t Muntsoort \t Transactiedatum \t ... \t Bedrag \t Omschrijving)
    if (lines[0].includes("\t") && /^\d{8,10}\t/.test(lines[0])) {
      return lines.map((line, idx) => {
        const cols = line.split("\t");
        const date = normalizeDate(cols[2], fallbackMonth);
        const amount = parseAmount(cols[6]);
        const desc = cols[7] || "ABN AMRO Transaction";
        // Extract /NAME/.../ if SEPA formatted
        const nameMatch = desc.match(/\/NAME\/([^/]+)/i) || desc.match(/Naam:\s*([^\s].+)/i);
        const merchant = nameMatch ? nameMatch[1].trim() : desc.slice(0, 45).trim();
        return buildTx(date, "ABN AMRO", merchant, desc, amount, customRules, idx);
      }).filter(tx => tx.amount < 0);
    }

    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") ? ";" : (firstLine.includes("\t") ? "\t" : ",");
    const headers = splitCsvLine(firstLine, delimiter).map(h => h.toLowerCase());

    const findCol = (candidates) => headers.findIndex(h => candidates.some(c => h.includes(c)));

    const dateIdx = findCol(["datum", "date", "started date", "completed date", "transactiedatum"]);
    const amountIdx = findCol(["bedrag", "amount", "mutatie"]);
    const nameIdx = findCol(["naam tegenpartij", "tegenrekening", "name", "merchant", "payee", "counterparty"]);
    const descIdx = findCol(["omschrijving", "description", "reference", "mededelingen"]);

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i], delimiter);
      if (cols.length < 2) continue;

      const rawDate = dateIdx >= 0 ? cols[dateIdx] : cols[0];
      const rawAmount = amountIdx >= 0 ? cols[amountIdx] : cols[cols.length - 1];
      const amount = parseAmount(rawAmount);

      // Keep expenses (negative amounts)
      if (amount >= 0) continue;

      const merchant = (nameIdx >= 0 ? cols[nameIdx] : "") || (descIdx >= 0 ? cols[descIdx] : "") || `${bank} Expense`;
      const description = (descIdx >= 0 ? cols[descIdx] : merchant) || merchant;
      const date = normalizeDate(rawDate, fallbackMonth);

      rows.push(buildTx(date, bank, merchant, description, amount, customRules, i));
    }
    return rows;
  }

  // Extract text lines from PDF statement using PDF.js and parse transaction rows
  async function parsePdfFile(file, selectedBank, fallbackMonth, customRules) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const allLines = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      // Group text items by approximate Y coordinate to reconstruct table rows
      const rowMap = new Map();
      for (const item of content.items) {
        const y = Math.round(item.transform[5] / 4) * 4;
        if (!rowMap.has(y)) rowMap.set(y, []);
        rowMap.get(y).push({ x: item.transform[4], text: item.str });
      }
      const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a);
      for (const y of sortedYs) {
        const rowItems = rowMap.get(y).sort((a, b) => a.x - b.x);
        const lineText = rowItems.map(i => i.text.trim()).filter(Boolean).join(" ");
        if (lineText) allLines.push(lineText);
      }
    }

    const fullText = allLines.join("\n");
    const bank = selectedBank === "AUTO" ? detectBankFromText(fullText, file.name) : selectedBank;

    // Regex matching common PDF statement transaction lines across Rabobank, ABN AMRO, Revolut, bunq, Wise:
    // Matches lines starting or containing a date + merchant text + a currency amount at the end
    const datePattern = "(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4}|\\d{1,2}\\s+[A-Za-z]{3}[a-z]*\\s+\\d{4})";
    const amountPattern = "([+-]?\\s*(?:€|EUR)?\\s*\\d{1,3}(?:[.,]\\d{3})*[.,]\\d{2}-?)";
    const lineRegex = new RegExp(`${datePattern}\\s+(.+?)\\s+${amountPattern}$`, "i");

    const parsed = [];
    allLines.forEach((line, idx) => {
      const match = line.match(lineRegex);
      if (!match) return;

      const date = normalizeDate(match[1], fallbackMonth);
      const rawMiddle = match[2].replace(/\s+/g, " ").trim();
      let amount = parseAmount(match[3]);

      // Ignore balance summary lines ("Saldo", "Balance", "Opening", "Closing")
      if (/^(saldo|opening|closing|balance|totaal|total)/i.test(rawMiddle)) return;

      // In many Dutch PDF statements, expenses are listed as negative or in an "Af" column;
      // If a statement lists expenses as positive numbers without "salari" / "bijschrijving", treat as expense
      if (amount > 0 && !/(salaris|loon|bijschrijving|refund|terugbetaling|incoming)/i.test(rawMiddle)) {
        amount = -Math.abs(amount);
      }

      if (amount < 0) {
        parsed.push(buildTx(date, bank, rawMiddle.slice(0, 48), rawMiddle, amount, customRules, idx));
      }
    });

    return { bank, transactions: parsed };
  }

  function buildTx(date, bank, merchant, description, amount, customRules, seq) {
    const cleanMerchant = merchant.replace(/^\d{2}-\d{2}-\d{4}\s*/, "").trim() || `${bank} Expense`;
    const month = date.slice(0, 7);
    const year = date.slice(0, 4);
    const category = Categorizer.categorize(`${cleanMerchant} ${description}`, customRules);
    return {
      id: `tx-${Date.now()}-${seq}-${Math.random().toString(36).slice(2, 6)}`,
      date,
      month,
      year,
      bank,
      merchant: cleanMerchant,
      description,
      amount: Number(amount.toFixed(2)),
      type: amount < 0 ? "expense" : "income",
      category
    };
  }

  async function parseStatementFile(file, selectedBank, fallbackMonth, customRules) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "pdf") {
      return await parsePdfFile(file, selectedBank, fallbackMonth, customRules);
    } else {
      const text = await file.text();
      const bank = selectedBank === "AUTO" ? detectBankFromText(text, file.name) : selectedBank;
      const transactions = parseDelimitedText(text, bank, fallbackMonth, customRules, file.name);
      return { bank, transactions };
    }
  }

  return {
    parseStatementFile
  };
})();
