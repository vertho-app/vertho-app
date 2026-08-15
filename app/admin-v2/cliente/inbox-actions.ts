'use server';

import { checarAcessoPlataforma } from '@/lib/authz-plataforma';
import { tenantDb } from '@/lib/tenant-db';
import { calcularJanela } from '@/lib/inbox/janela';
import { montarThread } from '@/lib/inbox/thread';
import { montarConversas, type LinhaConversa } from '@/lib/inbox/caixa';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { enviarTextoCloud, subirMidia, enviarMidiaCloud } from '@/lib/whatsapp/cloud-api';
import { classificarMidia } from '@/lib/inbox/anexos';
import type { Conversa, ThreadCompleta, ResultadoEnvio } from '@/lib/inbox/tipos';

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

/**
 * Conversas de uma empresa, mais recente primeiro.
 *
 * Lê a view `whatsapp_conversas` (mig 216) — o agrupamento é do BANCO. A versão
 * anterior trazia as últimas 500 mensagens e agrupava aqui, e isso escondia
 * conversas assim que um único telefone ficasse falante: a cota era das
 * mensagens, não das pessoas.
 */
export async function listarConversas(empresaId: string): Promise<Conversa[]> {
  await exigirPlataforma();
  const tdb = tenantDb(empresaId);

  const { data, error } = await tdb.from('whatsapp_conversas')
    .select('empresa_id, from_phone, ultima_em, total, nao_lidas, ultimo_texto, ultimo_tipo, colaborador_id, ambiguidade')
    .order('ultima_em', { ascending: false })
    .limit(300);
  if (error) throw new Error(`conversas: ${error.message}`);

  const linhas = (data || []) as LinhaConversa[];
  const colabIds = [...new Set(linhas.map((l) => l.colaborador_id).filter(Boolean))] as string[];

  const nomes = new Map<string, string>();
  if (colabIds.length) {
    const { data: colabs, error: eN } = await tdb.from('colaboradores')
      .select('id, nome_completo')
      .in('id', colabIds);
    // Nome é enfeite; conversa não é. Falhar aqui esconderia a caixa inteira
    // por causa de um join que só melhora o rótulo.
    if (eN) console.error('[inbox] nomes:', eN.message);
    for (const c of (colabs || []) as any[]) nomes.set(c.id, c.nome_completo);
  }

  return montarConversas(linhas, nomes);
}

/**
 * Thread completa de um telefone: recebidas + enviadas + telemetria.
 *
 * 🔴 AS TRÊS CONSULTAS SÃO `DESC`, e a lista é invertida em memória. Parece
 * indireto e é o oposto: `ORDER BY ... ASC LIMIT 300` devolve as 300 mensagens
 * MAIS ANTIGAS, então uma conversa longa abriria mostrando o começo do
 * relacionamento e escondendo exatamente a mensagem que acabou de chegar — sem
 * erro nenhum na tela. O limite tem que cair sobre a cauda, não sobre a cabeça.
 */
const TETO_THREAD = 300;

