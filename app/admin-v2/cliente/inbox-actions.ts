'use server';

import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';
import { calcularJanela } from '@/lib/inbox/janela';
import { montarThread } from '@/lib/inbox/thread';
import { enviarTextoCloud } from '@/lib/whatsapp/cloud-api';
import type { Conversa, ThreadCompleta, ResultadoEnvio, NaoResolvida } from '@/lib/inbox/tipos';

/**
 * Caixa de entrada do WhatsApp — leitura e resposta.
 *
 * ⚠️ ARQUIVO `'use server'`: TODO export vira endpoint HTTP, chamável por quem
 * souber o action id. Por isso cada função abre com `checarAcessoPlataforma()`,
 * inclusive as de LEITURA — não há "gate implícito por estar no /admin-v2", o
 * layout protege a NAVEGAÇÃO, não a action.
 *
 * QUEM ATENDE: a equipe Vertho (decidido em 14/08/2026, ver docs/INBOX-WHATSAPP
 * §0.1). Se um dia gestores de cliente forem responder, isto NÃO é "liberar a
 * mesma action" — é outra rota, com escopo de empresa vindo da SESSÃO e não do
 * parâmetro. Reaproveitar esta daria a um contratante a caixa dos outros.
 */

async function exigirPlataforma() {
  const acesso = await checarAcessoPlataforma();
  if (!acesso.authorized) throw new Error('Acesso restrito à plataforma');
  return acesso.email!;
}

/** Conversas de uma empresa, agrupadas por telefone, mais recente primeiro. */
export async function listarConversas(empresaId: string): Promise<Conversa[]> {
  await exigirPlataforma();
  const tdb = tenantDb(empresaId);

  const { data, error } = await tdb.from('whatsapp_mensagens_recebidas')
    .select('id, from_phone, colaborador_id, texto, tipo, recebida_em, lida_em')
    .order('recebida_em', { ascending: false })
    .limit(500);
  if (error) throw new Error(`conversas: ${error.message}`);

  const porTelefone = new Map<string, any[]>();
  for (const m of (data || []) as any[]) {
    const lista = porTelefone.get(m.from_phone) || [];
    lista.push(m);
    porTelefone.set(m.from_phone, lista);
  }

  const colabIds = [...new Set((data || []).map((m: any) => m.colaborador_id).filter(Boolean))];
  const nomes = new Map<string, string>();
  if (colabIds.length) {
    const { data: colabs } = await tdb.from('colaboradores')
      .select('id, nome_completo')
      .in('id', colabIds);
    for (const c of (colabs || []) as any[]) nomes.set(c.id, c.nome_completo);
  }

  const agora = Date.now();
  return [...porTelefone.entries()]
    .map(([telefone, msgs]) => {
      const ultima = msgs[0];
      return {
        telefone,
        colaboradorId: ultima.colaborador_id,
        nome: ultima.colaborador_id ? nomes.get(ultima.colaborador_id) ?? null : null,
        ultimaEm: ultima.recebida_em,
        ultimoTexto: ultima.texto,
        naoLidas: msgs.filter((m: any) => !m.lida_em).length,
        // A janela é do ÚLTIMO recebido — é ele que a reabre.
        janela: calcularJanela(ultima.recebida_em, agora),
      };
    })
    .sort((a, b) => new Date(b.ultimaEm).getTime() - new Date(a.ultimaEm).getTime());
}

/** Thread completa de um telefone: recebidas + enviadas + telemetria. */
export async function carregarThread(empresaId: string, telefone: string): Promise<ThreadCompleta> {
  await exigirPlataforma();
  const tdb = tenantDb(empresaId);

  const { data: recebidas, error: e1 } = await tdb.from('whatsapp_mensagens_recebidas')
    .select('id, texto, tipo, recebida_em, raw, colaborador_id')
    .eq('from_phone', telefone)
    .order('recebida_em', { ascending: true })
    .limit(300);
  if (e1) throw new Error(`thread/recebidas: ${e1.message}`);

  const { data: enviadas, error: e2 } = await tdb.from('whatsapp_mensagens_enviadas')
    .select('id, texto, tipo, template_nome, autor_email, origem, erro, enviada_em, wa_message_id')
    .eq('to_phone', telefone)
    .order('enviada_em', { ascending: true })
    .limit(300);
  if (e2) throw new Error(`thread/enviadas: ${e2.message}`);

  const colaboradorId = (recebidas || []).find((r: any) => r.colaborador_id)?.colaborador_id ?? null;

  // Telemetria histórica (cadência antiga, sem texto). Só faz sentido buscar
  // quando se sabe de quem é — a tabela não tem telefone.
  let entregas: any[] = [];
  if (colaboradorId) {
    const { data } = await tdb.from('notification_deliveries')
      .select('id, kind, sent_at, provider_status, delivered_at, opened_at, error, provider_message_id')
      .eq('colaborador_id', colaboradorId)
      .eq('channel', 'whatsapp')
      .order('sent_at', { ascending: true })
      .limit(300);
    entregas = data || [];
  }

  let nome: string | null = null;
  if (colaboradorId) {
    const { data: c } = await tdb.from('colaboradores')
      .select('nome_completo').eq('id', colaboradorId).maybeSingle();
    nome = (c as any)?.nome_completo ?? null;
  }

  const ultimaRecebida = (recebidas || []).at(-1) as any;
  return {
    telefone,
    nome,
    colaboradorId,
    janela: calcularJanela(ultimaRecebida?.recebida_em ?? null),
    itens: montarThread({
      recebidas: (recebidas || []) as any,
      enviadas: (enviadas || []) as any,
      entregas: entregas as any,
    }),
  };
}

