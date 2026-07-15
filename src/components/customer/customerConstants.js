export const DRINK_OPTIONS = [
  { key: "coke", label: "קוקה קולה", imageSrc: "/coke.png" },
  { key: "cokeZero", label: "קולה זירו", imageSrc: "/coke-zero.png" },
  { key: "sprite", label: "ספרייט", imageSrc: "/sprite.png" },
  { key: "fanta", label: "פאנטה", imageSrc: "/fanta.png" },
  {
    key: "xl",
    label: "XL",
    imageSrc: "https://dummyimage.com/120x160/111827/ffffff.png&text=XL",
  },
  {
    key: "blu",
    label: "BLU",
    imageSrc: "https://dummyimage.com/120x160/1e3a8a/ffffff.png&text=BLU",
  },
];

export const EXTRA_DRINK_OPTIONS = [
  { key: "grapeWater", label: "מים ענבים", imageSrc: "/grape-water.png" },
  { key: "peachWater", label: "מים אפרסק", imageSrc: "/peach-water.png" },
  { key: "fuzetea", label: "פיוזטי", imageSrc: "/fuzetea.jpeg" },
];

export const ALL_TOPPINGS = [
  { key: "noOnion", label: "בצל", imageSrc: "/onion.png" },
  { key: "noLettuce", label: "חסה", imageSrc: "/lettuce.png" },
  { key: "noTomato", label: "עגבניה", imageSrc: "/tomato.png" },
  { key: "noPickles", label: "חמוצים", imageSrc: "/pickles.png" },
  { key: "noMayo", label: "מיונז", imageSrc: "/mayo.png" },
  { key: "noKetchup", label: "קטשופ", imageSrc: "/ketchup.png" },
];

export const THEME = {
  accent: "#0f766e",
  accentDeep: "#115e59",
  warm: "#f59e0b",
  border: "#dbe7e4",
  borderSoft: "#e7eeec",
  text: "#111827",
  textSoft: "#4b5563",
  textMuted: "#6b7280",
  surfaceAlt: "#f8fafc",
  danger: "#ef4444",
};

export const CARD_BG =
  "linear-gradient(135deg, rgba(240,253,250,0.98) 0%, rgba(255,250,245,0.96) 100%)";

export const baseCenter = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const titleStyle = {
  fontWeight: 900,
  fontSize: 18,
  color: THEME.text,
  lineHeight: 1.25,
};

export const priceStyle = {
  fontWeight: 900,
  fontSize: 21,
  color: THEME.accent,
  whiteSpace: "nowrap",
};