export async function carregarThread(empresaId: string, telefone: string): Promise<ThreadCompleta> {
  await exigirPlataforma();
  const tdb = tenantDb(empresaId);

  const { data: recebidas, error: e1 } = await tdb.from('whatsapp_mensagens_recebidas')
    .select('id, texto, tipo, recebida_em, raw, colaborador_id')
    .eq('from_phone', telefone)
    .order('recebida_em', { ascending: false })
    .limit(TETO_THREAD);
  if (e1) throw new Error(`thread/recebidas: ${e1.message}`);

  const { data: enviadas, error: e2 } = await tdb.from('whatsapp_mensagens_enviadas')
    .select('id, texto, tipo, template_nome, autor_email, origem, erro, enviada_em, wa_message_id, raw')
    .eq('to_phone', telefone)
    .order('enviada_em', { ascending: false })
    .limit(TETO_THREAD);
  if (e2) throw new Error(`thread/enviadas: ${e2.message}`);

  // Com as recebidas em DESC, o primeiro com dono é o vínculo MAIS RECENTE —
  // que é o certo quando o telefone mudou de mãos entre um envio e outro.
  const colaboradorId = (recebidas || []).find((r: any) => r.colaborador_id)?.colaborador_id ?? null;

  // Telemetria histórica (cadência antiga, sem texto). Só faz sentido buscar
  // quando se sabe de quem é — a tabela não tem telefone.
  let entregas: any[] = [];
  if (colaboradorId) {
    const { data } = await tdb.from('notification_deliveries')
      .select('id, kind, sent_at, provider_status, delivered_at, opened_at, error, provider_message_id')
      .eq('colaborador_id', colaboradorId)
      .eq('channel', 'whatsapp')
      .order('sent_at', { ascending: false })
      .limit(TETO_THREAD);
    entregas = data || [];
  }

  let nome: string | null = null;
  if (colaboradorId) {
    const { data: c } = await tdb.from('colaboradores')
      .select('nome_completo').eq('id', colaboradorId).maybeSingle();
    nome = (c as any)?.nome_completo ?? null;
  }

  // DESC ⇒ a mais recente é a PRIMEIRA. Ler `.at(-1)` aqui pegaria a mais antiga
  // das 300 e a janela nasceria fechada com a conversa viva.
  const ultimaRecebida = (recebidas || [])[0] as any;
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
  if (error) {
    console.error('[inbox] marcarLida:', error.message);
    // Aviso, não crítico: a conversa continua aparecendo como não lida. Irrita
    // e não perde nada — mas some do log se não for registrado, e "o contador
    // não zera" é o tipo de queixa que ninguém consegue investigar depois.
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.INBOX_ESCRITA_PERDIDA,
      chave: 'marcar-lida',
      empresaId,
      severidade: 'aviso',
      detalhe: { motivo: error.message },
    });
  }
}

/**
 * O que TODO envio precisa checar antes de gastar rede — janela e idempotência.
 *
 * Existe como função única porque texto e anexo compartilham a mesma regra, e
 * duas cópias dela divergiriam na primeira correção: nesta base já houve caso de
 * o conserto ir para o gêmeo que ninguém percorre. Se a janela mudar, muda aqui.
 */
/**
 * ⚠️ NÃO é união discriminada, e o motivo é o mesmo do `ResultadoEnvio`: o
 * `tsconfig` deste repo tem `strict: false`, então o TypeScript **não estreita**
 * união por booleano literal — `if (!p.ok)` não daria acesso a `p.resposta`, e o
 * erro aparece como "Property does not exist", parecendo problema de quem
 * consome. Interface achatada funciona nos dois modos.
 */
interface Preparo {
  ok: boolean;
  /** Presente quando `ok`. */
  colaboradorId?: string | null;
  /** Presente quando `!ok` — já é a resposta pronta para o cliente. */
  resposta?: ResultadoEnvio;
}

