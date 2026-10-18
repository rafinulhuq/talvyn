import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CmsMediaAsset } from "@/types/cms";

interface Props {
  coverAsset: CmsMediaAsset | null;
  coverUploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => void;
}

export function CoverImageField({ coverAsset, coverUploading, onUpload, onRemove }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ImageIcon className="h-4 w-4 text-slate-400" />
        Cover image
      </h3>
      {coverAsset ? (
        <div className="space-y-2">
          <div className="relative h-32 w-full overflow-hidden rounded-lg">
            <Image
              src={coverAsset.url}
              alt={coverAsset.alt_text ?? ""}
              fill
              sizes="320px"
              className="object-cover"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500 hover:bg-slate-100">
          <ImageIcon className="h-5 w-5 text-slate-400" />
          {coverUploading ? "Uploading…" : "Drag & drop or click to upload"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={coverUploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              await onUpload(file);
            }}
          />
        </label>
      )}
    </section>
  );
}
