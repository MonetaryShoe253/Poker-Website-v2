import { useCallback, useEffect, useState } from "react";
import { api, btn, inputCls } from "../../lib/adminShared";

interface SeriesDetail {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  sessionStartMinutesOfDay: number | null;
  sessionDurationMinutes: number | null;
  lateRegWindowMinutes: number | null;
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
  const [nameInput, setNameInput] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [durationHours, setDurationHours] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("0");
  const [lateRegWindowMinutes, setLateRegWindowMinutes] = useState("70");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void api<SeriesDetail>(`/api/admin/tournament-series/${seriesId}`).then((d) => {
      setDetail(d);
      setNameInput(d.name);
      if (d.sessionStartMinutesOfDay !== null) setStartTime(minutesOfDayToTime(d.sessionStartMinutesOfDay));
      if (d.sessionDurationMinutes !== null) {
        setDurationHours(String(Math.floor(d.sessionDurationMinutes / 60)));
        setDurationMinutes(String(d.sessionDurationMinutes % 60));
      }
      if (d.lateRegWindowMinutes !== null) setLateRegWindowMinutes(String(d.lateRegWindowMinutes));
    });
  }, [seriesId]);
  useEffect(load, [load]);

  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  if (!detail) return null;

  const toggleArchive = () => {
    setArchiveBusy(true);
    setArchiveError(null);
    const action = detail.status === "ARCHIVED" ? "unarchive" : "archive";
    void api(`/api/admin/tournament-series/${seriesId}/${action}`, { method: "POST" })
      .then(load)
      .catch((e: Error) => setArchiveError(e.message))
      .finally(() => setArchiveBusy(false));
  };

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length === 0) return setNameError("Enter a series name.");
    setNameBusy(true);
    setNameError(null);
    void api(`/api/admin/tournament-series/${seriesId}/params`, {
      method: "PUT",
      body: JSON.stringify({ name: trimmed }),
    })
      .then(() => {
        setNameSaved(true);
        load();
        setTimeout(() => setNameSaved(false), 2000);
      })
      .catch((e: Error) => setNameError(e.message))
      .finally(() => setNameBusy(false));
  };

  const nameControl = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-muted">
        Series name
        <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} className={`${inputCls} mt-1 w-full`} />
      </label>
      <button className={`${btn} mt-4`} disabled={nameBusy} onClick={saveName}>
        Save name
      </button>
      {nameSaved && <span className="mt-4 text-sm text-text">Saved.</span>}
    </div>
  );

  const archiveControl = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="font-display text-xs uppercase tracking-widest text-muted">
        {detail.name} <span className="text-ember">·</span> {detail.status}
      </div>
      <button className={btn} disabled={archiveBusy} onClick={toggleArchive}>
        {detail.status === "ARCHIVED" ? "Undo: unarchive series" : "Archive series"}
      </button>
    </div>
  );

  if (detail.sessionStartMinutesOfDay === null) {
    return (
      <div className="panel-steel mt-4 rounded-lg p-4 text-sm text-muted">
        {archiveControl}
        {archiveError && <p className="mt-2 text-sm text-ember">{archiveError}</p>}
        <div className="mt-3 border-t border-line pt-3">
          {nameControl}
          {nameError && <p className="mt-2 text-sm text-ember">{nameError}</p>}
        </div>
        <p className="mt-3">
          Legacy season — no tournament template. Only series created via "New tournament series"
          have editable start time / duration.
        </p>
      </div>
    );
  }

  const save = () => {
    const sessionStartMinutesOfDay = timeToMinutesOfDay(startTime);
    const sessionDurationMinutes = Number(durationHours) * 60 + Number(durationMinutes);
    const lateReg = Number(lateRegWindowMinutes);
    if (sessionStartMinutesOfDay === null) return setError("Enter a valid start time.");
    if (!Number.isInteger(sessionDurationMinutes) || sessionDurationMinutes < 1) {
      return setError("Enter a valid duration.");
    }
    if (!Number.isInteger(lateReg) || lateReg < 1) {
      return setError("Enter a valid late registration window.");
    }
    void api(`/api/admin/tournament-series/${seriesId}/params`, {
      method: "PUT",
      body: JSON.stringify({
        sessionStartMinutesOfDay,
        sessionDurationMinutes,
        lateRegWindowMinutes: lateReg,
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
      {archiveControl}
      {archiveError && <p className="mt-2 text-sm text-ember">{archiveError}</p>}
      <div className="mt-3 border-t border-line pt-3">
        {nameControl}
        {nameError && <p className="mt-2 text-sm text-ember">{nameError}</p>}
      </div>
      <p className="mt-3 text-xs text-muted">
        Applies to every not-yet-opened session in this series immediately on save.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
          Late registration window (minutes)
          <input
            value={lateRegWindowMinutes}
            onChange={(e) => setLateRegWindowMinutes(e.target.value)}
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
