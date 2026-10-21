'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Importa OFX ou CSV para uma conta (bancos fora do Open Finance, histórico antigo). */
export function ImportStatement({ accounts }: { accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true); setMsg(null);
    const res = await fetch('/api/import', { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: body.error ?? `Erro ${res.status}` }); return; }
    setMsg({ ok: true, text: `${body.inserted} novos de ${body.total} lançamentos.` });
    router.refresh();
  }

  if (accounts.length === 0) return <p className="muted">Crie uma conta manual primeiro.</p>;
  return (
    <form action={submit}>
      <div className="field">
        <label htmlFor="imp-account">Conta</label>
        <select id="imp-account" name="accountId" required>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="imp-file">Arquivo OFX ou CSV</label>
        <input id="imp-file" name="file" type="file" accept=".ofx,.csv,text/csv,application/x-ofx" required />
      </div>
      <label className="chip" style={{ marginBottom: 12 }}>
        <input type="checkbox" name="invertSign" /> CSV de cartão com compras positivas
      </label>
      {msg && <p className={`banner${msg.ok ? '' : ' error'}`} role="status">{msg.text}</p>}
      <button className="btn block" disabled={busy}>{busy ? 'Importando…' : 'Importar'}</button>
    </form>
  );
}
