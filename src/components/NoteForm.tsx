'use client';

import { useState, useTransition } from 'react';

/** Nota do lançamento. A ação já funcionava, mas a tela não mudava: agora mostra "Salvando…" e "Nota salva". */
export function NoteForm({ note, saveAction }: { note: string; saveAction: (form: FormData) => Promise<void> }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<'saved' | 'error' | null>(null);

  return (
    <form
      className="field"
      style={{ margin: 0 }}
      action={(form) => start(async () => {
        setStatus(null);
        try { await saveAction(form); setStatus('saved'); } catch { setStatus('error'); }
      })}
    >
      <label htmlFor="note">Nota</label>
      <textarea id="note" name="note" rows={2} defaultValue={note} maxLength={500}
        placeholder="Ex.: dividido com a Ana" onChange={() => setStatus(null)} />
      <button className="btn" disabled={pending}>{pending ? 'Salvando…' : 'Salvar nota'}</button>
      {status && (
        <p className={`banner${status === 'error' ? ' error' : ''}`} role="status">
          {status === 'saved' ? 'Nota salva.' : 'Não foi possível salvar a nota. Tente de novo.'}
        </p>
      )}
    </form>
  );
}
