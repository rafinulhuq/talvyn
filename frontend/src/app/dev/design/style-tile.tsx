"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Briefcase,
  CircleAlert,
  Download,
  FileUp,
  LayoutDashboard,
  MailPlus,
  MoreHorizontal,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DataTable, dataTableColumns } from "@/components/ui/data-table";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ScoreMeter } from "@/components/ui/score-meter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetContent, Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";

// ─── Sample data (realistic, not lorem) ───────────────────────

type Status = "Invited" | "In progress" | "Submitted" | "Evaluated" | "Expired";

type Candidate = {
  id: string;
  name: string;
  email: string;
  status: Status;
  score: number | null;
  technical: number | null;
  reasoning: number | null;
  problemSolving: number | null;
  flags: number;
  submitted: string;
};

const statusTone: Record<Status, BadgeTone> = {
  Invited: "neutral",
  "In progress": "accent",
  Submitted: "warning",
  Evaluated: "success",
  Expired: "danger",
};

const CANDIDATES: Candidate[] = [
  { id: "c1", name: "Amara Okafor", email: "amara.okafor@fastmail.com", status: "Evaluated", score: 86, technical: 91, reasoning: 82, problemSolving: 84, flags: 0, submitted: "18 Nov, 14:20" },
  { id: "c2", name: "Jonas Lindqvist", email: "jonas.lindqvist@proton.me", status: "Evaluated", score: 74, technical: 70, reasoning: 81, problemSolving: 72, flags: 1, submitted: "18 Nov, 09:05" },
  { id: "c3", name: "Priya Raman", email: "priya.raman@outlook.com", status: "Evaluated", score: 63, technical: 58, reasoning: 71, problemSolving: 61, flags: 0, submitted: "17 Nov, 16:48" },
  { id: "c4", name: "Mateo Fernández", email: "mateo.fdz@gmail.com", status: "Submitted", score: null, technical: null, reasoning: null, problemSolving: null, flags: 3, submitted: "19 Nov, 11:32" },
  { id: "c5", name: "Hana Watanabe", email: "hana.w@icloud.com", status: "In progress", score: null, technical: null, reasoning: null, problemSolving: null, flags: 0, submitted: "—" },
  { id: "c6", name: "Daniel Mensah", email: "d.mensah@gmail.com", status: "Invited", score: null, technical: null, reasoning: null, problemSolving: null, flags: 0, submitted: "—" },
  { id: "c7", name: "Sofia Rossi", email: "sofia.rossi@libero.it", status: "Expired", score: null, technical: null, reasoning: null, problemSolving: null, flags: 0, submitted: "—" },
];

const PASS_MARK = 70;

const col = dataTableColumns<Candidate>();
const columns = col.columns([
  col.accessor("name", {
    header: "Candidate",
    cell: (info) => (
      <div className="flex flex-col">
        <span className="font-medium text-ink">{info.getValue()}</span>
        <span className="text-sm text-ink-muted">{info.row.original.email}</span>
      </div>
    ),
  }),
  col.accessor("status", {
    header: "Status",
    cell: (info) => (
      <Badge tone={statusTone[info.getValue()]} dot>
        {info.getValue()}
      </Badge>
    ),
  }),
  col.accessor("score", {
    header: "Overall",
    sortUndefined: "last",
    cell: (info) => {
      const v = info.getValue();
      if (v === null) return <span className="text-ink-muted">Not graded</span>;
      return (
        <span className="flex items-center gap-2">
          <span className="w-7 font-medium">{v}</span>
          <span className="relative h-1.5 w-20 rounded-[2px] bg-sunken">
            <span className={`absolute inset-y-0 left-0 rounded-[2px] ${v >= PASS_MARK ? "bg-accent" : "bg-ink-faint"}`} style={{ width: `${v}%` }} />
            <span aria-hidden className="absolute -inset-y-0.5 w-px bg-ink" style={{ left: `${PASS_MARK}%` }} />
          </span>
        </span>
      );
    },
  }),
  col.accessor("flags", {
    header: "Integrity",
    cell: (info) =>
      info.getValue() === 0 ? (
        <span className="text-ink-muted">Clean</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-warning">
          <CircleAlert aria-hidden className="size-3.5" />
          {info.getValue()} {info.getValue() === 1 ? "event" : "events"}
        </span>
      ),
  }),
  col.accessor("submitted", { header: "Submitted", enableSorting: false, cell: (info) => <span className="text-ink-muted">{info.getValue()}</span> }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: () => <RowMenu />,
  }),
]);

// ─── Page ─────────────────────────────────────────────────────

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Type"],
  ["controls", "Controls"],
  ["status", "Status"],
  ["scores", "Score scale"],
  ["table", "Data table"],
  ["overlays", "Overlays"],
  ["states", "Empty and loading"],
] as const;

