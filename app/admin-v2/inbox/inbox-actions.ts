'use server';

import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { logAdminAction } from '@/lib/audit';
import { montarCaixaGlobal, resumoDaCaixa, type LinhaConversa } from '@/lib/inbox/caixa';
import { decidirDono, filtroDeTelefone, variantesDoTelefone } from '@/lib/whatsapp/resolver-dono';
import type {
  ConversaGlobal, ResumoCaixa, CandidatoDono, FilaNaoIdentificada, ResultadoAssociacao,
} from '@/lib/inbox/tipos';

/**
 * Caixa de entrada da EQUIPE — todas as empresas, mais a fila de quem não foi
 * identificado.
 *
 * POR QUE ESTA TELA EXISTE
 * ────────────────────────
 * A caixa por cliente (`/admin-v2/cliente`) só mostra conversa que já tem
 * tenant, e para percebê-la alguém precisa entrar cliente por cliente. As
 * mensagens sem dono não apareciam em lugar nenhum: havia uma
 * `listarNaoResolvidas()` escrita e SEM NENHUM CONSUMIDOR na interface.
 *
 * O custo foi medido em 15/08/2026, e é o argumento inteiro: a única mensagem
 * que o webhook já tinha recebido estava com `empresa_id NULL` (o telefone
 * existe em seis empresas), portanto invisível — enquanto o workspace do cliente
 * exibia, com toda a confiança, "Nenhuma mensagem recebida deste cliente".
 * 1 de 1. Uma caixa de entrada que só mostra o que já foi resolvido inverte a
 * própria função: o caso que precisa de gente é justamente o que ela escondia.
 *
 * ⚠️ ARQUIVO `'use server'`: todo export é um endpoint HTTP. Cada função abre
 * com `exigirPlataforma()`, inclusive as de leitura — e aqui isso pesa mais que
 * de costume, porque estas actions leem CROSS-TENANT por definição. Se um dia o
 * RH de um cliente for responder mensagens, isto não é "liberar a mesma action":
 * é outra rota, com o escopo vindo da SESSÃO.
 */

/** Teto de conversas na caixa. Explícito porque corte silencioso vira "não há mais". */
const TETO_CONVERSAS = 500;
/** Teto de telefones na fila de não identificados por rodada de busca de candidatos. */
const TETO_FILA = 50;

async function exigirPlataforma(): Promise<string> {
  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) throw new Error('Acesso restrito à equipe Vertho');
  return acesso.email!;
}

export interface CaixaGlobal {
  conversas: ConversaGlobal[];
  resumo: ResumoCaixa;
  empresas: { id: string; nome: string }[];
  /** `true` quando o teto cortou a lista — a tela precisa dizer, não sumir com o resto. */
  truncada: boolean;
}

