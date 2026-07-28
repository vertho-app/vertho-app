'use server';

import crypto from 'crypto';
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarEvento } from '@/lib/radar/eventos';

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
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const chave = identidade.email || identidade.telefone;
  if (chave) {
    const coluna = identidade.email ? 'email' : 'telefone';
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
): Promise<{ success: boolean; leadId?: string; error?: string }> {
  // Validações básicas
  if (!input?.nome?.trim() || input.nome.trim().length < 2) {
    return { success: false, error: 'Nome obrigatório.' };
  }
  // Contato: e-mail OU WhatsApp. Exigir e-mail era o que rejeitava todo lead de
  // feira, onde o que se coleta é o número.
  const emailBruto = (input?.email || '').trim().toLowerCase();
  const emailNorm = emailBruto && EMAIL_RE.test(emailBruto) && emailBruto.length <= 200 ? emailBruto : null;
  const telefoneNorm = normalizarTelefone(input?.whatsapp);

  if (emailBruto && !emailNorm) {
    return { success: false, error: 'E-mail inválido.' };
  }
  if (!emailNorm && !telefoneNorm) {
    return { success: false, error: 'Informe e-mail ou WhatsApp para retornarmos o contato.' };
  }
  if (!input?.cargo?.trim()) {
    return { success: false, error: 'Cargo obrigatório.' };
  }
  if (!input?.instituicao?.trim()) {
    return { success: false, error: 'Instituição obrigatória.' };
  }
  if (!input.consentimento_lgpd) {
    return { success: false, error: 'Consentimento LGPD obrigatório.' };
  }

  const sb = createSupabaseAdmin();
  const { ipHash, userAgent, referer } = await getRequestFingerprint();

  const pedida = (input.campanha || CAMPANHA_PADRAO).toLowerCase();
  const scopeId = CAMPANHAS[pedida] || CAMPANHAS[CAMPANHA_PADRAO];

  const rl = await checkRateLimit(ipHash, { email: emailNorm, telefone: telefoneNorm });
  if (!rl.ok) return { success: false, error: rl.reason || 'Limite de pedidos atingido.' };

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
    return { success: true };
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
  const organizacao = [input.instituicao.trim(), orgComplemento].filter(Boolean).join(' — ');

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
      scope_label: input.instituicao.trim().slice(0, 200),
      consentimento_lgpd: true,
      consentimento_em: new Date().toISOString(),
      pdf_status: 'nao_aplicavel',
      user_agent: userAgent,
      referer,
      ip_hash: ipHash,
    })
    .select('id')
    .single();

  if (error || !lead) {
    return { success: false, error: error?.message || 'Falha ao salvar lead.' };
  }

  // Tracking — best effort
  registrarEvento('lead_submit', {
    scopeType: 'municipio', // tipo mais "neutro" no enum existente
    scopeId,
    extra: { leadId: lead.id, comercial: true, origem: input.origem, sem_email: !emailNorm },
  }).catch(() => {});

  return { success: true, leadId: lead.id };
}
