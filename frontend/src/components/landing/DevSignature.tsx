"use client";

import { useEffect, useRef } from "react";
// lucide-react 1.x dropped brand glyphs (no Github/Linkedin icons) — using
// generic equivalents instead.
import { Code2, Briefcase, Globe, Mail, X } from "lucide-react";

const LINKS = [
  { label: "Portfolio", href: "https://www.rafinulhuq.com", icon: Globe },
  { label: "GitHub", href: "https://github.com/rafinulhuq", icon: Code2 },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/rafinulhuq", icon: Briefcase },
  { label: "Email", href: "mailto:amrh.cse@gmail.com", icon: Mail },
];

export function DevSignature({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Developer info"
      className="open:flex m-0 h-full max-h-full w-full max-w-full items-center justify-center border-0 bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-md"
    >
      <div className="relative mx-4 w-full max-w-xs max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-6 text-center shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-white/50 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-accent-600 to-accent-500 text-lg font-bold text-white">
          RH
        </div>
        <p className="text-base font-bold text-slate-900">A. M. Rafinul Huq</p>
        <p className="mb-4 text-sm text-slate-500">Software Engineer</p>

        <div className="flex flex-col gap-1.5">
          {LINKS.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith("mailto:") ? undefined : "_blank"}
              rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-brand-700"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </dialog>
  );
}
