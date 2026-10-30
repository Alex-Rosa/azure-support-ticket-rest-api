// Typed client for the Microsoft.Support operation groups used by the app.
import { ArmClient, type ArmClientOptions } from "./http";
import { chunkRanges, planChunks } from "./files";
import { buildTicketFilter, type TicketFilter } from "./filter";
import { supportBasePath, ticketPath, type Scope } from "./scope";
import type {
  ChatTranscript,
  CheckNameAvailabilityResult,
  Communication,
  CreateSupportTicketBody,
  ListResult,
  ProblemClassification,
  ProblemClassificationResult,
  Service,
  Subscription,
  SupportFile,
  SupportTicket,
  UpdateSupportTicketBody,
} from "./types";

/** classifyProblems only ships in preview API versions. */
export const CLASSIFY_API_VERSION = "2025-06-01-preview";
const SUBSCRIPTIONS_API_VERSION = "2022-12-01";

function filesPath(scope: Scope, workspace: string) {
  return `${supportBasePath(scope)}/fileWorkspaces/${encodeURIComponent(workspace)}/files`;
}

export interface PlannedRequest {
  method: string;
  url: string;
  body?: unknown;
}

export class SupportClient {
  readonly arm: ArmClient;

  constructor(options: ArmClientOptions) {
    this.arm = new ArmClient(options);
  }

  // Subscriptions (Resource Manager) — used for the scope picker.
  async listSubscriptions(): Promise<Subscription[]> {
    const result = await this.arm.get<ListResult<Subscription>>("/subscriptions", {
      apiVersion: SUBSCRIPTIONS_API_VERSION,
    });
    return result.value;
  }

  // Services and Problem Classifications are tenant-level catalogs.
  async listServices(): Promise<Service[]> {
    return (await this.arm.get<ListResult<Service>>("/providers/Microsoft.Support/services")).value;
  }

  async listProblemClassifications(serviceName: string): Promise<ProblemClassification[]> {
    const path = `/providers/Microsoft.Support/services/${encodeURIComponent(serviceName)}/problemClassifications`;
    return (await this.arm.get<ListResult<ProblemClassification>>(path)).value;
  }

  /** Preview: suggests problem classifications for a free-text issue summary. */
  async classifyProblems(
    subscriptionId: string,
    serviceName: string,
    input: { issueSummary: string; resourceId?: string },
  ): Promise<ProblemClassificationResult[]> {
    const path = `/subscriptions/${subscriptionId}/providers/Microsoft.Support/services/${encodeURIComponent(serviceName)}/classifyProblems`;
    const result = await this.arm.request<{ problemClassificationResults?: ProblemClassificationResult[] }>(
      "POST",
      path,
      { apiVersion: CLASSIFY_API_VERSION, body: input },
    );
    return result.problemClassificationResults ?? [];
  }

  // Support Tickets / Support Tickets No Subscription
  listTickets(scope: Scope, filter: TicketFilter = {}, top = 50): Promise<ListResult<SupportTicket>> {
    return this.arm.get(`${supportBasePath(scope)}/supportTickets`, {
      query: { $top: top, $filter: buildTicketFilter(filter) },
    });
  }

  listTicketsNextPage(nextLink: string): Promise<ListResult<SupportTicket>> {
    return this.arm.getNextPage(nextLink);
  }

  getTicket(scope: Scope, name: string): Promise<SupportTicket> {
    return this.arm.get(ticketPath(scope, name));
  }

  checkTicketName(scope: Scope, name: string): Promise<CheckNameAvailabilityResult> {
    return this.arm.request("POST", `${supportBasePath(scope)}/checkNameAvailability`, {
      body: { name, type: "Microsoft.Support/supportTickets" },
    });
  }

  planCreateTicket(scope: Scope, name: string, body: CreateSupportTicketBody): PlannedRequest {
    return { method: "PUT", url: this.arm.url(ticketPath(scope, name)), body };
  }

  createTicket(scope: Scope, name: string, body: CreateSupportTicketBody): Promise<SupportTicket> {
    return this.arm.request("PUT", ticketPath(scope, name), { body });
  }

  planUpdateTicket(scope: Scope, name: string, body: UpdateSupportTicketBody): PlannedRequest {
    return { method: "PATCH", url: this.arm.url(ticketPath(scope, name)), body };
  }

