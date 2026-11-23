"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { api } from "@/lib/api/client";
import { LENGTHS, SENIORITY, TONES } from "@/lib/domain/jd";

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function BriefForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [seniority, setSeniority] = useState("Senior");
  const [department, setDepartment] = useState("");
  const [experience, setExperience] = useState("");
  const [must, setMust] = useState<string[]>([]);
  const [nice, setNice] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("Standard");
  const [errors, setErrors] = useState<{ title?: string; must?: string }>({});
  const [failure, setFailure] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = {
      title: title.trim().length < 2 ? "Enter the role title." : undefined,
      must: must.length === 0 ? "Add at least one must-have skill." : undefined,
    };
    setErrors(errs);
    if (errs.title || errs.must) return;
    setFailure(undefined);
    setLoading(true);
    const res = await api<{ jd_id: string }>("/api/jd/generate", {
      base: "",
      method: "POST",
      body: { title: title.trim(), seniority, department, experience, must_have_skills: must, nice_to_have_skills: nice, tools, context, tone, length },
    });
    if (!res.ok) {
      setLoading(false);
      return setFailure(res.error.message);
    }
    router.push(`/dashboard/jds/${res.data.jd_id}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {failure && <Alert tone="danger" title="Couldn't start writing">{failure}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Role title" error={errors.title}>
          <Input value={title} onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors((x) => ({ ...x, title: undefined })); }} placeholder="Senior Backend Engineer" maxLength={200} />
        </Field>
        <Choice label="Seniority" value={seniority} onChange={setSeniority} options={SENIORITY} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Team or department" optional>
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Payments platform" maxLength={200} />
        </Field>
        <Field label="Experience" optional>
          <Input value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="5+ years" maxLength={100} />
        </Field>
      </div>
      <Field label="Must-have skills" hint="Press Enter or comma after each skill." error={errors.must}>
        <TagInput value={must} onChange={(v) => { setMust(v); if (errors.must && v.length) setErrors((x) => ({ ...x, must: undefined })); }} placeholder="Go, PostgreSQL, distributed systems" invalid={!!errors.must} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nice-to-have skills" optional>
          <TagInput value={nice} onChange={setNice} />
        </Field>
        <Field label="Tools" optional>
          <TagInput value={tools} onChange={setTools} placeholder="Kafka, Terraform" />
        </Field>
      </div>
      <Field label="Anything else the description should say" optional hint="Mission, team setup, location or benefits. Up to 2,000 characters.">
        <Textarea value={context} onChange={(e) => setContext(e.target.value)} maxLength={2000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Choice label="Tone" value={tone} onChange={setTone} options={TONES} />
        <Choice label="Length" value={length} onChange={setLength} options={LENGTHS} />
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-sm text-ink-muted">Writing runs on your self-hosted model and takes a minute or two.</p>
        <Button type="submit" variant="primary" loading={loading}>
          {loading ? "Starting" : "Write job description"}
        </Button>
      </div>
    </form>
  );
}
