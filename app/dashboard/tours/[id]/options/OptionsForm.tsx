'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Banner, Button, Card, Field, Input, Select, SubmitButton } from '@/components/ui';
import type { ActionResult } from '@/lib/actions';
import type { CustomFieldRow, ExtraRow, RoomTypeRow } from '@/lib/admin/packages';
import { saveOptionsAction } from '../actions';

const money = (c: number) => (c / 100).toFixed(2);
let nextKey = 0;

type RoomState = RoomTypeRow & { rowKey: number };
type ExtraState = ExtraRow & { rowKey: number };
type FieldState = CustomFieldRow & { rowKey: number };

export default function OptionsForm({
  packageId,
  rooms: initialRooms,
  extras: initialExtras,
  customFields: initialFields,
  currency,
  canEdit,
}: {
  packageId: string;
  rooms: RoomTypeRow[];
  extras: ExtraRow[];
  customFields: CustomFieldRow[];
  currency: string;
  canEdit: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    saveOptionsAction.bind(null, packageId),
    null
  );
  const [rooms, setRooms] = useState<RoomState[]>(() => initialRooms.map((r) => ({ ...r, rowKey: nextKey++ })));
  const [extras, setExtras] = useState<ExtraState[]>(() => initialExtras.map((e) => ({ ...e, rowKey: nextKey++ })));
  const [fields, setFields] = useState<FieldState[]>(() => initialFields.map((f) => ({ ...f, rowKey: nextKey++ })));

  // The radio needs a stable value per row, and new rows have no id yet — so
  // the position stands in, matching how the action reads it back.
  const roomValue = (room: RoomState, index: number) => room.id || `new-${index}`;
  const [defaultRoom, setDefaultRoom] = useState(() => {
    const idx = initialRooms.findIndex((r) => r.isDefault);
    return idx >= 0 ? initialRooms[idx].id : '';
  });

  if (!canEdit) {
    return (
      <Banner tone="info">
        Rooms and extras carry prices, so they are set by an administrator. Your role can edit
        everything else about this tour.
      </Banner>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.ok && <Banner tone="success">{state.message}</Banner>}
      {state && !state.ok && <Banner tone="error">{state.message}</Banner>}

      <Card
        title="Rooms"
        description="Offered on the booking flow when there is more than one. The adjustment is charged per occupied seat, and infants do not count."
      >
        <input type="hidden" name="room_default" value={defaultRoom} />
        <div className="flex flex-col gap-3">
          {rooms.map((room, i) => (
            <div key={room.rowKey} className="grid items-end gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[1fr_1fr_110px_110px_auto_auto]">
              <input type="hidden" name="room_id" value={room.id} />
              <Field label="Name" htmlFor={`room_name_${room.rowKey}`}>
                <Input
                  id={`room_name_${room.rowKey}`} name="room_name" value={room.name} placeholder="Twin share"
                  onChange={(e) => setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
                />
              </Field>
              <Field label="Description" htmlFor={`room_description_${room.rowKey}`}>
                <Input
                  id={`room_description_${room.rowKey}`} name="room_description" value={room.description ?? ''}
                  onChange={(e) => setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, description: e.target.value } : r)))}
                />
              </Field>
              <Field label={`Extra (${currency})`} htmlFor={`room_adjustment_${room.rowKey}`}>
                <Input
                  id={`room_adjustment_${room.rowKey}`} name="room_adjustment" type="number" step="0.01"
                  value={money(room.priceAdjustmentCents)}
                  onChange={(e) => setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, priceAdjustmentCents: Math.round(Number(e.target.value) * 100) } : r)))}
                />
              </Field>
              <Field label="Sleeps" htmlFor={`room_occupancy_${room.rowKey}`}>
                <Input
                  id={`room_occupancy_${room.rowKey}`} name="room_occupancy" type="number" min={1}
                  value={room.maxOccupancy}
                  onChange={(e) => setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, maxOccupancy: Number(e.target.value) } : r)))}
                />
              </Field>
              <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-[12px] text-muted-foreground">
                <input
                  type="radio" name="room_default_radio" className="h-3.5 w-3.5 accent-[var(--primary)]"
                  checked={defaultRoom === roomValue(room, i)}
                  onChange={() => setDefaultRoom(roomValue(room, i))}
                />
                Default
              </label>
              <Button
                type="button" variant="ghost" aria-label={`Remove ${room.name || 'room'}`}
                onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button" variant="secondary" className="mt-4"
          onClick={() =>
            setRooms((rs) => [...rs, {
              rowKey: nextKey++, id: '', name: '', description: null,
              priceAdjustmentCents: 0, maxOccupancy: 2, isDefault: false, sortOrder: rs.length,
            }])
          }
        >
          <Plus size={14} aria-hidden="true" />
          Add a room
        </Button>
      </Card>

      <Card
        title="Extras"
        description="Optional add-ons offered during booking. Removing one retires it rather than deleting it, because bookings that already bought it still refer to it."
      >
        <div className="flex flex-col gap-3">
          {extras.map((extra, i) => (
            <div key={extra.rowKey} className="grid items-end gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[1fr_1fr_110px_130px_110px_120px_auto]">
              <input type="hidden" name="extra_id" value={extra.id} />
              <Field label="Name" htmlFor={`extra_name_${extra.rowKey}`}>
                <Input
                  id={`extra_name_${extra.rowKey}`} name="extra_name" value={extra.name} placeholder="Airport transfer"
                  onChange={(e) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
              </Field>
              <Field label="Description" htmlFor={`extra_description_${extra.rowKey}`}>
                <Input
                  id={`extra_description_${extra.rowKey}`} name="extra_description" value={extra.description ?? ''}
                  onChange={(e) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                />
              </Field>
              <Field label={`Price (${currency})`} htmlFor={`extra_price_${extra.rowKey}`}>
                <Input
                  id={`extra_price_${extra.rowKey}`} name="extra_price" type="number" step="0.01" min={0}
                  value={money(extra.priceCents)}
                  onChange={(e) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, priceCents: Math.round(Number(e.target.value) * 100) } : x)))}
                />
              </Field>
              <Field label="Charged" htmlFor={`extra_per_${extra.rowKey}`}>
                <Select
                  id={`extra_per_${extra.rowKey}`} name="extra_per" value={extra.per}
                  onChange={(e) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, per: e.target.value } : x)))}
                >
                  <option value="person">Per person</option>
                  <option value="booking">Per booking</option>
                </Select>
              </Field>
              <Field label="Capacity" htmlFor={`extra_capacity_${extra.rowKey}`} hint="Blank = unlimited">
                <Input
                  id={`extra_capacity_${extra.rowKey}`} name="extra_capacity" type="number" min={0}
                  value={extra.capacity ?? ''}
                  onChange={(e) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, capacity: e.target.value === '' ? null : Number(e.target.value) } : x)))}
                />
              </Field>
              <Field label="Status" htmlFor={`extra_status_${extra.rowKey}`}>
                <Select
                  id={`extra_status_${extra.rowKey}`} name="extra_status" value={extra.status}
                  onChange={(e) => setExtras((xs) => xs.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)))}
                >
                  <option value="active">Offered</option>
                  <option value="inactive">Retired</option>
                </Select>
              </Field>
              <Button
                type="button" variant="ghost" aria-label={`Remove ${extra.name || 'extra'}`}
                onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button" variant="secondary" className="mt-4"
          onClick={() =>
            setExtras((xs) => [...xs, {
              rowKey: nextKey++, id: '', name: '', description: null, priceCents: 0,
              per: 'person', capacity: null, status: 'active', sortOrder: xs.length,
            }])
          }
        >
          <Plus size={14} aria-hidden="true" />
          Add an extra
        </Button>
      </Card>

      <Card
        title="Questions to ask"
        description="Anything this trip needs that the standard form does not collect — passport numbers, licence details, a shoe size for the hiking boots."
      >
        <div className="flex flex-col gap-3">
          {fields.map((field, i) => (
            <div key={field.rowKey} className="grid items-end gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[1fr_130px_130px_1fr_auto_auto]">
              <input type="hidden" name="field_id" value={field.id} />
              <input type="hidden" name="field_key" value={field.key} />
              <input type="hidden" name="field_required" value={String(field.isRequired)} />
              <Field label="Question" htmlFor={`field_label_${field.rowKey}`}>
                <Input
                  id={`field_label_${field.rowKey}`} name="field_label" value={field.label} placeholder="Passport number"
                  onChange={(e) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, label: e.target.value } : f)))}
                />
              </Field>
              <Field label="Type" htmlFor={`field_type_${field.rowKey}`}>
                <Select
                  id={`field_type_${field.rowKey}`} name="field_type" value={field.fieldType}
                  onChange={(e) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, fieldType: e.target.value } : f)))}
                >
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="dropdown">Choose one</option>
                  <option value="checkbox">Tick box</option>
                  <option value="date">Date</option>
                </Select>
              </Field>
              <Field label="Asked of" htmlFor={`field_applies_${field.rowKey}`}>
                <Select
                  id={`field_applies_${field.rowKey}`} name="field_applies" value={field.appliesTo}
                  onChange={(e) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, appliesTo: e.target.value } : f)))}
                >
                  <option value="booking">The booking</option>
                  <option value="traveller">Each traveller</option>
                </Select>
              </Field>
              <Field label="Choices" htmlFor={`field_options_${field.rowKey}`} hint="Comma separated, for “choose one”.">
                <Input
                  id={`field_options_${field.rowKey}`} name="field_options" value={(field.options ?? []).join(', ')}
                  disabled={field.fieldType !== 'dropdown'}
                  onChange={(e) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, options: e.target.value.split(',').map((o) => o.trim()) } : f)))}
                />
              </Field>
              <label className="flex cursor-pointer items-center gap-1.5 pb-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox" className="h-3.5 w-3.5 accent-[var(--primary)]" checked={field.isRequired}
                  onChange={(e) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, isRequired: e.target.checked } : f)))}
                />
                Required
              </label>
              <Button
                type="button" variant="ghost" aria-label={`Remove ${field.label || 'question'}`}
                onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button" variant="secondary" className="mt-4"
          onClick={() =>
            setFields((fs) => [...fs, {
              rowKey: nextKey++, id: '', key: '', label: '', fieldType: 'text',
              options: null, isRequired: false, appliesTo: 'traveller', sortOrder: fs.length,
            }])
          }
        >
          <Plus size={14} aria-hidden="true" />
          Add a question
        </Button>
      </Card>

      <div className="flex justify-end">
        <SubmitButton>Save rooms, extras and questions</SubmitButton>
      </div>
    </form>
  );
}
