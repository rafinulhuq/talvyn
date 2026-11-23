"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import type { ApiResult } from "@/lib/api/client";

type Pending = { count: number; retry: () => Promise<void> };

/**
 * Deletes that hit 409 QUESTIONS_IN_USE ask once before forcing.
 * `run(force)` performs the delete; `onForced` handles the result of the forced retry.
 */
export function useInUseGuard() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  /** Returns the result unless it was a 409 in-use, in which case it opens the confirm and returns null. */
  async function guard<T>(run: (force: boolean) => Promise<ApiResult<T>>, onForced: (r: ApiResult<T>) => void): Promise<ApiResult<T> | null> {
    const res = await run(false);
    if (!res.ok && res.error.code === "QUESTIONS_IN_USE") {
      const ids = res.error.details?.in_use_question_ids;
      setPending({
        count: Array.isArray(ids) ? ids.length : 1,
        retry: async () => {
          setBusy(true);
          const forced = await run(true);
          setBusy(false);
          setPending(null);
          onForced(forced);
        },
      });
      return null;
    }
    return res;
  }

  const dialog = (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
      <DialogContent
        title={pending?.count === 1 ? "A candidate already has this question" : `Candidates already have ${pending?.count ?? 0} of these questions`}
        description="They were given to a candidate in an exam that has started. Deleting removes them from that candidate's record too, and it can't be undone."
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost">Keep them</Button>
            </DialogClose>
            <Button variant="danger" loading={busy} onClick={() => void pending?.retry()}>
              Delete anyway
            </Button>
          </>
        }
      />
    </Dialog>
  );

  return { guard, dialog };
}
