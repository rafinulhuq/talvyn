"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Obj = { [k: string]: Json };
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Icons the backend accepts (cms_service._ALLOWED_ICON_KEYS). */
export const ICON_KEYS = ["arrow-right", "bar-chart", "brain", "check-circle", "clock", "code", "file-text", "layers", "shield", "sparkles", "target", "trending-up", "trophy", "users", "zap"];
const HOME_SECTIONS: Record<string, string> = {
  hero: "Hero",
  trustedBy: "Customer logos",
  stats: "Numbers",
  howItWorks: "How it works",
  assessmentTypes: "What it tests",
  features: "Features",
  comparison: "Comparison",
  testimonials: "Testimonials",
  blog: "Blog posts",
  finalCta: "Closing call to action",
};

const LABELS: Record<string, string> = {
  titlePrefix: "Headline",
  titleHighlight: "Headline, continued",
  helperText: "Small print",
  eyebrow: "Label above the heading",
  highlight: "Heading, continued",
  robotsIndex: "Let search engines index the site",
  robotsFollow: "Let search engines follow links",
  titleTemplate: "Page title pattern",
  navLinks: "Menu links",
  navActions: "Menu buttons",
  footerLinks: "Footer links",
  footerCopyright: "Copyright line",
  primaryCta: "Main button",
  secondaryCta: "Second button",
  ctaLabel: "Link text",
  oldLabel: "Left column heading",
  newLabel: "Right column heading",
  now: "Talvyn",
  old: "Alternative",
  avatarUrl: "Photo",
  videoUrl: "Video",
  src: "File",
  href: "Link",
};

/** Notes shown under specific fields. Several exist to keep public claims honest. */
const NOTES: Record<string, string> = {
  "home.trustedBy.companies": "Only list companies that use Talvyn and have agreed to be named. Leave empty to hide this section.",
  "home.stats": "Only numbers you can back up. Leave empty to hide this section.",
  "home.testimonials.quotes": "Real quotes from real people, with their permission. Leave empty to hide this section.",
  "home.sectionOrder": "Sections in the order they appear. Remove a section to hide it.",
  "site.footerCopyright": "{year} is replaced with the current year.",
  "invitation_email.subject": "You can use {jdTitle} and {candidateName}.",
};

/** Shapes for adding the first item to an empty list. */
const TEMPLATES: Record<string, Json> = {
  "home.trustedBy.companies": "",
  "home.stats": { value: "", label: "", icon: "trending-up" },
  "home.testimonials.quotes": { text: "", name: "", role: "", stars: 5, avatarUrl: "" },
  "home.howItWorks.media": { type: "image", src: "", poster: "", caption: "" },
  "site.navLinks": { label: "", href: "" },
  "site.footerLinks": { label: "", href: "" },
};

/** Reading order for fields; the database returns keys sorted by length, not meaning. */
const KEY_ORDER = ["sectionOrder", "metadata", "brand", "eyebrow", "title", "titlePrefix", "titleHighlight", "titleTemplate", "highlight", "heading", "subject", "preheader", "greeting", "name", "tagline", "role", "label", "value", "step", "body", "description", "text", "intro", "items", "steps", "rows", "quotes", "companies", "tags", "media", "oldLabel", "newLabel", "old", "now", "primaryCta", "secondaryCta", "ctaLabel", "helperText", "icon", "href", "src", "poster", "caption", "type"];
const rank = (k: string) => {
  const i = KEY_ORDER.indexOf(k);
  return i === -1 ? KEY_ORDER.length : i;
};
function ordered(o: Obj, docKey?: string): [string, Json][] {
  const entries = Object.entries(o);
  if (docKey === "home" && Array.isArray(o.sectionOrder)) {
    const order = ["sectionOrder", ...(o.sectionOrder as string[])];
    const pos = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
    return entries.sort(([a], [b]) => pos(a) - pos(b) || a.localeCompare(b));
  }
  return entries.map((e, i) => [e, i] as const).sort(([[a], i], [[b], j]) => rank(a) - rank(b) || i - j).map(([e]) => e);
}

const humanize = (k: string) => LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (m) => m.toLowerCase());
const LONG = /^(body|description|text|intro|instructions|explanation|footer|nextBody|greeting)$/;
const blank = (v: Json): Json => (typeof v === "string" ? "" : typeof v === "number" ? 0 : typeof v === "boolean" ? false : Array.isArray(v) ? [] : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)])) : null);
const pathKey = (p: (string | number)[]) => p.filter((x) => typeof x === "string").join(".");

