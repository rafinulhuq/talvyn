import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownComponents = ComponentProps<typeof ReactMarkdown>["components"];

// Raw HTML in the markdown source is never rendered — react-markdown skips
// it unless rehype-raw is added, which keeps blog content XSS-safe.
// The "article" variant uses larger, Medium-like body typography.
function buildComponents(article: boolean): MarkdownComponents {
  const body = article ? "my-5 text-lg leading-8 text-slate-800" : "my-4 leading-7 text-slate-700";
  const list = article
    ? "my-5 list-disc space-y-2 pl-6 text-lg leading-8 text-slate-800"
    : "my-4 list-disc space-y-1.5 pl-6 text-slate-700";
  return {
  h1: (props) => (
    <h1 className="mt-10 mb-4 text-3xl font-bold tracking-tight text-slate-900" {...props} />
  ),
  h2: (props) => (
    <h2 className="mt-12 mb-4 text-2xl font-bold tracking-tight text-slate-900" {...props} />
  ),
  h3: (props) => (
    <h3 className="mt-8 mb-2 text-xl font-semibold text-slate-900" {...props} />
  ),
  h4: (props) => <h4 className="mt-6 mb-2 text-lg font-semibold text-slate-900" {...props} />,
  p: (props) => <p className={body} {...props} />,
  a: ({ href, ...props }) => (
    <a
      href={href}
      className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
      rel="noopener noreferrer"
      target={href?.startsWith("http") ? "_blank" : undefined}
      {...props}
    />
  ),
  ul: (props) => <ul className={list} {...props} />,
  ol: (props) => <ol className={list.replace("list-disc", "list-decimal")} {...props} />,
  li: (props) => <li className={article ? "leading-8" : "leading-7"} {...props} />,
  blockquote: (props) => (
    <blockquote
      className="my-6 border-l-4 border-brand-200 bg-brand-50/50 px-4 py-2 italic text-slate-600"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.9em] text-slate-800"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="my-6 overflow-x-auto rounded-xl bg-slate-900 p-4 font-mono text-sm text-slate-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-slate-100"
      {...props}
    />
  ),
  hr: () => <hr className="my-8 border-slate-200" />,
  img: (props) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="my-6 max-w-full rounded-xl" alt={props.alt ?? ""} {...props} />
  ),
  table: (props) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border-b-2 border-slate-200 px-3 py-2 text-left font-semibold text-slate-900"
      {...props}
    />
  ),
  td: (props) => <td className="border-b border-slate-100 px-3 py-2 text-slate-700" {...props} />,
  };
}

const defaultComponents = buildComponents(false);
const articleComponents = buildComponents(true);

export function MarkdownContent({
  content,
  variant = "default",
}: {
  content: string;
  variant?: "default" | "article";
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={variant === "article" ? articleComponents : defaultComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
