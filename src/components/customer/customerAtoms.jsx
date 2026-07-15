import { THEME, baseCenter } from "./customerConstants.js";

export function PaymentChoiceButton({ label, active, onClick, theme = "dark" }) {
  const styles = {
    dark: {
      background: active ? THEME.accent : "white",
      color: active ? "white" : THEME.accentDeep,
      border: `1px solid ${active ? THEME.accent : THEME.border}`,
      boxShadow: active ? "0 12px 24px rgba(15,118,110,0.18)" : "none",
    },
    bit: {
      background: active ? "#4338ca" : "#eef2ff",
      color: active ? "white" : "#312e81",
      border: "1px solid #c7d2fe",
      boxShadow: active ? "0 12px 24px rgba(67,56,202,0.20)" : "none",
    },
    paybox: {
      background: active ? "#ea580c" : "#fff7ed",
      color: active ? "white" : "#9a3412",
      border: "1px solid #fed7aa",
      boxShadow: active ? "0 12px 24px rgba(234,88,12,0.20)" : "none",
    },
  };

  return (
    <button
      onClick={onClick}
      style={{
        padding: "13px 14px",
        borderRadius: 18,
        cursor: "pointer",
        fontWeight: 800,
        fontSize: 15,
        transition: "all 0.2s ease",
        ...styles[theme],
        border: active ? "2px solid #dc2626" : styles[theme].border,
      }}
    >
      {label}
    </button>
  );
}

export function QtyButton({ children, onClick, filled = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 48,
        height: 44,
        borderRadius: 14,
        border: filled ? "none" : `1px solid ${THEME.border}`,
        background: filled
          ? `linear-gradient(135deg, ${THEME.accent} 0%, ${THEME.warm} 100%)`
          : "white",
        color: filled ? "white" : THEME.accentDeep,
        cursor: "pointer",
        fontSize: 24,
        fontWeight: 700,
        boxShadow: filled ? "0 10px 24px rgba(15,118,110,0.20)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function ImageChoiceChip({
  label,
  imageSrc,
  active,
  onClick,
  width = 72,
  imageSize = 58,
  activeColor = THEME.accent,
  activeText = THEME.accentDeep,
  fullWidth = false,
}) {
  const isBlueActive = activeColor === "#2563eb";
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? `2px solid ${activeColor}` : `1px solid ${THEME.borderSoft}`,
        background: active ? (isBlueActive ? "#eff6ff" : "#f0fdfa") : "#fff",
        padding: 6,
        cursor: "pointer",
        display: "grid",
        gap: 6,
        justifyItems: "center",
        width: fullWidth ? "min(100%, 84px)" : width,
        flex: `0 0 ${width}px`,
        justifySelf: fullWidth ? "center" : "stretch",
        borderRadius: 16,
        boxShadow: active
          ? isBlueActive
            ? "0 10px 22px rgba(37,99,235,0.18)"
            : "0 10px 22px rgba(15,118,110,0.18)"
          : "0 6px 16px rgba(15,23,42,0.06)",
      }}
    >
      <div
        style={{
          width: imageSize,
          height: imageSize,
          borderRadius: 14,
          overflow: "hidden",
          background: "#fff",
          position: "relative",
          ...baseCenter,
        }}
      >
        <img
          src={imageSrc}
          alt={label}
          style={{
            maxWidth: "84%",
            maxHeight: "84%",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: active ? activeText : THEME.textSoft,
          lineHeight: 1.2,
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </button>
  );
}

export function ToppingChip(props) {
  return (
    <ImageChoiceChip
      {...props}
      width={68}
      imageSize={54}
      activeColor="#2563eb"
      activeText="#1e3a8a"
    />
  );
}

export function DrinkChip(props) {
  const { label, imageSrc, active, onClick } = props;

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        minHeight: 56,
        borderRadius: 14,
        border: active ? `1.5px solid ${THEME.accent}` : `1px solid ${THEME.borderSoft}`,
        background: active ? "#f0fdfa" : "#fff",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "40px minmax(0, 1fr) 18px",
        alignItems: "center",
        gap: 10,
        padding: "7px 10px",
        boxShadow: active
          ? "0 8px 18px rgba(15,118,110,0.16)"
          : "0 5px 12px rgba(15,23,42,0.05)",
        textAlign: "right",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          background: "#fff",
          ...baseCenter,
        }}
      >
        <img
          src={imageSrc}
          alt={label}
          style={{
            maxWidth: "78%",
            maxHeight: "78%",
            objectFit: "contain",
            display: "block",
          }}
        />
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: active ? THEME.accentDeep : THEME.textSoft,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>

      <div
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: active ? `5px solid ${THEME.accent}` : "2px solid #cbd5e1",
          background: active ? "#d1fae5" : "transparent",
          justifySelf: "center",
          boxSizing: "border-box",
        }}
      />
    </button>
  );
}
