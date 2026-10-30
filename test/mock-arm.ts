// A scripted fetch for ArmClient tests: each call consumes the next response
// and records the request so tests can assert on URL, method and body.
import { vi } from "vitest";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

type Scripted = { status?: number; body?: unknown; headers?: Record<string, string> };

export function mockArm(...responses: Scripted[]) {
  const requests: RecordedRequest[] = [];
  const queue = [...responses];
  const fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    requests.push({
      method: init?.method ?? "GET",
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request: ${init?.method} ${url}`);
    const status = next.status ?? 200;
    const text = next.body === undefined ? "" : JSON.stringify(next.body);
    return new Response(status === 204 ? null : text, { status, headers: next.headers });
  });
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    requests,
    options: {
      getToken: async () => "test-token",
      fetch: fetch as unknown as typeof globalThis.fetch,
      sleep: async () => {},
    },
  };
}

export const SUB = "132d901f-189d-4381-9214-fe68e27e05a1";

export const sampleTicket = {
  id: `/subscriptions/${SUB}/providers/Microsoft.Support/supportTickets/testticket`,
  name: "testticket",
  type: "Microsoft.Support/supportTickets",
  properties: {
    supportTicketId: "118032014183770",
    title: "Test - please ignore",
    description: "This is a test - please ignore",
    serviceId: "/providers/Microsoft.Support/services/vm_service_guid",
    problemClassificationId: "/providers/Microsoft.Support/services/vm_service_guid/problemClassifications/pc_guid",
    severity: "moderate",
    status: "Open",
    advancedDiagnosticConsent: "Yes",
    contactDetails: {
      firstName: "abc",
      lastName: "xyz",
      preferredContactMethod: "email",
      primaryEmailAddress: "test.name@contoso.com",
      preferredTimeZone: "Pacific Standard Time",
      country: "USA",
      preferredSupportLanguage: "en-us",
    },
  },
};
