// Every ticket operation exists twice: under a subscription and at tenant
// level ("No Subscription" operation groups). A Scope picks which one.

export type Scope = { kind: "subscription"; subscriptionId: string } | { kind: "tenant" };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parses the wire form used by the app: "tenant" or a subscription GUID. */
export function parseScope(value: string | null | undefined): Scope {
  if (!value || value === "tenant") return { kind: "tenant" };
  if (!GUID.test(value)) throw new RangeError(`Invalid scope "${value}": expected "tenant" or a subscription ID.`);
  return { kind: "subscription", subscriptionId: value.toLowerCase() };
}

export function formatScope(scope: Scope): string {
  return scope.kind === "tenant" ? "tenant" : scope.subscriptionId;
}

/** ARM path prefix for Microsoft.Support resources in this scope. */
export function supportBasePath(scope: Scope): string {
  return scope.kind === "tenant"
    ? "/providers/Microsoft.Support"
    : `/subscriptions/${scope.subscriptionId}/providers/Microsoft.Support`;
}

export function ticketPath(scope: Scope, ticketName: string): string {
  return `${supportBasePath(scope)}/supportTickets/${encodeURIComponent(ticketName)}`;
}
