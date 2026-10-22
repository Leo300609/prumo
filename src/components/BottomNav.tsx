'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon.tsx';

const TABS = [
  { href: '/', label: 'Início', icon: 'home' },
  { href: '/lancamentos', label: 'Extrato', icon: 'list' },
  { href: '/investimentos', label: 'Investir', icon: 'trending-up' },
  { href: '/novo', label: 'Novo', icon: 'plus', fab: true },   // 4º de 7: fica no centro
  { href: '/relatorios', label: 'Relatórios', icon: 'chart' },
  { href: '/contas', label: 'Contas', icon: 'wallet' },
  { href: '/sair', label: 'Sair', icon: 'logout' },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <ul>
        {TABS.map((t) => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? 'page' : undefined} prefetch>
                {t.fab
                  ? <span className="fab"><Icon name={t.icon} size={26} label={t.label} /></span>
                  : <><Icon name={t.icon} /><span>{t.label}</span></>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
