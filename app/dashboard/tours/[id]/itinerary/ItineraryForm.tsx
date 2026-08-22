'use client';

import { useActionState, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { Banner, Button, Card, Field, Input, SubmitButton, Textarea } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { InclusionRow, ItineraryDay } from '@/lib/admin/packages';
import { saveItineraryAction } from '../actions';

type Row = { key: number; id: string; title: string; description: string; image: string };

let nextKey = 0;

export default function ItineraryForm({
  packageId,
  itinerary,
  inclusions,
}: {
  packageId: string;
  itinerary: ItineraryDay[];
  inclusions: InclusionRow[];
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveItineraryAction.bind(null, packageId),
    null
  );

  const [days, setDays] = useState<Row[]>(() =>
    itinerary.map((d) => ({
      key: nextKey++,
      id: d.id,
      title: d.title,
      description: d.description ?? '',
      image: d.image ?? '',
    }))
  );

  const included = inclusions.filter((i) => i.kind === 'included').map((i) => i.text).join('\n');
  const excluded = inclusions.filter((i) => i.kind === 'excluded').map((i) => i.text).join('\n');

  // Reordering is a swap rather than drag-and-drop: it works with a keyboard,
  // works on a phone, and the position is renumbered server-side from the
  // order the rows arrive in.
  function move(index: number, delta: number) {
    setDays((rows) => {
      const next = [...rows];
      const target = index + delta;
      if (target < 0 || target >= next.length) return rows;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card
        title="Day by day"
        description="What happens on each day of the trip. Days are numbered from the order here, so moving one renumbers the rest."
      >
        {days.length === 0 && (
          <p className="mb-4 rounded-md bg-secondary p-3 text-[13px] leading-relaxed text-muted-foreground">
            No itinerary yet. A tour cannot be published without one — it is the thing travellers
            actually read before booking.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {days.map((day, i) => (
            <div key={day.key} className="rounded-md border border-border bg-background p-4">
              <input type="hidden" name="day_id" value={day.id} />
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Day {i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp size={15} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button" variant="ghost" aria-label="Move down"
                    disabled={i === days.length - 1} onClick={() => move(i, 1)}
                  >
                    <ChevronDown size={15} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button" variant="ghost" aria-label={`Remove day ${i + 1}`}
                    onClick={() => setDays((rows) => rows.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3">
                <Field label="Title" htmlFor={`day_title_${day.key}`}>
                  <Input
                    id={`day_title_${day.key}`} name="day_title" value={day.title}
                    placeholder="Arrive in Athens"
                    onChange={(e) =>
                      setDays((rows) => rows.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)))
                    }
                  />
                </Field>
                <Field label="Description" htmlFor={`day_description_${day.key}`}>
                  <Textarea
                    id={`day_description_${day.key}`} name="day_description" rows={3} value={day.description}
                    onChange={(e) =>
                      setDays((rows) => rows.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))
                    }
                  />
                </Field>
                <Field label="Image" htmlFor={`day_image_${day.key}`}>
                  <Input
                    id={`day_image_${day.key}`} name="day_image" value={day.image} placeholder="https://…"
                    onChange={(e) =>
                      setDays((rows) => rows.map((r, j) => (j === i ? { ...r, image: e.target.value } : r)))
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button" variant="secondary" className="mt-4"
          onClick={() => setDays((rows) => [...rows, { key: nextKey++, id: '', title: '', description: '', image: '' }])}
        >
          <Plus size={14} aria-hidden="true" />
          Add a day
        </Button>
      </Card>

      <Card
        title="What is and is not included"
        description="One line each. These are the two lists on the tour page, and the second one prevents most of the arguments."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Included" htmlFor="included">
            <Textarea id="included" name="included" rows={8} defaultValue={included}
              placeholder={'All accommodation\nBreakfast daily\nAirport transfers'} />
          </Field>
          <Field label="Not included" htmlFor="excluded">
            <Textarea id="excluded" name="excluded" rows={8} defaultValue={excluded}
              placeholder={'International flights\nTravel insurance\nLunches and dinners'} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <SubmitButton>Save itinerary</SubmitButton>
      </div>
    </form>
  );
}
