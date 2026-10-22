import { Icon } from '../../../components/Icon.tsx';
import { logout } from '../actions.ts';

export default function SairPage() {
  return (
    <>
      <header className="topbar"><h1>Sair</h1></header>

      <section className="card" style={{ textAlign: 'center', padding: '32px 20px 24px' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-grid', placeItems: 'center', width: 72, height: 72, borderRadius: 24,
            background: 'var(--ink)', color: 'var(--brass)', marginBottom: 16,
          }}
        >
          <Icon name="logout" size={32} />
        </span>
        <h2 style={{ fontSize: 22, margin: '0 0 8px', textTransform: 'none', letterSpacing: 0, color: 'var(--text)' }}>
          Até logo!
        </h2>
        <p className="muted" style={{ margin: '0 auto 24px', maxWidth: 320 }}>
          Ao sair, o Prumo pede seu e-mail, senha e código do autenticador na próxima vez. Seus dados e suas
          conexões com os bancos continuam guardados.
        </p>
        <form action={logout.bind(null, false)}>
          <button className="btn block">Sair deste aparelho</button>
        </form>
      </section>

      <section className="card">
        <h2>Perdeu o celular ou usou um aparelho emprestado?</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
          Isso encerra o acesso em todos os aparelhos ao mesmo tempo, inclusive este.
        </p>
        <form action={logout.bind(null, true)}>
          <button className="btn block">Sair de todos os aparelhos</button>
        </form>
      </section>
    </>
  );
}
