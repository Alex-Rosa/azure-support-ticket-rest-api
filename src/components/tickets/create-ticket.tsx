"use client";
// Guided ticket creation: problem → details → contact → review.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert, SessionGate } from "@/components/session-gate";
import { scopeLabel, useApp } from "@/components/app-context";
import { useGuardedWrite } from "@/components/guarded-write";
import { FilePicker, uploadConfirmed } from "@/components/tickets/attachments";
import { Field } from "@/components/tickets/ticket-list";
import { api, describeError, withScope } from "@/lib/client/api";
import { COMMON_TIME_ZONES, SEVERITIES, SEVERITY_LABELS, SUPPORT_LANGUAGES } from "@/lib/client/labels";
import { formatBytes, sanitizeFileName } from "@/lib/azure-support/files";
import { cn } from "@/lib/utils";
import type {
  ContactProfile,
  ProblemClassification,
  ProblemClassificationResult,
  Service,
  SeverityLevel,
  SupportTicket,
} from "@/lib/azure-support/types";

const CONTACT_KEY = "asm.contact";
const STEPS = ["Problem", "Details", "Contact", "Review"] as const;

const emptyContact: ContactProfile = {
  firstName: "",
  lastName: "",
  preferredContactMethod: "email",
  primaryEmailAddress: "",
  additionalEmailAddresses: [],
  phoneNumber: "",
  preferredTimeZone: "Pacific Standard Time",
  country: "USA",
  preferredSupportLanguage: "en-us",
};

function loadContact(): ContactProfile {
  try {
    const raw = localStorage.getItem(CONTACT_KEY);
    return raw ? { ...emptyContact, ...JSON.parse(raw) } : emptyContact;
  } catch {
    return emptyContact;
  }
}

export function CreateTicket() {
  return <SessionGate>{(scope) => <CreateTicketForScope key={scope} scope={scope} />}</SessionGate>;
}

