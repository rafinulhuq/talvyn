import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
    <section id="blog" className="mt-28">
      <div className="mx-auto max-w-[1160px] px-5 sm:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-14 gap-6">
          <div>
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[#F2D74E] block mb-3">
              {content.eyebrow || "Technical Dispatches & Research"}
            </span>
            <h2 className="text-[clamp(30px,4vw,44px)] font-[650] tracking-[-0.035em] text-white">
              {content.title || "Latest From Our"}{" "}
              <span className="text-[#F2D74E]">{content.highlight || "Engineering Log"}</span>
            </h2>
            <p className="mt-3 text-[16px] text-[#8A8F98] max-w-2xl leading-relaxed">
              {content.body || "Technical analysis on cheating counter-measures, rubric calibration, and engineering assessment design."}
            </p>
          </div>

          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-[10px] border border-white/12 bg-transparent px-4 py-2 text-xs font-semibold text-white hover:border-white/24 transition-colors shrink-0"
          >
            <span>View All Dispatches</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {hasPosts ? (
            posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 flex flex-col justify-between transition-colors hover:border-white/[0.18]"
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[11px] text-[#5A5F68] mb-3">
                    <span className="text-[#F2D74E] uppercase">{post.tags[0] || "ARTICLE"}</span>
                    <span>{post.reading_minutes || 5} MIN READ</span>
                  </div>
                  <h3 className="text-[16px] font-semibold text-white mb-2 leading-snug group-hover:text-[#F2D74E] transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-[13px] text-[#8A8F98] leading-relaxed line-clamp-3">
                    {post.excerpt}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-[#8A8F98]">
                  <span>{post.published_at ? new Date(post.published_at).toLocaleDateString() : "RECENT"}</span>
                  <span className="text-[#F2D74E] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Read <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            ))
          ) : (
            fallbackBlogPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group rounded-[14px] border border-white/[0.08] bg-[#121317] p-6 flex flex-col justify-between transition-colors hover:border-white/[0.18]"
              >
                <div>
                  <div className="flex items-center justify-between font-mono text-[11px] text-[#5A5F68] mb-3">
                    <span className="text-[#F2D74E] uppercase">{post.tag}</span>
                    <span>{post.readingMinutes} MIN READ</span>
                  </div>
                  <h3 className="text-[16px] font-semibold text-white mb-2 leading-snug group-hover:text-[#F2D74E] transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-[13px] text-[#8A8F98] leading-relaxed line-clamp-3">
                    {post.excerpt}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono text-[#8A8F98]">
                  <span>{post.date}</span>
                  <span className="text-[#F2D74E] flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Read <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
