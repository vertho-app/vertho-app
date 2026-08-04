'use server';

import crypto from 'crypto';
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarEvento } from '@/lib/radar/eventos';
import { APP_WEBHOOK_URL, QSTASH_BASE_URL } from '@/lib/domain';
import { sendWhatsapp } from '@/lib/whatsapp';
import { rotuloPorta } from '@/lib/conarh/conteudo';
import { classificarLeadConarh } from '@/lib/conarh/classificacao';

/**
 * Captura de lead comercial do Radar Bett SEM escopo de escola/município
 * obrigatório.
 *
 * Diferente de `capturarLead` (em app/radar/actions.ts), que valida que
 * scope_id corresponde a INEP/IBGE real do banco, este aceita o lead
 * mesmo sem busca prévia (ex: usuário clicou em "Agendar conversa" no
 * header, sem ter selecionado escola).
 *
 * Salva em diag_leads com scope_type='comercial' e scope_id='radarbett'
 * pra distinguir dos leads orgânicos do Radar.
 *
 * NÃO dispara worker de PDF — sem escopo concreto, não há proposta
 * individual a gerar. A equipe Vertho recebe via dashboard funnel-bett.
 *
 * ── CONARH 52 ────────────────────────────────────────────────────────────
 * Campanha 'conarh' (scope_id 'conarh-2026'): além dos campos base, grava a
 * qualificação da feira (porta, competência, horizonte, sessão da demo,
 * reunião) nas colunas da mig 196, classifica A/B/C NO SERVIDOR e dispara o
 * worker assíncrono /api/conarh/artefato (T+0: WhatsApp + e-mail com o Mapa
 * da Evolução). Lead classe A gera alerta WhatsApp best-effort ao fechador.
 *
 * Envs novas:
 *   - CONARH_ALERT_WHATSAPP — número (E.164) do fechador que recebe o alerta
 *     de lead A e os resumos da régua. Ausente → alerta pulado, captura intacta.
 */

/**
 * Campanhas conhecidas → o `scope_id` gravado. Allowlist, não campo livre: o
 * scope_id é por onde o funil separa os leads, e um valor digitado errado (ou
 * escolhido pelo cliente, já que toda export daqui é endpoint HTTP) some da
 * contagem sem erro nenhum.
 *
 * Até a mig 195 isto era a string 'radarbett' cravada no insert — um lead de
 * feira entrava contabilizado como Radar Bett.
 */
const CAMPANHAS: Record<string, string> = {
  radarbett: 'radarbett',
  conarh: 'conarh-2026',
};
const CAMPANHA_PADRAO = 'radarbett';

/**
 * A campanha define APENAS o scope_id (rótulo do funil), nunca o rate limit.
 *
 * Houve uma versão em que campanha de evento elevava o teto de IP, protegida por
 * token — mas o formulário roda no navegador do visitante, então o token teria
 * de viajar no bundle público e não seria segredo. Decisão do Rodrigo (28/07):
 * subir o teto de IP para todo mundo e aceitar o risco de flood, que aqui custa
 * lead falso no funil — não vazamento nem indisponibilidade.
 *
 * A campanha continua vindo de allowlist: o valor é escolhido pelo cliente (toda
 * export daqui é endpoint HTTP), então o pior caso é rotular um lead na campanha
 * errada, e não gravar texto arbitrário no scope_id.
 */

export type ConarhSessaoInput = {
  /**
   * Etapa 2 desde 04/08/2026: o visitante escolhe, entre 4 respostas a um
   * cenário, a que ACEITARIA — e `nivel_aceito` é o nível dessa resposta na
   * régua. Substituiu `nota_instintiva`/`reavaliacao`/`divergencias`, que
   * mediam o mecanismo antigo (registro escrito + reavaliação por descritor).
   */
  cenario?: {
    regua?: string;
    competencia?: string;
    cenario?: string;
    descritor?: string;
    nivel_aceito?: number;
    nivel_meta?: number;
  };
  rotas_iniciadas?: number[];
  rotas_concluidas?: number[];
  /** Porta de onde a captura foi aberta — o gesto de apontar da abordagem. */
  porta_origem?: number;
};

