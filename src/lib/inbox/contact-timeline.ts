import type { ContactNote } from '@/types';
import type { UauAttendance } from '@/lib/uau/finance-types';
export type ContactTimelineItem =
  | { key: string; date: string; origin: 'internal'; note: ContactNote }
  | { key: string; date: string; origin: 'uau'; attendance: UauAttendance };

export function contactTimeline(
  notes: ContactNote[],
  attendances: UauAttendance[]
): ContactTimelineItem[] {
  return [
    ...notes.map((note) => ({
      key: `note:${note.id}`,
      date: note.created_at,
      origin: 'internal' as const,
      note,
    })),
    ...attendances.map((attendance) => ({
      key: `uau:${attendance.id}`,
      date: attendance.createdAt,
      origin: 'uau' as const,
      attendance,
    })),
  ].sort(
    (a, b) =>
      Date.parse(b.date) - Date.parse(a.date) || a.key.localeCompare(b.key)
  );
}
