"use client";
// App-wide state: the server session (auth mode, live mode) and the selected
// scope (a subscription ID or "tenant"), remembered in localStorage.
import * as React from "react";
import { api, type Session } from "@/lib/client/api";
import type { Subscription } from "@/lib/azure-support/types";

interface AppContextValue {
  session: Session | null;
  sessionError: string | null;
  subscriptions: Subscription[];
  subscriptionsError: string | null;
  scope: string | null;
  setScope: (scope: string) => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);
const SCOPE_KEY = "asm.scope";

function readStoredScope(): string | null {
  try {
    return localStorage.getItem(SCOPE_KEY);
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [sessionError, setSessionError] = React.useState<string | null>(null);
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [subscriptionsError, setSubscriptionsError] = React.useState<string | null>(null);
  const [scope, setScopeState] = React.useState<string | null>(null);

  React.useEffect(() => {
    api<Session>("/api/session").then(setSession, (e) => setSessionError((e as Error).message));
  }, []);

  React.useEffect(() => {
    if (!session || session.signInRequired) return;
    api<Subscription[]>("/api/subscriptions").then(
      (subs) => {
        setSubscriptions(subs);
        const stored = readStoredScope();
        const valid = stored === "tenant" || subs.some((s) => s.subscriptionId === stored);
        setScopeState(valid ? stored : (subs[0]?.subscriptionId ?? "tenant"));
      },
      (e) => {
        setSubscriptionsError((e as Error).message);
        setScopeState("tenant");
      },
    );
  }, [session]);

  const setScope = React.useCallback((value: string) => {
    setScopeState(value);
    try {
      localStorage.setItem(SCOPE_KEY, value);
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  }, []);

  const value = React.useMemo(
    () => ({ session, sessionError, subscriptions, subscriptionsError, scope, setScope }),
    [session, sessionError, subscriptions, subscriptionsError, scope, setScope],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>.");
  return ctx;
}

export function scopeLabel(scope: string | null, subscriptions: Subscription[]) {
  if (!scope) return "…";
  if (scope === "tenant") return "Tenant (no subscription)";
  return subscriptions.find((s) => s.subscriptionId === scope)?.displayName ?? scope;
}
