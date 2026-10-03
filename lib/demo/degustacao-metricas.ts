import type { DemoGuestProgress } from './acme-prospect-config';
import { DESAFIOS_CHAVES, alvoDoDesafio } from './degustacao-desafios';

export const DEMO_TELEMETRY_VERSION = '2026-09-21.v1';
/**
 * Coorte C. Versão PRÓPRIA da telemetria porque o sentido da "exploração
 * relevante" mudou: na B é o primeiro conteúdo visto, na C é o primeiro DESAFIO
 * escolhido (`dor-<chave>`). Misturar as duas numa taxa só mediria duas coisas.
 */
export const DEMO_TELEMETRY_VERSION_C = '2026-10-03.c1';
export const EXPLORACOES_DEGUSTACAO = [
  'perfil', 'pdi', 'jornada', 'engajamento', 'evolucao', 'relatorio', 'adequacao', 'cultura', 'pratica',
  ...DESAFIOS_CHAVES.map(alvoDoDesafio),
] as const;
export type ExploracaoDegustacao = typeof EXPLORACOES_DEGUSTACAO[number];
export function ehExploracao(value: unknown): value is ExploracaoDegustacao {
  return typeof value === 'string' && (EXPLORACOES_DEGUSTACAO as readonly string[]).includes(value);
}
export function ehTesteInterno(nome: string, empresa: string) {
  return /^QA(?:\s|$)|^TESTE INTERNO(?:\s|$)/i.test(nome.trim()) || /^TESTE INTERNO(?:\s|$)/i.test(empresa.trim());
}
/**
 * Uma sessão conta uma vez. Coorte instrumentada por versão; histórico e QA
 * ficam fora. O padrão é a B, como sempre foi: quem pede a C diz `'C'`.
 */
export function metricasDegustacao(convidados: DemoGuestProgress[], versao: 'B' | 'C' = 'B') {
  const telemetria = versao === 'C' ? DEMO_TELEMETRY_VERSION_C : DEMO_TELEMETRY_VERSION;
  const coorte = convidados.filter(p => p.origem === 'passaporte' && p.versao === versao
    && p.telemetryVersion === telemetria && !p.testeInterno && !ehTesteInterno(p.nome, p.contexto));
  const abertos = coorte.filter(p => p.conviteAbertoEm);
  const exploraram = abertos.filter(p => p.exploracaoRelevanteEm).length;
  return { convites: coorte.length, abertos: abertos.length, exploraram,
    contatos: abertos.filter(p => p.contatoClicadoEm).length,
    taxa: abertos.length ? Math.round(100 * exploraram / abertos.length) : null };
}
