import { PageHeader } from '@/components/ui';
import { requireCapability } from '@/lib/auth';
import ContentTabs from './ContentTabs';

export const dynamic = 'force-dynamic';

/**
 * The words the public site says.
 *
 * Gated on manageSettings rather than managePackages: Exhibit A keeps content
 * and settings together in B6 and keeps both away from the Agent role, because
 * disclosure wording is a regulatory instrument rather than a piece of copy.
 */
export default async function ContentLayout({ children }: { children: React.ReactNode }) {
  await requireCapability('manageSettings');
  return (
    <>
      <PageHeader
        title="Content"
        description="The destination tree and the collections the catalogue is arranged by, the policy pages, the disclosure wording Part D turns on, the transactional emails, the landing page's postcards and the journal. All of it renders on the public site."
      />
      <ContentTabs />
      {children}
    </>
  );
}
