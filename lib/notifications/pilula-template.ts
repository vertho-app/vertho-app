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

/** Nome do template aprovado, ou `null` quando o caminho está desligado. */
export function templatePilulaAtivo(): string | null {
  const nome = (process.env.WHATSAPP_TEMPLATE_PILULA || '').trim();
  return nome || null;
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

export async function enviarPilulaPorTemplate(a: PilulaTemplateArgs): Promise<ResultadoPilulaTemplate> {
  const template = templatePilulaAtivo();
  const montar = contratoDoTemplate(template);

  if (!template || !cloudApiConfigurada()) return { tentou: false };
  if (!montar) {
    // Chave apontando para template desconhecido: não envia e DIZ. Silêncio aqui
    // viraria "a pílula não sai e ninguém sabe por quê".
    console.error(`[pilula-template] WHATSAPP_TEMPLATE_PILULA="${template}" não tem contrato em CONTRATOS — envio NÃO feito.`);
    return { tentou: false };
  }

  const { params, botaoParam } = montar(a);

  const r = await enviarTemplateCloud(
    { phone: a.telefone, template, params, botaoParam },
    {
      motivo: 'pilula',
      empresaId: a.empresaId ?? null,
      colaboradorId: a.colaboradorId ?? null,
      dedupeKey: a.dedupeKey ?? null,
    },
  );

  return { tentou: true, ok: r.ok, reason: r.reason };
}
