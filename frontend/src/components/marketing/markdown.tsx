import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeHref } from "@/lib/cms/site-content";

/**
 * Blog post body. Raw HTML in the markdown is not rendered (no rehype-raw),
 * so post content can't inject script. Links outside the site open safely.
 */
export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="prose-talvyn">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) => {
            const h = safeHref(href);
            const external = /^https?:/i.test(h);
            return (
              <a href={h} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {children}
              </a>
            );
          },
          img: (props: ComponentProps<"img">) => (
            // eslint-disable-next-line @next/next/no-img-element -- CMS media; dimensions unknown
            <img src={typeof props.src === "string" ? props.src : undefined} alt={props.alt ?? ""} loading="lazy" />
          ),
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
