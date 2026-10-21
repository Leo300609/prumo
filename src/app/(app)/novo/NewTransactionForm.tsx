'use client';

import { useActionState, useState } from 'react';
import { addTransaction, type AddState } from '../actions.ts';

type Props = {
  today: string;
  accounts: { id: string; name: string }[];
  categories: { id: number; name: string; kind: string; group: string }[];
};

export function NewTransactionForm({ today, accounts, categories }: Props) {
  const [state, action, pending] = useActionState<AddState, FormData>(addTransaction, { error: null });
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const visible = categories.filter((c) => direction === 'in'
    ? c.kind === 'income' || c.kind === 'investment'
    : c.kind === 'expense' || c.kind === 'investment');
  const groups = [...new Set(visible.map((c) => c.group))];

  return (
    <form action={action}>
      <fieldset className="segmented" style={{ border: 0 }}>
        <legend className="sr-only">Tipo</legend>
        <label>
          <input type="radio" name="direction" value="out" checked={direction === 'out'} onChange={() => setDirection('out')} />
          <span>Saída</span>
        </label>
        <label>
          <input type="radio" name="direction" value="in" checked={direction === 'in'} onChange={() => setDirection('in')} />
          <span>Entrada</span>
        </label>
      </fieldset>

      <div className="field">
        <label htmlFor="amount" className="sr-only">Valor</label>
        <input id="amount" name="amount" className="amount-input num" inputMode="decimal" placeholder="R$ 0,00"
          autoComplete="off" required autoFocus />
      </div>

      <div className="field">
        <label htmlFor="description">Descrição</label>
        <input id="description" name="description" placeholder={direction === 'in' ? 'Ex.: freela site' : 'Ex.: feira'}
          maxLength={140} autoComplete="off" enterKeyHint="next" />
      </div>

      <div className="field">
        <label htmlFor="categoryId">Categoria</label>
        <select id="categoryId" name="categoryId" defaultValue="">
          <option value="">Classificar depois</option>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {visible.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="accountId">Conta</label>
        <select id="accountId" name="accountId" required defaultValue={accounts[0]?.id}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="date">Data</label>
        <input id="date" name="date" type="date" defaultValue={today} max={today} />
      </div>

      {state.error && <p className="banner error" role="alert">{state.error}</p>}
      <button className="btn primary block" disabled={pending}>{pending ? 'Salvando…' : 'Salvar'}</button>
    </form>
  );
}
