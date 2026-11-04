# Huishoudboekje NL — Multi-File GitHub Expense Tracker

A lightweight, modular household expense tracker built with vanilla HTML, CSS, and JavaScript that you can **host directly on GitHub Pages** while using **`data/db.json` inside the exact same GitHub repository as your backend database**.

## Project Structure (Separated by Responsibility)

```text
huishoudboekje-nl/
├── index.html          # Main application UI (Laptop, Android & iPhone responsive)
├── manifest.json       # PWA manifest for mobile home-screen installation
├── README.md           # Setup & deployment guide
├── css/
│   └── styles.css      # Responsive styling
├── js/
│   ├── categorizer.js  # Dutch & international merchant categorization + learned rules
│   ├── parsers.js      # PDF & CSV statement parsers (Rabobank, ABN AMRO, Revolut, bunq, Wise)
│   ├── storage.js      # GitHub Contents REST API adapter (reads/commits data/db.json in this repo)
│   ├── charts.js       # Chart.js monthly/yearly category timeline & doughnut charts
│   └── app.js          # Main controller, staging queue & 2-user household access control
└── data/
    └── db.json         # Backend database file committed directly in this repository
```

## How to Host on GitHub with Backend Storage in the Same Repo

1. **Create a GitHub Repository**:
   - Create a new repository on GitHub (e.g., `huishoudboekje-nl`) and upload all files from this project.
2. **Enable GitHub Pages**:
   - Go to **Settings → Pages** in your repository, select the `main` branch and `/ (root)` folder, and click **Save**.
3. **Create a Fine-Grained Personal Access Token (PAT) for Backend Storage**:
   - Go to **GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
   - Click **Generate new token**, select **Only select repositories** → pick your `huishoudboekje-nl` repository.
   - Under **Repository permissions**, set **Contents** to **Read and write**.
4. **Connect Your Laptop, Android Phone, and iPhone**:
   - Open your hosted site URL on your device, go to the **⚙️ GitHub DB & Access** tab, and enter your GitHub username, repo name, and token once.
   - Every time you or your wife upload monthly **Rabobank, ABN AMRO, Revolut, bunq, or Wise** PDF/CSV statements, the app automatically updates `data/db.json` inside your GitHub repository!
