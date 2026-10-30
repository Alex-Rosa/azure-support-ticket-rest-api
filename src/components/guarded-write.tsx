"use client";
// Every write goes through here. The first call never sets confirm, so the
// server answers with the planned request. The user reviews it in a dialog
// and, only in live mode, can send the same request again with confirm: true.
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, describeError, type WriteResponse } from "@/lib/client/api";
import type { PlannedRequest } from "@/lib/azure-support/client";
import { useApp } from "@/components/app-context";

interface Pending {
  url: string;
  method: string;
  envelope: Record<string, unknown>;
  plan: PlannedRequest;
  reason: string;
  title: string;
}

export function useGuardedWrite<T>(onDone: (result: T) => void) {
  const { session } = useApp();
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = async (title: string, method: string, url: string, envelope: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<WriteResponse<T>>(url, { method, body: JSON.stringify(envelope) });
      if (!res.dryRun) {
        onDone(res.result);
        return;
      }
      // Pin the generated resource name so the confirmed request is the reviewed one.
      const pinned = res.name ? { ...envelope, name: res.name } : envelope;
      setPending({ url, method, envelope: pinned, plan: res.request, reason: res.reason, title });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<WriteResponse<T>>(pending.url, {
        method: pending.method,
        body: JSON.stringify({ ...pending.envelope, confirm: true }),
      });
      if (res.dryRun) throw new Error(res.reason);
      setPending(null);
      onDone(res.result);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && !busy && setPending(null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          <DialogDescription>{pending?.reason}</DialogDescription>
        </DialogHeader>
        {pending && (
          <div className="min-w-0 space-y-2">
            <p className="font-mono text-xs break-all">
              <span className="font-semibold">{pending.plan.method}</span> {pending.plan.url}
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs break-all whitespace-pre-wrap">
              {JSON.stringify(pending.plan.body, null, 2)}
            </pre>
          </div>
        )}
        {error && <p className="text-sm whitespace-pre-line text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setPending(null)}>
            {session?.liveMode ? "Cancel" : "Close"}
          </Button>
          {session?.liveMode && (
            <Button variant="destructive" disabled={busy} onClick={confirm}>
              {busy ? "Sending…" : "Send to Azure"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { start, busy, error: pending ? null : error, dialog };
}
