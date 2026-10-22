// Página inicial pública (landing). Quem já está logado vai direto para o app; quem não está lê a
// apresentação e clica em "Entrar", que leva ao /login.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../lib/session.ts';
import './landing.css';

export const dynamic = 'force-dynamic'; // depende do cookie de sessão

const description =
  'Saldos, faturas, lançamentos e investimentos dos seus bancos num app só, atualizado sozinho pelo Open Finance.';

export const metadata: Metadata = {
  title: 'Prumo — suas finanças, alinhadas num só lugar',
  description,
  openGraph: {
    title: 'Prumo — suas finanças, alinhadas num só lugar',
    description,
    locale: 'pt_BR',
    type: 'website',
    images: [{ url: '/landing/og.png', width: 1200, height: 630, alt: 'Prumo' }],
  },
  twitter: { card: 'summary_large_image' },
};

const MORE = [
  ['Classificação em um toque', 'Regras, dicionário e histórico categorizam a maior parte. O resto cai numa fila de revisão.'],
  ['Transferências pareadas', 'O dinheiro que sai de uma conta sua e entra em outra não vira gasto nem receita.'],
  ['DRE do mês e patrimônio', 'Entradas, saídas e o que sobrou, mais o patrimônio líquido, sem montar planilha.'],
  ['Rentabilidade contra o CDI', 'Quanto seus investimentos renderam nos últimos 30 dias e 12 meses, comparado ao CDI.'],
  ['Projeção de 3, 6 e 12 meses', 'Para onde o saldo caminha, com base nas recorrências que o Prumo detecta.'],
  ['Feito para o celular', 'Instala como app no Android e no iOS, com modo escuro e modo privacidade.'],
] as const;

const STEPS = [
  ['Conecte seus bancos', 'Crie conta no Meu Pluggy, autorize seus bancos uma vez e escolha MeuPluggy no Prumo.'],
  ['O Prumo sincroniza sozinho', 'Quando algo muda, a Pluggy avisa e o Prumo atualiza na hora. Uma rotina diária cobre o que escapar.'],
  ['Você só classifica o que sobrar', 'O que o app não souber categorizar espera por você numa fila de um toque.'],
] as const;

const SAFE = [
  ['Senha e código do autenticador', 'O login exige os dois, e cada código só vale uma vez.'],
  ['Limite de tentativas', 'Por IP e por conta, sem deixar ninguém trancar o dono do lado de fora.'],
  ['Sessões que você controla', 'Saia deste aparelho ou de todos de uma vez.'],
  ['Dados no seu banco', 'O Prumo roda na sua infraestrutura, com o seu Postgres. Não há terceiros guardando seus saldos.'],
] as const;

function Phone({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <figure className={`lp-phone ${className}`}>
      <img src={src} alt={alt} width={750} height={1575} loading="lazy" decoding="async" />
    </figure>
  );
}

