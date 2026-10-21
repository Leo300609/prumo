import type { ReactNode } from 'react';
import { BottomNav } from '../../components/BottomNav.tsx';
import { requireSession } from '../../lib/session.ts';

// Todas as telas dentro de (app) exigem login. Dados financeiros: nada de cache estático.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return (
    <>
      <main className="shell">{children}</main>
      <BottomNav />
    </>
  );
}
