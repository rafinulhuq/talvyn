/**
 * Generate a job description from a short brief (self-hosted AI).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Sparkles, AlertCircle, Loader2 } from "lucide-react";
import { jdApi, type GenerateJdBrief } from "@/lib/api/jd";

const SENIORITY = ["Intern", "Junior", "Mid-level", "Senior", "Lead", "Principal", "Manager", "Director"];
const TONES = ["Professional", "Friendly", "Concise", "Enthusiastic"];
const LENGTHS = ["Short", "Standard", "Detailed"];

type Phase = "idle" | "submitting" | "drafting" | "error";

const inputCls =
  "block min-h-[40px] w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs";
const labelCls = "mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300";
const hintCls = "mt-1 text-[11px] text-slate-400";

function TagInput({
  id,
  tags,
  setTags,
  placeholder,
}: {
  id: string;
  tags: string[];
  setTags: (t: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !tags.includes(v) && tags.length < 25) setTags([...tags, v]);
    setDraft("");
  };
  return (
    <div className="flex min-h-[42px] flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 shadow-xs">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/50 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
        >
          {t}
          <button
            type="button"
            aria-label={`Remove ${t}`}
            onClick={() => setTags(tags.filter((x) => x !== t))}
            className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-700 dark:text-indigo-300 transition-colors"
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && tags.length) {
            setTags(tags.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={tags.length ? "" : placeholder}
        className="min-w-[120px] flex-1 border-0 bg-transparent py-0.5 text-xs text-slate-900 dark:text-white outline-none placeholder:text-slate-400"
      />
    </div>
  );
}

export function JdGenerateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [seniority, setSeniority] = useState("Senior");
  const [department, setDepartment] = useState("");
  const [experience, setExperience] = useState("");
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [niceToHave, setNiceToHave] = useState<string[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("Standard");

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollStatus = useCallback(
    (jdId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        const res = await jdApi.getStatus(jdId);
        if (!res.success) {
          stopPolling();
          setPhase("error");
          setError(res.error.message || "Failed to check generation status.");
          return;
        }
        const st = res.data.generation_status;
        if (st === "FAILED") {
          stopPolling();
          setPhase("error");
          setError(res.data.error_message || "AI failed to draft the JD. Please try again.");
        } else if (st === "IDLE") {
          stopPolling();
          router.push(`/dashboard/jds/${jdId}`);
        }
      }, 2000);
    },
    [router, stopPolling]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || mustHave.length === 0) return;
    setPhase("submitting");
    setError(null);

    const brief: GenerateJdBrief = {
      title: title.trim(),
      seniority,
      department: department.trim() || undefined,
      experience: experience.trim() || undefined,
      must_have_skills: mustHave,
      nice_to_have_skills: niceToHave.length ? niceToHave : undefined,
      tools: tools.length ? tools : undefined,
      context: context.trim() || undefined,
      tone: tone.toLowerCase() || undefined,
      length: length.toLowerCase() || undefined,
    };

    const res = await jdApi.generate(brief);
    if (!res.success) {
      setPhase("error");
      setError(res.error.message || "Failed to start JD generation.");
      return;
    }

    setPhase("drafting");
    pollStatus(res.data.jd_id);
  };

  const busy = phase === "submitting" || phase === "drafting";
  const canSubmit = title.trim().length > 0 && mustHave.length > 0;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-5">
      <div>
        <label className={labelCls} htmlFor="jd-title">
          Job Title <span className="text-rose-500">*</span>
        </label>
        <input
          id="jd-title"
          className={inputCls}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Senior Backend Engineer"
          required
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
        <div>
          <label className={labelCls} htmlFor="jd-seniority">Seniority</label>
          <select id="jd-seniority" className={inputCls} value={seniority} onChange={(e) => setSeniority(e.target.value)}>
            {SENIORITY.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="jd-department">
            Department <span className="text-slate-400 font-normal">[Optional]</span>
          </label>
          <input
            id="jd-department"
            className={inputCls}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering"
            maxLength={100}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="jd-experience">
            Experience <span className="text-slate-400 font-normal">[Optional]</span>
          </label>
          <input
            id="jd-experience"
            className={inputCls}
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="e.g. 5+ years"
            maxLength={100}
          />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="jd-must-have">
          Must-Have Skills <span className="text-rose-500">*</span>
        </label>
        <TagInput id="jd-must-have" tags={mustHave} setTags={setMustHave} placeholder="Type a skill and press Enter…" />
        <p className={hintCls}>These anchor the JD and the generated test topics.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelCls} htmlFor="jd-nice-to-have">
            Nice-To-Have Skills <span className="text-slate-400 font-normal">[Optional]</span>
          </label>
          <TagInput id="jd-nice-to-have" tags={niceToHave} setTags={setNiceToHave} placeholder="Add…" />
        </div>
        <div>
          <label className={labelCls} htmlFor="jd-tools">
            Tools &amp; Tech <span className="text-slate-400 font-normal">[Optional]</span>
          </label>
          <TagInput id="jd-tools" tags={tools} setTags={setTools} placeholder="Add…" />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="jd-context">
          Company / Context <span className="text-slate-400 font-normal">[Optional]</span>
        </label>
        <textarea
          id="jd-context"
          className={clsx(inputCls, "min-h-[84px] resize-y")}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="A sentence or two about the team, product, or ways of working…"
          maxLength={2000}
        />
        <p className={hintCls}>Context makes the JD specific instead of generic.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
        <div>
          <label className={labelCls} htmlFor="jd-tone">Tone</label>
          <select id="jd-tone" className={inputCls} value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="jd-length">Target Length</label>
          <select id="jd-length" className={inputCls} value={length} onChange={(e) => setLength(e.target.value)}>
            {LENGTHS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <span>[Error] {error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 sm:flex-row sm:items-center sm:pt-5">
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className={clsx(
            "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg px-6 text-xs font-semibold transition-all shadow-xs",
            !canSubmit || busy
              ? "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {phase === "drafting" ? "Generating JD…" : phase === "submitting" ? "Starting…" : "Generate Job Description"}
        </button>
        <span className="text-[11px] text-slate-400 font-medium">
          Runs locally with Ollama · ~15–30s
        </span>
      </div>
    </form>
  );
}