function CreateTicketForScope({ scope }: { scope: string }) {
  const router = useRouter();
  const { session, subscriptions } = useApp();
  const [step, setStep] = React.useState(0);
  const [stepError, setStepError] = React.useState<string | null>(null);

  // Problem
  const [services, setServices] = React.useState<Service[] | null>(null);
  const [servicesError, setServicesError] = React.useState<string | null>(null);
  const [serviceId, setServiceId] = React.useState("");
  const [classifications, setClassifications] = React.useState<ProblemClassification[]>([]);
  const [classificationId, setClassificationId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<ProblemClassificationResult[] | null>(null);
  const [suggesting, setSuggesting] = React.useState(false);
  const [suggestError, setSuggestError] = React.useState<string | null>(null);

  // Details
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState<SeverityLevel>("minimal");
  const [problemStart, setProblemStart] = React.useState("");
  const [resourceId, setResourceId] = React.useState("");
  const [consent, setConsent] = React.useState<"Yes" | "No">("Yes");
  const [require24x7, setRequire24x7] = React.useState(false);
  const [secondaryConsent, setSecondaryConsent] = React.useState<Record<string, boolean>>({});
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [uploadFailure, setUploadFailure] = React.useState<{ ticketName: string; message: string } | null>(null);

  // Contact
  // This component only renders client-side (inside SessionGate), so reading
  // localStorage during the first render is safe.
  const [contact, setContact] = React.useState<ContactProfile>(loadContact);
  const [ccText, setCcText] = React.useState(() => (contact.additionalEmailAddresses ?? []).join(", "));

  React.useEffect(() => {
    api<Service[]>("/api/services").then(setServices, (e) => setServicesError(describeError(e)));
  }, []);

  const service = services?.find((s) => s.id === serviceId);
  const classification = classifications.find((c) => c.id === classificationId);

  React.useEffect(() => {
    if (!service) return;
    let cancelled = false;
    api<ProblemClassification[]>(`/api/services/${encodeURIComponent(service.name)}/problem-classifications`).then(
      (items) => !cancelled && setClassifications(items),
      (e) => !cancelled && setStepError(describeError(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [service]);

  const chooseService = (id: string) => {
    setServiceId(id);
    setClassifications([]);
    setClassificationId("");
    setSuggestions(null);
  };

  const canClassify = session?.classifyEnabled && scope !== "tenant" && service && title.trim().length >= 10;

  const suggest = async () => {
    if (!service) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const results = await api<ProblemClassificationResult[]>("/api/classify", {
        method: "POST",
        body: JSON.stringify({
          subscriptionId: scope,
          serviceName: service.name,
          issueSummary: title,
          resourceId: resourceId || undefined,
        }),
      });
      setSuggestions(results);
    } catch (e) {
      setSuggestError(describeError(e));
    } finally {
      setSuggesting(false);
    }
  };

  const pickSuggestion = (s: ProblemClassificationResult) => {
    // The preview API may return a bare ID or a full resource path.
    const id = s.problemClassificationId.includes("/problemClassifications/")
      ? s.problemClassificationId
      : `${serviceId}/problemClassifications/${s.problemClassificationId}`;
    const match = classifications.find((c) => c.id.toLowerCase() === id.toLowerCase() || c.name === s.problemClassificationId);
    if (match) setClassificationId(match.id);
    else setSuggestError("That suggestion isn't in this service's problem list; pick one manually.");
  };

  const ccList = ccText.split(",").map((s) => s.trim()).filter(Boolean);
  const consentTypes = (classification?.properties.secondaryConsentEnabled ?? []).filter((c) => c.type);

  const input = {
    title: title.trim(),
    description: description.trim(),
    serviceId,
    problemClassificationId: classificationId,
    severity,
    advancedDiagnosticConsent: consent,
    require24X7Response: require24x7 || undefined,
    problemStartTime: problemStart ? new Date(problemStart).toISOString() : undefined,
    resourceId: scope !== "tenant" && resourceId.trim() ? resourceId.trim() : undefined,
    secondaryConsent: consentTypes.length
      ? consentTypes.map((c) => ({ type: c.type!, userConsent: secondaryConsent[c.type!] ? "Yes" : "No" }))
      : undefined,
    contactDetails: {
      ...contact,
      additionalEmailAddresses: ccList,
      phoneNumber: contact.phoneNumber?.trim() || undefined,
    },
  };

  const validate = (s: number): string | null => {
    if (s === 0) {
      if (!title.trim()) return "Enter a short summary of the problem.";
      if (!serviceId) return "Choose the service.";
      if (!classificationId) return "Choose the problem type.";
    }
    if (s === 1) {
      if (!description.trim()) return "Describe the problem.";
      if (resourceId.trim() && !resourceId.trim().startsWith("/subscriptions/"))
        return "Resource ID must be a full ARM ID starting with /subscriptions/.";
    }
    if (s === 2) {
      const c = contact;
      if (!c.firstName.trim() || !c.lastName.trim()) return "Enter first and last name.";
      if (!/^\S+@\S+\.\S+$/.test(c.primaryEmailAddress)) return "Enter a valid email address.";
      const needsPhone = c.preferredContactMethod === "phone" || severity === "critical" || severity === "highestcriticalimpact";
      if (needsPhone && !c.phoneNumber?.trim()) return "A phone number is required for phone contact or severity A / Emergency.";
      if (!/^[A-Za-z]{3}$/.test(c.country)) return "Country must be a 3-letter ISO code, e.g. USA.";
    }
    return null;
  };

  const next = () => {
    const err = validate(step);
    setStepError(err);
    if (err) return;
    if (step === 2) {
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify({ ...contact, additionalEmailAddresses: ccList }));
      } catch {
        // Not critical.
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const write = useGuardedWrite<SupportTicket>(async (ticket) => {
    // The ticket exists now; attachments go to its workspace. An upload
    // failure must not look like a failed ticket, so report it separately.
    if (attachments.length) {
      try {
        await uploadConfirmed(scope, ticket.name, attachments);
      } catch (e) {
        setUploadFailure({ ticketName: ticket.name, message: describeError(e) });
        return;
      }
    }
    router.push(`/tickets/${encodeURIComponent(ticket.name)}`);
  });
  const attachmentNote = attachments.length > 0 && (
    <div className="rounded-lg border p-3 text-sm">
      <p className="font-medium">After the ticket is created, these files are uploaded to it:</p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {attachments.map((f) => (
          <li key={f.name}>
            {sanitizeFileName(f.name)} ({formatBytes(f.size)})
          </li>
        ))}
      </ul>
    </div>
  );

  if (uploadFailure) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Ticket created</h1>
        <ErrorAlert title="Some attachments were not uploaded" message={uploadFailure.message} />
        <Button nativeButton={false} render={<Link href={`/tickets/${encodeURIComponent(uploadFailure.ticketName)}`} />}>
          Open the ticket to retry from Attachments
        </Button>
      </div>
    );
  }

  const setC = (key: keyof ContactProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setContact((c) => ({ ...c, [key]: e.target.value }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">New support ticket</h1>
        <p className="text-sm text-muted-foreground">Scope: {scopeLabel(scope, subscriptions)}</p>
      </div>

      <ol className="flex gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "flex-1 rounded-md border px-3 py-1.5",
              i === step ? "border-foreground font-medium" : i < step ? "bg-muted" : "text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {servicesError && <ErrorAlert title="Could not load services" message={servicesError} />}

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What&apos;s the problem?</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Summary (ticket title)">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Cannot RDP to Windows VM after resize" />
            </Field>
            <Field label="Service">
              <NativeSelect value={serviceId} onChange={(e) => chooseService(e.target.value)} disabled={!services}>
                <option value="">{services ? "Choose a service…" : "Loading services…"}</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.properties.displayName}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Problem type">
              <NativeSelect
                value={classificationId}
                onChange={(e) => setClassificationId(e.target.value)}
                disabled={!service || classifications.length === 0}
              >
                <option value="">{service ? "Choose a problem type…" : "Choose a service first"}</option>
                {classifications.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.properties.displayName}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {session?.classifyEnabled && (
              <div className="space-y-2 rounded-lg border border-dashed p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Suggest a problem type from the summary (preview API, subscription scope only).
                  </p>
                  <Button variant="outline" size="sm" onClick={suggest} disabled={!canClassify || suggesting}>
                    <Sparkles />
                    {suggesting ? "Suggesting…" : "Suggest"}
                  </Button>
                </div>
                {suggestError && <p className="text-sm text-destructive">{suggestError}</p>}
                {suggestions?.length === 0 && <p className="text-sm text-muted-foreground">No suggestions.</p>}
                {suggestions?.map((s) => (
                  <button
                    key={s.problemClassificationId}
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{s.title}</span>
                    {s.description && <span className="block text-muted-foreground">{s.description}</span>}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Description">
                <Textarea
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened, what you expected, error messages, what you've tried…"
                />
              </Field>
            </div>
            <Field label="Severity">
              <NativeSelect value={severity} onChange={(e) => setSeverity(e.target.value as SeverityLevel)}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Problem started (optional)">
              <Input type="datetime-local" value={problemStart} onChange={(e) => setProblemStart(e.target.value)} />
            </Field>
            {scope !== "tenant" && (
              <div className="sm:col-span-2">
                <Field label="Affected resource ID (optional)" hint="Full ARM ID, e.g. /subscriptions/…/virtualMachines/vm1">
                  <Input value={resourceId} onChange={(e) => setResourceId(e.target.value)} className="font-mono text-xs" />
                </Field>
              </div>
            )}
            <Field label="Advanced diagnostic information" hint="Allow Microsoft to collect diagnostics from your resources.">
              <NativeSelect value={consent} onChange={(e) => setConsent(e.target.value as "Yes" | "No")}>
                <option value="Yes">Yes, allow</option>
                <option value="No">No</option>
              </NativeSelect>
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox checked={require24x7} onCheckedChange={(v) => setRequire24x7(v === true)} />
              Require 24x7 response
            </label>
            {consentTypes.map((c) => (
              <label key={c.type} className="flex items-start gap-2 text-sm sm:col-span-2">
                <Checkbox
                  checked={secondaryConsent[c.type!] ?? false}
                  onCheckedChange={(v) => setSecondaryConsent((s) => ({ ...s, [c.type!]: v === true }))}
                />
                <span>{c.description ?? `Consent for ${c.type}`}</span>
              </label>
            ))}
            <div className="sm:col-span-2">
              <Field label="Attachments (optional)" hint="Uploaded to the ticket right after it's created.">
                <FilePicker files={attachments} onChange={setAttachments} />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>Saved in this browser for next time.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input value={contact.firstName} onChange={setC("firstName")} />
            </Field>
            <Field label="Last name">
              <Input value={contact.lastName} onChange={setC("lastName")} />
            </Field>
            <Field label="Email">
              <Input type="email" value={contact.primaryEmailAddress} onChange={setC("primaryEmailAddress")} />
            </Field>
            <Field label="Phone" hint="Required for phone contact or severity A / Emergency">
              <Input type="tel" value={contact.phoneNumber ?? ""} onChange={setC("phoneNumber")} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="CC email addresses (optional)" hint="Comma-separated">
                <Input value={ccText} onChange={(e) => setCcText(e.target.value)} />
              </Field>
            </div>
            <Field label="Preferred contact method">
              <NativeSelect value={contact.preferredContactMethod} onChange={setC("preferredContactMethod")}>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
              </NativeSelect>
            </Field>
            <Field label="Support language">
              <NativeSelect value={contact.preferredSupportLanguage} onChange={setC("preferredSupportLanguage")}>
                {Object.entries(SUPPORT_LANGUAGES).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Time zone" hint="Windows time zone name">
              <Input list="time-zones" value={contact.preferredTimeZone} onChange={setC("preferredTimeZone")} />
              <datalist id="time-zones">
                {COMMON_TIME_ZONES.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
            </Field>
            <Field label="Country" hint="ISO 3166-1 alpha-3, e.g. USA, BRA, GBR">
              <Input value={contact.country} onChange={setC("country")} maxLength={3} className="uppercase" />
            </Field>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>
              {session?.liveMode
                ? "Next you'll see the exact request. Sending it opens a real case with Microsoft."
                : "Dry-run mode: you'll see the exact request, but nothing is sent to Azure."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Title</dt>
              <dd>{input.title}</dd>
              <dt className="text-muted-foreground">Service</dt>
              <dd>{service?.properties.displayName}</dd>
              <dt className="text-muted-foreground">Problem</dt>
              <dd>{classification?.properties.displayName}</dd>
              <dt className="text-muted-foreground">Severity</dt>
              <dd>{SEVERITY_LABELS[severity]}</dd>
              <dt className="text-muted-foreground">Contact</dt>
              <dd>
                {contact.firstName} {contact.lastName} · {contact.primaryEmailAddress}
              </dd>
              <dt className="text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap">{input.description}</dd>
              <dt className="text-muted-foreground">Attachments</dt>
              <dd>{attachments.length ? attachments.map((f) => sanitizeFileName(f.name)).join(", ") : "None"}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      {(stepError || write.error) && (
        <p className="text-sm whitespace-pre-line text-destructive">{stepError ?? write.error}</p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0 || write.busy}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Next</Button>
        ) : (
          <Button
            disabled={write.busy}
            onClick={() =>
              write.start("Create support ticket", "POST", withScope("/api/tickets", scope), { input }, attachmentNote)
            }
          >
            {write.busy ? "Preparing…" : "Review request"}
          </Button>
        )}
      </div>
      {write.dialog}
    </div>
  );
}
