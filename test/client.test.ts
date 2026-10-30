import { describe, expect, it } from "vitest";
import { ArmClient, ArmError, FORBIDDEN_RETRY_DELAYS_MS, SupportClient, parseScope } from "@/lib/azure-support";
import { SUB, mockArm, sampleTicket } from "./mock-arm";

const sub = parseScope(SUB);
const tenant = parseScope("tenant");

describe("ArmClient", () => {
  it("sends the bearer token and api-version", async () => {
    const arm = mockArm({ body: { value: [] } });
    await new ArmClient(arm.options).get("/providers/Microsoft.Support/services");
    expect(arm.requests[0].url).toBe(
      "https://management.azure.com/providers/Microsoft.Support/services?api-version=2024-04-01",
    );
    expect(arm.requests[0].headers.Authorization).toBe("Bearer test-token");
  });

  it("maps ARM error bodies to ArmError", async () => {
    const arm = mockArm({
      status: 400,
      body: { error: { code: "InvalidParameter", message: "The severity value is invalid" } },
    });
    const err = await new ArmClient(arm.options).get("/x").catch((e) => e);
    expect(err).toBeInstanceOf(ArmError);
    expect(err).toMatchObject({ status: 400, code: "InvalidParameter", message: "The severity value is invalid" });
  });

  it("retries a read through Azure's intermittent 403", async () => {
    const forbidden = { status: 403, body: { error: { code: "Forbidden", message: "no" } } };
    const arm = mockArm(forbidden, forbidden, { body: { value: [] } });
    await expect(new ArmClient(arm.options).get("/x")).resolves.toEqual({ value: [] });
    expect(arm.requests).toHaveLength(3);
  });

  it("gives up after the retries and reports the 403", async () => {
    const forbidden = { status: 403, body: { error: { code: "Forbidden", message: "no" } } };
    const arm = mockArm(...Array(FORBIDDEN_RETRY_DELAYS_MS.length + 1).fill(forbidden));
    await expect(new ArmClient(arm.options).get("/x")).rejects.toMatchObject({ status: 403 });
    expect(arm.requests).toHaveLength(FORBIDDEN_RETRY_DELAYS_MS.length + 1);
  });

  it("never retries writes on 403", async () => {
    const arm = mockArm({ status: 403, body: { error: { code: "Forbidden", message: "no" } } });
    await expect(new ArmClient(arm.options).request("PUT", "/t", { body: {} })).rejects.toMatchObject({ status: 403 });
    expect(arm.requests).toHaveLength(1);
  });

  it("does not retry other errors", async () => {
    const arm = mockArm({ status: 404, body: { error: { code: "ResourceNotFound", message: "x" } } });
    await expect(new ArmClient(arm.options).get("/x")).rejects.toMatchObject({ status: 404 });
    expect(arm.requests).toHaveLength(1);
  });

  it("refuses nextLinks that don't point at ARM", async () => {
    const arm = mockArm();
    await expect(new ArmClient(arm.options).getNextPage("https://evil.example.com/steal")).rejects.toMatchObject({
      code: "InvalidNextLink",
    });
    expect(arm.requests).toHaveLength(0);
  });

  it("polls Azure-AsyncOperation until Succeeded, then GETs the resource", async () => {
    const op = "https://management.azure.com/operations/op1";
    const arm = mockArm(
      { status: 202, headers: { "Azure-AsyncOperation": op, "Retry-After": "0" } },
      { body: { status: "InProgress" } },
      { body: { status: "Succeeded" } },
      { body: sampleTicket },
    );
    const result = await new ArmClient(arm.options).request("PUT", "/providers/Microsoft.Support/supportTickets/t1", {
      body: { properties: {} },
    });
    expect(result).toEqual(sampleTicket);
    expect(arm.requests.map((r) => `${r.method} ${r.url.split("?")[0]}`)).toEqual([
      "PUT https://management.azure.com/providers/Microsoft.Support/supportTickets/t1",
      `GET ${op}`,
      `GET ${op}`,
      "GET https://management.azure.com/providers/Microsoft.Support/supportTickets/t1",
    ]);
  });

  it("surfaces a failed long-running operation", async () => {
    const arm = mockArm(
      { status: 202, headers: { "Azure-AsyncOperation": "https://management.azure.com/op" } },
      { body: { status: "Failed", error: { code: "SupportPlanMissing", message: "No support plan" } } },
    );
    await expect(new ArmClient(arm.options).request("PUT", "/t", { body: {} })).rejects.toMatchObject({
      code: "SupportPlanMissing",
    });
  });
});

describe("SupportClient", () => {
  it("lists tickets at subscription scope with $top and $filter", async () => {
    const arm = mockArm({ body: { value: [sampleTicket], nextLink: "https://management.azure.com/next" } });
    const page = await new SupportClient(arm.options).listTickets(sub, { status: "Open" }, 25);
    const url = new URL(arm.requests[0].url);
    expect(url.pathname).toBe(`/subscriptions/${SUB}/providers/Microsoft.Support/supportTickets`);
    expect(url.searchParams.get("$top")).toBe("25");
    expect(url.searchParams.get("$filter")).toBe("status eq 'Open'");
    expect(page.nextLink).toBe("https://management.azure.com/next");
  });

  it("uses the NoSubscription path at tenant scope", async () => {
    const arm = mockArm({ body: { value: [] } });
    await new SupportClient(arm.options).listTickets(tenant);
    expect(new URL(arm.requests[0].url).pathname).toBe("/providers/Microsoft.Support/supportTickets");
  });

  it("plans a create without calling Azure", () => {
    const arm = mockArm();
    const plan = new SupportClient(arm.options).planCreateTicket(sub, "ticket-1", { properties: {} as never });
    expect(plan.method).toBe("PUT");
    expect(plan.url).toBe(
      `https://management.azure.com/subscriptions/${SUB}/providers/Microsoft.Support/supportTickets/ticket-1?api-version=2024-04-01`,
    );
    expect(arm.requests).toHaveLength(0);
  });

  it("checks ticket name availability with the right resource type", async () => {
    const arm = mockArm({ body: { nameAvailable: true } });
    await new SupportClient(arm.options).checkTicketName(tenant, "ticket-1");
    expect(arm.requests[0]).toMatchObject({
      method: "POST",
      body: { name: "ticket-1", type: "Microsoft.Support/supportTickets" },
    });
  });

  it("follows nextLink for communications", async () => {
    const msg = (n: string) => ({ id: n, name: n, type: "Microsoft.Support/communications", properties: { subject: n, body: n } });
    const arm = mockArm(
      { body: { value: [msg("a")], nextLink: "https://management.azure.com/page2" } },
      { body: { value: [msg("b")] } },
    );
    const items = await new SupportClient(arm.options).listCommunications(sub, "testticket");
    expect(items.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("calls classifyProblems on the preview API version", async () => {
    const arm = mockArm({ body: { problemClassificationResults: [{ problemClassificationId: "pc1" }] } });
    const results = await new SupportClient(arm.options).classifyProblems(SUB, "svc1", { issueSummary: "VM down" });
    expect(arm.requests[0].url).toBe(
      `https://management.azure.com/subscriptions/${SUB}/providers/Microsoft.Support/services/svc1/classifyProblems?api-version=2025-06-01-preview`,
    );
    expect(results).toEqual([{ problemClassificationId: "pc1" }]);
  });
});
