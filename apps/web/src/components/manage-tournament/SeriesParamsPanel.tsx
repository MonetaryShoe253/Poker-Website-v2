import { useCallback, useEffect, useState } from "react";
import { api, btn, inputCls } from "../../lib/adminShared";

interface SeriesDetail {
  id: string;
  name: string;
  sessionStartMinutesOfDay: number | null;
  sessionDurationMinutes: number | null;
  expectedPlayerCount: number | null;
}

function minutesOfDayToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutesOfDay(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function SeriesParamsPanel({ seriesId }: { seriesId: string }) {
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [startTime, setStartTime] = useState("17:00");
  const [durationHours, setDurationHours] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("0");
  const [expectedPlayerCount, setExpectedPlayerCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void api<SeriesDetail>(`/api/admin/tournament-series/${seriesId}`).then((d) => {
      setDetail(d);
      if (d.sessionStartMinutesOfDay !== null) setStartTime(minutesOfDayToTime(d.sessionStartMinutesOfDay));
      if (d.sessionDurationMinutes !== null) {
        setDurationHours(String(Math.floor(d.sessionDurationMinutes / 60)));
        setDurationMinutes(String(d.sessionDurationMinutes % 60));
      }
      if (d.expectedPlayerCount !== null) setExpectedPlayerCount(String(d.expectedPlayerCount));
    });
  }, [seriesId]);
  useEffect(load, [load]);

  if (!detail) return null;

  if (detail.sessionStartMinutesOfDay === null) {
    return (
      <div className="panel-steel mt-4 rounded-lg p-4 text-sm text-muted">
        Legacy season — no tournament template. Only series created via "New tournament series"
        have editable start time / duration / expected players.
      </div>
    );
  }

  const save = () => {
    const sessionStartMinutesOfDay = timeToMinutesOfDay(startTime);
    const sessionDurationMinutes = Number(durationHours) * 60 + Number(durationMinutes);
    const expected = Number(expectedPlayerCount);
    if (sessionStartMinutesOfDay === null) return setError("Enter a valid start time.");
    if (!Number.isInteger(sessionDurationMinutes) || sessionDurationMinutes < 1) {
      return setError("Enter a valid duration.");
    }
    if (!Number.isInteger(expected) || expected < 1) return setError("Enter a valid expected player count.");
    void api(`/api/admin/tournament-series/${seriesId}/params`, {
      method: "PUT",
      body: JSON.stringify({
        sessionStartMinutesOfDay,
        sessionDurationMinutes,
        expectedPlayerCount: expected,
      }),
    })
      .then(() => {
        setError(null);
        setSaved(true);
        load();
        setTimeout(() => setSaved(false), 2000);
      })
      .catch((e: Error) => setError(e.message));
  };

  return (
    <div className="panel-steel mt-4 rounded-lg p-4">
      <div className="font-display text-xs uppercase tracking-widest text-muted">
        {detail.name} — series template
      </div>
      <p className="mt-1 text-xs text-muted">
        Applies to every not-yet-opened session in this series immediately on save.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Session start time
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs text-muted">
          Duration (h / m)
          <div className="mt-1 flex gap-1">
            <input value={durationHours} onChange={(e) => setDurationHours(e.target.value)} className={`${inputCls} w-full`} />
            <input value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={`${inputCls} w-full`} />
          </div>
        </label>
        <label className="text-xs text-muted">
          Expected players
          <input
            value={expectedPlayerCount}
            onChange={(e) => setExpectedPlayerCount(e.target.value)}
            className={`${inputCls} mt-1 w-full`}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-ember">{error}</p>}
      {saved && <p className="mt-2 text-sm text-text">Saved.</p>}
      <button className={`${btn} mt-3`} onClick={save}>
        Save series template
      </button>
    </div>
  );
}