async function prepararEnvio(tdb: any, telefone: string, dedupe: string | null): Promise<Preparo> {
  // 1) Estado REAL da janela, agora.
  const { data: ultima, error: eU } = await tdb.from('whatsapp_mensagens_recebidas')
    .select('recebida_em, colaborador_id')
    .eq('from_phone', telefone)
    .order('recebida_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (eU) return { ok: false, resposta: { ok: false, motivo: 'Não foi possível verificar a conversa.' } };

  const janela = calcularJanela((ultima as any)?.recebida_em ?? null);
  if (!janela.podeTextoLivre) {
    return {
      ok: false,
      resposta: {
        ok: false,
        janelaFechada: true,
        motivo:
          janela.estado === 'nunca-escreveu'
            ? 'Esta pessoa nunca escreveu para o número — sem janela aberta, só é possível enviar template aprovado.'
            : 'A janela de 24 horas encerrou. Só é possível enviar template aprovado.',
      },
    };
  }

  // 2) Idempotência ANTES de gastar a chamada de rede.
  if (dedupe) {
    const { data: jaExiste } = await tdb.from('whatsapp_mensagens_enviadas')
      .select('id, wa_message_id')
      .eq('dedupe_key', dedupe)
      .maybeSingle();
    if (jaExiste) return { ok: false, resposta: { ok: true, wamid: (jaExiste as any).wa_message_id ?? null } };
  }

  return { ok: true, colaboradorId: (ultima as any)?.colaborador_id ?? null };
}

/**
 * Responde uma conversa com texto livre.
 *
 * 🔴 A JANELA É REVALIDADA no `prepararEnvio`, no instante do envio, lendo o
 * banco. O estado que a tela renderizou envelhece — o atendente abre com a
 * janela aberta, escreve cinco minutos e clica com ela fechada. Sem essa
 * checagem, a Meta recusaria com 131047 e, para quem clicou, a mensagem
 * simplesmente não teria chegado.
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
  const dedupe = args.dedupeKey || null;

  const preparo = await prepararEnvio(tdb, args.telefone, dedupe);
  if (!preparo.ok) return preparo.resposta!;
  const colaboradorId = preparo.colaboradorId ?? null;

  // 3) Envia.
  const r = await enviarTextoCloud(
    { phone: args.telefone, texto },
    { motivo: 'atendimento', empresaId: args.empresaId, colaboradorId, dedupeKey: dedupe },
  );

  // 4) Grava o CONTEÚDO — inclusive quando falha. Uma resposta que não saiu
  // precisa aparecer na tela como tentativa: sem isso o atendente reescreve sem
  // saber que já tentou, e a pessoa do outro lado pode receber duas.
  await gravarEnviada(tdb, {
    empresaId: args.empresaId,
    colaboradorId,
    telefone: args.telefone,
    email,
    dedupe,
    tipo: 'text',
    texto,
    resultado: r,
  });

  return r.ok
    ? { ok: true, wamid: r.providerMessageId ?? null }
    : { ok: false, motivo: r.reason || 'Falha ao enviar.' };
}

/**
 * Grava o que saiu (ou tentou sair). Um lugar só, porque o ramo de erro daqui é
 * o ponto cego mais caro do inbox: a mensagem chegou à pessoa e a thread não
 * mostra nada.
 */
async function gravarEnviada(tdb: any, d: {
  empresaId: string;
  colaboradorId: string | null;
  telefone: string;
  email: string;
  dedupe: string | null;
  tipo: string;
  texto: string | null;
  /** Payload no MESMO formato da Meta — é o que faz `midiaIdDoRaw` servir os dois lados. */
  raw?: Record<string, unknown> | null;
  resultado: { ok: boolean; providerMessageId?: string | null; reason?: string };
}): Promise<void> {
  const { error } = await tdb.from('whatsapp_mensagens_enviadas').insert({
    empresa_id: d.empresaId,
    colaborador_id: d.colaboradorId,
    wa_message_id: d.resultado.providerMessageId ?? null,
    to_phone: d.telefone,
    from_phone_id: process.env.PHONE_NUMBER_ID || null,
    tipo: d.tipo,
    texto: d.texto,
    raw: (d.raw ?? null) as any,
    autor_email: d.email,
    origem: 'inbox',
    dedupe_key: d.dedupe,
    erro: d.resultado.ok ? null : (d.resultado.reason ?? 'falha desconhecida'),
  });

  if (error) {
    // 🔴 A mensagem SAIU e a thread não vai mostrar. Sem este registro, o
    // atendente reescreve por não ver o que já respondeu — e a pessoa recebe
    // duas. `critico` porque o efeito está do lado de fora, não na nossa tela.
    console.error('[inbox] gravar enviada:', error.message);
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.INBOX_ESCRITA_PERDIDA,
      chave: 'gravar-enviada',
      empresaId: d.empresaId,
      colaboradorId: d.colaboradorId,
      severidade: 'critico',
      detalhe: { wamid: d.resultado.providerMessageId ?? null, enviou: d.resultado.ok, tipo: d.tipo, motivo: error.message },
    });
  }
}

