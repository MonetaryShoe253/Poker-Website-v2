import { useState } from "react";
import { api, btn, btnPrimary, inputCls } from "../../lib/adminShared";

interface CreateResponse {
  ok: true;
  id: string;
  sessionCount: number;
}

function timeToMinutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function CreateSeriesForm({
  onCreated,
  onCancel,
}: {
  onCreated: (seriesId: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("17:00");
  const [durationHours, setDurationHours] = useState("4");
  const [durationMinutes, setDurationMinutes] = useState("20");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim().length > 0 && startDate && endDate;

  const submit = () => {
    const sessionStartMinutesOfDay = timeToMinutesOfDay(startTime);
    const sessionDurationMinutes = Number(durationHours) * 60 + Number(durationMinutes);
    if (sessionStartMinutesOfDay === null) {
      setError("Enter a valid start time.");
      return;
    }
    if (!Number.isInteger(sessionDurationMinutes) || sessionDurationMinutes < 1) {
      setError("Enter a valid duration.");
      return;
    }
    setBusy(true);
    setError(null);
    void api<CreateResponse>("/api/admin/tournament-series", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        startDate,
        endDate,
        sessionStartMinutesOfDay,
        sessionDurationMinutes,
      }),
    })
      .then((res) => onCreated(res.id))
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="panel-steel mt-4 rounded-lg p-4">
      <div className="font-display text-xs uppercase tracking-widest text-muted">New tournament series</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <input
          placeholder="Series name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} sm:col-span-2 lg:col-span-3`}
        />
        <label className="text-xs text-muted">
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs text-muted">
          End date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs text-muted">
          Session start time
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs text-muted">
          Duration (hours)
          <input value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs text-muted">
          Duration (minutes)
          <input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        Generates every Tuesday between the two dates, each with this same start time and
        duration, and the fixed blind schedule.
      </p>
      {error && <p className="mt-2 text-sm text-ember">{error}</p>}
      <button className={`${btnPrimary} mt-3`} disabled={!canSubmit || busy} onClick={submit}>
        Create series
      </button>
      <button className={`${btn} ml-2 mt-3`} onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}
