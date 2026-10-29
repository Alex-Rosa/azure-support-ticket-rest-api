import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABELS } from "@/lib/client/labels";
import type { SeverityLevel } from "@/lib/azure-support/types";

export function StatusBadge({ status }: { status?: string }) {
  const s = (status ?? "").toLowerCase();
  return (
    <Badge variant={s === "closed" ? "secondary" : s === "open" ? "default" : "outline"}>{status ?? "Unknown"}</Badge>
  );
}

export function SeverityBadge({ severity }: { severity?: SeverityLevel }) {
  if (!severity) return <Badge variant="outline">—</Badge>;
  const urgent = severity === "critical" || severity === "highestcriticalimpact";
  return <Badge variant={urgent ? "destructive" : "outline"}>{SEVERITY_LABELS[severity] ?? severity}</Badge>;
}
