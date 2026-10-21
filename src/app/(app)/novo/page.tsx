import { getAccounts, getCategories } from '../../../db/read.ts';
import { localDate } from '../../../lib/time.ts';
import { NewTransactionForm } from './NewTransactionForm.tsx';

export default async function NovoPage() {
  const [accounts, categories] = await Promise.all([getAccounts(), getCategories()]);
  return (
    <>
      <header className="topbar"><h1>Novo lançamento</h1></header>
      <NewTransactionForm
        today={localDate()}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, group: c.parent_name ?? '' }))}
      />
    </>
  );
}
