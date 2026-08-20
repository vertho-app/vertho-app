/**
 * Disparo MANUAL, em lote, de um template aprovado — o núcleo da aba WhatsApp
 * da tela de Envios.
 *
 * POR QUE ISTO EXISTE (medido em 20/08/2026)
 * ─────────────────────────────────────────
 * A tela de Envios montava TEXTO LIVRE com `{{nome}}` e mandava por
 * `lib/whatsapp` — cujos dois provedores registrados são Z-API e WaSender.
 * Nenhum deles é a Cloud API oficial, que é o canal desde 14/08. Resultado
 * medido em 14 dias: **392 entregas pela Cloud API contra 0 por texto livre**, o
 * último sucesso do caminho antigo em 13/08 12:50, e **633 falhas**
 * `zapi: saúde: desconectada`.
 *
 * E não é questão de reconectar o provedor: fora da janela de 24h a Meta só
 * entrega TEMPLATE APROVADO. "Escrever a mensagem na hora e mandar para um
 * filtro de pessoas" deixou de existir como operação — o que existe é template
 * (aqui) ou texto livre para quem escreveu nas últimas 24h (a inbox).
 *
 * 🔴 O PIOR SINTOMA ERA A TELA MENTIR: o disparo reportava "N agendados" no
 * enfileiramento, e o desfecho chegava depois, no webhook, sem voltar para quem
 * clicou. Aqui o retorno é o que a Meta ACEITOU, por pessoa — e o texto diz
 * explicitamente que entrega confirmada é outro carimbo (`delivered_at`, do
 * webhook de status).
 *
 * Núcleo em `lib/` de propósito: a action `'use server'` aplica o gate e delega,
 * e script/cron chamam direto sem HTTP. Ver CLAUDE.md §"Server Actions são
 * endpoints HTTP".
 */
import { TEMPLATES, type TemplateDef } from '@/lib/whatsapp/templates';
import { contratoDoTemplate, type PilulaTemplateArgs } from '@/lib/notifications/pilula-template';
import { enviarTemplateCloud, cloudApiConfigurada } from '@/lib/whatsapp/cloud-api';
import { aplicarTetoLote, criarPaceadorSincrono } from '@/lib/whatsapp/cadencia';
import { tenantUrl } from '@/lib/domain';

/** Primeiro nome apresentável — "JANAINA" vira "Janaina", "McDonald" fica. */
export function primeiroNome(completo: string | null | undefined): string {
  const bruto = String(completo || '').trim().split(/\s+/)[0] || '';
  if (!bruto) return 'Olá';
  if (bruto !== bruto.toUpperCase()) return bruto;
  return bruto.charAt(0) + bruto.slice(1).toLowerCase();
}

export interface ContextoEnvio {
  empresaId: string;
  empresaNome: string;
  empresaSlug: string;
  /** `cargos_empresa.top5_workshop` por cargo (minúsculo) — régua da tela do assessment. */
  top5PorCargo: Map<string, string[]>;
}

export interface ColaboradorAlvo {
  id: string;
  nome_completo: string | null;
  cargo: string | null;
  telefone: string | null;
  whatsapp?: string | null;
}

/** Args montados, ou o motivo de a pessoa NÃO poder receber este template. */
type Resolucao = { args: PilulaTemplateArgs } | { excluir: string };

/**
 * Como cada template disparável preenche os seus `{{n}}`.
 *
 * 🔑 O contrato NÃO se deduz do nome (`CONTRATOS` existe por isso), e o
 * PREENCHIMENTO também não: `{{2}}` é "instituição" num template e "competência"
 * noutro. Este mapa é o par que faltava — sem ele, uma tela genérica mandaria
 * a mesma variável para todos e entregaria mensagem sem sentido.
 *
 * Quem NÃO está aqui não aparece na tela, mesmo aprovado na Meta. Ficam de fora,
 * por decisão:
 *   - os da CADÊNCIA (`conteudo_semana`, `registro_*`, `missao_*`,
 *     `retomada_trilha`): dependem de semana/tema/formato da trilha da pessoa e
 *     têm dono próprio (o cron). Disparar à mão anunciaria uma semana que o
 *     motor não considera entregue;
 *   - `acesso_vertho` e `otp_acesso`: carregam CREDENCIAL, gerada por pessoa. O
 *     caminho é o botão de magic link desta mesma tela, que passa pelo serviço
 *     de acesso;
 *   - `recorte_demonstracao`: o destinatário é lead do CONARH, não colaborador.
 */
