"use client";

import { useRef, useState } from "react";
import { Trash2, Upload, User as UserIcon } from "lucide-react";

import { usersApi } from "@/lib/api/users";
import { Button } from "@/components/ui/Button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Section } from "@/components/admin/settings/SettingsPrimitives";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ProfilePictureSection({
  userId,
  userName,
}: {
  userId: string;
  userName?: string | null;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Image is too large. Maximum size is 5MB.");
      return;
    }

    setIsUploading(true);
    try {
      const result = await usersApi.uploadAvatar(file);

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      // The serving URL is stable per user (avatars/{id}.webp) — bust the
      // browser's cache of it so this page's own avatars reflect the change
      // immediately. Other already-open tabs/pages catch up within the
      // proxy's Cache-Control window.
      setCacheBust((n) => n + 1);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setIsRemoving(true);
    try {
      const result = await usersApi.deleteAvatar();

      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setCacheBust((n) => n + 1);
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Section icon={UserIcon} title="Profile Picture">
      <div className="flex items-center gap-4">
        <UserAvatar
          userId={userId}
          name={userName}
          size={64}
          className="text-base"
          cacheBust={cacheBust || undefined}
        />
        <div className="flex flex-col gap-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Shown next to your name across the dashboard so teammates can
            recognize you at a glance.
          </p>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelected}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={isUploading}
              leftIcon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload picture
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={isRemoving}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={handleRemove}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
    </Section>
  );
}
