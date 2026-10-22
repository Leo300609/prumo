'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions.ts';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  return (
    <form action={action} className="auth-form">
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required inputMode="email" />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="code">Código do autenticador</label>
        <input id="code" name="code" className="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
          placeholder="000000" />
      </div>
      {state.error && <p className="banner error" role="alert">{state.error}</p>}
      <button className="btn primary block" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