const RESOLVEDORES: Record<string, (c: ColaboradorAlvo, ctx: ContextoEnvio) => Resolucao> = {
  avaliacao_competencias: (c, ctx) => {
    const competencia = (ctx.top5PorCargo.get(String(c.cargo || '').toLowerCase()) || [])[0];
    // Sem competência resolvida o `{{2}}` sairia vazio ("sua avaliação de  ainda
    // não foi iniciada"). Excluir é a falha ALTA na construção, que é onde há
    // humano para corrigir — ver CLAUDE.md §fallback silencioso.
    if (!competencia) return { excluir: 'cargo sem competência em top5_workshop' };
    return { args: base(c, ctx, { competencia }) };
  },
  avaliacao_pendente: (c, ctx) => ({ args: base(c, ctx) }),
  boas_vindas_v2: (c, ctx) => ({ args: base(c, ctx) }),
  resultado_perfil: (c, ctx) => ({ args: base(c, ctx) }),
  plano_desenvolvimento: (c, ctx) => ({ args: base(c, ctx) }),
};

function base(c: ColaboradorAlvo, ctx: ContextoEnvio, extra: Partial<PilulaTemplateArgs> = {}): PilulaTemplateArgs {
  return {
    telefone: String(c.whatsapp || c.telefone || ''),
    nome: primeiroNome(c.nome_completo),
    semana: 1,
    tema: '',
    slug: ctx.empresaSlug,
    baseUrl: tenantUrl(ctx.empresaSlug),
    instituicao: ctx.empresaNome,
    empresaId: ctx.empresaId,
    colaboradorId: c.id,
    ...extra,
  };
}

export interface TemplateDisparavel {
  template: string;
  categoria: string;
  /** Corpo literal aprovado na Meta — a tela mostra ISTO, não uma paráfrase. */
  corpo: string;
  /** O que preenche cada `{{n}}`, na ordem. */
  variaveis: string[];
  /** Quem costuma ser o destinatário — orienta o filtro, não o aplica. */
  alvoSugerido: string;
}

const VARIAVEIS_DE: Record<string, string[]> = {
  avaliacao_competencias: ['primeiro nome', 'competência do cargo (top5_workshop)', 'link do assessment'],
  avaliacao_pendente: ['primeiro nome', 'nome da instituição', 'link do assessment'],
  boas_vindas_v2: ['primeiro nome', 'nome da instituição', 'link de /entrar'],
  resultado_perfil: ['primeiro nome', 'link do perfil comportamental'],
  plano_desenvolvimento: ['primeiro nome', 'link do PDI'],
};

const ALVO_DE: Record<string, string> = {
  avaliacao_competencias: 'já fez o mapeamento comportamental e não iniciou o assessment',
  avaliacao_pendente: 'não deu nenhum passo (sem DISC e sem assessment)',
  boas_vindas_v2: 'primeiro contato da turma — quem nunca recebeu mensagem',
  resultado_perfil: 'já tem perfil comportamental e pode não saber',
  plano_desenvolvimento: 'já tem relatório/PDI gerado',
};

/** Templates que a tela pode disparar: têm resolvedor E contrato de parâmetros. */
export function listarTemplatesDisparaveis(): TemplateDisparavel[] {
  const defs = Object.values(TEMPLATES) as TemplateDef[];
  return Object.keys(RESOLVEDORES)
    .filter((nome) => !!contratoDoTemplate(nome))
    .map((nome) => {
      const def = defs.find((d) => d.name === nome);
      return {
        template: nome,
        categoria: def?.category || 'UTILITY',
        corpo: def?.body || '',
        variaveis: VARIAVEIS_DE[nome] || [],
        alvoSugerido: ALVO_DE[nome] || '',
      };
    })
    .sort((a, b) => a.template.localeCompare(b.template));
}

export interface AlvoPreparado {
  colaboradorId: string;
  nome: string;
  telefone: string;
  params: string[];
}

export interface LotePreparado {
  template: string;
  corpo: string;
  alvos: AlvoPreparado[];
  /** Agrupado por motivo — quem some tem que aparecer em algum lugar. */
  excluidos: { motivo: string; quantidade: number; amostra: string[] }[];
  /** Já receberam ESTE template antes (idempotência por `kind`). */
  jaReceberam: number;
  /** Excedente do teto por disparo, devolvido em vez de cortado em silêncio. */
  adiadosPorTeto: number;
  avisoTeto?: string;
}

