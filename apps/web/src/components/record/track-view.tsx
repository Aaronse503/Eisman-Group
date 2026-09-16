'use client';
import { useEffect } from 'react';
import { recordRecentlyViewedAction } from '@/server/actions/shell';

/**
 * Records that the signed-in user opened this record, feeding the "recently
 * viewed" list in the command palette. Fire-and-forget: a failure here must
 * never disturb the page.
 */
export function TrackView({
  entityType,
  entityId,
  label,
  href,
  companyId,
}: {
  entityType: string;
  entityId: string;
  label: string;
  href: string;
  companyId?: string | null;
}) {
  useEffect(() => {
    void recordRecentlyViewedAction({ entityType, entityId, label, href, companyId }).catch(
      () => undefined,
    );
  }, [entityType, entityId, label, href, companyId]);
  return null;
}
