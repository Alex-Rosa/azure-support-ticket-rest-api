// Shapes from the Microsoft.Support REST API, version 2024-04-01.
// https://learn.microsoft.com/rest/api/support/?view=rest-support-2024-04-01

export type SeverityLevel = "minimal" | "moderate" | "critical" | "highestcriticalimpact";
export type Consent = "Yes" | "No";
export type PreferredContactMethod = "email" | "phone";
export type TicketStatusUpdate = "open" | "closed";

export interface ArmResource<P> {
  id: string;
  name: string;
  type: string;
  properties: P;
}

export interface ListResult<T> {
  value: T[];
  nextLink?: string | null;
}

export interface ServiceProperties {
  displayName: string;
  resourceTypes?: string[];
}
export type Service = ArmResource<ServiceProperties>;

export interface SecondaryConsentEnabled {
  description?: string;
  type?: string;
}

export interface ProblemClassificationProperties {
  displayName: string;
  secondaryConsentEnabled?: SecondaryConsentEnabled[];
}
export type ProblemClassification = ArmResource<ProblemClassificationProperties>;

export interface ContactProfile {
  firstName: string;
  lastName: string;
  preferredContactMethod: PreferredContactMethod;
  primaryEmailAddress: string;
  additionalEmailAddresses?: string[];
  phoneNumber?: string;
  /** Windows time zone name, e.g. "Pacific Standard Time". */
  preferredTimeZone: string;
  /** ISO 3166-1 alpha-3 code, e.g. "USA". */
  country: string;
  /** e.g. "en-us". */
  preferredSupportLanguage: string;
}

export interface SecondaryConsent {
  type: string;
  userConsent: Consent;
}

export interface ServiceLevelAgreement {
  startTime?: string;
  expirationTime?: string;
  slaMinutes?: number;
}

export interface SupportTicketProperties {
  supportTicketId?: string;
  title: string;
  description: string;
  problemClassificationId: string;
  problemClassificationDisplayName?: string;
  serviceId: string;
  serviceDisplayName?: string;
  severity: SeverityLevel;
  status?: string;
  contactDetails: ContactProfile;
  advancedDiagnosticConsent: Consent;
  require24X7Response?: boolean;
  problemStartTime?: string;
  technicalTicketDetails?: { resourceId?: string };
  secondaryConsent?: SecondaryConsent[];
  supportEngineer?: { emailAddress?: string | null };
  supportPlanType?: string;
  supportPlanDisplayName?: string;
  serviceLevelAgreement?: ServiceLevelAgreement;
  fileWorkspaceName?: string;
  createdDate?: string;
  modifiedDate?: string;
}
export type SupportTicket = ArmResource<SupportTicketProperties>;

export interface CreateSupportTicketBody {
  properties: Omit<
    SupportTicketProperties,
    | "supportTicketId"
    | "problemClassificationDisplayName"
    | "serviceDisplayName"
    | "status"
    | "supportEngineer"
    | "supportPlanType"
    | "supportPlanDisplayName"
    | "serviceLevelAgreement"
    | "createdDate"
    | "modifiedDate"
  >;
}

export interface UpdateSupportTicketBody {
  severity?: SeverityLevel;
  status?: TicketStatusUpdate;
  advancedDiagnosticConsent?: Consent;
  contactDetails?: Partial<ContactProfile>;
  secondaryConsent?: SecondaryConsent[];
}

export interface CommunicationProperties {
  communicationType?: string;
  communicationDirection?: "inbound" | "outbound";
  sender?: string;
  subject: string;
  body: string;
  createdDate?: string;
}
export type Communication = ArmResource<CommunicationProperties>;

export interface ChatTranscriptMessage {
  contentType?: string;
  communicationDirection?: "inbound" | "outbound";
  sender?: string;
  body?: string;
  createdDate?: string;
}

export interface ChatTranscriptProperties {
  messages?: ChatTranscriptMessage[];
  startTime?: string;
}
export type ChatTranscript = ArmResource<ChatTranscriptProperties>;

export interface CheckNameAvailabilityResult {
  nameAvailable: boolean;
  reason?: string;
  message?: string;
}

/** Preview API (2025-06-01-preview): classifyProblems. */
export interface ProblemClassificationResult {
  problemId?: string;
  title?: string;
  description?: string;
  serviceId?: string;
  problemClassificationId: string;
  relatedService?: { serviceId?: string; displayName?: string; resourceTypes?: string[] };
}

export interface Subscription {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId?: string;
}
