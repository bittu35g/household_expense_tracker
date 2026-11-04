// js/charts.js
// Responsibility: Render and update interactive expenses-over-time and category breakdown charts.

const ChartsView = (() => {
  let timelineChartInstance = null;
  let categoryChartInstance = null;

  const PALETTE = {
    "Groceries": "#2563eb",
    "Housing & Utilities": "#0f172a",
    "Home & DIY": "#d97706",
    "Transport": "#059669",
    "Dining & Leisure": "#db2777",
    "Shopping": "#7c3aed",
    "Health & Care": "#0891b2",
    "Subscriptions": "#4f46e5",
    "Transfers & Other": "#64748b"
  };

  function renderCharts(transactions, timelineMode = "month", chartStyle = "bar") {
    renderTimelineChart(transactions, timelineMode, chartStyle);
    renderCategoryDoughnut(transactions);
  }

  function renderTimelineChart(transactions, timelineMode, chartStyle) {
    const ctx = document.getElementById("timelineChart");
    if (!ctx) return;

    const expenses = transactions.filter(t => t.amount < 0);
    const periodsSet = new Set();
    expenses.forEach(t => {
      periodsSet.add(timelineMode === "year" ? t.year : t.month);
    });
    const periods = Array.from(periodsSet).sort();

    const datasets = Categorizer.CATEGORIES.map(category => {
      const data = periods.map(period => {
        return expenses
          .filter(t => (timelineMode === "year" ? t.year : t.month) === period && t.category === category)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      });
      const totalForCat = data.reduce((a, b) => a + b, 0);
      return {
        label: category,
        data: data.map(v => Number(v.toFixed(2))),
        backgroundColor: PALETTE[category] || "#64748b",
        borderColor: PALETTE[category] || "#64748b",
        borderWidth: 2,
        tension: 0.25,
        fill: false,
        hidden: totalForCat === 0
      };
    }).filter(ds => !ds.hidden);

    if (timelineChartInstance) {
      timelineChartInstance.destroy();
    }

    timelineChartInstance = new Chart(ctx, {
      type: chartStyle === "line" ? "line" : "bar",
      data: {
        labels: periods.length ? periods : ["No Data"],
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: chartStyle === "bar" },
          y: {
            stacked: chartStyle === "bar",
            beginAtZero: true,
            ticks: {
              callback: (val) => `€${val}`
            }
          }
        },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: €${ctx.parsed.y.toFixed(2)}`
            }
          }
        }
      }
    });
  }

  function renderCategoryDoughnut(transactions) {
    const ctx = document.getElementById("categoryChart");
    if (!ctx) return;

    const totalsByCat = {};
    transactions.filter(t => t.amount < 0).forEach(t => {
      totalsByCat[t.category] = (totalsByCat[t.category] || 0) + Math.abs(t.amount);
    });

    const labels = Object.keys(totalsByCat);
    const data = labels.map(l => Number(totalsByCat[l].toFixed(2)));
    const colors = labels.map(l => PALETTE[l] || "#64748b");

    if (categoryChartInstance) {
      categoryChartInstance.destroy();
    }

    categoryChartInstance = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["No Expenses"],
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: colors.length ? colors : ["#e2e8f0"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" }
        }
      }
    });
  }

  return {
    renderCharts
  };
})();
