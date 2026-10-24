"use client";

import { useState } from "react";
import {
  Terminal,
  ShieldAlert,
  Trophy,
  CheckCircle2,
  Code2,
  Activity,
  Check,
  X,
} from "lucide-react";

export function Interactive3DCockpit() {
  const [activeMode, setActiveMode] = useState<"eval" | "anticheat" | "code">("eval");

  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Product Window Console */}
      <div
        role="img"
        aria-label="Talvyn live assessment console showing candidate ranking, anti-cheat telemetry, and code sandbox execution"
        className="relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-[#121317] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        {/* Title Bar (44px) */}
        <div className="flex h-11 items-center justify-between border-b border-white/[0.08] px-4">
          <div className="flex items-center gap-6">
            {/* 3 Status Dots */}
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3A3D44]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#3A3D44]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#3A3D44]" />
            </div>

            {/* Tabs flush with bottom edge */}
            <div className="flex items-center gap-5 h-11" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === "eval"}
                onClick={() => setActiveMode("eval")}
                className={`relative flex h-full items-center gap-1.5 text-[13px] transition-colors ${
                  activeMode === "eval"
                    ? "font-medium text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#F2D74E]"
                    : "text-[#8A8F98] hover:text-white"
                }`}
              >
                <Trophy className="h-3.5 w-3.5" />
                <span>Ranking HUD</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeMode === "anticheat"}
                onClick={() => setActiveMode("anticheat")}
                className={`relative flex h-full items-center gap-1.5 text-[13px] transition-colors ${
                  activeMode === "anticheat"
                    ? "font-medium text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#F2D74E]"
                    : "text-[#8A8F98] hover:text-white"
                }`}
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>Telemetry Audit</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeMode === "code"}
                onClick={() => setActiveMode("code")}
                className={`relative flex h-full items-center gap-1.5 text-[13px] transition-colors ${
                  activeMode === "code"
                    ? "font-medium text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#F2D74E]"
                    : "text-[#8A8F98] hover:text-white"
                }`}
              >
                <Code2 className="h-3.5 w-3.5" />
                <span>Code Sandbox</span>
              </button>
            </div>
          </div>

          {/* Live Telemetry Indicator */}
          <div className="flex items-center gap-2 font-mono text-[12px] text-[#4ADE80]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
            <span>Telemetry Live</span>
          </div>
        </div>

        {/* ── MODE 1: EVALUATION RANKING HUD ── */}
        {activeMode === "eval" && (
          <div className="p-6 sm:p-7 space-y-3 bg-[#121317]">
            {/* Candidate Tier 1 - Hire */}
            <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#F2D74E] text-[#1A1600] font-bold text-xs">
                    01
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[15px] font-semibold text-white">
                        Sarah Chen
                      </span>
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] text-[#F2D74E]">
                        Strong Hire · 96.4%
                      </span>
                      <span className="text-[11px] font-mono text-[#4ADE80] flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 inline" /> Authentic Cadence
                      </span>
                    </div>
                    <p className="text-[13px] text-[#8A8F98] mt-1 leading-relaxed">
                      Implemented Redis stream consumer groups with PostgreSQL advisory locks and idempotency hash tokens. Zero synthetic GPT syntax.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  <span className="font-mono text-2xl font-bold text-white tabular-nums">96.4%</span>
                  <span className="text-[11px] uppercase tracking-[0.08em] text-[#5A5F68]">Calibrated Fit</span>
                </div>
              </div>

              {/* Vector breakdown */}
              <div className="mt-4 pt-3.5 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#5A5F68]">Algorithmic Execution</span>
                  <div className="mt-1.5 h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full bg-[#F2D74E] rounded-full" style={{ width: "98%" }} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#5A5F68]">System Architecture</span>
                  <div className="mt-1.5 h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full bg-[#F2D74E] rounded-full" style={{ width: "94%" }} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#5A5F68]">Lock Contention Safety</span>
                  <div className="mt-1.5 h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full bg-[#F2D74E] rounded-full" style={{ width: "92%" }} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[#5A5F68]">Integrity Score</span>
                  <div className="mt-1.5 h-1.5 w-full bg-white/[0.05] rounded-full overflow-hidden">
                    <div className="h-full bg-[#4ADE80] rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Tier 2 */}
            <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F]/60 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.05] text-[#8A8F98] font-bold text-xs">
                    02
                  </div>
                  <div>
                    <span className="text-[14px] font-semibold text-white">Michael Thorne</span>
                    <span className="ml-2 rounded-full border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-[#8A8F98]">
                      Hire · 89.2%
                    </span>
                    <p className="text-[12px] text-[#8A8F98] mt-0.5">Diagnosed Next.js App Router hydration mismatch using useSyncExternalStore proxy.</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-base font-semibold text-white tabular-nums">89.2%</span>
                </div>
              </div>
            </div>

            {/* Candidate Tier 3 - Flagged */}
            <div className="rounded-[10px] border border-[#F87171]/20 bg-[#F87171]/[0.04] p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[#F87171]/20 text-[#F87171] font-bold text-xs">
                    03
                  </div>
                  <div>
                    <span className="text-[14px] font-semibold text-white">Candidate #4128</span>
                    <span className="ml-2 rounded-full bg-[#F87171]/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#F87171]">
                      Disqualified · Cheating Detected
                    </span>
                    <p className="text-[12px] text-[#8A8F98] mt-0.5">
                      14 instant clipboard paste events detected within 4 seconds of challenge render.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-semibold text-[#F87171]">Flagged</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODE 2: ANTI-CHEAT TELEMETRY AUDIT ── */}
        {activeMode === "anticheat" && (
          <div className="p-6 sm:p-7 space-y-4 bg-[#121317]">
            <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] uppercase tracking-[0.08em] text-[#5A5F68]">Keystroke Cadence Analysis</span>
                <span className="font-mono text-[11px] text-[#4ADE80]">Entropy: 0.88 (Human)</span>
              </div>
              <div className="mt-3 flex items-end gap-1 h-14">
                {[45, 62, 55, 78, 65, 82, 40, 90, 85, 70, 60, 75, 88, 92, 50, 68, 74, 80, 85, 95].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-[#F2D74E]/70 rounded-[1px] hover:bg-[#F2D74E] transition-colors"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-3.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#5A5F68] block">Window Blur Events</span>
                <span className="font-mono text-xl font-bold text-white mt-1 block">0</span>
                <span className="text-[11px] text-[#4ADE80] font-mono">100% Focused</span>
              </div>
              <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-3.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#5A5F68] block">Paste Anomaly Ratio</span>
                <span className="font-mono text-xl font-bold text-white mt-1 block">0.02</span>
                <span className="text-[11px] text-[#4ADE80] font-mono">Clean Baseline</span>
              </div>
              <div className="rounded-[10px] border border-white/[0.08] bg-[#181A1F] p-3.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-[#5A5F68] block">AI Hallucination Vector</span>
                <span className="font-mono text-xl font-bold text-white mt-1 block">&lt;0.01</span>
                <span className="text-[11px] text-[#4ADE80] font-mono">Authentic</span>
              </div>
            </div>
          </div>
        )}

        {/* ── MODE 3: CODE SANDBOX ── */}
        {activeMode === "code" && (
          <div className="p-6 sm:p-7 space-y-4 bg-[#121317]">
            <div className="rounded-[10px] border border-white/[0.08] bg-[#0B0C0E] p-4 font-mono text-[12px] text-white">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] text-[#5A5F68] text-[11px]">
                <span>solution.go · Go 1.23</span>
                <span className="text-[#4ADE80]">Compiled: 42ms</span>
              </div>
              <pre className="mt-3 text-white overflow-x-auto leading-relaxed">
{`func (q *Queue) ProcessBatch(ctx context.Context, batch []Job) error {
    lockKey := fmt.Sprintf("lock:batch:%s", q.ID)
    ok, err := q.redis.SetNX(ctx, lockKey, 1, 10*time.Second).Result()
    if err != nil || !ok {
        return ErrLockContention
    }
    defer q.redis.Del(ctx, lockKey)
    return q.worker.Execute(ctx, batch)
}`}
              </pre>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
              <div className="rounded-[8px] bg-[#181A1F] border border-white/[0.06] p-2.5 flex items-center justify-between">
                <span className="text-[#8A8F98]">Unit Tests</span>
                <span className="text-[#4ADE80] flex items-center gap-1"><Check className="h-3 w-3" /> 18/18</span>
              </div>
              <div className="rounded-[8px] bg-[#181A1F] border border-white/[0.06] p-2.5 flex items-center justify-between">
                <span className="text-[#8A8F98]">Race Detector</span>
                <span className="text-[#4ADE80] flex items-center gap-1"><Check className="h-3 w-3" /> 0 Races</span>
              </div>
              <div className="rounded-[8px] bg-[#181A1F] border border-white/[0.06] p-2.5 flex items-center justify-between">
                <span className="text-[#8A8F98]">Time/op</span>
                <span className="text-white">312 ns</span>
              </div>
              <div className="rounded-[8px] bg-[#181A1F] border border-white/[0.06] p-2.5 flex items-center justify-between">
                <span className="text-[#8A8F98]">Alloc/op</span>
                <span className="text-white">0 B</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
