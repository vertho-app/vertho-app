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

export interface PilulaTemplateArgs {
  telefone: string;
  nome: string;
  semana: number;
  tema: string;
  /** Slug do tenant — vira o primeiro segmento do link curto. */
  slug: string;
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

export async function enviarPilulaPorTemplate(a: PilulaTemplateArgs): Promise<ResultadoPilulaTemplate> {
  const template = templatePilulaAtivo();
  if (!template || !cloudApiConfigurada()) return { tentou: false };

  const r = await enviarTemplateCloud(
    {
      phone: a.telefone,
      template,
      // Ordem é contrato do template: {{1}} nome, {{2}} semana, {{3}} tema.
      params: [a.nome, String(a.semana), a.tema],
      botaoParam: caminhoDoBotao(a),
    },
    {
      motivo: 'pilula',
      empresaId: a.empresaId ?? null,
      colaboradorId: a.colaboradorId ?? null,
      dedupeKey: a.dedupeKey ?? null,
    },
  );

  return { tentou: true, ok: r.ok, reason: r.reason };
}
