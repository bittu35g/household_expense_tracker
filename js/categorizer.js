// js/categorizer.js
// Responsibility: Automatic categorization for Dutch & international merchants + user-defined rules.

const Categorizer = (() => {
  const CATEGORIES = [
    "Groceries",
    "Housing & Utilities",
    "Home & DIY",
    "Transport",
    "Dining & Leisure",
    "Shopping",
    "Health & Care",
    "Subscriptions",
    "Transfers & Other"
  ];

  const DEFAULT_RULES = {
    "Groceries": [
      "albert heijn", "ah to go", "jumbo", "lidl", "aldi", "plus ", "dirk",
      "picnic", "ekoPlaza", "amazing oriental", "spar", "supermarkt", "bakkerij"
    ],
    "Housing & Utilities": [
      "hypotheek", "rabobank hypotheek", "eneco", "vattenfall", "essent",
      "greenchoice", "brabant water", "waterbedrijf", "gemeente", "ziggo",
      "kpn", "odido", "verzekering", "centraal beheer", "interpolis"
    ],
    "Home & DIY": [
      "gamma", "praxis", "karwei", "hornbach", "action", "ikea", "intratuin",
      "jysk", "kwantum", "leen bakker", "bouwmarkt", "parkside", "eufy"
    ],
    "Transport": [
      "ns groep", "ns reizigers", "ov-chipkaart", "shell", "totalenergies",
      "tango", "tinq", "esb", "bp ", "esso", "q-park", "parkeren", "wegenbelasting",
      "belastingdienst", "anwb", "citroen", "garage"
    ],
    "Dining & Leisure": [
      "pathe", "bioscoop", "thuisbezorgd", "uber eats", "deliveroo",
      "restaurant", "cafe", "starbucks", "mcdonald", "domino", "kfc",
      "booking.com", "airbnb", "hotel", "museum", "efteling"
    ],
    "Shopping": [
      "bol.com", "coolblue", "amazon", "zalando", "wehkamp", "hema",
      "mediamarkt", "decathlon", "h&m", "uniqlo", "primark", "zara"
    ],
    "Health & Care": [
      "cz ", "zilveren kruis", "vgz", "menzis", "kruidvat", "etos",
      "apotheek", "holland & barrett", "tandarts", "huisarts", "kapper"
    ],
    "Subscriptions": [
      "netflix", "spotify", "playstation", "disney", "youtube", "apple.com",
      "google ", "microsoft", "chatgpt", "openai", "prime video"
    ]
  };

  function categorize(merchantOrDescription, customRules = {}) {
    const text = (merchantOrDescription || "").toLowerCase();

    // 1. Check user's learned custom rules first
    for (const [keyword, category] of Object.entries(customRules)) {
      if (keyword && text.includes(keyword.toLowerCase())) {
        return category;
      }
    }

    // 2. Check built-in Dutch & European merchant rules
    for (const [category, keywords] of Object.entries(DEFAULT_RULES)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          return category;
        }
      }
    }

    return "Transfers & Other";
  }

  return {
    CATEGORIES,
    categorize
  };
})();
