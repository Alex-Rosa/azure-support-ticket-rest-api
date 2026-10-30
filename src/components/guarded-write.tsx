"use client";
// Every write goes through here. The first call never sets confirm, so the
// server answers with the planned request(s). The user reviews them in a
// dialog and, only in live mode, can send the same request with confirm: true.
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

type Envelope = Record<string, unknown>;

interface Pending {
  url: string;
  method: string;
  envelope: Envelope;
  plans: PlannedRequest[];
  reason: string;
  title: string;
  note?: React.ReactNode;
}

/** JSON normally; multipart when the envelope carries a file. */
export function encodeEnvelope(envelope: Envelope): BodyInit {
  const hasFile = (v: unknown) => v instanceof Blob || (Array.isArray(v) && v.length > 0 && v.every((x) => x instanceof Blob));
  if (!Object.values(envelope).some(hasFile)) return JSON.stringify(envelope);
  const form = new FormData();
  for (const [key, value] of Object.entries(envelope)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.every((v) => v instanceof Blob)) value.forEach((v) => form.append(key, v));
    else if (value instanceof Blob) form.append(key, value);
    else form.append(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  return form;
}

export function useGuardedWrite<T>(onDone: (result: T) => void | Promise<void>) {
  const { session } = useApp();
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = async (title: string, method: string, url: string, envelope: Envelope, note?: React.ReactNode) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<WriteResponse<T>>(url, { method, body: encodeEnvelope(envelope) });
      if (!res.dryRun) {
        await onDone(res.result);
        return;
      }
      // Pin the generated resource name so the confirmed request is the reviewed one.
      const pinned = res.name ? { ...envelope, name: res.name } : envelope;
      const plans = Array.isArray(res.request) ? res.request : [res.request];
      setPending({ url, method, envelope: pinned, plans, reason: res.reason, title, note });
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
        body: encodeEnvelope({ ...pending.envelope, confirm: true }),
      });
      if (res.dryRun) throw new Error(res.reason);
      await onDone(res.result);
      setPending(null);
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
          <div className="max-h-[60vh] min-w-0 space-y-3 overflow-y-auto">
            {pending.plans.map((plan, i) => (
              <div key={i} className="min-w-0 space-y-2">
                <p className="font-mono text-xs break-all">
                  {pending.plans.length > 1 && <span className="text-muted-foreground">{i + 1}. </span>}
                  <span className="font-semibold">{plan.method}</span> {plan.url}
                </p>
                {plan.body !== undefined && (
                  <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs break-all whitespace-pre-wrap">
                    {JSON.stringify(plan.body, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            {pending.note}
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
