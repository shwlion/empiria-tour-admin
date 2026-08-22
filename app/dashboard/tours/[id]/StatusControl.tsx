'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff, Archive, Loader2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { setPackageStatusAction } from '../actions';

/**
 * Publish, unpublish, archive.
 *
 * Publishing is refused while anything essential is missing, and the reasons
 * are listed rather than hidden behind a disabled button with no explanation —
 * "why can't I publish this" should never need a support conversation.
 */
export default function StatusControl({
  packageId,
  status,
  blockers,
}: {
  packageId: string;
  status: string;
  blockers: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showBlockers, setShowBlockers] = useState(false);

  function change(next: 'draft' | 'published' | 'archived') {
    if (next === 'published' && blockers.length > 0) {
      setShowBlockers(true);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await setPackageStatusAction(packageId, next);
      setMessage({ ok: result.ok, text: result.ok ? (result.message ?? 'Done.') : result.message });
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Badge value={status} />
        {pending && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden="true" />}

        {status !== 'published' && (
          <Button variant="primary" disabled={pending} onClick={() => change('published')}>
            <Eye size={14} aria-hidden="true" />
            Publish
          </Button>
        )}
        {status === 'published' && (
          <Button variant="secondary" disabled={pending} onClick={() => change('draft')}>
            <EyeOff size={14} aria-hidden="true" />
            Unpublish
          </Button>
        )}
        {status !== 'archived' && (
          <Button variant="ghost" disabled={pending} onClick={() => change('archived')}>
            <Archive size={14} aria-hidden="true" />
            Archive
          </Button>
        )}
      </div>

      {message && (
        <p className={`text-[12px] ${message.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}

      {showBlockers && blockers.length > 0 && (
        <div className="max-w-sm rounded-md border border-destructive/40 bg-destructive/8 p-3 text-left">
          <p className="text-[13px] font-medium text-destructive">
            Not ready to publish. This tour still needs:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[12.5px] leading-relaxed text-destructive">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