/** Todas as conversas, de todas as empresas, mais recente primeiro. */
export async function listarCaixaGlobal(): Promise<CaixaGlobal> {
  await exigirPlataforma();
  const sb = await requireAdminSupabase();

  const { data, error } = await sb.from('whatsapp_conversas')
    .select('empresa_id, from_phone, ultima_em, total, nao_lidas, ultimo_texto, ultimo_tipo, colaborador_id, ambiguidade')
    .order('ultima_em', { ascending: false })
    .limit(TETO_CONVERSAS);
  if (error) throw new Error(`caixa: ${error.message}`);

  const linhas = (data || []) as LinhaConversa[];

  const { data: empresasData, error: eE } = await sb.from('empresas').select('id, nome').order('nome');
  if (eE) throw new Error(`empresas: ${eE.message}`);
  const empresas = (empresasData || []) as { id: string; nome: string }[];
  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));

  // Nomes dos colaboradores. O `.in('empresa_id', …)` não é decoração: mantém a
  // leitura escopada aos tenants que a caixa já está mostrando, que é o que o
  // `tenant-read-guard` verifica — e o que torna a consulta descritível.
  const colabIds = [...new Set(linhas.map((l) => l.colaborador_id).filter(Boolean))] as string[];
  const empresaIds = [...new Set(linhas.map((l) => l.empresa_id).filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (colabIds.length && empresaIds.length) {
    const { data: colabs, error: eC } = await sb.from('colaboradores')
      .select('id, nome_completo')
      .in('empresa_id', empresaIds)
      .in('id', colabIds);
    if (eC) console.error('[inbox-global] nomes:', eC.message);
    for (const c of (colabs || []) as any[]) nomes.set(c.id, c.nome_completo);
  }

  const conversas = montarCaixaGlobal(linhas, nomes, nomeEmpresa);
  return {
    conversas,
    resumo: resumoDaCaixa(conversas),
    empresas,
    truncada: linhas.length >= TETO_CONVERSAS,
  };
}

/**
 * Candidatos a dono, por telefone — varridos EMPRESA POR EMPRESA.
 *
 * Uma consulta única por telefone (sem `empresa_id`) seria mais curta e é
 * exatamente o que o `tenant-read-guard` bloqueia em `colaboradores`. A varredura
 * escopada custa uma query por empresa (unidades, nesta escala), passa no guard
 * por CONSTRUÇÃO — não por allowlist — e deixa explícito que ler o cadastro de
 * todos os tenants é uma decisão, não um efeito colateral.
 */
async function candidatosPorTelefone(
  sb: any,
  telefones: string[],
  empresas: { id: string; nome: string }[],
): Promise<Map<string, CandidatoDono[]>> {
  const mapa = new Map<string, CandidatoDono[]>();
  for (const t of telefones) mapa.set(t, []);
  if (!telefones.length) return mapa;

  // Um `.or()` por empresa, cobrindo todos os telefones da fila de uma vez.
  const filtro = telefones.map(filtroDeTelefone).filter(Boolean).join(',');
  if (!filtro) return mapa;

  // Índice variante → telefone da fila, para saber qual linha casou com qual.
  const porVariante = new Map<string, string>();
  for (const t of telefones) for (const v of variantesDoTelefone(t)) porVariante.set(v, t);

  await Promise.all(empresas.map(async (e) => {
    const { data, error } = await sb.from('colaboradores')
      .select('id, nome_completo, email, whatsapp, telefone')
      .eq('empresa_id', e.id)
      .or(filtro);
    if (error) {
      console.error('[inbox-global] candidatos:', e.nome, error.message);
      return;
    }
    for (const c of (data || []) as any[]) {
      const alvo = porVariante.get(String(c.whatsapp || '')) ?? porVariante.get(String(c.telefone || ''));
      if (!alvo) continue;
      mapa.get(alvo)!.push({
        colaboradorId: c.id,
        nome: c.nome_completo ?? null,
        email: c.email ?? null,
        empresaId: e.id,
        empresa: e.nome,
      });
    }
  }));

  return mapa;
}

/** Conversas que o webhook não conseguiu atribuir — com a quem elas podem pertencer. */
export async function listarFilaNaoIdentificada(): Promise<{ fila: FilaNaoIdentificada[]; truncada: boolean }> {
  await exigirPlataforma();
  const sb = await requireAdminSupabase();

  // Sem tenant por definição: `empresa_id IS NULL` é o próprio filtro, e é o
  // único ponto do inbox que lê a caixa sem escopo de empresa.
  const { data, error } = await sb.from('whatsapp_conversas')
    .select('empresa_id, from_phone, ultima_em, total, nao_lidas, ultimo_texto, ultimo_tipo, colaborador_id, ambiguidade')
    .is('empresa_id', null)
    .order('ultima_em', { ascending: false })
    .limit(TETO_FILA);
  if (error) throw new Error(`fila: ${error.message}`);

  const linhas = (data || []) as LinhaConversa[];
  if (!linhas.length) return { fila: [], truncada: false };

  const { data: empresasData } = await sb.from('empresas').select('id, nome').order('nome');
  const empresas = (empresasData || []) as { id: string; nome: string }[];
  const candidatos = await candidatosPorTelefone(sb, linhas.map((l) => l.from_phone), empresas);

  return {
    fila: linhas.map((l) => ({
      telefone: l.from_phone,
      ultimaEm: l.ultima_em,
      ultimoTexto: l.ultimo_texto,
      ultimoTipo: l.ultimo_tipo,
      total: Number(l.total) || 0,
      naoLidas: Number(l.nao_lidas) || 0,
      ambiguidade: l.ambiguidade,
      candidatos: candidatos.get(l.from_phone) ?? [],
    })),
    truncada: linhas.length >= TETO_FILA,
  };
}

/**
 * Atribui um telefone não identificado a um colaborador.
 *
 * É a saída humana para o caso que a máquina não pode decidir sozinha — o mesmo
 * número em duas empresas. Quem escolhe é uma pessoa, e por isso a ação é
 * auditada: numa caixa compartilhada, "quem disse que esta conversa é da escola
 * X" é a pergunta que aparece depois, quando o histórico já mudou de dono.
 *
 * ⚠️ Só toca linhas SEM empresa (`.is('empresa_id', null)`). Sem essa cláusula,
 * uma associação errada sequestraria conversa já atribuída de outro tenant — o
 * botão de consertar vira o de quebrar.
 *
 * 🔑 O `empresaId` CHEGA do cliente e é CONFIRMADO no banco antes de valer: a
 * leitura do colaborador vai escopada pelo par `(empresa_id, id)`. Um cliente
 * que mande o colaborador de um tenant com o id de outro não acha linha nenhuma
 * e a ação recusa. Ler só por `id` e aceitar o `empresa_id` que voltasse seria
 * mais curto e passaria a decisão de escopo para fora do servidor — que é
 * exatamente a classe de furo que o `tenant-read-guard` existe para pegar.
 */
export async function associarTelefone(args: {
  telefone: string;
  colaboradorId: string;
  empresaId: string;
}): Promise<ResultadoAssociacao> {
  const email = await exigirPlataforma();
  const sb = await requireAdminSupabase();

  const telefone = String(args.telefone || '').trim();
  if (!telefone || !args.colaboradorId || !args.empresaId) {
    return { ok: false, motivo: 'Telefone, colaborador e cliente são obrigatórios.' };
  }

  const { data: colab, error: eC } = await sb.from('colaboradores')
    .select('id, nome_completo')
    .eq('empresa_id', args.empresaId)
    .eq('id', args.colaboradorId)
    .maybeSingle();
  if (eC) return { ok: false, motivo: `Não foi possível ler o colaborador: ${eC.message}` };
  if (!colab) return { ok: false, motivo: 'Colaborador não encontrado neste cliente.' };

  const empresaId = args.empresaId;

  const { data: atualizadas, error: eU } = await sb.from('whatsapp_mensagens_recebidas')
    .update({ empresa_id: empresaId, colaborador_id: args.colaboradorId, ambiguidade: null })
    .eq('from_phone', telefone)
    .is('empresa_id', null)
    .select('id');
  if (eU) return { ok: false, motivo: `Falha ao associar: ${eU.message}` };

  const mensagens = atualizadas?.length ?? 0;

  await logAdminAction({
    adminEmail: email,
    acao: 'inbox.associar',
    empresaId,
    alvo: telefone,
    detalhes: { colaboradorId: args.colaboradorId, colaborador: (colab as any).nome_completo, mensagens },
    resultado: mensagens > 0 ? 'ok' : 'parcial',
  });

  return { ok: true, mensagens };
}

/**
 * Roda o resolvedor de novo sobre a fila.
 *
 * Serve para o caso mais comum de "telefone desconhecido": o cadastro estava
 * incompleto quando a mensagem chegou e foi corrigido depois. A mensagem não se
 * reprocessa sozinha — a Meta não reentrega nada, e o número da Cloud API não
 * tem aplicativo onde alguém possa "ver depois".
 *
 * Aplica APENAS o que ficou inequívoco. O que continuar ambíguo permanece na
 * fila, para associação manual: é o mesmo critério do webhook, e afrouxá-lo aqui
 * seria decidir por chute justamente onde já se sabe que há dúvida.
 */
export async function reprocessarNaoIdentificadas(): Promise<{ resolvidas: number; mensagens: number; restantes: number }> {
  const email = await exigirPlataforma();
  const sb = await requireAdminSupabase();

  const { data, error } = await sb.from('whatsapp_conversas')
    .select('from_phone')
    .is('empresa_id', null)
    .order('ultima_em', { ascending: false })
    .limit(TETO_FILA);
  if (error) throw new Error(`reprocessar: ${error.message}`);

  const telefones = (data || []).map((l: any) => l.from_phone as string);
  if (!telefones.length) return { resolvidas: 0, mensagens: 0, restantes: 0 };

  const { data: empresasData } = await sb.from('empresas').select('id, nome').order('nome');
  const empresas = (empresasData || []) as { id: string; nome: string }[];
  const candidatos = await candidatosPorTelefone(sb, telefones, empresas);

  let resolvidas = 0;
  let mensagens = 0;

  for (const telefone of telefones) {
    const lista = candidatos.get(telefone) ?? [];
    // MESMA decisão do webhook — uma segunda régua aqui seria uma segunda
    // verdade sobre "de quem é este telefone".
    const dono = decidirDono(lista.map((c) => ({ id: c.colaboradorId, empresa_id: c.empresaId })));
    if (!dono.empresaId) continue;

    const { data: att, error: eU } = await sb.from('whatsapp_mensagens_recebidas')
      .update({ empresa_id: dono.empresaId, colaborador_id: dono.colaboradorId, ambiguidade: dono.ambiguidade })
      .eq('from_phone', telefone)
      .is('empresa_id', null)
      .select('id');
    if (eU) {
      console.error('[inbox-global] reprocessar:', telefone, eU.message);
      continue;
    }
    if (att?.length) {
      resolvidas++;
      mensagens += att.length;
    }
  }

  await logAdminAction({
    adminEmail: email,
    acao: 'inbox.reprocessar',
    alvo: `${telefones.length} telefone(s)`,
    detalhes: { resolvidas, mensagens, restantes: telefones.length - resolvidas },
    resultado: resolvidas > 0 ? 'ok' : 'parcial',
  });

  return { resolvidas, mensagens, restantes: telefones.length - resolvidas };
}