export function StyleTile() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 lg:grid-cols-[180px_1fr]">
      <nav aria-label="Sections" className="hidden lg:block">
        <ul className="sticky top-10 flex flex-col gap-0.5">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-control px-2 py-1 text-base text-ink-muted hover:bg-sunken hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex min-w-0 flex-col gap-16">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1 className="text-2xl font-medium tracking-[-0.01em]">Talvyn design system</h1>
            <p className="mt-1 max-w-xl text-md text-ink-muted">
              Quiet precision: calm surfaces, one cobalt accent, and a measurement scale for every score. Review in both
              themes before screens are built.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <Section id="colour" title="Colour" note="Roles, not hex. Every component uses these names, so dark mode is a token swap.">
          <ColourGrid />
        </Section>

        <Section id="type" title="Type" note="IBM Plex Sans for the product, Plex Mono for code and tokens, Instrument Serif for marketing headlines only.">
          <TypeSpecimen />
        </Section>

        <Section id="controls" title="Controls">
          <Controls />
        </Section>

        <Section id="status" title="Status" note="Colour carries meaning only. A dot keeps status scannable down a long column.">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(statusTone) as Status[]).map((s) => (
              <Badge key={s} tone={statusTone[s]} dot>
                {s}
              </Badge>
            ))}
            <Badge tone="warning">3 integrity events</Badge>
            <Badge tone="accent">Approved</Badge>
          </div>
        </Section>

        <Section id="scores" title="Score scale" note="The signature element. Ticks every ten points, a notch at the pass mark, and a muted fill below it.">
          <div className="grid gap-x-12 gap-y-8 rounded-panel border border-line bg-surface p-6 md:grid-cols-2">
            <div className="flex flex-col gap-8">
              <ScoreMeter label="Overall score, Amara Okafor" value={86} passMark={PASS_MARK} />
              <ScoreMeter label="Overall score, Priya Raman" value={63} passMark={PASS_MARK} />
            </div>
            <div className="flex flex-col gap-5 border-t border-line pt-6 md:border-l md:border-t-0 md:pl-12 md:pt-0">
              <p className="text-sm text-ink-muted">Section scores, Amara Okafor</p>
              <ScoreMeter size="sm" label="Technical" value={91} />
              <ScoreMeter size="sm" label="Reasoning" value={82} />
              <ScoreMeter size="sm" label="Problem solving" value={64} />
            </div>
          </div>
        </Section>

        <Section id="table" title="Data table" note="Sort by a column, select rows for bulk actions, or open a candidate in the side panel.">
          <CandidateTable />
        </Section>

        <Section id="overlays" title="Overlays">
          <Overlays />
        </Section>

        <Section id="states" title="Empty and loading">
          <States />
        </Section>
      </main>
    </div>
  );
}

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-10">
      <h2 id={`${id}-title`} className="text-lg font-medium">
        {title}
      </h2>
      {note && <p className="mt-1 max-w-2xl text-base text-ink-muted">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

// ─── Colour ───────────────────────────────────────────────────

const COLOUR_ROLES: { role: string; varName: string; use: string }[] = [
  { role: "Canvas", varName: "--canvas", use: "App background" },
  { role: "Surface", varName: "--surface", use: "Panels, tables, inputs" },
  { role: "Sunken", varName: "--surface-sunken", use: "Wells, table header" },
  { role: "Ink", varName: "--ink", use: "Primary text" },
  { role: "Ink muted", varName: "--ink-muted", use: "Secondary text" },
  { role: "Ink faint", varName: "--ink-faint", use: "Placeholders only" },
  { role: "Line", varName: "--line", use: "Hairlines" },
  { role: "Accent", varName: "--accent", use: "Actions, focus, selection" },
  { role: "Accent soft", varName: "--accent-soft", use: "Selected rows" },
  { role: "Success", varName: "--success", use: "Passed, evaluated" },
  { role: "Warning", varName: "--warning", use: "Needs review" },
  { role: "Danger", varName: "--danger", use: "Destructive, expired" },
];

function ColourGrid() {
  return (
    <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line bg-line min-[480px]:grid-cols-2 lg:grid-cols-4">
      {COLOUR_ROLES.map((c) => (
        <li key={c.varName} className="flex items-center gap-3 bg-surface p-3">
          <span aria-hidden className="size-9 shrink-0 rounded-control border border-line" style={{ background: `var(${c.varName})` }} />
          <span className="min-w-0">
            <span className="block text-base font-medium">{c.role}</span>
            <span className="block truncate text-sm text-ink-muted">{c.use}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ─── Type ─────────────────────────────────────────────────────

function TypeSpecimen() {
  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-panel border border-line bg-surface px-6 py-8">
        <p className="max-w-3xl font-serif text-3xl tracking-[-0.01em] sm:text-display">Hire on evidence of the work itself.</p>
        <p className="mt-4 max-w-xl text-md text-ink-muted">
          Talvyn turns a job description into a role-specific assessment, grades every answer against the same rubric,
          and shows you why each candidate scored the way they did.
        </p>
      </div>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-[120px_1fr]">
        {(
          [
            ["2xl / 32", "text-2xl font-medium tracking-[-0.01em]", "Senior Backend Engineer"],
            ["xl / 24", "text-xl font-medium", "Results for 42 candidates"],
            ["lg / 20", "text-lg font-medium", "Technical assessment"],
            ["md / 16", "text-md", "Reading size, used in reports and long answers."],
            ["base / 14", "text-base", "Body size for the product: tables, forms, descriptions."],
            ["sm / 13", "text-sm text-ink-muted", "Secondary details, hints and table headers."],
            ["mono / 13", "font-mono text-sm", "inv_7f3a9c21f04e"],
          ] as const
        ).map(([token, cls, sample]) => (
          <div key={token} className="contents">
            <dt className="pt-1 text-sm text-ink-muted">{token}</dt>
            <dd className={cls}>{sample}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── Controls ─────────────────────────────────────────────────

function Controls() {
  const [saving, setSaving] = useState(false);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Invite candidates</Button>
          <Button>Preview as candidate</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Revoke invitation</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            loading={saving}
            onClick={() => {
              setSaving(true);
              setTimeout(() => {
                setSaving(false);
                toast({ title: "Changes saved", tone: "success" });
              }, 1200);
            }}
          >
            {saving ? "Saving changes" : "Save changes"}
          </Button>
          <Button size="sm">
            <Download aria-hidden className="size-3.5" />
            Export report
          </Button>
          <Button size="sm" disabled>
            Disabled
          </Button>
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <label className="flex items-center gap-2.5 text-base">
            <Checkbox defaultChecked />
            Shuffle question order for each candidate
          </label>
          <label className="flex items-center justify-between gap-4 text-base">
            <span>
              Pause the timer when the candidate loses connection
              <span className="block text-sm text-ink-muted">The clock resumes from the last server heartbeat.</span>
            </span>
            <Switch defaultChecked />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-6">
        <Field label="Role title" hint="Shown to candidates on the invitation.">
          <Input defaultValue="Senior Backend Engineer" />
        </Field>
        <Field label="Candidate email" error="Enter an email address like name@company.com.">
          <Input type="email" defaultValue="amara.okafor@" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Seniority">
            <Select defaultValue="senior">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="junior">Junior</SelectItem>
                <SelectItem value="mid">Mid-level</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Time limit" hint="Minutes per test.">
            <Input type="number" defaultValue={45} />
          </Field>
        </div>
        <Field label="Note to candidate" optional>
          <Textarea placeholder="Anything the candidate should know before starting" />
        </Field>
      </div>
    </div>
  );
}

// ─── Table + sheet ────────────────────────────────────────────

function RowMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Candidate actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem>
          <Send aria-hidden /> Resend invitation
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Download aria-hidden /> Export report
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive>
          <Trash2 aria-hidden /> Move to trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CandidateTable() {
  const [open, setOpen] = useState<Candidate | null>(null);
  return (
    <>
      <DataTable
        label="Candidates for Senior Backend Engineer"
        columns={columns}
        data={CANDIDATES}
        getRowId={(c) => c.id}
        selectable
        onRowClick={setOpen}
        bulkActions={(ids) => (
          <>
            <Button size="sm" onClick={() => toast({ title: `Reminder sent to ${ids.length} candidates`, tone: "success" })}>
              <Send aria-hidden className="size-3.5" />
              Send reminder
            </Button>
            <Button size="sm">
              <Download aria-hidden className="size-3.5" />
              Export
            </Button>
          </>
        )}
      />
      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <SheetContent
            title={open.name}
            description={`${open.email}, Senior Backend Engineer`}
            actions={
              <Button size="sm">
                <Download aria-hidden className="size-3.5" />
                Report
              </Button>
            }
          >
            <Tabs defaultValue="scores">
              <TabsList>
                <TabsTrigger value="scores">Scores</TabsTrigger>
                <TabsTrigger value="integrity">Integrity</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>
              <TabsContent value="scores">
                {open.score === null ? (
                  <EmptyState
                    title="Not graded yet"
                    description={
                      open.status === "Submitted"
                        ? "Answers are in. Grading usually finishes within a few minutes."
                        : "Scores appear here once the candidate submits."
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-6">
                    <ScoreMeter label="Overall" value={open.score} passMark={PASS_MARK} />
                    <div className="flex flex-col gap-4 border-t border-line pt-5">
                      <ScoreMeter size="sm" label="Technical" value={open.technical ?? 0} />
                      <ScoreMeter size="sm" label="Reasoning" value={open.reasoning ?? 0} />
                      <ScoreMeter size="sm" label="Problem solving" value={open.problemSolving ?? 0} />
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="integrity">
                <p className="text-base text-ink-muted">
                  {open.flags === 0 ? "No integrity events were recorded during this attempt." : `${open.flags} events recorded, such as leaving the test tab.`}
                </p>
              </TabsContent>
              <TabsContent value="timeline">
                <ol className="flex flex-col gap-3 border-l border-line pl-4 text-base">
                  <li>Invitation sent <span className="text-ink-muted">15 Nov, 10:02</span></li>
                  <li>Started test <span className="text-ink-muted">18 Nov, 13:31</span></li>
                  <li>Submitted <span className="text-ink-muted">{open.submitted}</span></li>
                </ol>
              </TabsContent>
            </Tabs>
          </SheetContent>
        )}
      </Sheet>
    </>
  );
}

// ─── Overlays ─────────────────────────────────────────────────

function Overlays() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface p-6">
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open confirmation</Button>
        </DialogTrigger>
        <DialogContent
          title="Revoke invitation for Daniel Mensah?"
          description="The invitation link stops working immediately. You can send a new one later."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost">Keep invitation</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="danger" onClick={() => toast({ title: "Invitation revoked" })}>
                  Revoke invitation
                </Button>
              </DialogClose>
            </>
          }
        />
      </Dialog>

      <Button onClick={() => toast({ title: "Report exported", description: "Senior Backend Engineer, 7 candidates.", tone: "success" })}>
        Show toast
      </Button>
      <Button onClick={() => toast({ title: "Couldn't send invitation", description: "The mail server refused the address. Check it and try again.", tone: "danger" })}>
        Show error toast
      </Button>

      <Tooltip content="Candidates see questions in a different order">
        <Button variant="ghost">Hover for tooltip</Button>
      </Tooltip>

      <Button variant="secondary" onClick={() => setPaletteOpen(true)} className="ml-auto">
        Search or jump to
        <span className="ml-2 flex gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </Button>

      <DialogPrimitive.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-panel border border-line shadow-float animate-pop-in">
            <DialogPrimitive.Title className="sr-only">Command menu</DialogPrimitive.Title>
            <Command>
              <CommandInput placeholder="Search candidates, roles and actions" />
              <CommandList>
                <CommandEmpty>No matches. Try a candidate name or a role title.</CommandEmpty>
                <CommandGroup heading="Go to">
                  <CommandItem onSelect={() => setPaletteOpen(false)}>
                    <LayoutDashboard aria-hidden /> Overview
                  </CommandItem>
                  <CommandItem onSelect={() => setPaletteOpen(false)}>
                    <Briefcase aria-hidden /> Job descriptions
                  </CommandItem>
                  <CommandItem onSelect={() => setPaletteOpen(false)}>
                    <Users aria-hidden /> Candidates
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="Actions">
                  <CommandItem onSelect={() => setPaletteOpen(false)}>
                    <FileUp aria-hidden /> Upload job description
                  </CommandItem>
                  <CommandItem onSelect={() => setPaletteOpen(false)}>
                    <MailPlus aria-hidden /> Invite candidates
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="Candidates">
                  {CANDIDATES.slice(0, 4).map((c) => (
                    <CommandItem key={c.id} value={`${c.name} ${c.email}`} onSelect={() => setPaletteOpen(false)}>
                      <span className="flex-1">{c.name}</span>
                      <Badge tone={statusTone[c.status]}>{c.status}</Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

// ─── States ───────────────────────────────────────────────────

function States() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-panel border border-line bg-surface">
        <EmptyState
          icon={Users}
          title="No candidates yet"
          description="Invite people by email or share a public link. Each candidate gets a private, timed test."
          action={
            <Button variant="primary" size="sm">
              <MailPlus aria-hidden className="size-3.5" />
              Invite candidates
            </Button>
          }
        />
      </div>
      <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-6" aria-busy="true" aria-label="Loading results">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="ml-auto h-1.5 w-24" />
          </div>
        ))}
      </div>
      <div className="flex items-start gap-3 rounded-panel border border-danger/30 bg-danger-soft p-4 lg:col-span-2" role="alert">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
        <div>
          <p className="text-base font-medium text-danger">Test generation stopped at question 18 of 30</p>
          <p className="mt-0.5 text-base text-ink-muted">
            The model server didn&apos;t respond for 10 minutes. The 17 questions already written are saved.
          </p>
          <Button size="sm" className="mt-3">
            Resume generation
          </Button>
        </div>
      </div>
    </div>
  );
}
