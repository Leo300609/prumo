import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session.ts';
import { LoginForm } from './LoginForm.tsx';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/');
  return (
    <main className="shell" style={{ display: 'grid', alignContent: 'center', paddingBottom: 48 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <img src="/icons/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 18 }} />
        <h1 style={{ margin: '12px 0 0', fontSize: 24 }}>Prumo</h1>
        <p className="muted" style={{ margin: 0 }}>Suas finanças no prumo.</p>
      </div>
      <LoginForm />
    </main>
  );
}