export type CapturarLeadComercialInput = {
  // Dados pessoais — email OU whatsapp; pelo menos um
  nome: string;
  email?: string;
  whatsapp?: string;
  cargo: string;
  // Contexto institucional
  instituicao: string;
  municipio?: string;
  tipo?: 'publica' | 'privada';
  qtd_alunos?: string;
  qtd_escolas?: string;
  // Origem
  origem?: 'home' | 'header' | 'persona' | 'cta_final' | 'sticky' | 'comparar' | 'public_cta' | string;
  /** Campanha (chave de CAMPANHAS). Define o scope_id — default: radarbett. */
  campanha?: string;
  // Se tinha algum scope mas era inválido, registra como referência
  scope_label_original?: string;
  // LGPD
  consentimento_lgpd: boolean;

  // ── CONARH 52 (campanha 'conarh') — todos opcionais e ignorados nas demais
  // campanhas: a classe é calculada NO SERVIDOR, nunca aceita do cliente.
  /** Alias de `whatsapp` no formulário da feira. */
  telefone?: string;
  /** Alias de `instituicao` no formulário da feira. */
  organizacao?: string;
  porta?: 1 | 2 | 3 | 4 | 5;
  competencia?: string;
  horizonte?: 'rodando' | 'ate_3m' | '3_a_6m' | 'sem_data';
  decide_ou_recomenda?: boolean;
  aceitou_proximo_passo?: boolean;
  /**
   * Curioso, fornecedor, concorrente ou fora do ICP — marcado pelo expositor.
   * Sem este campo a classe C era inalcançável no tablet (ver lib/conarh/classificacao).
   */
  fora_do_perfil?: boolean;
  /** ISO datetime da reunião marcada no estande. */
  slot?: string;
  sessao?: ConarhSessaoInput;
};

/**
 * Retorno em DOIS formatos, por compatibilidade:
 *  - legado radarbett: `success` / `leadId` / `error` (modal do Bett só olha `error`);
 *  - contrato CONARH: `ok: true, id, classe` ou `ok: false, erro`.
 */
