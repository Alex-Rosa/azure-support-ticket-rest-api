import { describe, expect, it } from "vitest";
import {
  buildCreateTicketBody,
  buildUpdateTicketBody,
  createTicketSchema,
  updateTicketSchema,
  type CreateTicketInput,
} from "@/lib/azure-support";

const valid: CreateTicketInput = {
  title: "VM won't start",
  description: "Started failing after resize.",
  serviceId: "/providers/Microsoft.Support/services/vm_guid",
  problemClassificationId: "/providers/Microsoft.Support/services/vm_guid/problemClassifications/pc_guid",
  severity: "moderate",
  advancedDiagnosticConsent: "Yes",
  contactDetails: {
    firstName: "Ada",
    lastName: "Lovelace",
    preferredContactMethod: "email",
    primaryEmailAddress: "ada@example.com",
    additionalEmailAddresses: [],
    phoneNumber: "",
    preferredTimeZone: "Pacific Standard Time",
    country: "usa",
    preferredSupportLanguage: "en-us",
  },
};

describe("createTicketSchema", () => {
  it("accepts a minimal valid ticket", () => {
    expect(createTicketSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a phone number for critical severity", () => {
    const result = createTicketSchema.safeParse({ ...valid, severity: "critical" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["contactDetails", "phoneNumber"]);
  });

  it("requires a phone number for phone contact", () => {
    const input = { ...valid, contactDetails: { ...valid.contactDetails, preferredContactMethod: "phone" as const } };
    expect(createTicketSchema.safeParse(input).success).toBe(false);
  });

  it("rejects IDs that aren't Support service / problem classification IDs", () => {
    expect(createTicketSchema.safeParse({ ...valid, serviceId: "vm_guid" }).success).toBe(false);
    expect(createTicketSchema.safeParse({ ...valid, problemClassificationId: "pc_guid" }).success).toBe(false);
  });

  it("rejects 2-letter country codes", () => {
    const input = { ...valid, contactDetails: { ...valid.contactDetails, country: "US" } };
    expect(createTicketSchema.safeParse(input).success).toBe(false);
  });
});

describe("buildCreateTicketBody", () => {
  it("wraps in properties, drops empty optionals and uppercases country", () => {
    const body = buildCreateTicketBody(createTicketSchema.parse(valid));
    expect(body.properties.contactDetails).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      preferredContactMethod: "email",
      primaryEmailAddress: "ada@example.com",
      preferredTimeZone: "Pacific Standard Time",
      country: "USA",
      preferredSupportLanguage: "en-us",
    });
    expect(body.properties).not.toHaveProperty("technicalTicketDetails");
    expect(body.properties).not.toHaveProperty("resourceId");
  });

  it("moves resourceId into technicalTicketDetails", () => {
    const resourceId = "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/vm1";
    const body = buildCreateTicketBody(createTicketSchema.parse({ ...valid, resourceId }));
    expect(body.properties.technicalTicketDetails).toEqual({ resourceId });
  });
});

describe("update", () => {
  it("rejects an empty update", () => {
    expect(updateTicketSchema.safeParse({}).success).toBe(false);
  });

  it("builds a minimal PATCH body", () => {
    expect(buildUpdateTicketBody(updateTicketSchema.parse({ status: "closed" }))).toEqual({ status: "closed" });
    expect(
      buildUpdateTicketBody(updateTicketSchema.parse({ contactDetails: { phoneNumber: "123", additionalEmailAddresses: [] } })),
    ).toEqual({ contactDetails: { phoneNumber: "123" } });
  });
});
