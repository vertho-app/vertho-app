import type { DemoGuestProgress } from './acme-prospect-config';

export const DEMO_TELEMETRY_VERSION = '2026-09-21.v1';
export const EXPLORACOES_DEGUSTACAO = ['perfil', 'pdi', 'jornada', 'engajamento', 'evolucao', 'relatorio', 'adequacao', 'cultura', 'pratica'] as const;
export type ExploracaoDegustacao = typeof EXPLORACOES_DEGUSTACAO[number];
export function ehExploracao(value: unknown): value is ExploracaoDegustacao {
  return typeof value === 'string' && (EXPLORACOES_DEGUSTACAO as readonly string[]).includes(value);
}
export function ehTesteInterno(nome: string, empresa: string) {
  return /^QA(?:\s|$)|^TESTE INTERNO(?:\s|$)/i.test(nome.trim()) || /^TESTE INTERNO(?:\s|$)/i.test(empresa.trim());
}
/** Uma sessão conta uma vez. Coorte B instrumentada; histórico e QA ficam fora. */
export function metricasDegustacao(convidados: DemoGuestProgress[]) {
  const coorte = convidados.filter(p => p.origem === 'passaporte' && p.versao === 'B'
    && p.telemetryVersion === DEMO_TELEMETRY_VERSION && !p.testeInterno && !ehTesteInterno(p.nome, p.contexto));
  const abertos = coorte.filter(p => p.conviteAbertoEm);
  const exploraram = abertos.filter(p => p.exploracaoRelevanteEm).length;
  return { convites: coorte.length, abertos: abertos.length, exploraram,
    contatos: abertos.filter(p => p.contatoClicadoEm).length,
    taxa: abertos.length ? Math.round(100 * exploraram / abertos.length) : null };
}
