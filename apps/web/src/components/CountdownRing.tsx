import { useEffect, useState } from "react";

/** Generalized version of the self-correcting deadline ring used for the
 * poker action clock in TablePage.tsx (kept private there — this is a
 * separate component for the blind-level timer, which runs minutes not
 * single-digit seconds and needs its own colour-band thresholds). */

function formatRemaining(totalSeconds: number, mode: "seconds" | "clock"): string {
  if (mode === "seconds") return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function CountdownRing({
  deadlineMs,
  totalMs,
  size = 22,
  formatMode = "seconds",
}: {
  deadlineMs: number;
  totalMs: number;
  size?: number;
  formatMode?: "seconds" | "clock";
}) {
  const [remaining, setRemaining] = useState(Math.max(0, deadlineMs - Date.now()));
  useEffect(() => {
    const interval = setInterval(() => setRemaining(Math.max(0, deadlineMs - Date.now())), 200);
    return () => clearInterval(interval);
  }, [deadlineMs]);

  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0;
  const totalSeconds = Math.ceil(remaining / 1000);
  const strokeWidth = Math.max(2.5, size / 28);
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const urgent = fraction <= 0.15;
  const low = fraction <= 0.4;
  const colour = urgent ? "#FF2D40" : low ? "#D8B05A" : "#8B93A1";
  const label = formatRemaining(totalSeconds, formatMode);
  const fontSize = Math.round(size / 5);

  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`${label} remaining`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#343B44" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          strokeLinecap="round"
        />
      </svg>
      <span
        className={`tnum absolute font-display ${urgent ? "text-ember" : "text-text"}`}
        style={{ fontSize }}
      >
        {label}
      </span>
    </span>
  );
}
