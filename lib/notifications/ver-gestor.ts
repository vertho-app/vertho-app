/**
 * O "VER" do gestor: da palavra recebida até a lista de nomes na janela de 24h.
 *
 * 🔴 A AUTORIZAÇÃO NÃO É A PALAVRA. Esta resposta carrega PII de terceiros —
 * nome de liderado e o estado da trilha dele. Se a única condição fosse escrever
 * "VER", qualquer pessoa que descobrisse a palavra receberia a lista de alguma
 * equipe. São quatro portas, todas fail-closed, e a terceira é a que importa:
 * **a autorização vem de NÓS termos enviado o template para aquele colaborador**
 * (`notification_deliveries.kind = 'resumo-gestor'` nas últimas 24h), não de o
 * telefone saber a palavra.
 *
 * ⚠️ RODA DENTRO DE `after()`, NUNCA NO CAMINHO DO 200. Montar o resumo e enviar
 * é I/O lento; segurar a resposta faz a Meta reentregar o evento e, no limite,
 * desativar a inscrição do webhook.
 *
 * ⚠️ IDEMPOTÊNCIA PRÓPRIA. A Meta reentrega eventos, e o laço do webhook coleta a
 * mensagem para o pós-processamento mesmo quando o upsert ignora a duplicata —
 * tolerável para um push, inaceitável para uma lista de nomes enviada duas vezes.
 * O `dedupeKey` é o `wa_message_id`, e ele é consultado ANTES de enviar.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { enviarTextoCloud } from '@/lib/whatsapp/cloud-api';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
import { TRILHA } from '@/lib/status';
import {
  agruparPessoas, classificarSemana, formatarResumo, primeiroNome, semanaDaTrilha,
  type PessoaNaSemana, type ResumoEquipe,
} from './resumo-gestor';

/** `kind` da entrega do template. É o que abre a porta para o VER. */
export const KIND_RESUMO_GESTOR = 'resumo-gestor';
const JANELA_AUTORIZACAO_H = 24;

/**
 * Normaliza para comparar: sem acento, sem pontuação, minúsculo, sem espaço
 * duplicado. "Ver!" e "vér " viram "ver".
 */
