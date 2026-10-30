"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/native-select";
import { useApp } from "@/components/app-context";
import { cn } from "@/lib/utils";

const AUTH_LABELS = { cli: "Azure CLI", "service-principal": "Service principal", user: "Signed-in user" } as const;

export function AppHeader() {
  const { session, subscriptions, scope, setScope } = useApp();
  const pathname = usePathname();

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <LifeBuoy className="size-5" />
          Azure Support Tickets
        </Link>
        <nav className="flex gap-1 text-sm">
          <NavLink href="/" active={pathname === "/" || pathname.startsWith("/tickets/") && pathname !== "/tickets/new"}>
            Tickets
          </NavLink>
          <NavLink href="/tickets/new" active={pathname === "/tickets/new"}>
            New ticket
          </NavLink>
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Scope
            <NativeSelect
              aria-label="Scope"
              className="w-64"
              value={scope ?? ""}
              disabled={!scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {!scope && <option value="">Loading…</option>}
              {subscriptions.map((s) => (
                <option key={s.subscriptionId} value={s.subscriptionId}>
                  {s.displayName}
                </option>
              ))}
              <option value="tenant">Tenant (no subscription)</option>
            </NativeSelect>
          </label>
          {session && (
            <>
              <Badge variant="outline" title={session.authWarning}>
                {AUTH_LABELS[session.authMode]}
                {session.user ? `: ${session.user.username}` : ""}
              </Badge>
              {session.liveMode ? (
                <Badge variant="destructive" title="Writes are sent to Azure after confirmation">
                  LIVE
                </Badge>
              ) : (
                <Badge variant="secondary" title="Writes are never sent; you see the request instead">
                  DRY RUN
                </Badge>
              )}
              {session.user && (
                <Button variant="ghost" size="sm" onClick={signOut}>
                  Sign out
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 transition-colors hover:bg-muted",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}