export function setIn(root: Json, path: (string | number)[], value: Json): Json {
  if (!path.length) return value;
  const [h, ...rest] = path;
  if (Array.isArray(root)) {
    const copy = [...root];
    copy[h as number] = setIn(copy[h as number] ?? null, rest, value);
    return copy;
  }
  const o = isObj(root) ? root : {};
  return { ...o, [h as string]: setIn(o[h as string] ?? null, rest, value) };
}

type FieldProps = { value: Json; path: (string | number)[]; onChange: (path: (string | number)[], v: Json) => void };

export function JsonForm({ value, docKey, onChange }: { value: Obj; docKey: string; onChange: (v: Obj) => void }) {
  const change = (path: (string | number)[], v: Json) => onChange(setIn(value, path, v) as Obj);
  return (
    <div className="flex flex-col gap-6">
      {ordered(value, docKey).map(([k, v]) => (
        <Node key={k} name={k} value={v} path={[docKey, k]} onChange={(p, x) => change(p.slice(1), x)} top />
      ))}
    </div>
  );
}

function Node({ name, value, path, onChange, top = false }: FieldProps & { name: string; top?: boolean }) {
  const key = pathKey(path);
  const note = NOTES[key];
  const label = humanize(name);

  if (key === "home.sectionOrder" && Array.isArray(value)) return <SectionOrder value={value as string[]} onChange={(v) => onChange(path, v)} note={note} />;

  if (isObj(value)) {
    return (
      <fieldset className={cn("flex flex-col gap-4", top ? "rounded-panel border border-line bg-surface p-5" : "border-l-2 border-line pl-4")}>
        <legend className={cn("font-medium text-ink", top ? "px-1 text-md" : "text-sm")}>{label}</legend>
        {note && <p className="-mt-2 text-sm text-ink-muted">{note}</p>}
        {ordered(value).map(([k, v]) => (
          <Node key={k} name={k} value={v} path={[...path, k]} onChange={onChange} />
        ))}
      </fieldset>
    );
  }

  if (value === null) {
    const tpl = TEMPLATES[key];
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-ink">{label}</span>
        {tpl !== undefined ? (
          <Button size="sm" variant="secondary" onClick={() => onChange(path, tpl)}>
            <Plus aria-hidden className="size-3.5" /> Add
          </Button>
        ) : (
          <span className="text-ink-muted">Not set</span>
        )}
      </div>
    );
  }

  if (Array.isArray(value)) return <List label={label} note={note} value={value} path={path} onChange={onChange} template={TEMPLATES[key]} top={top} />;

  return <Leaf name={name} label={label} note={note} value={value} path={path} onChange={onChange} />;
}