/**
 * Monta o lote SEM enviar: é a prévia da tela e o dry-run do script.
 *
 * `colabs` já vem filtrado pela tela (cargo/voto/DISC/mapeamento) — este núcleo
 * não reimplementa esses filtros de propósito: duas cópias da mesma régua
 * divergem, e aqui a régua já existe em `loadColaboradoresEnvio`.
 */
export async function prepararLoteTemplate(
  sb: any,
  opts: { empresaId: string; template: string; colabs: ColaboradorAlvo[]; incluirJaEnviados?: boolean },
): Promise<LotePreparado> {
  const { empresaId, template, colabs, incluirJaEnviados = false } = opts;

  const montar = contratoDoTemplate(template);
  const resolver = RESOLVEDORES[template];
  if (!montar || !resolver) throw new Error(`template "${template}" não é disparável por esta tela`);

  const { data: empresa, error: eE } = await sb.from('empresas')
    .select('id, nome, slug, is_demo').eq('id', empresaId).maybeSingle();
  if (eE) throw new Error(`empresas: ${eE.message}`);
  if (!empresa) throw new Error('empresa não encontrada');
  if (empresa.is_demo) throw new Error('tenant de demonstração não envia comunicação real');

  const { data: cargos, error: eC } = await sb.from('cargos_empresa')
    .select('nome, top5_workshop').eq('empresa_id', empresaId);
  if (eC) throw new Error(`cargos_empresa: ${eC.message}`);
  const ctx: ContextoEnvio = {
    empresaId,
    empresaNome: empresa.nome,
    empresaSlug: empresa.slug,
    top5PorCargo: new Map((cargos || []).map((c: any) => [String(c.nome || '').toLowerCase(), (c.top5_workshop || []) as string[]])),
  };

  // Idempotência por TEMPLATE (`kind` = nome do template): dois templates podem
  // descrever o mesmo momento com textos diferentes, e o segundo existe para
  // alcançar quem o primeiro não moveu. Guarda genérica tornaria correção de
  // copy inaplicável.
  const { data: jaForam, error: eJ } = await sb.from('notification_deliveries')
    .select('colaborador_id').eq('empresa_id', empresaId).eq('kind', template).eq('channel', 'whatsapp');
  if (eJ) throw new Error(`notification_deliveries: ${eJ.message}`);
  const recebidos = new Set((jaForam || []).map((d: any) => d.colaborador_id));

  const excl = new Map<string, string[]>();
  const empurra = (motivo: string, nome: string) => {
    const l = excl.get(motivo) || [];
    l.push(nome);
    excl.set(motivo, l);
  };

  const alvos: AlvoPreparado[] = [];
  for (const c of colabs) {
    const nome = c.nome_completo || '(sem nome)';
    const fone = c.whatsapp || c.telefone;
    if (!fone) { empurra('sem telefone/WhatsApp', nome); continue; }
    if (!incluirJaEnviados && recebidos.has(c.id)) continue;
    const r = resolver(c, ctx);
    if ('excluir' in r) { empurra(r.excluir, nome); continue; }
    const { params } = montar(r.args);
    if (params.some((p) => !String(p || '').trim())) { empurra('parâmetro do template ficou vazio', nome); continue; }
    alvos.push({ colaboradorId: c.id, nome, telefone: String(fone), params });
  }

  const { enviar, adiados, aviso } = aplicarTetoLote(alvos);
  const def = (Object.values(TEMPLATES) as TemplateDef[]).find((d) => d.name === template);

  return {
    template,
    corpo: def?.body || '',
    alvos: enviar,
    excluidos: [...excl.entries()].map(([motivo, nomes]) => ({ motivo, quantidade: nomes.length, amostra: nomes.slice(0, 5) })),
    jaReceberam: colabs.filter((c) => recebidos.has(c.id)).length,
    adiadosPorTeto: adiados.length,
    avisoTeto: aviso,
  };
}

export interface ResumoEnfileiramento {
  enfileirados: number;
  falhas: { nome: string; motivo: string }[];
  adiadosPorTeto: number;
  /** Quanto tempo o lote leva para escoar, no ritmo da política. */
  duracao: string;
}

