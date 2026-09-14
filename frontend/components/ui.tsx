// Small shared UI atoms: loading/error boxes, confidence badge, compound swatch/select.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Confidence } from "@/lib/api";
import { tyreColor, tyreNeedsOutline } from "@/lib/tyreColors";
import styles from "./ui.module.css";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="status-box status-loading">{label}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="status-box status-error">
      <strong>Something went wrong.</strong> {message}
    </div>
  );
}

const CONF_LABEL: Record<Confidence, string> = {
  low: "low confidence",
  medium: "medium confidence",
  high: "high confidence",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`${styles.tag} ${styles[confidence]}`} title={CONF_LABEL[confidence]}>
      {confidence}
    </span>
  );
}

export function CompoundSwatch({
  compound,
  size = 8,
}: {
  compound: string;
  size?: number;
}) {
  const color = tyreColor(compound);
  return (
    <span
      className={`${styles.tyreDot} ${tyreNeedsOutline(compound) ? styles.tyreDotHard : ""}`}
      style={{ width: size, height: size, background: color }}
      aria-hidden
    />
  );
}

export function CompoundSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (compound: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.compoundSelect} ref={rootRef}>
      <button
        type="button"
        className={styles.compoundBtn}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <CompoundSwatch compound={value} />
        {value}
      </button>
      {open && (
        <ul id={listId} role="listbox" className={styles.compoundMenu}>
          {options.map((c) => (
            <li key={c} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={c === value}
                className={styles.compoundOption}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
              >
                <CompoundSwatch compound={c} />
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompoundStints({ compounds }: { compounds: string[] }) {
  return (
    <span className={styles.stints}>
      {compounds.map((c, i) => (
        <span key={`${c}-${i}`} className={styles.stint}>
          {i > 0 && <span className={styles.stintArrow}>→</span>}
          <CompoundSwatch compound={c} />
          <span>{c}</span>
        </span>
      ))}
    </span>
  );
}
