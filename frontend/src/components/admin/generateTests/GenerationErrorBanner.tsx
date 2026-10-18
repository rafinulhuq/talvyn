import { AlertCircle, X } from "lucide-react";

interface Props {
  message: string;
  code: string;
  onRetry: () => void;
  onDismiss: () => void;
}

export function GenerationErrorBanner({ message, code, onRetry, onDismiss }: Props) {
  return (
    <div className="flex w-full items-start gap-3 rounded-xl border border-danger/20 bg-danger-light px-4 py-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-danger-dark">
          {code === "AI_SERVICE_UNAVAILABLE"
            ? "Generation service is not reachable"
            : "Test generation failed"}
        </p>
        <p className="mt-0.5 text-xs text-danger-dark/80 line-clamp-2">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRetry}
          className="text-xs font-medium text-danger underline hover:no-underline"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-danger/60 hover:text-danger"
          aria-label="Dismiss generation error"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
