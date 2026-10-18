export function FieldBlock({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {htmlFor ? (
        <label
          htmlFor={htmlFor}
          className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
        >
          {label}
        </label>
      ) : (
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}
