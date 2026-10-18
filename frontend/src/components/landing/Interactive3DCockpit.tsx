"use client";

import { useState } from "react";
import {
  Terminal,
  ShieldAlert,
  Cpu,
  Trophy,
  CheckCircle2,
  Code2,
  Activity,
  ArrowUpRight,
  Eye,
  Radio,
} from "lucide-react";

export function Interactive3DCockpit() {
  const [activeMode, setActiveMode] = useState<"eval" | "anticheat" | "code">("eval");

  return (
    <div
      style={{ perspective: 1400 }}
      className="relative mx-auto w-full max-w-5xl transition-transform duration-300"
    >
      {/* 3D Depth Canvas Layer */}
      <div
        style={{
          transformStyle: "preserve-3d",
        }}
        className="relative overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl ring-1 ring-slate-900/5 dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Terminal Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-300 bg-slate-50/70 px-5 py-3.5 gap-2 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="text-xs tracking-wide text-slate-700 font-semibold flex items-center gap-1.5 dark:text-slate-300">
              <Terminal className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              Talvyn Telemetry &bull; Live Cockpit
            </span>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-300/90 bg-slate-100 p-0.5 text-xs font-medium dark:border-slate-800 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveMode("eval")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                activeMode === "eval"
                  ? "bg-white text-indigo-600 font-semibold shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Trophy className="h-3.5 w-3.5" />
              <span>Ranking HUD</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("anticheat")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                activeMode === "anticheat"
                  ? "bg-white text-indigo-600 font-semibold shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Integrity Telemetry</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("code")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
                activeMode === "code"
                  ? "bg-white text-indigo-600 font-semibold shadow-xs dark:bg-slate-900 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Code Sandbox</span>
            </button>
          </div>
        </div>

        {/* ── MODE 1: EVALUATION RANKING HUD ── */}
        {activeMode === "eval" && (
          <div className="p-6 sm:p-8 space-y-4 bg-white dark:bg-slate-900">
            {/* Candidate Tier 1 */}
            <div className="relative rounded-xl border border-indigo-300 bg-indigo-50/20 p-5 shadow-xs transition hover:border-indigo-400 dark:border-indigo-900/50 dark:bg-indigo-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs">
                    01
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-slate-900 tracking-tight dark:text-white">
                        Sarah Johnson
                      </span>
                      <span className="rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
                        Strong Hire &bull; 96.4%
                      </span>
                      <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5 inline" /> Authentic Keystrokes
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 font-normal leading-relaxed dark:text-slate-300">
                      Synthesized 30% CAC reduction across performance marketing channels with complete formula attribution.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:flex-col sm:items-end">
                  <span className="text-2xl font-bold text-slate-900 tracking-tight dark:text-white">96.4%</span>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Calibrated Fit</span>
                </div>
              </div>

              {/* Skill vector breakdown bars */}
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Algorithmic Thinking</span>
                  <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: "98%" }} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">System Architecture</span>
                  <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: "94%" }} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Code Readability</span>
                  <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: "92%" }} />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Integrity Confidence</span>
                  <div className="mt-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Candidate Tier 2 */}
            <div className="relative rounded-xl border border-slate-300 bg-slate-50/50 p-4 shadow-xs transition hover:bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-850 dark:hover:bg-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-bold text-xs dark:bg-slate-800 dark:text-slate-300">
                    02
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">David Chen</span>
                    <span className="ml-2 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Hire &bull; 89.2%
                    </span>
                    <p className="text-xs text-slate-600 font-normal mt-0.5 dark:text-slate-300">Solid SQL optimization; slight edge case omissions in concurrency.</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-slate-900 dark:text-white">89.2%</span>
                </div>
              </div>
            </div>

            {/* Candidate Tier 3 - Flagged */}
            <div className="relative rounded-xl border border-rose-300 bg-rose-50/40 p-4 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700 font-bold text-xs dark:bg-rose-950/50 dark:text-rose-400">
                    03
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Alex Rivera</span>
                    <span className="ml-2 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300">
                      Disqualified &bull; Cheating Detected
                    </span>
                    <p className="text-xs text-rose-700 font-normal mt-0.5 dark:text-rose-300">
                      14 instant clipboard paste events detected within 4 seconds of question render.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-rose-600 dark:text-rose-400">Flagged</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODE 2: ANTI-CHEAT TELEMETRY AUDIT ── */}
        {activeMode === "anticheat" && (
          <div className="p-6 sm:p-8 space-y-5 bg-white dark:bg-slate-900">
            <div className="rounded-xl border border-slate-300 bg-slate-50/60 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 flex items-center gap-2 dark:text-white">
                  <Radio className="h-4 w-4 text-indigo-600 animate-pulse dark:text-indigo-400" />
                  Real-Time Proctoring Radar &bull; Sensor Stream
                </span>
                <span className="text-[10px] text-slate-500 font-medium dark:text-slate-400">Latency: 0.8ms</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed font-normal dark:text-slate-300">
                Passive sensor telemetry capturing inter-keystroke flight intervals, focus blurring, DevTools DOM inspector triggers, and multi-monitor clipboard leaks without invasive webcam surveillance.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider dark:text-slate-400">Sensor: Cadence</span>
                <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">142 WPM</p>
                <p className="mt-1 text-xs text-slate-500 font-normal dark:text-slate-400">Normal gaussian variance</p>
                <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                  <div className="h-full bg-indigo-600 rounded-full" style={{ width: "88%" }} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider dark:text-slate-400">Sensor: Tab Focus</span>
                <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">0 Blurs</p>
                <p className="mt-1 text-xs text-slate-500 font-normal dark:text-slate-400">Session locked to exam viewport</p>
                <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider dark:text-slate-400">Sensor: Clipboard</span>
                <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">0 External</p>
                <p className="mt-1 text-xs text-slate-500 font-normal dark:text-slate-400">Zero GPT paste injections</p>
                <div className="mt-3 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MODE 3: CODE RUNNER & SANDBOX ── */}
        {activeMode === "code" && (
          <div className="p-6 sm:p-8 space-y-4 bg-white dark:bg-slate-900">
            <div className="rounded-xl border border-slate-800 bg-slate-950 text-slate-100 p-4 shadow-xs font-mono">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-indigo-400" />
                  solution_test.go &bull; Isolated WASM Sandbox
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold">Go 1.23 &bull; Pass</span>
              </div>
              <pre className="text-xs text-slate-300 leading-relaxed overflow-x-auto">
{`func DeduplicateStream(in <-chan Event) <-chan Event {
    out := make(chan Event)
    go func() {
        defer close(out)
        seen := make(map[string]struct{})
        for evt := range in {
            if _, exists := seen[evt.ID]; !exists {
                seen[evt.ID] = struct{}{}
                out <- evt
            }
        }
    }()
    return out
}`}
              </pre>
            </div>

            {/* Test outputs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl border border-slate-300 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Test Case 1</span>
                <p className="text-emerald-600 font-semibold mt-0.5 dark:text-emerald-400">Pass (0.2ms)</p>
              </div>
              <div className="rounded-xl border border-slate-300 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Test Case 2</span>
                <p className="text-emerald-600 font-semibold mt-0.5 dark:text-emerald-400">Pass (0.4ms)</p>
              </div>
              <div className="rounded-xl border border-slate-300 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Memory Profile</span>
                <p className="text-slate-900 font-semibold mt-0.5 dark:text-white">2.4 MB</p>
              </div>
              <div className="rounded-xl border border-slate-300 bg-white p-3 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider dark:text-slate-400">Code Fit</span>
                <p className="text-indigo-600 font-semibold mt-0.5 dark:text-indigo-400">Optimal</p>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Status Ticker */}
        <div className="border-t border-slate-300 bg-slate-50/70 px-5 py-2.5 flex items-center justify-between text-xs text-slate-500 font-medium dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
          <span className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            Engine: Active &bull; 100% Passive Integrity
          </span>
          <span>Talvyn Architecture System</span>
        </div>
      </div>
    </div>
  );
}