/**
 * Responde com um ANEXO (imagem, áudio, vídeo ou documento).
 *
 * Recebe `FormData` porque o arquivo é binário — e é aqui que mora o limite que
 * mais confunde: o corpo de uma request na Vercel para em **4,5 MB**, então o
 * teto real é nosso (4 MB), não o da Meta (que aceita 100 MB de documento). A
 * recusa acontece ANTES do upload e diz o número verdadeiro; deixar subir para
 * morrer num 413 opaco seria impossível de explicar ao cliente.
 *
 * Vale a MESMA janela de 24h do texto livre — anexo fora da janela é recusado
 * pela Meta igual, e a checagem é a mesma função (`prepararEnvio`).
 */
export async function responderComAnexo(formData: FormData): Promise<ResultadoEnvio> {
  const email = await exigirPlataforma();

  const empresaId = String(formData.get('empresaId') || '');
  const telefone = String(formData.get('telefone') || '');
  const legenda = String(formData.get('legenda') || '').trim();
  const dedupe = String(formData.get('dedupeKey') || '') || null;
  const arquivo = formData.get('arquivo');

  if (!empresaId || !telefone) return { ok: false, motivo: 'Conversa inválida.' };
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, motivo: 'Nenhum arquivo recebido.' };

  // Classifica ANTES de qualquer I/O: tipo não suportado e arquivo grande demais
  // são decisões de graça, e o erro precisa chegar como frase, não como código.
  const classe = classificarMidia(arquivo.type, arquivo.size);
  if (!classe.ok) return { ok: false, motivo: classe.motivo! };

  const tdb = tenantDb(empresaId);
  const preparo = await prepararEnvio(tdb, telefone, dedupe);
  if (!preparo.ok) return preparo.resposta!;
  const colaboradorId = preparo.colaboradorId ?? null;

  const nome = (arquivo.name || 'arquivo').slice(0, 120);

  // 1) Sobe o binário. Falhar aqui é falha de ENVIO, e vira tentativa gravada:
  // sem isso o atendente não sabe se o anexo foi ou não.
  const up = await subirMidia(arquivo, arquivo.type, nome);
  if (!up.ok || !up.mediaId) {
    await gravarEnviada(tdb, {
      empresaId, colaboradorId, telefone, email, dedupe,
      tipo: classe.tipo,
      texto: legenda || null,
      raw: { filename: nome },
      resultado: { ok: false, reason: up.reason ?? 'falha no upload' },
    });
    return { ok: false, motivo: `Não foi possível enviar o arquivo: ${up.reason ?? 'falha no upload'}` };
  }

  // 2) Envia a mídia já subida.
  const r = await enviarMidiaCloud(
    { phone: telefone, tipo: classe.tipo, mediaId: up.mediaId, legenda, nomeArquivo: nome },
    { motivo: 'atendimento-anexo', empresaId, colaboradorId, dedupeKey: dedupe },
  );

  // 3) Grava no formato DA META (`{ image: { id } }`) — assim o mesmo
  // `midiaIdDoRaw` que lê o recebido lê o enviado, e o proxy autenticado serve
  // os dois sem uma linha a mais.
  await gravarEnviada(tdb, {
    empresaId, colaboradorId, telefone, email, dedupe,
    tipo: classe.tipo,
    texto: legenda || null,
    raw: { [classe.tipo]: { id: up.mediaId }, filename: nome },
    resultado: r,
  });

  return r.ok
    ? { ok: true, wamid: r.providerMessageId ?? null }
    : { ok: false, motivo: r.reason || 'Falha ao enviar o anexo.' };
}

/**
 * As mensagens SEM tenant não moram aqui.
 *
 * Elas viviam neste arquivo, numa `listarNaoResolvidas()` que nunca teve
 * consumidor — e o custo disso foi medido em 15/08/2026: a ÚNICA mensagem que o
 * webhook já tinha recebido estava sem empresa, portanto invisível em todas as
 * telas, enquanto o workspace do cliente dizia "nenhuma mensagem recebida". Uma
 * action sem tela não é meio caminho andado; é a lacuna com aparência de
 * cobertura.
 *
 * Agora ficam em `app/admin-v2/inbox` (caixa da equipe), junto com os candidatos
 * a dono e a associação auditada — que é onde alguém realmente as vê.
 */