/** Marca como lidas as mensagens recebidas de um telefone. */
export async function marcarLida(empresaId: string, telefone: string): Promise<void> {
  const email = await exigirPlataforma();
  const tdb = tenantDb(empresaId);
  const { error } = await tdb.from('whatsapp_mensagens_recebidas')
    .update({ lida_em: new Date().toISOString(), lida_por: email })
    .eq('from_phone', telefone)
    .is('lida_em', null);
  if (error) console.error('[inbox] marcarLida:', error.message);
}

/**
 * Responde uma conversa com texto livre.
 *
 * 🔴 A JANELA É REVALIDADA AQUI, no instante do envio, lendo o banco. O estado
 * que a tela renderizou envelhece — o atendente abre com a janela aberta,
 * escreve cinco minutos e clica com ela fechada. Sem esta checagem, a Meta
 * recusaria com 131047 e, para quem clicou, a mensagem simplesmente não teria
 * chegado.
 */
export async function responderConversa(args: {
  empresaId: string;
  telefone: string;
  texto: string;
  /** Idempotência: o mesmo valor no duplo clique não manda duas vezes. */
  dedupeKey?: string;
}): Promise<ResultadoEnvio> {
  const email = await exigirPlataforma();
  const texto = (args.texto || '').trim();
  if (!texto) return { ok: false, motivo: 'Mensagem vazia.' };

  const tdb = tenantDb(args.empresaId);

  // 1) Estado REAL da janela, agora.
  const { data: ultima, error: eU } = await tdb.from('whatsapp_mensagens_recebidas')
    .select('recebida_em, colaborador_id')
    .eq('from_phone', args.telefone)
    .order('recebida_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eU) return { ok: false, motivo: 'Não foi possível verificar a conversa.' };

  const janela = calcularJanela((ultima as any)?.recebida_em ?? null);
  if (!janela.podeTextoLivre) {
    return {
      ok: false,
      janelaFechada: true,
      motivo:
        janela.estado === 'nunca-escreveu'
          ? 'Esta pessoa nunca escreveu para o número — sem janela aberta, só é possível enviar template aprovado.'
          : 'A janela de 24 horas encerrou. Só é possível enviar template aprovado.',
    };
  }

  // 2) Idempotência ANTES de gastar a chamada de rede.
  const dedupe = args.dedupeKey || null;
  if (dedupe) {
    const { data: jaExiste } = await tdb.from('whatsapp_mensagens_enviadas')
      .select('id, wa_message_id')
      .eq('dedupe_key', dedupe)
      .maybeSingle();
    if (jaExiste) return { ok: true, wamid: (jaExiste as any).wa_message_id ?? null };
  }

  const colaboradorId = (ultima as any)?.colaborador_id ?? null;

  // 3) Envia.
  const r = await enviarTextoCloud(
    { phone: args.telefone, texto },
    { motivo: 'atendimento', empresaId: args.empresaId, colaboradorId, dedupeKey: dedupe },
  );

  // 4) Grava o CONTEÚDO — inclusive quando falha. Uma resposta que não saiu
  // precisa aparecer na tela como tentativa: sem isso o atendente reescreve sem
  // saber que já tentou, e a pessoa do outro lado pode receber duas.
  const { error: eIns } = await tdb.from('whatsapp_mensagens_enviadas').insert({
    empresa_id: args.empresaId,
    colaborador_id: colaboradorId,
    wa_message_id: r.providerMessageId ?? null,
    to_phone: args.telefone,
    from_phone_id: process.env.PHONE_NUMBER_ID || null,
    tipo: 'text',
    texto,
    autor_email: email,
    origem: 'inbox',
    dedupe_key: dedupe,
    erro: r.ok ? null : (r.reason ?? 'falha desconhecida'),
  });
  if (eIns) console.error('[inbox] gravar enviada:', eIns.message);

  return r.ok
    ? { ok: true, wamid: r.providerMessageId ?? null }
    : { ok: false, motivo: r.reason || 'Falha ao enviar.' };
}

/** Mensagens que o webhook não conseguiu atribuir a nenhum tenant. */
export async function listarNaoResolvidas(): Promise<NaoResolvida[]> {
  await exigirPlataforma();
  // Sem tenant por definição — `tenantDb` não se aplica, e é o único ponto do
  // inbox que lê sem escopo de empresa. `empresa_id IS NULL` é o próprio filtro.
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('whatsapp_mensagens_recebidas')
    .select('id, from_phone, texto, tipo, ambiguidade, recebida_em')
    .is('empresa_id', null)
    .order('recebida_em', { ascending: false })
    .limit(100);
  if (error) throw new Error(`nao-resolvidas: ${error.message}`);
  return (data || []) as NaoResolvida[];
}