/**
 * Enfileira o lote no QStash — **este é o caminho da TELA**.
 *
 * 🔴 Por que não o loop síncrono: `LIMIAR_ENVIO_DIRETO = 1` na tela de Envios
 * não é capricho. A 6s por mensagem, 40 destinatários são 4 minutos dentro de
 * uma Server Action — e a page é `'use client'`, então não há onde declarar
 * `maxDuration`. A request morreria DEPOIS de já ter enviado parte, e o admin
 * veria erro sobre mensagem entregue. Com a fila, a tela responde na hora e o
 * ritmo fica com o QStash (`Upstash-Delay`, o mesmo `atrasosDoLote` da política).
 *
 * O `dispararLoteTemplate` síncrono continua existindo para SCRIPT de bancada,
 * onde não há timeout de HTTP e ver a mensagem sair uma a uma é o que se quer.
 */
export async function enfileirarLoteTemplate(lote: LotePreparado, empresaId: string): Promise<ResumoEnfileiramento> {
  const { publicarTemplateCloudCis } = await import('@/lib/qstash-publish');
  const { atrasosDoLote, duracaoEstimada } = await import('@/lib/whatsapp/cadencia');

  const atrasos = atrasosDoLote(lote.alvos.length);
  const falhas: { nome: string; motivo: string }[] = [];
  let enfileirados = 0;

  // Publicações em paralelo, com o atraso vindo da política: sequencial com
  // latência transatlântica estourava o timeout da lambda e só as primeiras
  // eram publicadas (lição do lote de 11/08).
  await Promise.all(lote.alvos.map(async (alvo, i) => {
    try {
      await publicarTemplateCloudCis({
        telefone: alvo.telefone,
        template: lote.template,
        templateParams: alvo.params,
        colaboradorId: alvo.colaboradorId,
        empresaId,
      }, atrasos[i]);
      enfileirados++;
    } catch (e: any) {
      falhas.push({ nome: alvo.nome, motivo: e?.message || String(e) });
    }
  }));

  return { enfileirados, falhas, adiadosPorTeto: lote.adiadosPorTeto, duracao: duracaoEstimada(lote.alvos.length) };
}

export interface ResumoEnvio {
  aceitos: number;
  falhas: number;
  detalhes: { nome: string; ok: boolean; motivo?: string }[];
  adiadosPorTeto: number;
  /** Ficaram para depois porque o orçamento de tempo da invocação acabou. */
  naoAlcancados: number;
  motivoDoCorte: string | null;
}

/**
 * Envia o lote já preparado, no ritmo da política única (6s + jitter).
 *
 * ⚠️ `aceitos` é o que a META ACEITOU — não é entrega. A confirmação vem depois,
 * pelo webhook de status, em `notification_deliveries.delivered_at`. Chamar isto
 * de "entregue" na tela seria repetir o erro que esta reescrita corrige.
 *
 * 🔴 O loop PARA quando o paceador diz que não cabe mais no tempo da invocação.
 * A 6s por mensagem, 40 já são 4 minutos — sem esse corte, a lambda morreria no
 * meio e ninguém saberia onde parou (o cenário que `cadencia.ts` descreve como
 * pior que o bloqueio). Quem sobrou volta contado em `naoAlcancados`, e a
 * idempotência por `kind` faz o segundo clique continuar de onde ficou.
 */
export async function dispararLoteTemplate(lote: LotePreparado, empresaId: string): Promise<ResumoEnvio> {
  if (!cloudApiConfigurada()) throw new Error('Cloud API não configurada');

  const paceador = criarPaceadorSincrono();
  const detalhes: ResumoEnvio['detalhes'] = [];
  let aceitos = 0, falhas = 0, enviados = 0;

  for (const alvo of lote.alvos) {
    if (paceador.tetoAtingido()) break;
    await paceador.aguardarVez();
    const r = await enviarTemplateCloud(
      { phone: alvo.telefone, template: lote.template, params: alvo.params, botaoParam: null },
      // `motivo` vira o `kind` da telemetria — é o que permite medir cada copy
      // separadamente e o que faz a idempotência acima funcionar.
      { motivo: lote.template, empresaId, colaboradorId: alvo.colaboradorId, dedupeKey: `${lote.template}:${alvo.colaboradorId}` },
    );
    enviados++;
    if (r.ok) { aceitos++; detalhes.push({ nome: alvo.nome, ok: true }); }
    else { falhas++; detalhes.push({ nome: alvo.nome, ok: false, motivo: r.reason }); }
  }

  return {
    aceitos,
    falhas,
    detalhes,
    adiadosPorTeto: lote.adiadosPorTeto,
    naoAlcancados: lote.alvos.length - enviados,
    motivoDoCorte: lote.alvos.length > enviados ? paceador.motivoDoTeto() : null,
  };
}
