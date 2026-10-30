"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/native-select";
import { ErrorAlert, SessionGate } from "@/components/session-gate";
import { useGuardedWrite } from "@/components/guarded-write";
import { SeverityBadge, StatusBadge } from "@/components/tickets/badges";
import { Field } from "@/components/tickets/ticket-list";
import { api, describeError, withScope } from "@/lib/client/api";
import { SEVERITIES, SEVERITY_LABELS, formatDate } from "@/lib/client/labels";
import type { ChatTranscript, Communication, SupportTicket } from "@/lib/azure-support/types";

export function TicketDetail({ params }: { params: Promise<{ name: string }> }) {
  const { name } = React.use(params);
  const ticketName = decodeURIComponent(name);
  return <SessionGate>{(scope) => <TicketDetailForScope key={scope} scope={scope} name={ticketName} />}</SessionGate>;
}

function TicketDetailForScope({ scope, name }: { scope: string; name: string }) {
  const base = `/api/tickets/${encodeURIComponent(name)}`;
  const [ticket, setTicket] = React.useState<SupportTicket | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const reload = () => setReloadToken((t) => t + 1);

  React.useEffect(() => {
    let cancelled = false;
    api<SupportTicket>(withScope(base, scope)).then(
      (t) => {
        if (cancelled) return;
        setTicket(t);
        setError(null);
      },
      (e) => !cancelled && setError(describeError(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [base, scope, reloadToken]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorAlert title="Could not load ticket" message={error} />
        <p className="text-sm text-muted-foreground">
          Tickets belong to one scope. If this ticket was opened under another subscription or at tenant level,
          switch the scope in the header.
        </p>
      </div>
    );
  }
  if (!ticket) return <Skeleton className="h-96 w-full" />;

  const p = ticket.properties;
  return (
    <div className="space-y-4">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{p.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={p.status} />
            <SeverityBadge severity={p.severity} />
            <span className="font-mono">#{p.supportTicketId ?? ticket.name}</span>
          </div>
        </div>
        <Button variant="outline" onClick={reload}>
          <RefreshCw />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="chats">Chat transcripts</TabsTrigger>
          <TabsTrigger value="manage">Manage</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-2">
          <Overview ticket={ticket} />
        </TabsContent>
        <TabsContent value="messages" className="pt-2">
          <Messages scope={scope} base={base} contactEmail={p.contactDetails?.primaryEmailAddress} />
        </TabsContent>
        <TabsContent value="chats" className="pt-2">
          <ChatTranscripts scope={scope} base={base} />
        </TabsContent>
        <TabsContent value="manage" className="pt-2">
          <Manage scope={scope} base={base} ticket={ticket} onUpdated={setTicket} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> All tickets
    </Link>
  );
}

function Overview({ ticket }: { ticket: SupportTicket }) {
  const p = ticket.properties;
  const c = p.contactDetails;
  const sla = p.serviceLevelAgreement;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{p.description}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Item label="Service">{p.serviceDisplayName}</Item>
            <Item label="Problem">{p.problemClassificationDisplayName}</Item>
            <Item label="Support plan">{p.supportPlanDisplayName ?? p.supportPlanType}</Item>
            <Item label="Engineer">{p.supportEngineer?.emailAddress || "Not assigned"}</Item>
            <Item label="Created">{formatDate(p.createdDate)}</Item>
            <Item label="Modified">{formatDate(p.modifiedDate)}</Item>
            <Item label="Diagnostics consent">{p.advancedDiagnosticConsent}</Item>
            <Item label="24x7 response">{p.require24X7Response ? "Yes" : "No"}</Item>
            {p.technicalTicketDetails?.resourceId && (
              <Item label="Resource">
                <span className="font-mono text-xs break-all">{p.technicalTicketDetails.resourceId}</span>
              </Item>
            )}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Service level agreement</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Item label="Response within">{sla?.slaMinutes ? `${sla.slaMinutes} minutes` : undefined}</Item>
            <Item label="Starts">{formatDate(sla?.startTime)}</Item>
            <Item label="Expires">{formatDate(sla?.expirationTime)}</Item>
          </dl>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <Item label="Name">{c ? `${c.firstName} ${c.lastName}` : undefined}</Item>
            <Item label="Email">{c?.primaryEmailAddress}</Item>
            <Item label="CC">{c?.additionalEmailAddresses?.join(", ")}</Item>
            <Item label="Phone">{c?.phoneNumber}</Item>
            <Item label="Preferred">{c?.preferredContactMethod}</Item>
            <Item label="Time zone">{c?.preferredTimeZone}</Item>
            <Item label="Language">{c?.preferredSupportLanguage}</Item>
            <Item label="Country">{c?.country}</Item>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children || "—"}</dd>
    </>
  );
}

function Messages({ scope, base, contactEmail }: { scope: string; base: string; contactEmail?: string }) {
  const [items, setItems] = React.useState<Communication[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");

  const load = React.useCallback(() => {
    api<Communication[]>(withScope(`${base}/communications`, scope)).then(setItems, (e) => {
      setError(describeError(e));
      setItems([]);
    });
  }, [base, scope]);
  React.useEffect(load, [load]);

  const write = useGuardedWrite<Communication>(() => {
    setSubject("");
    setBody("");
    load();
  });

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    write.start("Add message to ticket", "POST", withScope(`${base}/communications`, scope), {
      input: { subject, body, sender: contactEmail || undefined },
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        {error && <ErrorAlert title="Could not load messages" message={error} />}
        {items === null && <Skeleton className="h-40 w-full" />}
        {items?.length === 0 && !error && <p className="text-sm text-muted-foreground">No messages yet.</p>}
        {items?.map((m) => (
          <Card key={m.id} size="sm">
            <CardHeader>
              <CardTitle>{m.properties.subject}</CardTitle>
              <CardDescription>
                {m.properties.sender ?? "Unknown sender"} · {m.properties.communicationType ?? "web"} ·{" "}
                {formatDate(m.properties.createdDate)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Bodies can contain HTML from Microsoft; shown as text on purpose. */}
              <p className="text-sm whitespace-pre-wrap">{stripTags(m.properties.body)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Reply</CardTitle>
          <CardDescription>Adds a communication to the ticket.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={send}>
            <Field label="Subject">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={200} />
            </Field>
            <Field label="Message">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={6} />
            </Field>
            {write.error && <p className="text-sm whitespace-pre-line text-destructive">{write.error}</p>}
            <Button type="submit" disabled={write.busy}>
              Review & send
            </Button>
          </form>
        </CardContent>
      </Card>
      {write.dialog}
    </div>
  );
}

function stripTags(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function ChatTranscripts({ scope, base }: { scope: string; base: string }) {
  const [items, setItems] = React.useState<ChatTranscript[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api<ChatTranscript[]>(withScope(`${base}/chat-transcripts`, scope)).then(setItems, (e) => {
      setError(describeError(e));
      setItems([]);
    });
  }, [base, scope]);

  if (error) return <ErrorAlert title="Could not load chat transcripts" message={error} />;
  if (!items) return <Skeleton className="h-40 w-full" />;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No chat transcripts for this ticket.</p>;

  return (
    <div className="space-y-4">
      {items.map((t) => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle>Chat started {formatDate(t.properties.startTime)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(t.properties.messages ?? []).map((m, i) => (
              <div key={i} className={m.communicationDirection === "inbound" ? "pr-12" : "pl-12"}>
                <div className="rounded-lg bg-muted p-2 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {m.sender} · {formatDate(m.createdDate)}
                  </div>
                  <p className="whitespace-pre-wrap">{stripTags(m.body ?? "")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Manage({
  scope,
  base,
  ticket,
  onUpdated,
}: {
  scope: string;
  base: string;
  ticket: SupportTicket;
  onUpdated: (t: SupportTicket) => void;
}) {
  const p = ticket.properties;
  const [severity, setSeverity] = React.useState(p.severity);
  const [status, setStatus] = React.useState((p.status ?? "").toLowerCase() === "closed" ? "closed" : "open");
  const [consent, setConsent] = React.useState(p.advancedDiagnosticConsent);
  const [phone, setPhone] = React.useState(p.contactDetails?.phoneNumber ?? "");
  const [cc, setCc] = React.useState((p.contactDetails?.additionalEmailAddresses ?? []).join(", "));
  const write = useGuardedWrite<SupportTicket>(onUpdated);

  const originalStatus = (p.status ?? "").toLowerCase() === "closed" ? "closed" : "open";
  const contactChanges: Record<string, unknown> = {};
  if (phone !== (p.contactDetails?.phoneNumber ?? "")) contactChanges.phoneNumber = phone;
  const ccList = cc.split(",").map((s) => s.trim()).filter(Boolean);
  if (ccList.join(",") !== (p.contactDetails?.additionalEmailAddresses ?? []).join(",")) {
    contactChanges.additionalEmailAddresses = ccList;
  }

  const input = {
    severity: severity !== p.severity ? severity : undefined,
    status: status !== originalStatus ? status : undefined,
    advancedDiagnosticConsent: consent !== p.advancedDiagnosticConsent ? consent : undefined,
    contactDetails: Object.keys(contactChanges).length ? contactChanges : undefined,
  };
  const dirty = Object.values(input).some((v) => v !== undefined);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Update ticket</CardTitle>
        <CardDescription>
          Severity can&apos;t be changed while an engineer is actively working the case; send a message instead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            write.start("Update ticket", "PATCH", withScope(base, scope), { input });
          }}
        >
          <Field label="Severity">
            <NativeSelect value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Status">
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </NativeSelect>
          </Field>
          <Field label="Advanced diagnostic consent">
            <NativeSelect value={consent} onChange={(e) => setConsent(e.target.value as typeof consent)}>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </NativeSelect>
          </Field>
          <Field label="Phone number">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="CC email addresses" hint="Comma-separated">
              <Input value={cc} onChange={(e) => setCc(e.target.value)} />
            </Field>
          </div>
          {write.error && <p className="text-sm whitespace-pre-line text-destructive sm:col-span-2">{write.error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!dirty || write.busy}>
              Review changes
            </Button>
          </div>
        </form>
      </CardContent>
      {write.dialog}
    </Card>
  );
}
