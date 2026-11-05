import { THEME } from "./customerConstants.js";

function pad2(value) {
  return String(value).padStart(2, "0");
}

// בונה את רשימת השעות התקינות בין minTime ל-maxTime בקפיצות של stepMinutes.
function buildTimeSlots(minTime, maxTime, stepMinutes) {
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const start = toMinutes(minTime);
  const end = toMinutes(maxTime);
  const slots = [];
  for (let m = start; m <= end; m += stepMinutes) {
    slots.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return slots;
}

const selectStyle = {
  padding: "10px 10px",
  borderRadius: 12,
  border: `1.5px solid ${THEME.border}`,
  background: "white",
  color: THEME.accentDeep,
  fontWeight: 900,
  fontSize: 18,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "center",
};

// בורר שעה פשוט: שתי רשימות נפתחות - שעות ודקות - מוגבל לטווח שנתון.
// direction: "ltr" קבוע כדי שהשעות יופיעו לפני הדקות (18:30 ולא 30:18)
// גם כשהעמוד כולו RTL.
export function TimeWheelPicker({
  value,
  onChange,
  minTime = "18:30",
  maxTime = "23:00",
  stepMinutes = 15,
}) {
  const slots = buildTimeSlots(minTime, maxTime, stepMinutes);
  const current = value && slots.includes(value) ? value : slots[0];
  const [hour, minute] = current.split(":");

  const hours = [...new Set(slots.map((slot) => slot.split(":")[0]))];
  const minutesForHour = slots
    .filter((slot) => slot.split(":")[0] === hour)
    .map((slot) => slot.split(":")[1]);

  const handleHourChange = (newHour) => {
    const candidateMinutes = slots
      .filter((slot) => slot.split(":")[0] === newHour)
      .map((slot) => slot.split(":")[1]);
    const nextMinute = candidateMinutes.includes(minute) ? minute : candidateMinutes[0];
    onChange(`${newHour}:${nextMinute}`);
  };

  const handleMinuteChange = (newMinute) => {
    onChange(`${hour}:${newMinute}`);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        justifyContent: "center",
        direction: "ltr",
      }}
    >
      <select
        value={hour}
        onChange={(e) => handleHourChange(e.target.value)}
        style={selectStyle}
        aria-label="שעה"
      >
        {hours.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>

      <span style={{ fontSize: 18, fontWeight: 900, color: THEME.textMuted }}>:</span>

      <select
        value={minute}
        onChange={(e) => handleMinuteChange(e.target.value)}
        style={selectStyle}
        aria-label="דקות"
      >
        {minutesForHour.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