export default async function LandingPage() {
  if (await getSession()) redirect('/inicio');

  return (
    <div className="lp">
      <a className="lp-skip" href="#conteudo">Ir para o conteúdo</a>

      <header className="lp-top">
        <Link href="/" className="lp-brand" aria-label="Prumo, página inicial">Prumo</Link>
        <nav aria-label="Principal">
          <a className="lp-link" href="#como-funciona">Como funciona</a>
          <a className="lp-link" href="#seguranca">Segurança</a>
          <Link className="lp-btn lp-btn-small" href="/login">Entrar</Link>
        </nav>
      </header>

      <main id="conteudo">
        <section className="lp-hero" aria-labelledby="titulo">
          <div className="lp-thread" aria-hidden="true" />
          <div className="lp-hero-copy">
            <h1 id="titulo">Suas finanças, alinhadas num só lugar.</h1>
            <p className="lp-lead">
              O Prumo reúne saldos, faturas, lançamentos e investimentos dos seus bancos e se atualiza
              sozinho pelo Open Finance. Você só classifica o que ele não souber.
            </p>
            <div className="lp-cta">
              <Link className="lp-btn lp-btn-primary" href="/login">Entrar no Prumo</Link>
              <a className="lp-btn lp-btn-ghost" href="#como-funciona">Ver como funciona</a>
            </div>
            <p className="lp-note">Acesso privado: entrada com senha e código do autenticador.</p>
          </div>
          <div className="lp-phones">
            <Phone className="lp-phone-a" src="/landing/inicio-escuro.png"
              alt="Tela inicial do Prumo: saldo disponível, resultado do mês e últimos lançamentos" />
            <Phone className="lp-phone-b" src="/landing/investir-claro.png"
              alt="Tela de investimentos do Prumo, agrupados por instituição" />
          </div>
        </section>

        <section className="lp-row" aria-labelledby="t-tela">
          <div className="lp-copy">
            <h2 id="t-tela">Tudo o que você tem, numa tela só.</h2>
            <p>
              Saldo disponível, faturas abertas e total investido no topo. Logo abaixo, o resultado do mês e
              os últimos lançamentos, agrupados por dia.
            </p>
            <ul>
              <li>Atualiza sozinho: o banco avisa e o Prumo sincroniza em seguida.</li>
              <li>O modo privacidade borra os valores quando você abre o app em público.</li>
            </ul>
          </div>
          <Phone src="/landing/inicio-claro.png" alt="Início do Prumo no tema claro, com saldo, resultado do mês e contas" />
        </section>

        <section className="lp-row lp-row-flip" aria-labelledby="t-invest">
          <div className="lp-copy">
            <h2 id="t-invest">Investimentos que você reconhece.</h2>
            <p>
              Seus CDBs aparecem agrupados por instituição, com taxa, data de aplicação e vencimento. Dê a cada
              um o nome que quiser, como “Reserva de emergência” ou “Sonho de consumo”, e o Prumo guarda.
            </p>
            <ul>
              <li>Total, rendimento sobre o valor aplicado e rentabilidade contra o CDI.</li>
              <li>Evolução da carteira e os últimos aportes e resgates.</li>
            </ul>
          </div>
          <Phone src="/landing/investir-claro.png" alt="Investimentos agrupados por instituição, com nome, taxa e vencimento de cada CDB" />
        </section>

        <section className="lp-row" aria-labelledby="t-import">
          <div className="lp-copy">
            <h2 id="t-import">Chegou uma planilha? Ela entra.</h2>
            <p>
              Importe extratos em OFX, CSV ou Excel (.xlsx) para contas fora do Open Finance ou para trazer
              histórico antigo. Importar o mesmo arquivo duas vezes não duplica nada.
            </p>
            <ul>
              <li>O cabeçalho pode estar abaixo de um título, e linhas de total são ignoradas.</li>
              <li>Funciona com os extratos de conta e de cartão do Nubank.</li>
            </ul>
          </div>
          <Phone src="/landing/importar-claro.png" alt="Importação de uma planilha do Excel com os lançamentos importados" />
        </section>

        <section className="lp-more" aria-labelledby="t-mais">
          <h2 id="t-mais">E o que mais vem junto.</h2>
          <dl>
            {MORE.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="lp-steps" id="como-funciona" aria-labelledby="t-como">
          <h2 id="t-como">Como começa.</h2>
          <ol>
            {STEPS.map(([t, d]) => (
              <li key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-safe" id="seguranca" aria-labelledby="t-seg">
          <div>
            <h2 id="t-seg">Feito para ser só seu.</h2>
            <p>
              Os dados são financeiros, então o acesso é fechado: não existe cadastro aberto. Só o dono da
              instalação entra.
            </p>
          </div>
          <ul>
            {SAFE.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-final" aria-labelledby="t-final">
          <h2 id="t-final">Suas contas, no prumo.</h2>
          <Link className="lp-btn lp-btn-primary" href="/login">Entrar no Prumo</Link>
        </section>
      </main>

      <footer className="lp-foot">
        <span>Prumo · projeto pessoal</span>
        <span>Conexões bancárias via Open Finance, pela Pluggy. Uso pessoal, sem fins comerciais.</span>
      </footer>
    </div>
  );
}
