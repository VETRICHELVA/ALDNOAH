import { dateTime, STATUS_LABEL } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

export function AuditList({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) return <p className="text-muted text-[13px]">No review activity yet.</p>;
  return (
    <ol className="space-y-3 text-[13px]">
      {entries.map((e, i) => (
        <li key={i} className="border-l-2 border-border pl-3">
          <div className="text-muted num text-left">{dateTime(e.at)} · {e.user}</div>
          <div>
            {e.action}
            {e.prev_status && e.new_status && (
              <span className="text-muted"> · {STATUS_LABEL[e.prev_status] ?? e.prev_status} → {STATUS_LABEL[e.new_status] ?? e.new_status}</span>
            )}
          </div>
          {e.comment && <div>Reason: {e.comment}</div>}
        </li>
      ))}
    </ol>
  );
}
