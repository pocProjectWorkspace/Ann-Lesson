"use client";

import { useActionState } from "react";
import { markLessonLearnt } from "../../actions";
import { Badge } from "@/components/ui";
import { SubmitButton } from "@/components/forms";

export function LearntForm({ lessonId, learnt, confirmed }: { lessonId: string; learnt: boolean; confirmed: boolean }) {
  const [state, action] = useActionState(markLessonLearnt, undefined);
  return (
    <div className="flex flex-col items-end gap-1.5">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="lessonId" value={lessonId} />
        <input type="hidden" name="learnt" value={learnt ? "no" : "yes"} />
        {confirmed ? <Badge tone="green">Confirmed by teacher</Badge> : learnt ? <Badge tone="green">Learnt</Badge> : null}
        {!confirmed && (
          <SubmitButton variant={learnt ? "secondary" : "primary"}>
            {learnt ? "Undo" : "Mark as learnt"}
          </SubmitButton>
        )}
      </form>
      {state?.error && <p className="text-xs font-medium text-rose-600">{state.error}</p>}
    </div>
  );
}
