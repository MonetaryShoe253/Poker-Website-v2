import { useState } from "react";
import { btn, btnPrimary, inputCls } from "../../lib/adminShared";

/** Two-input confirmation to prevent an accidental destructive delete: the
 * admin must type the exact item name, then the literal word DELETE. */
export function ConfirmDeleteModal({
  title,
  itemLabel,
  warning,
  onConfirm,
  onCancel,
}: {
  title: string;
  itemLabel: string;
  warning?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typedName, setTypedName] = useState("");
  const [typedDelete, setTypedDelete] = useState("");
  const canConfirm = typedName === itemLabel && typedDelete === "DELETE";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div className="panel-steel w-full max-w-md rounded-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-sm uppercase tracking-widest text-ember">{title}</div>
        {warning && <p className="mt-2 text-sm text-muted">{warning}</p>}

        <p className="mt-4 text-xs text-muted">
          Type <span className="font-display text-text">{itemLabel}</span> to confirm:
        </p>
        <input
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          className={`${inputCls} mt-1 w-full`}
          autoFocus
        />

        <p className="mt-3 text-xs text-muted">
          Then type <span className="font-display text-text">DELETE</span>:
        </p>
        <input
          value={typedDelete}
          onChange={(e) => setTypedDelete(e.target.value)}
          className={`${inputCls} mt-1 w-full`}
        />

        <div className="mt-5 flex justify-end gap-2">
          <button className={btn} onClick={onCancel}>
            Cancel
          </button>
          <button className={btnPrimary} disabled={!canConfirm} onClick={onConfirm}>
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
