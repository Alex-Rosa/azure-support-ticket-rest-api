"use client";
import * as React from "react";
import { Paperclip, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorAlert } from "@/components/session-gate";
import { useGuardedWrite } from "@/components/guarded-write";
import { api, describeError, withScope } from "@/lib/client/api";
import { formatDate } from "@/lib/client/labels";
import { MAX_FILE_BYTES, formatBytes, sanitizeFileName } from "@/lib/azure-support/files";
import type { SupportFile } from "@/lib/azure-support/types";

/** Returns an error message, or null if Azure Support will accept the file. */
export function checkFile(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_FILE_BYTES)}.`;
  return null;
}

export function FilePicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const errors: string[] = [];
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = checkFile(f);
      if (problem) errors.push(problem);
      else if (next.some((x) => sanitizeFileName(x.name) === sanitizeFileName(f.name))) errors.push(`${f.name} is already added.`);
      else next.push(f);
    }
    setError(errors.length ? errors.join("\n") : null);
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => add(e.target.files)} />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Paperclip />
        Choose files
      </Button>
      <p className="text-xs text-muted-foreground">Up to {formatBytes(MAX_FILE_BYTES)} per file.</p>
      {error && <p className="text-sm whitespace-pre-line text-destructive">{error}</p>}
      {files.length > 0 && (
        <ul className="space-y-1 text-sm">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
              <span className="truncate">
                {sanitizeFileName(f.name)} <span className="text-muted-foreground">· {formatBytes(f.size)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${f.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((x) => x !== f))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Uploads files to an existing ticket after the user already confirmed them elsewhere. */
export async function uploadConfirmed(scope: string, ticketName: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("file", f));
  form.append("confirm", "true");
  const res = await api<{ dryRun: boolean; reason?: string }>(
    withScope(`/api/tickets/${encodeURIComponent(ticketName)}/files`, scope),
    { method: "POST", body: form },
  );
  if (res.dryRun) throw new Error(res.reason ?? "Upload was not sent.");
}

export function Attachments({ scope, ticketName }: { scope: string; ticketName: string }) {
  const url = withScope(`/api/tickets/${encodeURIComponent(ticketName)}/files`, scope);
  const [data, setData] = React.useState<{ workspace: string; files: SupportFile[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [selected, setSelected] = React.useState<File[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    api<{ workspace: string; files: SupportFile[] }>(url).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      },
      (e) => !cancelled && setError(describeError(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [url, reloadToken]);

  const write = useGuardedWrite<SupportFile[]>(() => {
    setSelected([]);
    setReloadToken((t) => t + 1);
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        {error && <ErrorAlert title="Could not load attachments" message={error} />}
        {!data && !error && <Skeleton className="h-32 w-full" />}
        {data && (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.files.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      No attachments yet.
                    </TableCell>
                  </TableRow>
                )}
                {data.files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell>{f.properties.fileSize ? formatBytes(f.properties.fileSize) : "—"}</TableCell>
                    <TableCell>{formatDate(f.properties.createdOn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The Azure Support API can list and upload files but has no download operation; open the ticket in the Azure
          portal to view file contents.
        </p>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Add attachments</CardTitle>
          <CardDescription>You review the exact requests before anything is sent.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilePicker files={selected} onChange={setSelected} disabled={write.busy} />
          {write.error && <p className="text-sm whitespace-pre-line text-destructive">{write.error}</p>}
          <Button
            disabled={selected.length === 0 || write.busy}
            onClick={() =>
              write.start(
                selected.length === 1 ? `Upload ${sanitizeFileName(selected[0].name)}` : `Upload ${selected.length} files`,
                "POST",
                url,
                { file: selected },
              )
            }
          >
            <Upload />
            Review upload{selected.length > 1 ? ` (${selected.length} files)` : ""}
          </Button>
        </CardContent>
      </Card>
      {write.dialog}
    </div>
  );
}
