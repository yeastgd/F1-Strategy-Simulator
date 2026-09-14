// Small shared UI atoms: loading/error boxes and a confidence badge.
import type { Confidence } from "@/lib/api";
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
    <span className={`${styles.badge} ${styles[confidence]}`} title={CONF_LABEL[confidence]}>
      {confidence}
    </span>
  );
}
