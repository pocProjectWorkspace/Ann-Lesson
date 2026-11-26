"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiveRoom } from "./use-live-room";
import { Flipbook, type Narration, type ReadingTrack } from "@/components/flipbook";
import { ActivityPad } from "./activity-pad";

/**
 * A student's book that follows the teacher's board when "follow" is on: it turns to the
 * board's page, and if the board is on a different lesson it takes the student there.
 * The student's own page is reported to the room so the teacher sees the class pulse.
 */
/** Where to send the student when the board moves to another book: a template with {lessonId} and {fileId}. */
const fill = (template: string, lessonId: string, fileId: string) => template.replace("{lessonId}", lessonId).replace("{fileId}", fileId);

export function FollowingBook({ classId, lessonId, fileId, src, title, watermark, track, token, hrefTemplate, narration }: { classId: string; lessonId: string; fileId: string; src: string; title: string; watermark?: string; track?: ReadingTrack; token?: string; hrefTemplate: string; narration?: Narration }) {
  const router = useRouter();
  const { state, send, submissions } = useLiveRoom(classId, { token });
  const activity = state?.activity ?? null;
  const mine = activity ? submissions.find((s) => s.studentId === myId(submissions)) : null;
  const lastHere = useRef(0);

  // Teacher moved to another book while following: go there.
  useEffect(() => {
    if (state?.follow && (state.lessonId !== lessonId || state.fileId !== fileId)) router.replace(fill(hrefTemplate, state.lessonId, state.fileId));
  }, [state, lessonId, fileId, router, hrefTemplate]);

  const following = !!state?.follow && state.lessonId === lessonId && state.fileId === fileId;
  const activitySrc = activity ? src.replace(fileId, activity.fileId) : src;
  return (
    <div className="space-y-2">
      {activity && <ActivityPad key={activity.id} activity={activity} src={activitySrc} initialStrokes={mine?.strokes ?? []} send={send} />}
      {state && (
        <p className={`rounded-lg px-3.5 py-2 text-sm font-medium ${following ? "bg-leaf-100 text-leaf-600" : "bg-ink-100/70 text-ink-700"}`} role="status">
          {following ? `Following your teacher: page ${state.page}` : state.follow ? "Your teacher is reading another book; taking you there…" : "Your teacher's board is on. You are reading on your own."}
        </p>
      )}
      <Flipbook
        src={src}
        title={title}
        watermark={watermark}
        track={track}
        narration={narration}
        followPage={following ? state!.page : null}
        onPage={(page) => {
          const now = Date.now();
          if (now - lastHere.current < 1500) return;
          lastHere.current = now;
          send({ type: "here", page }).catch(() => {});
        }}
      />
    </div>
  );
}

/** A student only ever receives their own submission, so the first one is theirs. */
function myId(submissions: { studentId: string }[]) {
  return submissions[0]?.studentId ?? "";
}