  updateTicket(scope: Scope, name: string, body: UpdateSupportTicketBody): Promise<SupportTicket> {
    return this.arm.request("PATCH", ticketPath(scope, name), { body });
  }

  // Communications / Communications No Subscription
  async listCommunications(scope: Scope, ticketName: string): Promise<Communication[]> {
    const items: Communication[] = [];
    let page = await this.arm.get<ListResult<Communication>>(`${ticketPath(scope, ticketName)}/communications`, {
      query: { $top: 10 },
    });
    items.push(...page.value);
    while (page.nextLink) {
      page = await this.arm.getNextPage<ListResult<Communication>>(page.nextLink);
      items.push(...page.value);
    }
    return items;
  }

  checkCommunicationName(scope: Scope, ticketName: string, name: string): Promise<CheckNameAvailabilityResult> {
    return this.arm.request("POST", `${ticketPath(scope, ticketName)}/checkNameAvailability`, {
      body: { name, type: "Microsoft.Support/communications" },
    });
  }

  planCreateCommunication(
    scope: Scope,
    ticketName: string,
    name: string,
    properties: { subject: string; body: string; sender?: string },
  ): PlannedRequest {
    return {
      method: "PUT",
      url: this.arm.url(`${ticketPath(scope, ticketName)}/communications/${encodeURIComponent(name)}`),
      body: { properties },
    };
  }

  createCommunication(
    scope: Scope,
    ticketName: string,
    name: string,
    properties: { subject: string; body: string; sender?: string },
  ): Promise<Communication> {
    return this.arm.request("PUT", `${ticketPath(scope, ticketName)}/communications/${encodeURIComponent(name)}`, {
      body: { properties },
    });
  }

  // File Workspaces / Files (and their No Subscription variants).
  // An existing ticket's workspace is named after its support ticket number.
  async listFiles(scope: Scope, workspace: string): Promise<SupportFile[]> {
    const items: SupportFile[] = [];
    let page = await this.arm.get<ListResult<SupportFile>>(`${filesPath(scope, workspace)}`);
    items.push(...page.value);
    while (page.nextLink) {
      page = await this.arm.getNextPage<ListResult<SupportFile>>(page.nextLink);
      items.push(...page.value);
    }
    return items;
  }

  /** The requests uploadFile will send; chunk content is summarized, not included. */
  planUploadFile(scope: Scope, workspace: string, fileName: string, fileSize: number): PlannedRequest[] {
    const plan = planChunks(fileSize);
    const filePath = `${filesPath(scope, workspace)}/${encodeURIComponent(fileName)}`;
    return [
      { method: "PUT", url: this.arm.url(filePath), body: { properties: plan } },
      ...chunkRanges(plan).map(([start, end], chunkIndex) => ({
        method: "POST",
        url: this.arm.url(`${filePath}/upload`),
        body: { chunkIndex, content: `<base64 of bytes ${start}–${end - 1} (${end - start} bytes)>` },
      })),
    ];
  }

  /** Creates the file entry, then uploads its chunks in order. */
  async uploadFile(scope: Scope, workspace: string, fileName: string, data: Uint8Array): Promise<SupportFile> {
    const plan = planChunks(data.byteLength);
    const filePath = `${filesPath(scope, workspace)}/${encodeURIComponent(fileName)}`;
    const file = await this.arm.request<SupportFile>("PUT", filePath, { body: { properties: plan } });
    for (const [chunkIndex, [start, end]] of chunkRanges(plan).entries()) {
      await this.arm.request("POST", `${filePath}/upload`, {
        body: { chunkIndex, content: Buffer.from(data.subarray(start, end)).toString("base64") },
      });
    }
    return file;
  }

  // Chat Transcripts / Chat Transcripts No Subscription
  async listChatTranscripts(scope: Scope, ticketName: string): Promise<ChatTranscript[]> {
    const items: ChatTranscript[] = [];
    let page = await this.arm.get<ListResult<ChatTranscript>>(`${ticketPath(scope, ticketName)}/chatTranscripts`);
    items.push(...page.value);
    while (page.nextLink) {
      page = await this.arm.getNextPage<ListResult<ChatTranscript>>(page.nextLink);
      items.push(...page.value);
    }
    return items;
  }
}