function normalizar(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim().replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * É um pedido do resumo?
 *
 * PALAVRA SOLTA, NÃO PREFIXO — de propósito. "Ver o que?" não dispara: errar
 * para o lado de não responder é melhor que mandar nomes a quem não pediu.
 */
export function ehPedidoDeResumo(texto: string | null | undefined): boolean {
  return normalizar(texto) === 'ver';
}

const RECUSAS = new Set([
  'sair', 'parar', 'pare', 'cancelar', 'stop', 'descadastrar',
  'nao quero', 'nao quero mais', 'para de mandar', 'remover',
]);

/**
 * É um pedido para parar de receber?
 *
 * O template NÃO oferece saída (o resumo é ferramenta de trabalho e o ritmo é
 * decisão da organização), mas quem pede precisa ser ENTENDIDO: a alternativa a
 * isso é a pessoa apertar Bloquear, e bloqueio derruba o `quality_rating` de um
 * número compartilhado por todos os tenants.
 */
export function ehRecusa(texto: string | null | undefined): boolean {
  return RECUSAS.has(normalizar(texto));
}

export const TEXTO_RECUSA =
  'Entendi. Quem controla esses envios é o RH da sua empresa — vou registrar seu pedido, ' +
  'e alguém da equipe fala com você. Se precisar do acompanhamento da equipe antes disso, ' +
  'ele continua disponível no painel.';

/**
 * ⚠️ NÃO É UNIÃO DISCRIMINADA, de propósito. Com `strict: false` o TypeScript
 * não estreita união por booleano, então `{enviou:true} | {enviou:false;motivo}`
 * compila aqui e QUEBRA em quem consome: o webhook não conseguiria ler
 * `r.motivo` dentro do próprio `if (!r.enviou)`. Mesma armadilha já registrada
 * em `lib/conteudo-podcast-core`.
 */
type Resultado = { enviou: boolean; motivo?: string };

/**
 * Aplica as quatro portas e responde. Nunca lança: quem chama está dentro de
 * `after()`, onde uma exceção não tem para onde ir.
 */
export async function responderPedidoDeResumo(input: {
  colaboradorId: string | null;
  empresaId: string | null;
  telefone: string;
  waMessageId: string;
  /** Host do tenant, quando conhecido — vira o link do painel. */
  hostTenant?: string | null;
}): Promise<Resultado> {
  try {
    // Porta 1 — o telefone resolveu para UMA pessoa. `decidirDono` já é
    // fail-closed na ambiguidade; aqui só recusamos o que chegou sem dono.
    if (!input.colaboradorId || !input.empresaId) return { enviou: false, motivo: 'sem dono resolvido' };

    const sb = createSupabaseAdmin();

    // Porta 4 (antes das caras) — já respondi a este evento?
    const dedupeKey = `${KIND_RESUMO_GESTOR}:${input.waMessageId}`;
    const { data: jaRespondi, error: erroDedupe } = await sb
      .from('notification_deliveries')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .limit(1);
    if (erroDedupe) throw new Error(erroDedupe.message);
    if (jaRespondi?.length) return { enviou: false, motivo: 'já respondido (reentrega da Meta)' };

    // Porta 3 — NÓS mandamos o template para esta pessoa nas últimas 24h?
    const desde = new Date(Date.now() - JANELA_AUTORIZACAO_H * 3600 * 1000).toISOString();
    const { data: entregas, error: erroEntrega } = await sb
      .from('notification_deliveries')
      .select('id')
      .eq('colaborador_id', input.colaboradorId)
      .eq('kind', KIND_RESUMO_GESTOR)
      .gte('created_at', desde)
      .limit(1);
    if (erroEntrega) throw new Error(erroEntrega.message);
    if (!entregas?.length) return { enviou: false, motivo: 'sem template enviado nas últimas 24h' };

    // Porta 2 — é gestor E tem liderados AGORA. A hierarquia muda dentro da
    // semana: entre dois dias consecutivos a base perdeu 15 pessoas e um vínculo.
    const resumo = await montarResumoDaEquipe(input.empresaId, input.colaboradorId, input.hostTenant ?? null);
    if (!resumo) return { enviou: false, motivo: 'não é gestor ou não tem liderados' };

    const r = await enviarTextoCloud(
      { phone: input.telefone, texto: formatarResumo(resumo) },
      { motivo: KIND_RESUMO_GESTOR, dedupeKey, empresaId: input.empresaId, colaboradorId: input.colaboradorId },
    );
    if (!r.ok) return { enviou: false, motivo: r.reason || 'envio recusado' };
    return { enviou: true };
  } catch (e: any) {
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.WHATSAPP_INBOUND_PERDIDO,
      chave: 'resumo-gestor',
      // `aviso`, não `critico`: o gestor pediu e não recebeu, o que é ruim, mas
      // nada se perdeu — a mensagem dele está gravada e ele pode pedir de novo.
      severidade: 'aviso',
      detalhe: { motivo: e?.message || String(e), wamid: input.waMessageId },
    });
    return { enviou: false, motivo: e?.message || String(e) };
  }
}

/**
 * Lê a equipe e devolve o resumo, ou `null` se a pessoa não lidera ninguém.
 *
 * ⚠️ O vínculo é por `gestor_email` (texto livre, sem FK) e a comparação é por
 * igualdade case-insensitive em CÓDIGO — nunca `.ilike()`, onde `_` e `%` são
 * curinga e um e-mail com underscore casaria gente de outro gestor. É a mesma
 * régua do gate de posse do painel, de propósito: ver e receber não podem
 * divergir.
 */
