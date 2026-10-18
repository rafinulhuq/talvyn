import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";
import { TiltBlock } from "@/components/ui/TiltBlock";
import type { HomeContent } from "@/lib/cms/content";
import type { PublicBlogPostSummary } from "@/types/cms";

const fallbackBlogPosts = [
  {
    slug: "the-death-of-the-technical-phone-screen",
    title: "The Death of the Technical Phone Screen: Why Asynchronous Real-World Simulations Win",
    excerpt:
      "Introductory phone screens cost engineering teams hundreds of unproductive hours and introduce massive interviewer bias. Here is the operational blueprint for replacing low-signal chatter with high-fidelity async simulations.",
    tag: "HIRING_STRATEGY",
    date: "OCT 15, 2026",
    readingMinutes: 6,
  },
  {
    slug: "detecting-synthetic-reasoning-keystroke-telemetry",
    title: "Detecting Synthetic Reasoning: How Behavioral Keystroke Dynamics Counter LLM Exploits",
    excerpt:
      "When candidates can feed prompts to frontier AI models, take-home tests collapse. Discover how sub-second keystroke latency and burstiness analysis distinguish human problem-solving from copy-pasted LLM outputs.",
    tag: "ANTI_CHEAT_ENG",
    date: "OCT 10, 2026",
    readingMinutes: 8,
  },
  {
    slug: "beyond-leetcode-assessing-system-judgment",
    title: "Beyond LeetCode: Assessing Distributed Systems Judgment and Operational Trade-Offs",
    excerpt:
      "Inverting binary trees does not tell you if an engineer can triage a cascading Redis failure or design an idempotent payment ledger. Here is how leading teams benchmark senior systems judgment.",
    tag: "DISTRIBUTED_SYSTEMS",
    date: "OCT 04, 2026",
    readingMinutes: 7,
  },
];

export function BlogTeaserSection({
  content,
  posts,
}: {
  content: HomeContent["blog"];
  posts: PublicBlogPostSummary[];
}) {
  const hasPosts = posts && posts.length > 0;

  return (
    <section id="blog" className="border-b border-slate-300 bg-slate-50/50 py-24 font-sans text-slate-900 scroll-mt-20 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-16 gap-6">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              {content.eyebrow || "Technical Dispatches & Research"}
            </p>
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl dark:text-white">
              {content.title || "Latest From Our"}{" "}
              <span className="text-indigo-600 dark:text-indigo-400">{content.highlight || "Engineering Log"}</span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 max-w-2xl font-normal leading-relaxed dark:text-slate-300">
              {content.body ||
                "Deep dives on candidate verification telemetry, AI code evaluation heuristics, and automated screening pipelines."}
            </p>
          </div>
          
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:bg-indigo-700 active:scale-95 transition-all shrink-0"
          >
            <span>{content.ctaLabel || "View All Posts"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Articles Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {hasPosts
            ? posts.slice(0, 3).map((post, idx) => (
                <Link key={post.slug} href={`/blog/${post.slug}`} className="block h-full group">
                  <TiltBlock
                    tag={`Dispatch 0${idx + 1}`}
                    className="flex flex-col justify-between h-full"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4 text-xs font-medium">
                        <span className="rounded-full border border-indigo-300 bg-indigo-50/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
                          {post.tags[0] || "Research"}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{post.reading_minutes} min read</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 dark:text-white dark:group-hover:text-indigo-400">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mt-3 text-xs leading-relaxed text-slate-600 font-normal line-clamp-3 dark:text-slate-300">
                          {post.excerpt}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 font-medium dark:text-slate-400">
                      <span>{post.author_name || "Talvyn"}</span>
                      <span className="flex items-center gap-1 font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform dark:text-indigo-400">
                        Read <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </TiltBlock>
                </Link>
              ))
            : fallbackBlogPosts.map((post, idx) => (
                <Link key={post.slug} href={`/blog/${post.slug}`} className="block h-full group">
                  <TiltBlock
                    tag={`Dispatch 0${idx + 1}`}
                    className="flex flex-col justify-between h-full"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4 text-xs font-medium">
                        <span className="rounded-full border border-indigo-300 bg-indigo-50/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-300">
                          {post.tag}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">{post.readingMinutes} min read</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 dark:text-white dark:group-hover:text-indigo-400">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="mt-3 text-xs leading-relaxed text-slate-600 font-normal line-clamp-3 dark:text-slate-300">
                          {post.excerpt}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 font-medium dark:text-slate-400">
                      <span>{post.date}</span>
                      <span className="flex items-center gap-1 font-semibold text-indigo-600 group-hover:translate-x-1 transition-transform dark:text-indigo-400">
                        Read <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </TiltBlock>
                </Link>
              ))}
        </div>

      </div>
    </section>
  );
}
