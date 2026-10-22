import { redirect } from 'next/navigation';
import { getSession } from '../../lib/session.ts';
import { LoginForm } from './LoginForm.tsx';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/');
  return (
    <main className="auth">
      <section className="auth-art">
        <svg className="plumb" viewBox="0 0 60 420" width="60" height="420" aria-hidden="true" focusable="false">
          <line x1="30" y1="0" x2="30" y2="340" stroke="#F2A0B5" strokeWidth="2" />
          <path d="M30 336 L44 362 Q44 384 30 400 Q16 384 16 362 Z" fill="#F2A0B5" />
          <path d="M30 346 L38 362 Q38 376 30 386 Z" fill="#fff" opacity=".35" />
        </svg>
        <div className="wordmark">Prumo</div>
        <p>Suas finanças, alinhadas num só lugar.</p>
      </section>
      <section className="auth-panel">
        <h1>Entrar</h1>
        <p className="muted">Use sua senha e o código de 6 dígitos do autenticador.</p>
        <LoginForm />
      </section>
    </main>
  );
}
