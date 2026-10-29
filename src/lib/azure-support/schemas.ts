// Input validation for the app's write operations, and builders that turn
// validated input into the exact request bodies the Support API expects.
import { z } from "zod";
import type { CreateSupportTicketBody, UpdateSupportTicketBody } from "./types";

export const severitySchema = z.enum(["minimal", "moderate", "critical", "highestcriticalimpact"]);
export const consentSchema = z.enum(["Yes", "No"]);

export const contactSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  preferredContactMethod: z.enum(["email", "phone"]),
  primaryEmailAddress: z.email(),
  additionalEmailAddresses: z.array(z.email()).optional(),
  phoneNumber: z.string().trim().optional(),
  preferredTimeZone: z.string().trim().min(1),
  country: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use the ISO 3166-1 alpha-3 code, e.g. USA"),
  preferredSupportLanguage: z.string().trim().min(2),
});

const phoneRequired = (contact: { preferredContactMethod: string; phoneNumber?: string }, severity?: string) =>
  contact.preferredContactMethod === "phone" || severity === "critical" || severity === "highestcriticalimpact"
    ? Boolean(contact.phoneNumber)
    : true;

export const createTicketSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
    serviceId: z.string().startsWith("/providers/Microsoft.Support/services/"),
    problemClassificationId: z.string().includes("/problemClassifications/"),
    severity: severitySchema,
    advancedDiagnosticConsent: consentSchema,
    require24X7Response: z.boolean().optional(),
    problemStartTime: z.iso.datetime({ offset: true }).optional(),
    resourceId: z.string().startsWith("/subscriptions/").optional(),
    contactDetails: contactSchema,
  })
  .refine((v) => phoneRequired(v.contactDetails, v.severity), {
    message: "A phone number is required for phone contact or critical / highest critical impact severity.",
    path: ["contactDetails", "phoneNumber"],
  });
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateTicketSchema = z
  .object({
    severity: severitySchema.optional(),
    status: z.enum(["open", "closed"]).optional(),
    advancedDiagnosticConsent: consentSchema.optional(),
    contactDetails: contactSchema.partial().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createCommunicationSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1),
  sender: z.email().optional(),
});
export type CreateCommunicationInput = z.infer<typeof createCommunicationSchema>;

/** Removes empty optional strings/arrays so they aren't sent to the API. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)),
  ) as T;
}

export function buildCreateTicketBody(input: CreateTicketInput): CreateSupportTicketBody {
  const { resourceId, contactDetails, ...rest } = input;
  return {
    properties: compact({
      ...rest,
      contactDetails: compact({ ...contactDetails, country: contactDetails.country.toUpperCase() }),
      technicalTicketDetails: resourceId ? { resourceId } : undefined,
    }),
  };
}

export function buildUpdateTicketBody(input: UpdateTicketInput): UpdateSupportTicketBody {
  return compact({
    ...input,
    contactDetails: input.contactDetails ? compact(input.contactDetails) : undefined,
  });
}

/** Resource names for new tickets/communications: unique and URL-safe. */
export function newResourceName(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
