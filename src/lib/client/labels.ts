import type { SeverityLevel } from "@/lib/azure-support/types";

/** Portal-style names for API severity values. */
export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  minimal: "C – Minimal impact",
  moderate: "B – Moderate impact",
  critical: "A – Critical impact",
  highestcriticalimpact: "Emergency – Severe impact",
};

export const SEVERITIES = Object.keys(SEVERITY_LABELS) as SeverityLevel[];

export const TICKET_STATUSES = ["Open", "Updating", "Closed"];

export const SUPPORT_LANGUAGES: Record<string, string> = {
  "en-us": "English",
  "de-de": "German",
  "es-es": "Spanish",
  "fr-fr": "French",
  "it-it": "Italian",
  "ja-jp": "Japanese",
  "ko-kr": "Korean",
  "pt-br": "Portuguese (Brazil)",
  "ru-ru": "Russian",
  "zh-hans": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
};

/** Common Windows time zone names; the field also accepts any other valid name. */
export const COMMON_TIME_ZONES = [
  "Pacific Standard Time",
  "Mountain Standard Time",
  "Central Standard Time",
  "Eastern Standard Time",
  "Atlantic Standard Time",
  "E. South America Standard Time",
  "GMT Standard Time",
  "W. Europe Standard Time",
  "Central European Standard Time",
  "India Standard Time",
  "China Standard Time",
  "Tokyo Standard Time",
  "AUS Eastern Standard Time",
  "UTC",
];

export function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}
