/** Página de origem para o botão Voltar: só caminhos do próprio app (início ou lançamentos, com filtros). */
export function safeFrom(from: string | undefined): string {
  return from && /^\/(inicio|lancamentos)(\?[\w=&%.-]*)?$/.test(from) ? from : '/lancamentos';
}
