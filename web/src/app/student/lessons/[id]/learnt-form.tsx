"use client";

import { useActionState } from "react";
import { markLessonLearnt } from "../../actions";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/forms";

/**
 * Reading status and the learnt toggle. Reading progress ("Read 40%", "Finished reading")
 * comes from the book viewer; "learnt" is the student's own claim, which the teacher
 * can confirm. Finishing the book is a nudge to mark it learnt, not an automatic one.
 */
export function LearntForm({ lessonId, learnt, confirmed, finished, percent, pageCount }: { lessonId: string; learnt: boolean; confirmed: boolean; finished: boolean; percent: number; pageCount: number | null }) {
  const [state, action] = useActionState(markLessonLearnt, undefined);
  const reading = confirmed || learnt ? null : finished ? <Badge tone="green">Finished reading</Badge> : pageCount ? <Badge tone="accent">Read {percent}%</Badge> : null;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="lessonId" value={lessonId} />
        <input type="hidden" name="learnt" value={learnt ? "no" : "yes"} />
        {reading}
        {confirmed ? <Badge tone="green">Confirmed by teacher</Badge> : learnt ? <Badge tone="green">Learnt</Badge> : null}
        {!confirmed && (
          <SubmitButton variant={learnt ? "secondary" : "primary"}>
            {learnt ? "Undo" : "Mark as learnt"}
          </SubmitButton>
        )}
      </form>
      {state?.error && <p className="text-xs font-medium text-rose-600">{state.error}</p>}
      {!learnt && !confirmed && finished && <p className="text-xs text-ink-500">You reached the end. Mark it as learnt when you know it.</p>}
    </div>
  );
}
