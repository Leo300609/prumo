'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

// O widget usa window/iframe: carregado só no navegador.
const PluggyConnect = dynamic(() => import('react-pluggy-connect').then((m) => m.PluggyConnect), { ssr: false });

type Props = {
  label: string;
  /** Para conectores comuns: reabre o MESMO item (não cria outro, não gasta limite do CPF). */
  updateItemId?: string;
  variant?: 'primary' | 'default';
};

/**
 * Fluxo:
 *  1. pede ao nosso backend um connect token (30 min, escopo restrito)
 *  2. abre o widget; você escolhe "MeuPluggy" (uso pessoal) e autoriza
 *  3. no onSuccess, avisa o backend, que grava a conexão e enfileira a sincronização
 */
export function ConnectBank({ label, updateItemId, variant = 'primary' }: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/pluggy/connect-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateItemId ? { itemId: updateItemId } : {}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setToken((await res.json()).accessToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'não foi possível abrir a conexão');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className={`btn ${variant === 'primary' ? 'primary' : ''}`} onClick={open} disabled={busy}>
        {busy ? 'Abrindo…' : label}
      </button>
      {error && <p className="banner error" role="alert">{error}</p>}
      {token && (
        <PluggyConnect
          connectToken={token}
          updateItem={updateItemId}
          onSuccess={async ({ item }: { item: { id: string } }) => {
            await fetch('/api/connections', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemId: item.id }),
            });
            setToken(null);
            router.refresh();
          }}
          onError={({ message }: { message: string }) => { setError(message); }}
          onLoadError={(e: unknown) => { setToken(null); setError(e instanceof Error ? e.message : 'o widget da Pluggy não carregou'); }}
          onClose={() => setToken(null)}
        />
      )}
    </>
  );
}