export type CapturarLeadComercialResult = {
  success: boolean;
  leadId?: string;
  error?: string;
  ok: boolean;
  id?: string;
  classe?: 'A' | 'B' | 'C';
  erro?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Horizontes válidos da feira — allowlist, o valor vem do cliente. */
const HORIZONTES_CONARH = new Set(['rodando', 'ate_3m', '3_a_6m', 'sem_data']);

/** Falha nos DOIS formatos de retorno (legado + contrato CONARH). */
function falha(error: string): CapturarLeadComercialResult {
  return { success: false, error, ok: false, erro: error };
}

/** Sessão da demo: aceita só as chaves conhecidas, com teto de tamanho. */
function sanitizarSessaoConarh(s?: ConarhSessaoInput): Record<string, unknown> | null {
  if (!s || typeof s !== 'object') return null;
  const out: Record<string, unknown> = {};
  const c = s.cenario;
  if (c && typeof c === 'object') {
    const nivelAceito = Number(c.nivel_aceito);
    // Sem nível não há o que medir: a linha entraria no painel como sessão
    // sem resposta e afundaria a média.
    if (nivelAceito >= 1 && nivelAceito <= 4) {
      const nivelMeta = Number(c.nivel_meta);
      out.cenario = {
        regua: String(c.regua || '').slice(0, 80),
        competencia: String(c.competencia || '').slice(0, 200),
        cenario: String(c.cenario || '').slice(0, 80),
        descritor: String(c.descritor || '').slice(0, 40),
        nivel_aceito: Math.trunc(nivelAceito),
        nivel_meta: nivelMeta >= 1 && nivelMeta <= 4 ? Math.trunc(nivelMeta) : 3,
      };
    }
  }
  for (const chave of ['rotas_iniciadas', 'rotas_concluidas'] as const) {
    const lista = s[chave];
    if (Array.isArray(lista)) {
      out[chave] = [...new Set(lista.map(Number).filter((n) => n >= 1 && n <= 5))];
    }
  }
  if (typeof s.porta_origem === 'number' && s.porta_origem >= 1 && s.porta_origem <= 5) {
    out.porta_origem = Math.trunc(s.porta_origem);
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Emite `conarh_porta_toque`, `conarh_rota_iniciada` e `conarh_rota_concluida`
 * a partir da sessão que chegou com a captura — um evento por porta.
 *
 * Estes três tipos existiam no enum de `lib/radar/eventos.ts` desde o commit
 * inicial da rota e nunca tinham emissor: o painel diário conta
 * `conarh_rota_concluida` (app/api/conarh/painel/route.ts) e por isso mostrava
 * zero rotas todos os dias — o modo de falha que a própria seção de
 * verificações do sprint adverte.
 *
 * Best-effort: nenhum `await`, nenhuma falha propagada. O lead já está gravado;
 * telemetria não pode derrubar captura.
 */
function emitirEventosDeRota(
  scopeId: string,
  leadId: string,
  sessao: Record<string, unknown> | null,
  portaEscolhida: number | null,
): void {
  const comum = { scopeType: 'municipio' as const, scopeId };
  const portaOrigem = typeof sessao?.porta_origem === 'number' ? sessao.porta_origem : portaEscolhida;
  if (portaOrigem) {
    registrarEvento('conarh_porta_toque', {
      ...comum,
      extra: { leadId, porta: portaOrigem },
    }).catch(() => {});
  }
  const emitirLista = (tipo: 'conarh_rota_iniciada' | 'conarh_rota_concluida', chave: string) => {
    const portas = sessao?.[chave];
    if (!Array.isArray(portas)) return;
    for (const porta of portas) {
      registrarEvento(tipo, { ...comum, extra: { leadId, porta } }).catch(() => {});
    }
  };
  emitirLista('conarh_rota_iniciada', 'rotas_iniciadas');
  emitirLista('conarh_rota_concluida', 'rotas_concluidas');
}

/**
 * Alerta de lead A ao fechador (F4: "< 30 s"). Best-effort de verdade: NUNCA
 * awaited no caminho da captura e engole qualquer falha — o lead não pode
 * deixar de ser registrado porque o WhatsApp interno não saiu.
 */
async function alertarFechadorConarh(opts: {
  nome: string;
  organizacao: string | null;
  telefone: string | null;
  porta: number | null;
  competencia: string | null;
  reuniaoEm: string | null;
}): Promise<void> {
  try {
    const destino = process.env.CONARH_ALERT_WHATSAPP;
    if (!destino) {
      console.warn('[lead-comercial] classe A sem CONARH_ALERT_WHATSAPP — alerta pulado');
      return;
    }
    const porta = rotuloPorta(opts.porta);
    const linhas = [
      '🔥 Lead A no estande (CONARH)',
      '',
      `${opts.nome}${opts.organizacao ? ` — ${opts.organizacao}` : ''}`,
      porta ? `Porta: ${porta}` : null,
      opts.competencia ? `Competência: "${opts.competencia}"` : null,
      opts.telefone ? `WhatsApp: ${opts.telefone}` : null,
      opts.reuniaoEm ? `Reunião marcada: ${opts.reuniaoEm}` : null,
    ].filter(Boolean);
    const r = await sendWhatsapp({ kind: 'text', phone: destino, text: linhas.join('\n') });
    if (!r.ok) console.error('[lead-comercial] alerta classe A falhou:', r.reason);
  } catch (err) {
    console.error('[lead-comercial] alerta classe A exception:', err);
  }
}

/**
 * Dispara o worker /api/conarh/artefato (T+0: WhatsApp + e-mail com o Mapa da
 * Evolução). Mesmo padrão do dispararPdfWorker (app/radar/actions.ts):
 *   1. QStash (assíncrono, com retry) — quando QSTASH_TOKEN configurado;
 *   2. fetch interno com INTERNAL_DISPATCH_SECRET — fallback, fire-and-forget.
 * Best-effort: erros são logados, nunca interrompem a captura.
 */
async function dispararArtefatoConarh(leadId: string): Promise<void> {
  const webhookUrl = `${APP_WEBHOOK_URL}/api/conarh/artefato`;

  if (process.env.QSTASH_TOKEN) {
    try {
      const r = await fetch(`${QSTASH_BASE_URL}/v2/publish/${webhookUrl}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leadId }),
      });
      if (r.ok) return;
      console.error('[lead-comercial] qstash artefato retornou', r.status);
    } catch (err) {
      console.error('[lead-comercial] qstash artefato dispatch failed', err);
    }
  }

  if (!process.env.INTERNAL_DISPATCH_SECRET) {
    console.warn('[lead-comercial] sem QStash e sem INTERNAL_DISPATCH_SECRET — artefato T+0 ficará pendente');
    return;
  }
  // Sem await: o envio não bloqueia a resposta da captura no estande.
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-dispatch': process.env.INTERNAL_DISPATCH_SECRET,
    },
    body: JSON.stringify({ leadId }),
  }).catch((err) => console.error('[lead-comercial] internal dispatch artefato failed', err));
}

/**
 * Teto por IP, igual para todo mundo.
 *
 * Era 10/h — o que matava a captura em feira, onde o stand inteiro sai por um
 * roteador só e o 11º visitante da hora sumia em silêncio (o erro aparece para
 * quem preenche, não para quem atende). 300/h cobre um dia de evento com folga e
 * ainda barra script.
 *
 * O que de fato contém abuso é o limite por IDENTIDADE abaixo; o IP sempre foi
 * aproximação grosseira, e compartilhado por construção em rede corporativa,
 * escola ou feira.
 */
const LIMITE_IP = 300;
/** Mesma pessoa reenviando: o dedup já cobre a hora; isto barra flood real. */
const LIMITE_IDENTIDADE = 5;

/**
 * Uma única mensagem para QUALQUER limite atingido. Distinguir "muitos desta
 * rede" de "já recebemos seu contato" entrega a um terceiro se determinado
 * e-mail ou telefone existe na base — num formulário público, isso é enumeração.
 */
const MENSAGEM_LIMITE = 'Não foi possível registrar agora. Tente de novo em alguns minutos.';

/** E.164 quando possível; se não der, guarda os dígitos (melhor que perder o contato). */
function normalizarTelefone(bruto?: string): string | null {
  const cru = (bruto || '').trim();
  if (!cru) return null;
  const digitos = cru.replace(/\D/g, '');
  if (digitos.length < 10 || digitos.length > 15) return null;
  if (cru.startsWith('+')) return `+${digitos}`;
  // sem DDI explícito, assume Brasil — a captura é de feira brasileira
  return digitos.length <= 11 ? `+55${digitos}` : `+${digitos}`;
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function getRequestFingerprint() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || '';
  return {
    ipHash: ip ? hashIp(ip) : null,
    userAgent: h.get('user-agent')?.slice(0, 500) || null,
    referer: h.get('referer')?.slice(0, 500) || null,
  };
}

/**
 * Rate limit em duas chaves: IDENTIDADE (quem é) e IP (de onde veio).
 *
 * A identidade é o que interessa contra flood — um mesmo contato repetindo. O IP
 * é aproximação grosseira e, em evento, é literalmente compartilhado por todos
 * os visitantes: por isso o teto sobe quando a campanha é de evento, em vez de
 * cortar a captura no meio do dia.
 */
async function checkRateLimit(
  ipHash: string | null,
  identidade: { email: string | null; telefone: string | null },
): Promise<{ ok: boolean; reason?: string }> {
  const sb = createSupabaseAdmin();
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Contato com e-mail E WhatsApp preenchidos é limitado pelos DOIS (28/07):
  // checar só um deixava o mesmo telefone repetir à vontade com e-mails
  // rotativos (o dedup por telefone só vale dentro de 1h e por campanha).
  for (const [coluna, chave] of [['email', identidade.email], ['telefone', identidade.telefone]] as const) {
    if (!chave) continue;
    const { count, error } = await sb
      .from('diag_leads')
      .select('id', { count: 'exact', head: true })
      .eq(coluna, chave)
      .gte('criado_em', umaHoraAtras);
    // supabase-js RETORNA o erro; sem checar, a falha viraria "limite ok"
    if (!error && (count || 0) >= LIMITE_IDENTIDADE) {
      // MESMA mensagem do limite por IP, de propósito: "já recebemos seu
      // contato" confirmaria a um terceiro que aquele e-mail/telefone está na
      // base — o formulário é público, então isso é enumeração de cadastro.
      return { ok: false, reason: MENSAGEM_LIMITE };
    }
  }

  if (ipHash) {
    const { count, error } = await sb
      .from('diag_leads')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('criado_em', umaHoraAtras);
    if (!error && (count || 0) >= LIMITE_IP) {
      return { ok: false, reason: MENSAGEM_LIMITE };
    }
  }

  return { ok: true };
}

export async function capturarLeadComercial(
  input: CapturarLeadComercialInput,
): Promise<CapturarLeadComercialResult> {
  // Validações básicas
  if (!input?.nome?.trim() || input.nome.trim().length < 2) {
    return falha('Nome obrigatório.');
  }
  // Contato: e-mail OU WhatsApp. Exigir e-mail era o que rejeitava todo lead de
  // feira, onde o que se coleta é o número.
  const emailBruto = (input?.email || '').trim().toLowerCase();
  const emailNorm = emailBruto && EMAIL_RE.test(emailBruto) && emailBruto.length <= 200 ? emailBruto : null;
  // `telefone` é o alias do formulário CONARH; `whatsapp` é o campo original.
  const telefoneNorm = normalizarTelefone(input?.whatsapp || input?.telefone);

  if (emailBruto && !emailNorm) {
    return falha('E-mail inválido.');
  }
  if (!emailNorm && !telefoneNorm) {
    return falha('Informe e-mail ou WhatsApp para retornarmos o contato.');
  }
  if (!input?.cargo?.trim()) {
    return falha('Cargo obrigatório.');
  }
  // `organizacao` é o alias do formulário CONARH; `instituicao` é o original.
  const instituicao = (input?.instituicao || input?.organizacao || '').trim();
  if (!instituicao) {
    return falha('Instituição obrigatória.');
  }
  if (!input.consentimento_lgpd) {
    return falha('Consentimento LGPD obrigatório.');
  }

  const sb = createSupabaseAdmin();
  const { ipHash, userAgent, referer } = await getRequestFingerprint();

  const pedida = (input.campanha || CAMPANHA_PADRAO).toLowerCase();
  const scopeId = CAMPANHAS[pedida] || CAMPANHAS[CAMPANHA_PADRAO];

  const rl = await checkRateLimit(ipHash, { email: emailNorm, telefone: telefoneNorm });
  if (!rl.ok) return falha(rl.reason || 'Limite de pedidos atingido.');

  // Dedup idempotente na última hora, por QUALQUER uma das identidades — quem
  // deixou o WhatsApp duas vezes não vira dois leads.
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const base = () =>
    sb
      .from('diag_leads')
      .select('id')
      .eq('scope_type', 'comercial')
      .eq('scope_id', scopeId)
      .gte('criado_em', umaHoraAtras)
      .limit(1);

  const { data: porEmail } = emailNorm ? await base().eq('email', emailNorm).maybeSingle() : { data: null };
  const { data: porTelefone } =
    !porEmail && telefoneNorm ? await base().eq('telefone', telefoneNorm).maybeSingle() : { data: null };

  const existente = porEmail || porTelefone;
  if (existente?.id) {
    // Sucesso SEM o id: o lead achado pode ser de outra pessoa (basta enviar o
    // e-mail dela), e devolver o identificador dela num formulário público é
    // vazamento. Nenhum chamador usa o leadId — o modal só olha `error`.
    return { success: true, ok: true };
  }

  // Consolida dados extras em organizacao. WhatsApp e origem NÃO entram mais
  // aqui: têm coluna própria desde a mig 195 — em texto livre, segmentar o
  // follow-up depois era trabalho manual.
  const orgComplemento = [
    input.municipio && `Município: ${input.municipio}`,
    input.tipo && `Tipo: ${input.tipo === 'publica' ? 'pública' : 'privada'}`,
    input.qtd_alunos && `Alunos: ${input.qtd_alunos}`,
    input.qtd_escolas && `Escolas: ${input.qtd_escolas}`,
    input.scope_label_original && `Busca anterior: ${input.scope_label_original}`,
  ].filter(Boolean).join(' · ');
  const organizacao = [instituicao, orgComplemento].filter(Boolean).join(' — ');

  // ── CONARH 52: qualificação da feira (mig 196). Só se aplica à campanha
  // conarh — lead de outra campanha não pode gravar classe/porta por acidente.
  const ehConarh = scopeId === 'conarh-2026';
  let classe: 'A' | 'B' | 'C' | null = null;
  let porta: number | null = null;
  let competenciaCritica: string | null = null;
  let horizonte: string | null = null;
  let reuniaoEm: string | null = null;
  let sessao: Record<string, unknown> | null = null;
  if (ehConarh) {
    porta = input.porta && input.porta >= 1 && input.porta <= 5 ? Math.trunc(input.porta) : null;
    competenciaCritica = (input.competencia || '').trim().slice(0, 300) || null;
    horizonte = input.horizonte && HORIZONTES_CONARH.has(input.horizonte) ? input.horizonte : null;
    const slotMs = Date.parse(input.slot || '');
    reuniaoEm = Number.isFinite(slotMs) ? new Date(slotMs).toISOString() : null;
    sessao = sanitizarSessaoConarh(input.sessao);
    classe = classificarLeadConarh({
      decide_ou_recomenda: input.decide_ou_recomenda,
      aceitou_proximo_passo: input.aceitou_proximo_passo,
      fora_do_perfil: input.fora_do_perfil,
      competencia: competenciaCritica,
      horizonte,
    });
  }

  const { data: lead, error } = await sb
    .from('diag_leads')
    .insert({
      email: emailNorm,
      telefone: telefoneNorm,
      origem: (input.origem || '').trim().slice(0, 60) || null,
      nome: input.nome.trim().slice(0, 200),
      cargo: input.cargo.trim().slice(0, 200),
      organizacao: organizacao.slice(0, 1000),
      scope_type: 'comercial',
      scope_id: scopeId,
      scope_label: instituicao.slice(0, 200),
      consentimento_lgpd: true,
      consentimento_em: new Date().toISOString(),
      pdf_status: 'nao_aplicavel',
      user_agent: userAgent,
      referer,
      ip_hash: ipHash,
      ...(ehConarh
        ? {
            porta_escolhida: porta,
            competencia_critica: competenciaCritica,
            horizonte,
            classe,
            reuniao_em: reuniaoEm,
            sessao,
          }
        : {}),
    })
    .select('id')
    .single();

  if (error || !lead) {
    return falha(error?.message || 'Falha ao salvar lead.');
  }

  // Tracking — best effort
  registrarEvento('lead_submit', {
    scopeType: 'municipio', // tipo mais "neutro" no enum existente
    scopeId,
    extra: { leadId: lead.id, comercial: true, origem: input.origem, sem_email: !emailNorm },
  }).catch(() => {});

  if (ehConarh) {
    registrarEvento('conarh_captura', {
      scopeType: 'municipio',
      scopeId,
      extra: { leadId: lead.id, classe, porta, horizonte, com_reuniao: !!reuniaoEm },
    }).catch(() => {});
    if (reuniaoEm) {
      registrarEvento('conarh_reuniao_marcada', {
        scopeType: 'municipio',
        scopeId,
        extra: { leadId: lead.id, reuniao_em: reuniaoEm },
      }).catch(() => {});
    }

    // ── Telemetria de rota (F7) ────────────────────────────────────────────
    // A demo roda em modo avião: nada é emitido DURANTE a rota, ou o evento se
    // perderia em silêncio no pavilhão. A sessão acumula no dispositivo
    // (app/conarh/_components/sessao.ts) e vira evento aqui, no único submit.
    //
    // Limite declarado: isto conta as rotas de quem CAPTUROU. Sessão que roda e
    // não deixa contato não aparece no painel — o denominador do funil é
    // "capturas", não "visitantes". Está dito em docs/CONARH52-SPRINT-CONSOLIDADO.md.
    emitirEventosDeRota(scopeId, lead.id, sessao, porta);

    // Lead A acorda o fechador na hora (F4: alerta < 30 s). SEM await: a
    // captura nunca espera nem falha por causa do alerta.
    if (classe === 'A') {
      alertarFechadorConarh({
        nome: input.nome.trim(),
        organizacao: instituicao || null,
        telefone: telefoneNorm,
        porta,
        competencia: competenciaCritica,
        reuniaoEm,
      }).catch(() => {});
    }

    // T+0 assíncrono: WhatsApp + e-mail com o Mapa da Evolução (F5).
    await dispararArtefatoConarh(lead.id);
  }

  return { success: true, leadId: lead.id, ok: true, id: lead.id, ...(classe ? { classe } : {}) };
}
