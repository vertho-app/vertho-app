/**
 * O que o golden v2 congela (`golden-prompts-ia3-v2.json`): os prompts das regras v2 dos
 * cenários e o auditor do A nas duas réguas, que até 13/10/2026 não tinha golden nenhum.
 * Mudança DELIBERADA num deles regrava o JSON com o diff à vista, nunca em silêncio.
 */
import { buildCheckIA3SystemPrompt, montarPromptsGeracaoIA3 } from '@/lib/ia3-cenarios';
import { buildIA3SystemPromptV2, CONFERENCIA_FATOS_E_PAPEL_V2 } from '@/lib/ia3-cenarios-v2';
import { SYSTEM_CENARIO_B_V2, SYSTEM_CHECK_CENARIO_B_V2 } from '@/lib/cenarios-b-prompt';
import { FIXTURES_GOLDEN_IA3 } from './fixtures-golden-ia3';

const FICHA_GOLDEN = [
  'Cargo: Diretor(a) Escolar (posição de liderança)',
  'Área: Gestão',
  'Stakeholders: Professores; famílias; Secretaria.',
];

/** `minimo` vai sem ficha: cobre o aviso de ficha não preenchida. */
const FICHA_POR_FIXTURE: Record<string, string[]> = { completo: FICHA_GOLDEN, minimo: [], parcial: FICHA_GOLDEN };

export function promptsGoldenV2(): Record<string, string> {
  const out: Record<string, string> = {
    system_v2: buildIA3SystemPromptV2(),
    check_system_v1: buildCheckIA3SystemPrompt(),
    check_system_v2: buildCheckIA3SystemPrompt() + CONFERENCIA_FATOS_E_PAPEL_V2,
    b_system_v2: SYSTEM_CENARIO_B_V2,
    b_check_system_v2: SYSTEM_CHECK_CENARIO_B_V2,
  };
  const ctxDe = (x: any) => ({
    tdb: {}, empresa: x.empresa, comp: x.comp, descritores: x.descritores, valores: x.valores,
    contextoPPP: x.contextoPPP, cargoDetalhe: x.cargoDetalhe, gabCIS: x.gabCIS, versao: 'v2',
  });
  for (const [nome, f] of Object.entries(FIXTURES_GOLDEN_IA3)) {
    const x: any = f;
    out[`user_v2_${nome}`] = montarPromptsGeracaoIA3({ ...ctxDe(x), fichaLinhas: FICHA_POR_FIXTURE[nome] } as any, x.cargoNome).user;
  }
  // Com o caso real do gestor (mig 286): o bloco do caso também é régua.
  const c: any = FIXTURES_GOLDEN_IA3.completo;
  out.user_v2_completo_com_caso = montarPromptsGeracaoIA3({
    ...ctxDe(c), fichaLinhas: FICHA_GOLDEN,
    casoReal: 'Dois professores discordaram sobre a recuperação de uma turma; a coordenação ouviu os dois e decidiu com o conselho.',
  } as any, c.cargoNome).user;
  return out;
}
