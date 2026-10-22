// Como os investimentos aparecem na tela: agrupados por instituição e com um título que os distingue.
// A Pluggy devolve, por exemplo, sete CDBs "NU FINANCEIRA S.A." com o mesmo nome: o que os diferencia são a
// taxa, a data de aplicação e o vencimento. Regras puras, para poderem ser testadas.
export type InvLike = {
  name: string; institution: string | null; group_label: string | null; connector: string | null;
};

/** "NU FINANCEIRA S.A. - SOCIEDADE DE CREDITO…" → "Nubank"; "BANCO INTER S.A" → "Inter"; "NEON FINANCEIRA…" → "Neon". */
export function tidy(raw: string): string {
  const s = raw.replace(/^(CDB|LCI|LCA|LC|LF|CRI|CRA)\s*-\s*/i, '');
  if (/\binter\b/i.test(s)) return 'Inter';
  if (/nubank|nu pagamentos|nu invest|\bnu\b/i.test(s)) return 'Nubank';
  const head = s.split(/\s-\s|,/)[0]
    .replace(/\b(S\.?\s?A\.?|S\/A|LTDA|FINANCEIRA|BANCO|SOCIEDADE.*)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  if (!head) return s.trim();
  // só desmaiuscula o que veio TODO em caixa alta ("NEON" → "Neon"); "XP Investimentos" fica como está
  return head === head.toUpperCase() ? head.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase()) : head;
}

export function groupName(i: InvLike): string {
  const manual = i.group_label?.trim();
  if (manual) return manual;
  if (i.institution?.trim()) return tidy(i.institution);
  if (/caixinha/i.test(i.name)) return 'Nubank'; // shortcut: só o Nubank usa "caixinha"; outro banco → defina o grupo à mão
  if (/\binter\b|nubank|\bnu\b/i.test(i.name) || /^(CDB|LCI|LCA|LC|LF|CRI|CRA)\s*-\s*\S/i.test(i.name)) return tidy(i.name);
  const c = i.connector?.trim();
  if (c && c.replace(/\s/g, '').toLowerCase() !== 'meupluggy') return tidy(c);
  return 'Outros';
}

/** "103% do CDI", "12,5% a.a." ou o que houver; null quando a Pluggy não informou a taxa. */
export function rateLabel(rateType: string | null, rate: number | null, fixed: number | null): string | null {
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (rate != null && rateType?.toUpperCase() === 'CDI') return `${n(rate)}% do CDI`;
  if (fixed != null) return `${n(fixed)}% a.a.`;
  if (rate != null && rateType) return `${rateType} ${n(rate)}`;
  return null;
}

type Titled = {
  nickname: string | null; name: string; subtype: string | null;
  rate_type: string | null; rate: number | null; fixed_rate: number | null;
};

/** Seu apelido, se houver; senão "CDB 103% do CDI" (que distingue); senão o nome que veio do banco. */
export function invTitle(i: Titled): string {
  const nick = i.nickname?.trim();
  if (nick) return nick;
  const rate = rateLabel(i.rate_type, i.rate, i.fixed_rate);
  if (rate && i.subtype) return `${i.subtype} ${rate}`;
  // "CDB - BANCO INTER S.A": o emissor já está no título do grupo, sobra só o tipo
  const kind = /^(CDB|LCI|LCA|LC|LF|CRI|CRA)\s*-\s*/i.exec(i.name);
  return kind ? kind[1].toUpperCase() : i.name;
}
