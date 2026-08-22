'use client';

import { useActionState, useState, useTransition } from 'react';
import { CalendarPlus, Trash2 } from 'lucide-react';
import { Badge, Banner, Button, Card, Field, Input, SubmitButton, Table } from '@/components/ui';
import { formatDepartureDate } from '@/lib/money';
import type { ActionResult } from '@/lib/actions';
import type { DepartureRow } from '@/lib/admin/departures';
import { expandRecurrence } from '@/lib/admin/departures';
import { deleteDepartureAction, generateDeparturesAction, saveDeparturesAction } from './actions';

const money = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function DeparturesForm({
  packageId,
  departures,
  currency,
  defaultCapacity,
}: {
  packageId: string;
  departures: DepartureRow[];
  currency: string;
  defaultCapacity: number;
}) {
  const [genState, generate] = useActionState<ActionResult | null, FormData>(
    generateDeparturesAction.bind(null, packageId),
    null
  );
  const [editState, save] = useActionState<ActionResult | null, FormData>(
    saveDeparturesAction.bind(null, packageId),
    null
  );

  return (
    <div className="flex flex-col gap-5">
      <Generator state={genState} action={generate} defaultCapacity={defaultCapacity} />

      {editState?.ok && <Banner tone="success">{editState.message}</Banner>}
      {editState && !editState.ok && <Banner tone="error">{editState.message}</Banner>}

      {departures.length === 0 ? (
        <Card title="No departures yet">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            A tour with no departures has nothing to sell. Generate a season above, and adjust
            individual dates afterwards.
          </p>
        </Card>
      ) : (
        <form action={save}>
          <Card
            title={`${departures.length} ${departures.length === 1 ? 'departure' : 'departures'}`}
            description="Booked and held seats are moved by the booking flow, not from here — they are shown so capacity is never set below what is already committed."
          >
            <Table head={['Date', 'Capacity', 'Booked', 'Held', 'Left', 'Adult price', 'Child price', 'Status', '']}>
              {departures.map((d) => (
                <DepartureRowFields
                  key={d.id}
                  packageId={packageId}
                  departure={d}
                  currency={currency}
                />
              ))}
            </Table>
            <div className="mt-4 flex justify-end">
              <SubmitButton>Save changes</SubmitButton>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}

function Generator({
  state,
  action,
  defaultCapacity,
}: {
  state: ActionResult | null;
  action: (form: FormData) => void;
  defaultCapacity: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [everyDays, setEveryDays] = useState(7);

  // Show what is about to be created before creating it. Generating a season
  // and discovering the pattern was wrong afterwards means sixty rows to undo.
  const preview = expandRecurrence({ from, to, weekdays, everyDays });

  return (
    <form action={action}>
      <Card
        title="Generate a season"
        description="Creates one departure per matching date. Re-running it over dates that already exist changes nothing, so it is safe to extend a season by moving the end date."
      >
        {state?.ok && <Banner tone="success">{state.message}</Banner>}
        {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="First date" htmlFor="from">
            <Input id="from" name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Last date" htmlFor="to">
            <Input id="to" name="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="Seats each" htmlFor="capacity">
            <Input id="capacity" name="capacity" type="number" min={1} defaultValue={defaultCapacity || 12} />
          </Field>
          <Field label="Start time" htmlFor="start_time" hint="Day tours only. Leave blank for multi-day.">
            <Input id="start_time" name="start_time" type="time" />
          </Field>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-[13px] font-medium text-foreground">On which days</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((label, index) => {
              const on = weekdays.includes(index);
              return (
                <label
                  key={label}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                    on ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground hover:border-primary'
                  }`}
                >
                  <input
                    type="checkbox" name="weekday" value={index} checked={on} className="sr-only"
                    onChange={(e) =>
                      setWeekdays((w) => (e.target.checked ? [...w, index] : w.filter((n) => n !== index)))
                    }
                  />
                  {label}
                </label>
              );
            })}
          </div>
          {weekdays.length === 0 && (
            <div className="mt-3 max-w-xs">
              <Field label="Or every N days" htmlFor="every_days">
                <Input
                  id="every_days" name="every_days" type="number" min={1} value={everyDays}
                  onChange={(e) => setEveryDays(Number(e.target.value))}
                />
              </Field>
            </div>
          )}
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[13px] text-muted-foreground">
            {preview.length === 0
              ? 'That pattern produces no dates.'
              : `Will create ${preview.length} ${preview.length === 1 ? 'departure' : 'departures'}` +
                (preview.length > 0 ? `, ${formatDepartureDate(preview[0])} → ${formatDepartureDate(preview[preview.length - 1])}` : '') +
                (preview.length >= 200 ? ' (capped at 200)' : '')}
          </p>
          <SubmitButton>
            <CalendarPlus size={14} aria-hidden="true" />
            Generate
          </SubmitButton>
        </div>
      </Card>
    </form>
  );
}

function DepartureRowFields({
  packageId,
  departure,
  currency,
}: {
  packageId: string;
  departure: DepartureRow;
  currency: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const committed = departure.seatsBooked + departure.seatsHeld;

  return (
    <tr className="align-middle">
      <input type="hidden" name="departure_id" value={departure.id} />
      <td className="px-4 py-2">
        <div className="font-medium text-foreground">{formatDepartureDate(departure.startsOn)}</div>
        {departure.endsOn && (
          <div className="text-[12px] text-muted-foreground">to {formatDepartureDate(departure.endsOn)}</div>
        )}
        {departure.startTime && (
          <div className="text-[12px] text-muted-foreground">{departure.startTime.slice(0, 5)}</div>
        )}
        {error && <div className="mt-1 text-[12px] text-destructive">{error}</div>}
      </td>
      <td className="px-4 py-2">
        <input
          name="departure_capacity" type="number" min={committed} defaultValue={departure.capacity}
          aria-label={`Capacity on ${departure.startsOn}`}
          className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-primary"
        />
      </td>
      <td className="px-4 py-2 tabular-nums text-muted-foreground">{departure.seatsBooked}</td>
      <td className="px-4 py-2 tabular-nums text-muted-foreground">{departure.seatsHeld}</td>
      <td className="px-4 py-2 tabular-nums">
        <span className={departure.seatsAvailable === 0 ? 'text-destructive' : 'text-foreground'}>
          {departure.seatsAvailable}
        </span>
      </td>
      <td className="px-4 py-2">
        <input
          name="departure_price" type="number" step="0.01" min={0} defaultValue={money(departure.priceOverrideCents)}
          placeholder={`${currency} default`}
          aria-label={`Adult price on ${departure.startsOn}`}
          className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-primary"
        />
      </td>
      <td className="px-4 py-2">
        <input
          name="departure_child_price" type="number" step="0.01" min={0} defaultValue={money(departure.childPriceOverrideCents)}
          placeholder="default"
          aria-label={`Child price on ${departure.startsOn}`}
          className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] tabular-nums outline-none focus:border-primary"
        />
      </td>
      <td className="px-4 py-2">
        <select
          name="departure_status" defaultValue={departure.status}
          aria-label={`Status on ${departure.startsOn}`}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary"
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="sold_out">Sold out</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </td>
      <td className="px-4 py-2">
        {committed === 0 ? (
          <Button
            type="button" variant="ghost" disabled={pending}
            aria-label={`Delete the ${departure.startsOn} departure`}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await deleteDepartureAction(packageId, departure.id);
                if (!result.ok) setError(result.message);
              });
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </Button>
        ) : (
          <Badge value={departure.seatsBooked > 0 ? 'booked' : 'holding'} />
        )}
      </td>
    </tr>
  );
}
