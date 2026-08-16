/**
 * A pílula pela Cloud API, com template aprovado — o caminho novo.
 *
 * POR QUE ATRÁS DE UMA CHAVE, e não ligado direto
 * ───────────────────────────────────────────────
 * Template não aprovado é recusado pela Meta com 132001, e do ponto de vista da
 * pessoa a pílula simplesmente não chega. Em 15/08/2026, dos 16 templates da
 * conta, **12 estavam PENDING** — incluindo este. Ligar antes da aprovação
 * trocaria um canal que às vezes funciona por um que não funciona nunca.
 *
 * `WHATSAPP_TEMPLATE_PILULA` guarda o NOME do template aprovado. Ausente ⇒ o
 * caminho legado (texto livre pela fila) segue valendo, sem nenhuma mudança de
 * comportamento. É uma chave com CONSUMIDOR — este arquivo — e o teste prova os
 * dois ramos: config declarada que ninguém lê já custou caro nesta base.
 *
 * ⚠️ QUANDO LIGAR, ACOMPANHE O PRIMEIRO ENVIO. Este ramo só é exercitado de
 * verdade contra a Meta; até lá, o que existe é teste com o cliente stubado.
 */
import { enviarTemplateCloud, cloudApiConfigurada } from '@/lib/whatsapp/cloud-api';
import { deepLinkSemana, labelFormato } from '@/lib/notifications/pilula-envio';

export interface PilulaTemplateArgs {
  telefone: string;
  nome: string;
  semana: number;
  tema: string;
  /** Slug do tenant — vira o primeiro segmento do link curto. */
  slug: string;
  /** URL do tenant (`https://ibipeba.vertho.ai`) — para o template que leva link no corpo. */
  baseUrl: string;
  formato?: string | null;
  pilula?: number | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  dedupeKey?: string | null;
  /** `<slug>~<token_hash>` do magic link — só para o papel `acesso`. */
  acessoParam?: string | null;
}

export interface ResultadoPilulaTemplate {
  /** `false` = o caminho nem foi tentado; o chamador deve usar o legado. */
  tentou: boolean;
  ok?: boolean;
  reason?: string;
}

/**
 * Sufixo do botão: `<slug>/<semana>[/<formato>[/<pilula>]]`.
 *
 * É só o VALOR de `{{1}}` — a URL fixa (`https://app.vertho.ai/ir/`) mora no
 * template, na Meta. Mandar a URL inteira aqui produziria `/ir/https://…`, que
 * não dá erro na API e chega quebrado para a pessoa.
 */
export function caminhoDoBotao(a: Pick<PilulaTemplateArgs, 'slug' | 'semana' | 'formato' | 'pilula'>): string {
  const partes = [a.slug, String(a.semana)];
  if (a.formato) {
    partes.push(a.formato);
    // A pílula (1 ou 2) só faz sentido depois do formato: o caminho é posicional.
    if (a.pilula) partes.push(String(a.pilula));
  }
  return partes.join('/');
}

/**
 * Papéis da cadência que podem sair por template.
 *
 * Cada um tem a SUA chave: a quinta-feira e a pílula aprovam em momentos
 * diferentes, e uma chave só obrigaria a ligar tudo junto — ou nada.
 */
export type PapelCadencia = 'pilula' | 'evidencia' | 'desafio' | 'retomada' | 'perfil' | 'acesso' | 'missao';

const ENV_DO_PAPEL: Record<PapelCadencia, string> = {
  pilula: 'WHATSAPP_TEMPLATE_PILULA',
  evidencia: 'WHATSAPP_TEMPLATE_EVIDENCIA',
  desafio: 'WHATSAPP_TEMPLATE_DESAFIO',
  retomada: 'WHATSAPP_TEMPLATE_RETOMADA',
  perfil: 'WHATSAPP_TEMPLATE_PERFIL',
  acesso: 'WHATSAPP_TEMPLATE_ACESSO',
  missao: 'WHATSAPP_TEMPLATE_MISSAO',
};

/** Nome do template aprovado para o papel, ou `null` quando está desligado. */
export function templateAtivo(papel: PapelCadencia): string | null {
  const nome = (process.env[ENV_DO_PAPEL[papel]] || '').trim();
  return nome || null;
}

