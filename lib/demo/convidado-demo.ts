import { isDemoPersonaEmail, isInternalEmail } from '@/lib/internal-emails';
import { ACME_PROSPECT_AUTH_PREFIX } from '@/lib/demo/acme-prospect-config';

/**
 * Quem, dentro de um tenant de demonstração, é CONVIDADO — e não cenário.
 *
 * O elenco fixo do seed (`*.demo@vertho.ai`) é o CONTEÚDO do ambiente: são as
 * personas que dão vida às telas, não gente que a Vertho está acompanhando. A
 * conta de staff também fica de fora. Sobra quem veio de fora: o passaporte da
 * degustação, o convidado nomeado do perfil do tenant (Alpheu, no Grupo Sinal)
 * e quem foi cadastrado à mão.
 *
 * ⚠️ O e-mail técnico do passaporte (`convidado.acme.<id>@vertho.ai`) É interno
 * pela régua canônica — de propósito, para ficar fora dos indicadores. Aqui ele
 * é a exceção explícita: é justamente a pessoa que estamos acompanhando.
 *
 * Régua ÚNICA, dois consumidores: o acompanhamento comercial em `/admin/demo`
 * (quem aparece na lista) e o assessment (quem responde a versão curta). Se as
 * duas divergirem, o painel acompanha uma pessoa que a experiência trata como
 * colaborador comum, ou o contrário.
 */
export function isEmailDeConvidadoDemo(email: string | null | undefined): boolean {
  const valor = String(email || '').trim().toLowerCase();
  if (!valor) return false;
  if (isDemoPersonaEmail(valor)) return false;
  if (valor.startsWith(ACME_PROSPECT_AUTH_PREFIX)) return true;
  return !isInternalEmail(valor);
}

/**
 * Quantas competências o convidado responde na degustação.
 *
 * A etapa 01 existe para a pessoa ENTENDER o fluxo (responder um cenário, ver a
 * devolutiva), não para produzir um diagnóstico: o diagnóstico completo é o que
 * ela vê pronto nas visões 02–04, com o ambiente já preenchido. Cinco cenários
 * de quatro perguntas cada é trabalho de avaliação real — e cada um custa uma
 * avaliação de IA (~1min48 de mediana) que ninguém vai ler numa demonstração.
 */
export const DEGUSTACAO_MAX_COMPETENCIAS = 1;

/**
 * O assessment desta pessoa é uma degustação?
 *
 * Exige as DUAS pontas: tenant de demonstração (`is_demo`, o mesmo gate que
 * bloqueia envio real) E convidado. Só o `is_demo` cortaria o assessment das
 * personas do fixture; só o e-mail cortaria o de gente real em tenant de
 * cliente, que é exatamente quem precisa das cinco competências.
 */
export function isAssessmentDeDegustacao(
  empresaIsDemo: boolean | null | undefined,
  email: string | null | undefined,
): boolean {
  return empresaIsDemo === true && isEmailDeConvidadoDemo(email);
}

/**
 * Aplica o teto da degustação a uma lista de competências, preservando a ordem.
 * Devolve a MESMA lista quando não é degustação — é este retorno que garante
 * que o corte não vaze para tenant de cliente.
 */
export function competenciasDaDegustacao<T>(
  competencias: readonly T[],
  degustacao: boolean,
): T[] {
  if (!degustacao) return [...competencias];
  return competencias.slice(0, DEGUSTACAO_MAX_COMPETENCIAS);
}