function Leaf({ name, label, note, value, path, onChange }: FieldProps & { name: string; label: string; note?: string }) {
  const id = path.join("-");
  if (typeof value === "boolean")
    return (
      <label className="flex items-center justify-between gap-3 text-base text-ink">
        {label}
        <Switch checked={value} onCheckedChange={(v) => onChange(path, v)} />
      </label>
    );
  if (typeof value === "number")
    return (
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        {label}
        <Input type="number" value={value} onChange={(e) => onChange(path, Number(e.target.value))} className="w-32" />
      </label>
    );
  const str = String(value ?? "");
  if (name === "icon")
    return (
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        {label}
        <div className="w-48">
          <Select value={ICON_KEYS.includes(str) ? str : undefined} onValueChange={(v) => onChange(path, v)}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an icon" />
            </SelectTrigger>
            <SelectContent>
              {ICON_KEYS.map((i) => (
                <SelectItem key={i} value={i}>
                  {i}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </label>
    );
  const media = /^(src|poster|avatarUrl|videoUrl)$/.test(name);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {LONG.test(name) || str.length > 90 ? (
        <Textarea id={id} rows={Math.min(8, Math.max(2, Math.ceil(str.length / 80)))} value={str} onChange={(e) => onChange(path, e.target.value)} />
      ) : (
        <div className="flex gap-2">
          <Input id={id} value={str} onChange={(e) => onChange(path, e.target.value)} placeholder={/href$|^href$/i.test(name) ? "/path, #section or https://" : undefined} />
          {media && <UploadButton onUploaded={(url) => onChange(path, url)} />}
        </div>
      )}
      {note && <p className="text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

export function UploadButton({ onUploaded, label = "Upload" }: { onUploaded: (url: string, id: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f: File) {
    setBusy(true);
    const form = new FormData();
    form.append("file", f);
    form.append("title", f.name);
    const res = await fetch("/api/cms/media", { method: "POST", body: form, credentials: "same-origin" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; url?: string; error?: { message?: string } } | null;
    setBusy(false);
    if (!res?.ok || !body?.url || !body.id) return toast({ title: "Upload failed", description: body?.error?.message ?? "Try again.", tone: "danger" });
    onUploaded(body.url, body.id);
  }
  return (
    <>
      <Button type="button" variant="secondary" loading={busy} onClick={() => ref.current?.click()}>
        <Upload aria-hidden className="size-4" /> {label}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </>
  );
}

function Mover({ i, n, move, remove, label }: { i: number; n: number; move: (from: number, to: number) => void; remove: () => void; label: string }) {
  return (
    // preventDefault: inside a <summary>, a click would otherwise also open or close the item.
    <span className="flex shrink-0 gap-1" onClick={(e) => e.preventDefault()}>
      <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${label} up`}>
        <ArrowUp aria-hidden className="size-3.5" />
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={i === n - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${label} down`}>
        <ArrowDown aria-hidden className="size-3.5" />
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={remove} aria-label={`Remove ${label}`}>
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
    </span>
  );
}

function List({ label, note, value, path, onChange, template, top }: FieldProps & { value: Json[]; label: string; note?: string; template?: Json; top: boolean }) {
  const move = (from: number, to: number) => {
    const copy = [...value];
    const [x] = copy.splice(from, 1);
    copy.splice(to, 0, x as Json);
    onChange(path, copy);
  };
  const remove = (i: number) => onChange(path, value.filter((_, j) => j !== i));
  const tpl = value.length ? blank(value[0] as Json) : (template ?? "");
  const item = (v: Json, i: number) => (isObj(v) ? String(v.title ?? v.label ?? v.name ?? v.text ?? `Item ${i + 1}`).slice(0, 60) || `Item ${i + 1}` : `item ${i + 1}`);
  return (
    <section className={cn("flex flex-col gap-3", top && "rounded-panel border border-line bg-surface p-5")}>
      <div>
        <h3 className={cn("font-medium text-ink", top ? "text-md" : "text-sm")}>{label}</h3>
        {note && <p className="mt-0.5 text-sm text-ink-muted">{note}</p>}
      </div>
      {value.length === 0 && <p className="text-sm text-ink-muted">Empty.</p>}
      <ol className="flex flex-col gap-2">
        {value.map((v, i) =>
          isObj(v) ? (
            <li key={i}>
              <details className="rounded-control border border-line">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-base text-ink">
                  <span className="truncate">{item(v, i)}</span>
                  <Mover i={i} n={value.length} move={move} remove={() => remove(i)} label={item(v, i)} />
                </summary>
                <div className="flex flex-col gap-4 border-t border-line p-3">
                  {ordered(v).map(([k, x]) => (
                    <Node key={k} name={k} value={x} path={[...path, i, k]} onChange={onChange} />
                  ))}
                </div>
              </details>
            </li>
          ) : (
            <li key={i} className="flex items-center gap-2">
              <Input aria-label={`${label} ${i + 1}`} value={String(v ?? "")} onChange={(e) => onChange([...path, i], e.target.value)} />
              <Mover i={i} n={value.length} move={move} remove={() => remove(i)} label={`item ${i + 1}`} />
            </li>
          ),
        )}
      </ol>
      <div>
        <Button type="button" size="sm" variant="secondary" onClick={() => onChange(path, [...value, tpl])}>
          <Plus aria-hidden className="size-3.5" /> Add
        </Button>
      </div>
    </section>
  );
}

function SectionOrder({ value, onChange, note }: { value: string[]; onChange: (v: string[]) => void; note?: string }) {
  const missing = Object.keys(HOME_SECTIONS).filter((k) => !value.includes(k));
  const move = (from: number, to: number) => {
    const c = [...value];
    const [x] = c.splice(from, 1);
    c.splice(to, 0, x!);
    onChange(c);
  };
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <h3 className="text-md font-medium text-ink">Sections</h3>
      {note && <p className="mt-0.5 text-sm text-ink-muted">{note}</p>}
      <ol className="mt-3 flex flex-col gap-1.5">
        {value.map((k, i) => (
          <li key={k} className="flex items-center justify-between gap-2 rounded-control border border-line px-3 py-1.5">
            <span className="text-base text-ink">
              <span className="mr-2 font-mono text-sm text-ink-muted">{i + 1}</span>
              {HOME_SECTIONS[k] ?? k}
            </span>
            <Mover i={i} n={value.length} move={move} remove={() => onChange(value.filter((x) => x !== k))} label={HOME_SECTIONS[k] ?? k} />
          </li>
        ))}
      </ol>
      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          Hidden:
          {missing.map((k) => (
            <Button key={k} size="sm" variant="secondary" onClick={() => onChange([...value, k])}>
              <Plus aria-hidden className="size-3.5" /> {HOME_SECTIONS[k]}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
