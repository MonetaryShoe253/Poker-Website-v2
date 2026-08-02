import { useCallback, useEffect, useState } from "react";
import { api, btn, inputCls } from "../../lib/adminShared";

interface Formula {
  A: number;
  B: number;
  ITM_PERCENT: number;
  BOUNTY_VALUE: number;
}

export function TournamentFormulaPanel() {
  const [detail, setDetail] = useState<Formula | null>(null);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [itmPercent, setItmPercent] = useState("");
  const [bountyValue, setBountyValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    void api<Formula>("/api/admin/formula").then((d) => {
      setDetail(d);
      setA(String(d.A));
      setB(String(d.B));
      setItmPercent(String(d.ITM_PERCENT));
      setBountyValue(String(d.BOUNTY_VALUE));
    });
  }, []);
  useEffect(load, [load]);

  if (!detail) return null;

  const save = () => {
    const A = Number(a);
    const B = Number(b);
    const ITM_PERCENT = Number(itmPercent);
    const BOUNTY_VALUE = Number(bountyValue);
    if ([A, B, ITM_PERCENT, BOUNTY_VALUE].some((n) => !Number.isFinite(n))) {
      return setError("Enter valid numbers for every field.");
    }
    void api("/api/admin/formula", {
      method: "PUT",
      body: JSON.stringify({ A, B, ITM_PERCENT, BOUNTY_VALUE }),
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
        Tournament parameters
      </div>
      <p className="mt-2 text-xs text-muted">
        The points formula and the value of a bounty — applies to every session going forward.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <label className="text-xs text-muted">
          A
          <input value={a} onChange={(e) => setA(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs text-muted">
          B
          <input value={b} onChange={(e) => setB(e.target.value)} className={`${inputCls} mt-1 w-full`} />
        </label>
        <label className="text-xs text-muted">
          ITM %
          <input
            value={itmPercent}
            onChange={(e) => setItmPercent(e.target.value)}
            className={`${inputCls} mt-1 w-full`}
          />
        </label>
        <label className="text-xs text-muted">
          Bounty value
          <input
            value={bountyValue}
            onChange={(e) => setBountyValue(e.target.value)}
            className={`${inputCls} mt-1 w-full`}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-ember">{error}</p>}
      {saved && <p className="mt-2 text-sm text-text">Saved.</p>}
      <button className={`${btn} mt-3`} onClick={save}>
        Save parameters
      </button>
    </div>
  );
}
