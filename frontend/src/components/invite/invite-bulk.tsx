"use client";

import { CheckCircle2, CircleAlert, MinusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/ui/file-drop";
import { Textarea } from "@/components/ui/input";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { MAX_BULK_ROWS, parseCandidateCsv, type CsvRow } from "@/lib/domain/invitation";
import { plural } from "@/lib/domain/test";
import type { BulkInviteResult } from "@/types/invitation";
import type { TestSummary } from "@/types/test";
import { ALL_TESTS, TestScopeField } from "./shared";

const MAX_FILE = 512 * 1024;

export function InviteBulk({ jdId, tests }: { jdId: string; tests: TestSummary[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string>();
  const [scope, setScope] = useState(ALL_TESTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<BulkInviteResult | null>(null);

  const { rows, duplicates } = parseCandidateCsv(text);
  const valid = rows.filter((r) => !r.error);
  const invalid = rows.length - valid.length;
  const over = valid.length > MAX_BULK_ROWS;

  async function pick(f: File | null) {
    setFile(f);
    setFileError(undefined);
    setResult(null);
    if (!f) return setText("");
    if (!/\.(csv|txt)$/i.test(f.name)) return setFileError("Choose a .csv file.");
    if (f.size > MAX_FILE) return setFileError("This file is too large. Keep it under 512 KB.");
    setText(await f.text());
  }

  async function send() {
    setBusy(true);
    setError(undefined);
    const res = await api<BulkInviteResult>("/api/v1/invitations/bulk", {
      method: "POST",
      body: {
        jd_id: jdId,
        ...(scope !== ALL_TESTS ? { test_id: scope } : {}),
        candidates: valid.map((r) => ({ candidate_email: r.email, candidate_name: r.name || r.email.split("@")[0] })),
      },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    setResult(res.data);
    toast({ title: `${plural(res.data.sent, "invitation")} sent`, tone: res.data.failed ? undefined : "success" });
    router.refresh();
  }

  if (result) return <BulkResult result={result} onAgain={() => (setResult(null), setFile(null), setText(""))} />;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-base text-ink-muted">
        A CSV with an <code className="font-mono text-sm">email</code> column and, optionally, a <code className="font-mono text-sm">name</code> column. Up to {MAX_BULK_ROWS} people at a time. You can also paste the list.
      </p>
      <FileDrop accept=".csv,text/csv" hint="CSV, up to 512 KB" file={file} onFile={(f) => void pick(f)} error={fileError} />
      {!file && (
        <Textarea
          aria-label="Or paste a list"
          rows={5}
          placeholder={"email,name\nada@example.com,Ada Lovelace"}
          className="font-mono text-sm"
          value={text}
          onChange={(e) => (setText(e.target.value), setResult(null))}
        />
      )}

      {rows.length > 0 && (
        <>
          <p className="text-base text-ink">
            {plural(valid.length, "person", "people")} ready to invite
            {invalid > 0 && <span className="text-danger">, {invalid} with problems</span>}
            {duplicates > 0 && <span className="text-ink-muted">, {plural(duplicates, "duplicate")} removed</span>}
          </p>
          {over && <Alert tone="danger">That&apos;s more than {MAX_BULK_ROWS}. Split the list and send it in batches.</Alert>}
          <div className="max-h-80 overflow-y-auto rounded-panel border border-line bg-surface">
            <RowTable rows={rows} />
          </div>
          <TestScopeField tests={tests} value={scope} onChange={setScope} />
          {error && <Alert tone="danger">{error}</Alert>}
          <div>
            <Button variant="primary" loading={busy} disabled={!valid.length || over} onClick={() => void send()}>
              Send {plural(valid.length, "invitation")}
            </Button>
            {invalid > 0 && valid.length > 0 && <span className="ml-3 text-sm text-ink-muted">Rows with problems are skipped.</span>}
          </div>
        </>
      )}
    </div>
  );
}

function RowTable({ rows }: { rows: CsvRow[] }) {
  return (
    <Table aria-label="Candidates in the file">
      <THead>
        <tr>
          <TH className="w-16">Line</TH>
          <TH>Email</TH>
          <TH>Name</TH>
        </tr>
      </THead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.line}>
            <TD className="text-ink-muted">{r.line}</TD>
            <TD className={cn(r.error && "text-danger")}>
              {r.email || <span className="text-ink-muted">Empty</span>}
              {r.error && <span className="block text-sm">{r.error}</span>}
            </TD>
            <TD className="text-ink-muted">{r.name || "From the email"}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

function BulkResult({ result, onAgain }: { result: BulkInviteResult; onAgain: () => void }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-line bg-line">
        {[
          { label: "Sent", n: result.sent },
          { label: "Skipped", n: result.skipped },
          { label: "Failed", n: result.failed },
        ].map((s) => (
          <div key={s.label} className="bg-surface px-4 py-3">
            <p className="text-sm text-ink-muted">{s.label}</p>
            <p className="text-xl text-ink">{s.n}</p>
          </div>
        ))}
      </div>
      <div className="max-h-96 overflow-y-auto rounded-panel border border-line bg-surface">
        <Table aria-label="Results per person">
          <THead>
            <tr>
              <TH>Candidate</TH>
              <TH>Result</TH>
            </tr>
          </THead>
          <tbody>
            {result.results.map((r) => (
              <TR key={r.email}>
                <TD>
                  <span className="block text-ink">{r.name}</span>
                  <span className="text-sm text-ink-muted">{r.email}</span>
                </TD>
                <TD>
                  {r.status === "sent" ? (
                    <span className="inline-flex items-center gap-1.5 text-success">
                      <CheckCircle2 aria-hidden className="size-4" /> {r.email_sent ? "Sent" : "Created, email not sent"}
                    </span>
                  ) : r.status === "skipped" ? (
                    <span className="inline-flex items-center gap-1.5 text-ink-muted">
                      <MinusCircle aria-hidden className="size-4" /> Skipped{r.error ? `: ${r.error}` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-danger">
                      <CircleAlert aria-hidden className="size-4" /> Failed{r.error ? `: ${r.error}` : ""}
                    </span>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>
      <div>
        <Button variant="secondary" onClick={onAgain}>
          Invite another list
        </Button>
      </div>
    </div>
  );
}
