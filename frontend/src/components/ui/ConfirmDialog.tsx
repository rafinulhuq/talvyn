"use client";

import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./Button";

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  variant?: "danger" | "primary";
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Confirm",
  confirmingLabel,
  cancelLabel = "Cancel",
  isConfirming = false,
  variant = "danger",
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    cancelButtonRef.current?.focus();
    return () => dialog.close();
  }, []);

  const onDialogCancel = useEffectEvent((event: Event) => {
    event.preventDefault();
    if (!isConfirming) onCancel();
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener("cancel", onDialogCancel);
    return () => dialog.removeEventListener("cancel", onDialogCancel);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="open:flex m-0 h-full max-h-full w-full max-w-full items-center justify-center border-0 bg-transparent p-0 backdrop:bg-[#0B0C0E]/75 backdrop:backdrop-blur-sm backdrop:animate-fade-backdrop motion-reduce:backdrop:animate-none"
    >
      <div className="mx-4 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-[#121317] p-6 shadow-2xl animate-fade-in motion-reduce:animate-none text-white">
        {/* Icon */}
        <div
          className={clsx(
            "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl",
            variant === "danger"
              ? "bg-[#F87171]/10 border border-[#F87171]/30 text-[#F87171]"
              : "bg-[#181A1F] border border-white/5 text-[#F2D74E]"
          )}
        >
          {icon ?? (
            <AlertTriangle className="h-6 w-6" />
          )}
        </div>

        {/* Title */}
        <h2 id={titleId} className="text-center font-display text-lg font-semibold text-white">
          {title}
        </h2>

        {/* Body */}
        <div id={descriptionId} className="mt-2 text-center text-sm leading-relaxed text-white/80">
          {description}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2.5">
          <Button
            ref={cancelButtonRef}
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            className="flex-1"
            onClick={onConfirm}
            disabled={isConfirming}
            leftIcon={
              isConfirming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : undefined
            }
          >
            {isConfirming ? confirmingLabel ?? `${confirmLabel}…` : confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
