import React from "react";
import { logoUrl, screenCardStyle, statusLabel, statusPill } from "./uiHelpersUtils.jsx";
import { ALL_TOPPINGS } from "./customer/customerConstants.js";

const toppingImageMap = Object.fromEntries(ALL_TOPPINGS.map((t) => [t.key, { src: t.imageSrc, label: t.label }]));

export { screenCardStyle, statusLabel, statusPill };

export function ItemModImages({ mods, size = 60 }) {
  if (!Array.isArray(mods) || mods.length === 0) return null;
  const images = mods.map((key) => toppingImageMap[key]).filter(Boolean);
  if (images.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
      {images.map(({ src, label }) => (
        <img key={label} src={src} alt={label} style={{ width: `${size}px`, height: `${size}px`, objectFit: "cover", borderRadius: "10px" }} />
      ))}
    </div>
  );
}

export function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <h2 style={{ margin: 0, fontSize: "30px", color: "#111827" }}>{title}</h2>
      {subtitle && <p style={{ margin: "6px 0 0", color: "#6b7280" }}>{subtitle}</p>}
    </div>
  );
}

export function LogoHeader({ compact = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: compact ? "12px" : "18px" }}>
      <img
        src={logoUrl}
        alt="הבשוניה"
        style={{
          width: compact ? "140px" : "180px",
          borderRadius: "20px",
          boxShadow: "0 10px 24px rgba(15,23,42,0.1)",
          background: "#111827",
        }}
      />
    </div>
  );
}

function OnionSlicesIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="22" cy="24" rx="12" ry="8" fill="none" stroke="#7e22ce" strokeWidth="5" />
      <ellipse cx="22" cy="24" rx="5" ry="3" fill="none" stroke="#c084fc" strokeWidth="3" />
      <ellipse cx="42" cy="38" rx="12" ry="8" fill="none" stroke="#7e22ce" strokeWidth="5" />
      <ellipse cx="42" cy="38" rx="5" ry="3" fill="none" stroke="#c084fc" strokeWidth="3" />
    </svg>
  );
}

function LettuceIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M10 42c3-16 12-24 22-24 7 0 15 4 22 12-2 16-12 24-24 24-8 0-15-3-20-12z"
        fill="#4ade80"
        stroke="#15803d"
        strokeWidth="4"
      />
      <path d="M20 48c10-6 16-14 20-26" stroke="#166534" strokeWidth="3" fill="none" />
    </svg>
  );
}

function TomatoIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="34" r="18" fill="#ef4444" stroke="#b91c1c" strokeWidth="4" />
      <path d="M32 12l4 6 7 1-5 5 1 7-7-4-7 4 1-7-5-5 7-1z" fill="#16a34a" />
    </svg>
  );
}

function IngredientIcon({ kind }) {
  if (kind === "onion") return <OnionSlicesIcon />;
  if (kind === "lettuce") return <LettuceIcon />;
  if (kind === "tomato") return <TomatoIcon />;
  return null;
}

export function IngredientToggle({ kind, active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: "84px",
        height: "84px",
        borderRadius: "18px",
        border: active ? "2px solid #ef4444" : "1px solid #d1d5db",
        background: active ? "#fff1f2" : "white",
        position: "relative",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 10px rgba(15,23,42,0.05)",
      }}
    >
      <IngredientIcon kind={kind} />
      {active && (
        <span
          style={{
            position: "absolute",
            inset: "10px",
            borderRadius: "999px",
            border: "3px solid #ef4444",
          }}
        />
      )}
    </button>
  );
}

export function MenuVisual({ parts = [], size = "normal" }) {
  const height = size === "small" ? "60px" : "128px";
  const borderRadius = size === "small" ? "0" : "16px";
  return (
    <div
      style={{
        height,
        borderRadius,
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        padding: size === "small" ? "4px" : "8px",
        overflow: "hidden",
      }}
    >
      {parts.map((part, index) =>
        part.type === "plus" ? (
          <div
            key={`plus-${index}`}
            style={{
              fontSize: "26px",
              fontWeight: 900,
              color: "#f59e0b",
              flexShrink: 0,
            }}
          >
            +
          </div>
        ) : (
          <img
            key={`${part.src}-${index}`}
            src={part.src}
            alt={part.alt}
            style={{
              width: parts.length === 1 ? "100%" : "30%",
              height: "100%",
              objectFit: "cover",
              borderRadius: "12px",
              flexShrink: 0,
            }}
          />
        )
      )}
    </div>
  );
}
