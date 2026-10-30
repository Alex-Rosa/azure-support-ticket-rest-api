"use client";
import * as React from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert, SessionGate } from "@/components/session-gate";
import { scopeLabel, useApp } from "@/components/app-context";
import { SeverityBadge, StatusBadge } from "@/components/tickets/badges";
import { api, describeError, withScope } from "@/lib/client/api";
import { SEVERITIES, SEVERITY_LABELS, TICKET_STATUSES, formatDate } from "@/lib/client/labels";
import type { ListResult, Service, SupportTicket } from "@/lib/azure-support/types";

export function TicketList() {
  return <SessionGate>{(scope) => <TicketListForScope key={scope} scope={scope} />}</SessionGate>;
}

interface Filters {
  status: string;
  createdAfter: string;
  serviceId: string;
  severity: string;
}

/** Default "created after": 90 days ago, as yyyy-mm-dd. */
function defaultSince() {
  return new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
}

function TicketListForScope({ scope }: { scope: string }) {
  const { subscriptions } = useApp();
  const [filters, setFilters] = React.useState<Filters>({
    status: "",
    createdAfter: defaultSince(),
    serviceId: "",
    severity: "",
  });
  const [services, setServices] = React.useState<Service[]>([]);
  const [reloadToken, setReloadToken] = React.useState(0);
  // Result of the last first-page query, tagged with the key it answers, so
  // "loading" is derived instead of set inside the effect.
  const [result, setResult] = React.useState<{
    key: string;
    tickets: SupportTicket[];
    nextLink: string | null;
    error: string | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);

  React.useEffect(() => {
    api<Service[]>("/api/services").then(setServices, () => setServices([]));
  }, []);

  const url = withScope("/api/tickets", scope, {
    status: filters.status,
    createdAfter: filters.createdAfter ? new Date(filters.createdAfter).toISOString() : undefined,
    serviceId: filters.serviceId,
  });
  const key = `${url}#${reloadToken}`;

  React.useEffect(() => {
    let cancelled = false;
    api<ListResult<SupportTicket>>(url).then(
      (page) => !cancelled && setResult({ key, tickets: page.value, nextLink: page.nextLink ?? null, error: null }),
      (e) => !cancelled && setResult({ key, tickets: [], nextLink: null, error: describeError(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  const loading = result?.key !== key || loadingMore;
  const tickets = result?.tickets ?? null;
  const nextLink = result?.nextLink ?? null;
  const error = result?.error ?? null;

  const loadMore = async () => {
    if (!result?.nextLink) return;
    setLoadingMore(true);
    try {
      const page = await api<ListResult<SupportTicket>>(withScope("/api/tickets", scope, { nextLink: result.nextLink }));
      setResult((r) => r && { ...r, tickets: [...r.tickets, ...page.value], nextLink: page.nextLink ?? null });
    } catch (e) {
      setResult((r) => r && { ...r, error: describeError(e) });
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = (tickets ?? []).filter((t) => !filters.severity || t.properties.severity === filters.severity);
  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Support tickets</h1>
          <p className="text-sm text-muted-foreground">{scopeLabel(scope, subscriptions)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setReloadToken((t) => t + 1)} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : undefined} />
            Refresh
          </Button>
          <Button nativeButton={false} render={<Link href="/tickets/new" />}>
            <Plus />
            New ticket
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Status">
          <NativeSelect value={filters.status} onChange={set("status")}>
            <option value="">Any status</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Created on or after">
          <Input type="date" value={filters.createdAfter} onChange={set("createdAfter")} />
        </Field>
        <Field label="Service">
          <NativeSelect value={filters.serviceId} onChange={set("serviceId")}>
            <option value="">Any service</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.properties.displayName}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Severity (this page)">
          <NativeSelect value={filters.severity} onChange={set("severity")}>
            <option value="">Any severity</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {error && <ErrorAlert title="Could not load tickets" message={error} />}

      {tickets === null ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Ticket ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No tickets match these filters."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-80 truncate font-medium">
                    <Link
                      className="hover:underline"
                      href={`/tickets/${encodeURIComponent(t.name)}`}
                      title={t.properties.title}
                    >
                      {t.properties.title}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.properties.supportTicketId ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.properties.status} />
                  </TableCell>
                  <TableCell>
                    <SeverityBadge severity={t.properties.severity} />
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{t.properties.serviceDisplayName}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(t.properties.createdDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {nextLink && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