export async function montarResumoDaEquipe(
  empresaId: string,
  gestorId: string,
  hostTenant: string | null = null,
): Promise<ResumoEquipe | null> {
  const tdb = tenantDb(empresaId);

  const { data: gestor, error: erroGestor } = await tdb.from('colaboradores')
    .select('id, nome_completo, email, role').eq('id', gestorId).maybeSingle();
  if (erroGestor) throw new Error(erroGestor.message);
  if (!gestor) return null;
  // `rh` é Admin da empresa, não gestor de equipe: pela régua de privacidade ele
  // recebe agregado, e há um vínculo de 126 liderados apontando para um `rh`.
  if ((gestor as any).role !== 'gestor') return null;

  const email = String((gestor as any).email ?? '').toLowerCase().trim();
  if (!email) return null;

  const { data: todos, error: erroLid } = await tdb.from('colaboradores')
    .select('id, nome_completo, gestor_email, role').neq('id', gestorId);
  if (erroLid) throw new Error(erroLid.message);

  const liderados = (todos || []).filter(
    (c: any) => c.role !== 'rh' && String(c.gestor_email ?? '').toLowerCase().trim() === email,
  );
  if (!liderados.length) return null;

  const ids = liderados.map((c: any) => c.id);
  const { data: trilhas, error: erroTrilhas } = await tdb.from('trilhas')
    .select('id, colaborador_id, data_inicio, programa_modo, status')
    .in('colaborador_id', ids).eq('status', TRILHA.ATIVA);
  if (erroTrilhas) throw new Error(erroTrilhas.message);

  const trilhaPorColab = new Map<string, any>();
  for (const t of trilhas || []) trilhaPorColab.set((t as any).colaborador_id, t);
  if (!trilhaPorColab.size) return null;

  const { data: progresso, error: erroProg } = await tdb.from('temporada_semana_progresso')
    .select('colaborador_id, semana, status, conteudo_consumido, concluido_em')
    .in('trilha_id', (trilhas || []).map((t: any) => t.id));
  if (erroProg) throw new Error(erroProg.message);

  const seteDiasAtras = Date.now() - 7 * 24 * 3600 * 1000;
  const catorzeDiasAtras = Date.now() - 14 * 24 * 3600 * 1000;
  const pessoas: PessoaNaSemana[] = [];
  const retomaram: string[] = [];
  let avancaram = 0;

  for (const colab of liderados) {
    const trilha = trilhaPorColab.get(colab.id);
    if (!trilha) continue; // sem trilha ativa não é pendência desta semana

    const semana = semanaDaTrilha(trilha);
    const doColab = (progresso || []).filter((p: any) => p.colaborador_id === colab.id);
    const daSemana = doColab.find((p: any) => p.semana === semana);

    const concluiuRecente = doColab.some(
      (p: any) => p.concluido_em && new Date(p.concluido_em).getTime() >= seteDiasAtras,
    );
    if (concluiuRecente) {
      avancaram++;
      // Retomada = avançou agora depois de um intervalo sem nada. Sem esse
      // recorte, "retomaram" listaria quem nunca parou.
      const concluiuAntes = doColab.some((p: any) => {
        const t = p.concluido_em ? new Date(p.concluido_em).getTime() : 0;
        return t > 0 && t < catorzeDiasAtras;
      });
      const nadaNoMeio = !doColab.some((p: any) => {
        const t = p.concluido_em ? new Date(p.concluido_em).getTime() : 0;
        return t >= catorzeDiasAtras && t < seteDiasAtras;
      });
      if (concluiuAntes && nadaNoMeio) retomaram.push(colab.nome_completo);
    }

    const chave = classificarSemana(daSemana);
    if (chave !== 'concluida') pessoas.push({ nome: colab.nome_completo, chave });
  }

  const semanas = [...new Set([...trilhaPorColab.values()].map((t) => semanaDaTrilha(t)))].filter(Boolean);

  return {
    gestorPrimeiroNome: primeiroNome((gestor as any).nome_completo),
    equipe: trilhaPorColab.size,
    avancaram,
    grupos: agruparPessoas(pessoas),
    retomaram,
    semana: semanas.length === 1 ? (semanas[0] as number) : null,
    linkPainel: hostTenant ? `https://${hostTenant}/dashboard/gestor` : null,
  };
}