/** @deprecated use `templateAtivo('pilula')`. Mantido para não quebrar chamador. */
export function templatePilulaAtivo(): string | null {
  return templateAtivo('pilula');
}

/**
 * 🔴 CADA TEMPLATE APROVADO TEM O SEU CONTRATO — e ele não se deduz do nome.
 *
 * Descoberto ao ligar, em 15/08/2026: `pilula_semanal` foi aprovado com
 * `{{1}}`=formato, `{{2}}`=tema, `{{3}}`=**link no corpo**, e SEM botão. O
 * código mandava `[nome, semana, tema]` + parâmetro de botão. Ligar sem
 * conferir teria entregado *"Seu Maria de hoje: **5**. Acesse: Escuta ativa…"*
 * a 36 pessoas — ou uma recusa por componente que não existe.
 *
 * Por isso o mapeamento é EXPLÍCITO por nome de template. Nome fora daqui não
 * liga (fail-closed): mandar parâmetros no formato errado não dá erro de
 * compilação, dá mensagem sem sentido na mão de gente real.
 */
type MontarParams = (a: PilulaTemplateArgs) => { params: string[]; botaoParam?: string | null };

const CONTRATOS: Record<string, MontarParams> = {
  /**
   * ✅ O PREFERIDO desde 15/08/2026: copy factual, aprovada como **UTILITY**.
   *
   * Custa ~R$ 0,08 contra ~R$ 0,45 do `pilula_semanal` (MARKETING) — 6× menos
   * pela mesma entrega. Corpo conferido na Meta antes de mapear:
   * `{{1}}`=nome, `{{2}}`=semana, `{{3}}`=tema, `{{4}}`=link. Sem botão.
   */
  conteudo_semana: (a) => ({
    params: [a.nome, String(a.semana), a.tema, deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Quinta-feira, semana de APLICAÇÃO: cobra o registro de evidência.
   * APPROVED/UTILITY. `{{1}}`=nome, `{{2}}`=semana, `{{3}}`=link. Sem botão.
   */
  /**
   * Segunda-feira da semana de APLICAÇÃO (4/8/12): anuncia a missão.
   * APPROVED/UTILITY em 16/08/2026. `{{1}}`=nome, `{{2}}`=semana, `{{3}}`=link.
   * Sem botão.
   *
   * ⚠️ O link vai SEM `formato`: semana de aplicação não entrega conteúdo novo,
   * então anunciar um formato prometeria o que não existe — a classe da R1 do
   * health.
   *
   * Substitui `missao_semana` e `missao_aplicacao`, que a Meta aprovou como
   * MARKETING (6× o custo) e que descreviam o MESMO momento com dois templates.
   */
  missao_semana_v2: (a) => ({
    params: [a.nome, String(a.semana), deepLinkSemana(a.baseUrl, a.semana)],
    botaoParam: null,
  }),

  registro_evidencia: (a) => ({
    params: [a.nome, String(a.semana), deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Quinta-feira, semana de CONTEÚDO: cobra a prática do desafio.
   * APPROVED/UTILITY, mesma forma do `registro_evidencia` — mas texto diferente,
   * e trocar um pelo outro entrega a cobrança errada para a pessoa certa.
   */
  registro_desafio: (a) => ({
    params: [a.nome, String(a.semana), deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Inatividade de 2+ semanas. APPROVED/**UTILITY** — substitui o
   * `nudge_inatividade`, que a Meta classificou como MARKETING (6× o custo) por
   * causa da voz antiga ("Notamos que…", "Que tal retomar hoje?", emoji).
   * `{{1}}`=nome, `{{2}}`=link. Sem botão.
   */
  retomada_trilha: (a) => ({
    params: [a.nome, deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),

  /**
   * Perfil comportamental pronto. APPROVED/UTILITY, 2 variáveis (nome, link).
   *
   * 🔴 O template estava aprovado e a copy pronta em `lib/notifications.ts`
   * desde sempre — e **sem nenhum consumidor**: ninguém chamava
   * `templateWhatsAppCIS`. Resultado medido em 15/08/2026: ~120 pessoas
   * responderam a avaliação e nunca souberam que o resultado saiu. É a mesma
   * classe do `listarNaoResolvidas` sem tela — a peça existe e não é acionada.
   *
   * ⚠️ O DISPARO NÃO ACONTECE NA GERAÇÃO DO RELATÓRIO, de propósito: aquele
   * caminho roda em LOTE (dezenas de relatórios seguidos), e mandar uma
   * mensagem por relatório gerado é uma rajada — exatamente o padrão que
   * derrubou o número em 11/08. Quem dispara é
   * `scripts/_avisar-perfil-pronto.ts`, com teto e espaçamento.
   */
  resultado_perfil: (a) => ({
    params: [a.nome, `${a.baseUrl}/dashboard/perfil-comportamental`],
    botaoParam: null,
  }),

  /**
   * Magic link por WhatsApp. APPROVED/UTILITY (15/08).
   *
   * 🔴 CORPO SEM VARIÁVEL — texto fixo, e só o BOTÃO varia. `params` vazio é
   * intencional: com um array vazio, `enviarTemplateCloud` OMITE o componente
   * body, porque mandar `parameters: []` faz a Meta recusar por parâmetro que o
   * template não espera.
   *
   * O `{{1}}` do botão é `<slug>~<token_hash>` (`montarParametroAcesso`), e quem
   * o desempacota é `/entrar` — a base do botão é fixa e o multi-tenant vive em
   * subdomínio, então o salto existe para a sessão nascer no host certo.
   *
   * ⚠️ O parâmetro aqui NÃO é o link completo: mandar a URL inteira produziria
   * `/entrar?t=https://…`, que não dá erro na API e leva a pessoa a lugar nenhum.
   */
  acesso_vertho: (a) => ({
    params: [],
    botaoParam: a.acessoParam ?? null,
  }),

  /** Copy ANTIGA, aprovada como MARKETING (6× o custo). Link no CORPO, sem botão. */
  pilula_semanal: (a) => ({
    params: [labelFormato(a.formato), a.tema, deepLinkSemana(a.baseUrl, a.semana, a.formato, a.pilula)],
    botaoParam: null,
  }),
  /** Copy factual com o link no BOTÃO — o desenho novo (ver templates.ts). */
  conteudo_semana_v2: (a) => ({
    params: [a.nome, String(a.semana), a.tema],
    botaoParam: caminhoDoBotao(a),
  }),
};

/** O template configurado tem contrato conhecido? Sem isso, não se envia. */
export function contratoDoTemplate(nome: string | null): MontarParams | null {
  return nome ? CONTRATOS[nome] ?? null : null;
}

export async function enviarPorTemplate(
  papel: PapelCadencia,
  a: PilulaTemplateArgs,
): Promise<ResultadoPilulaTemplate> {
  const template = templateAtivo(papel);
  const montar = contratoDoTemplate(template);

  if (!template || !cloudApiConfigurada()) return { tentou: false };
  if (!montar) {
    // Chave apontando para template desconhecido: não envia e DIZ. Silêncio aqui
    // viraria "a pílula não sai e ninguém sabe por quê".
    console.error(`[cadencia-template] ${ENV_DO_PAPEL[papel]}="${template}" não tem contrato em CONTRATOS — envio NÃO feito.`);
    return { tentou: false };
  }

  const { params, botaoParam } = montar(a);

  const r = await enviarTemplateCloud(
    { phone: a.telefone, template, params, botaoParam },
    {
      // `motivo` vira o `kind` da telemetria: é o que separa pílula de cobrança
      // de quinta nas métricas de entrega.
      motivo: papel,
      empresaId: a.empresaId ?? null,
      colaboradorId: a.colaboradorId ?? null,
      dedupeKey: a.dedupeKey ?? null,
    },
  );

  return { tentou: true, ok: r.ok, reason: r.reason };
}

/** Atalho do papel mais usado — mantém o call-site da pílula legível. */
export function enviarPilulaPorTemplate(a: PilulaTemplateArgs): Promise<ResultadoPilulaTemplate> {
  return enviarPorTemplate('pilula', a);
}
