import { describe, expect, it } from "vitest";
import { buildTicketFilter, formatScope, parseScope, supportBasePath, ticketPath } from "@/lib/azure-support";
import { SUB } from "./mock-arm";

describe("scope", () => {
  it("treats empty and 'tenant' as tenant scope", () => {
    expect(parseScope(null)).toEqual({ kind: "tenant" });
    expect(parseScope("tenant")).toEqual({ kind: "tenant" });
  });

  it("parses and normalizes a subscription ID", () => {
    expect(parseScope(SUB.toUpperCase())).toEqual({ kind: "subscription", subscriptionId: SUB });
  });

  it("rejects anything else, so it can't be used for path injection", () => {
    expect(() => parseScope("../../providers")).toThrow(RangeError);
    expect(() => parseScope(`${SUB}/resourceGroups/x`)).toThrow(RangeError);
  });

  it("builds subscription and NoSubscription paths", () => {
    expect(supportBasePath({ kind: "tenant" })).toBe("/providers/Microsoft.Support");
    expect(supportBasePath({ kind: "subscription", subscriptionId: SUB })).toBe(
      `/subscriptions/${SUB}/providers/Microsoft.Support`,
    );
    expect(ticketPath({ kind: "tenant" }, "a b/c")).toBe("/providers/Microsoft.Support/supportTickets/a%20b%2Fc");
    expect(formatScope(parseScope(SUB))).toBe(SUB);
  });
});

describe("buildTicketFilter", () => {
  it("returns undefined with no filters", () => {
    expect(buildTicketFilter({})).toBeUndefined();
  });

  it("combines supported filters with 'and' in the documented forms", () => {
    expect(
      buildTicketFilter({
        createdAfter: "2020-03-10T22:08:51.123Z",
        status: "Open",
        serviceId: "vm_windows_service_guid",
        problemClassificationId: "pc_guid",
      }),
    ).toBe(
      "createdDate ge 2020-03-10T22:08:51Z and status eq 'Open' and ServiceId eq 'vm_windows_service_guid' and ProblemClassificationId eq 'pc_guid'",
    );
  });

  it("escapes quotes in OData string literals", () => {
    expect(buildTicketFilter({ status: "O'Brien" })).toBe("status eq 'O''Brien'");
  });

  it("rejects invalid dates", () => {
    expect(() => buildTicketFilter({ createdAfter: "yesterday" })).toThrow(RangeError);
  });
});
