// Builds the OData $filter for Support Tickets - List.
// The API supports: Status/ServiceId/ProblemClassificationId with 'eq',
// CreatedDate with 'gt'/'ge', combined with 'and'. Severity is not filterable
// server-side, so callers filter it locally.

export interface TicketFilter {
  status?: string;
  createdAfter?: Date | string;
  serviceId?: string;
  problemClassificationId?: string;
}

export function buildTicketFilter(filter: TicketFilter): string | undefined {
  const parts: string[] = [];
  if (filter.createdAfter) {
    const date = filter.createdAfter instanceof Date ? filter.createdAfter : new Date(filter.createdAfter);
    if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid createdAfter date: ${filter.createdAfter}`);
    parts.push(`createdDate ge ${date.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  }
  if (filter.status) parts.push(`status eq ${quote(filter.status)}`);
  if (filter.serviceId) parts.push(`ServiceId eq ${quote(filter.serviceId)}`);
  if (filter.problemClassificationId) parts.push(`ProblemClassificationId eq ${quote(filter.problemClassificationId)}`);
  return parts.length ? parts.join(" and ") : undefined;
}

/** OData string literal: single quotes doubled. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
