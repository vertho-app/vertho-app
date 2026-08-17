import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase';
import { sendWhatsapp } from '@/lib/whatsapp';
import { criarPaceadorSincrono } from '@/lib/whatsapp/cadencia';
import { formatarDataHoraBRT } from './conteudo';
import { mensagemT1 } from './mensagens';

/**
 * CONARH 52 — régua de follow-up T+1 → T+5 (F8 do sprint consolidado).
 *
 * Executada diariamente pelo cron 'conarh-followup' (~12:00 UTC). Varre os
 * diag_leads do scope conarh-2026 e executa SÓ o próximo passo devido:
 *
 *   T+1 (followup_step=1, criado há ≥1 dia, classe A ou B):
 *     WhatsApp AO LEAD com recorte aplicado à competencia_critica, zero pedido
 *     → step 2.
 *   T+3 (step=2, ≥3 dias, classe A):
 *     entra na fila de ligação → step 3. A fila fica em `diag_leads`; não há
 *     mais aviso (ver abaixo).
 *   T+5 (step 2 ou 3, ≥5 dias):
 *     calcula o insight agregado do evento (contagens por porta, divergências
 *     médias) → step 4 (régua encerrada).
 *
 * Regras fixas:
 *   - Classe C NUNCA recebe nada — encerrada na primeira varredura (step 4,
 *     sem envio), para não ser re-varrida todo dia;
 *   - classe B só AVANÇA com contato_em preenchido (respondeu) — sem resposta,
 *     fica parada onde está;
 *   - leads sem classe (capturados antes da mig 196) encerram sem envio;
 *   - tudo best-effort com log: um lead quebrado NUNCA derruba o cron.
 *
 * ⚠️ AVISOS INTERNOS DESLIGADOS em 17/08/2026 (decisão do dono).
 *
 * `CONARH_ALERT_WHATSAPP` não é mais lida. A fila de ligação (T+3) e o insight
 * do evento (T+5) continuam sendo CALCULADOS e registrados no log; o que saiu
 * foi a notificação por WhatsApp, que ia para o próprio time pelo caminho
 * legado e não chegava desde 11/08.
 *
 * 🔑 E o avanço de `followup_step` foi DESAMARRADO do envio. Antes, o estado do
 * lead só mudava se a mensagem interna saísse — com o canal caído, a régua
 * ficava congelada em silêncio, e o T+5 recolhia os mesmos leads todo dia num
 * laço de nada. O que aconteceu de fato foi o lead completar 3 ou 5 dias; isso
 * é verdade tendo ou não alguém sido avisado. **Aviso é notificação, não
 * catraca de estado.**
 */

const DIA_MS = 24 * 60 * 60 * 1000;

type LeadRegua = {
  id: string;
  nome: string | null;
  telefone: string | null;
  organizacao: string | null;
  porta_escolhida: number | null;
  competencia_critica: string | null;
  classe: 'A' | 'B' | 'C' | null;
  criado_em: string;
  contato_em: string | null;
  followup_step: number;
};

export async function executarReguaConarh() {
  const sb = createSupabaseAdmin();
  const agora = Date.now();
  // Avisos internos de T+3/T+5 DESLIGADOS em 17/08/2026 (decisão do dono). Eles
  // iam por WhatsApp para o próprio time, pelo caminho legado — e a Z-API está
  // desconectada desde 11/08, então já não chegavam: 388 falhas medidas.
  //
  // O que sai daqui é só a NOTIFICAÇÃO. A fila de ligação e o insight continuam
  // sendo calculados, registrados no log e visíveis no banco (`followup_step`).
  // Se voltarem, o canal certo é push ou e-mail: comunicação interna nunca
  // precisou de WhatsApp, e amarrá-la a ele é o que deixou a régua parada.

  let t1 = 0, t3 = 0, t5 = 0, encerrados = 0, erros = 0, adiados = 0;

  // ── Cadência do T+1 (política única: lib/whatsapp/cadencia) ────────────────
  //
  // Este loop mandava WhatsApp para lead atrás de lead SEM INTERVALO NENHUM —
  // era o quarto emissor fora da política, e o único que nenhuma varredura
  // anterior tinha visto (não publica na fila, então a guarda de cadência, que
  // procurava por `whatsapp-cis`, passava direto). Com 5 leads não incomoda;
  // no dia seguinte a uma feira, é uma rajada para números que nunca trocaram
  // mensagem com o remetente — a definição do que bloqueou o número em 11/08.
  //
  // O teto ADIA em vez de descartar: sem o `update` do step, o lead continua
  // elegível e entra na varredura de amanhã. Num cron diário, "depois" já existe.
  const paceador = criarPaceadorSincrono();

  // Candidatos: já passaram pelo T+0 (step ≥ 1) e ainda não encerraram (≤ 3).
  // criado há ≥1 dia já filtra o grosso no banco (índice idx_diag_leads_conarh).
  const { data: leads, error } = await sb
    .from('diag_leads')
    .select('id, nome, telefone, organizacao, porta_escolhida, competencia_critica, classe, criado_em, contato_em, followup_step')
    .eq('scope_id', 'conarh-2026')
    .gte('followup_step', 1)
    .lte('followup_step', 3)
    .lte('criado_em', new Date(agora - DIA_MS).toISOString())
    .limit(500);

  if (error) {
    // Falha de LEITURA é global: reporta e sai (o route devolve 500 → visível
    // no log do Vercel e o cron de amanhã re-tenta).
    throw new Error(`[conarh/regua] leitura falhou: ${error.message}`);
  }

  const filaLigacao: LeadRegua[] = []; // T+3 — uma mensagem interna só
  const avancaramT5: LeadRegua[] = []; // T+5 — idem

  for (const lead of (leads || []) as LeadRegua[]) {
    try {
      const idadeDias = (agora - new Date(lead.criado_em).getTime()) / DIA_MS;

      // Classe C e sem-classe: régua encerrada SEM nenhum envio.
      if (lead.classe === 'C' || !lead.classe) {
        await sb.from('diag_leads').update({ followup_step: 4 }).eq('id', lead.id);
        encerrados++;
        continue;
      }

      // B só avança se respondeu (contato_em carimbado por quem atende).
      const podeAvancar = lead.classe === 'A' || !!lead.contato_em;
      if (!podeAvancar) continue;

      // ── T+1: recorte aplicado à competência, zero pedido ──
      if (lead.followup_step === 1 && idadeDias >= 1) {
        if (!lead.telefone) {
          console.warn(`[conarh/regua] lead ${lead.id} sem telefone — T+1 pulado, step avançado`);
          await sb.from('diag_leads').update({ followup_step: 2 }).eq('id', lead.id).eq('followup_step', 1);
          continue;
        }
        // Teto (volume ou tempo da invocação): não envia e NÃO avança o step —
        // o lead volta amanhã, em vez de ser pulado em silêncio.
        if (paceador.tetoAtingido()) { adiados++; continue; }
        await paceador.aguardarVez();
        const r = await sendWhatsapp(
          { kind: 'text', phone: lead.telefone, text: mensagemT1(lead) },
          { motivo: 'conarh_t1' },
        );
        if (r.ok) {
          await sb.from('diag_leads').update({ followup_step: 2 }).eq('id', lead.id).eq('followup_step', 1);
          t1++;
        } else {
          erros++;
          console.error(`[conarh/regua] T+1 falhou p/ ${lead.id}:`, r.reason);
        }
        continue;
      }

      // ── T+3: entra na fila de ligação do fechador (só classe A) ──
      if (lead.followup_step === 2 && idadeDias >= 3 && lead.classe === 'A') {
        filaLigacao.push(lead);
        continue;
      }

      // ── T+5: encerra a régua; o insight agregado vai num resumo só ──
      if ((lead.followup_step === 2 || lead.followup_step === 3) && idadeDias >= 5) {
        avancaramT5.push(lead);
      }
    } catch (err: any) {
      erros++;
      console.error(`[conarh/regua] lead ${lead.id} falhou:`, err?.message || err);
    }
  }

  // ── T+3: fila de ligação do dia ──
  //
  // 🔴 O AVANÇO DE ESTADO NÃO DEPENDE MAIS DO AVISO (17/08/2026).
  //
  // Antes, o `followup_step` só ia a 3 se a mensagem interna saísse. Isso amarra
  // o ESTADO DO LEAD ao sucesso de um CANAL — e o canal caiu: a Z-API está
  // desconectada desde 11/08 (388 falhas medidas), então a régua estava
  // congelada em silêncio, sem nada no produto dizendo isso.
  //
  // O que aconteceu de fato foi o lead completar 3 dias. Isso é verdade tendo
  // ou não alguém sido avisado. Aviso é notificação, não catraca.
  if (filaLigacao.length) {
    for (const l of filaLigacao) {
      await sb.from('diag_leads').update({ followup_step: 3 }).eq('id', l.id).eq('followup_step', 2);
    }
    t3 = filaLigacao.length;

    // Aviso interno DESLIGADO por decisão do dono (17/08).
    //
    // ⚠️ O LOG NÃO LEVA PII. A primeira versão listava nome, organização e
    // TELEFONE de cada lead — trocar um canal por um log parece inócuo e não é:
    // a mensagem ia para um destinatário, o log fica RETIDO e visível a quem tem
    // acesso ao projeto. A fila em si está em `diag_leads` (`followup_step = 3`),
    // que é de onde a tela lê e onde o dado deve viver.
    console.log(`[conarh/regua] fila de ligação: ${filaLigacao.length} lead(s) A no step 3`);
  }

  // ── T+5: encerra a régua e registra o insight agregado ──
  //
  // Mesma correção do T+3: encerrar é consequência de o lead completar 5 dias,
  // não de alguém ter sido avisado. Com o aviso amarrado ao estado, o canal
  // caído deixava TODO lead preso no step 2/3 — e, como o T+5 recolhe os mesmos
  // leads todo dia, a régua ficava num laço de nada, sem erro e sem fim.
  if (avancaramT5.length) {
    for (const l of avancaramT5) {
      await sb.from('diag_leads').update({ followup_step: 4 }).eq('id', l.id).in('followup_step', [2, 3]);
    }
    t5 = avancaramT5.length;

    // O insight continua sendo CALCULADO e registrado — ele é a leitura do
    // evento, e some se depender de um canal desligado. Aviso interno
    // desligado por decisão do dono (17/08).
    const insight = await montarInsightEvento(sb).catch((err) => {
      console.error('[conarh/regua] insight agregado falhou:', err?.message || err);
      return null;
    });
    console.log(`[conarh/regua] insight T+5 (${avancaramT5.length} encerrados):\n${insight || '(indisponível nesta rodada)'}`);
  }

  // `adiados` fica FORA da conta de erros e visível na mensagem: erro é coisa a
  // consertar, adiado é a proteção funcionando — e um corte que não aparece é
  // indistinguível de "mandei para todo mundo".
  const adiadoTxt = adiados > 0 ? `, ${adiados} adiados pelo teto (voltam amanhã)` : '';
  const message = `CONARH régua: ${t1} T+1, ${t3} T+3 (fila ligação), ${t5} T+5 (encerrados), ${encerrados} C/sem-classe encerrados, ${erros} erros${adiadoTxt}`;
  console.log(`[conarh/regua] ${message}`);
  return { t1, t3, t5, encerrados, erros, adiados, message };
}

/**
 * Insight agregado do evento inteiro (não só do dia): contagens por porta,
 * por classe e a comparação entre a leitura do visitante e a da régua no
 * cenário da etapa 2 (o ativo de dados de setembro).
 *
 * Leads que não têm `sessao.cenario.nivel_atribuido` ficam FORA da conta: são
 * os anteriores a 05/08/2026, medidos por réguas que já não existem (as
 * divergências por descritor do registro escrito, até 04/08; o nível que o
 * visitante aceitaria entre 4 respostas, até 05/08). Converter uma medida na
 * outra inventaria um dado que ninguém coletou.
 */
async function montarInsightEvento(sb: ReturnType<typeof createSupabaseAdmin>): Promise<string> {
  const { data: leads, error } = await sb
    .from('diag_leads')
    .select('classe, porta_escolhida, sessao')
    .eq('scope_id', 'conarh-2026')
    .limit(5000);
  if (error) throw new Error(error.message);

  const lista = (leads || []) as any[];
  const porPorta: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const porClasse: Record<string, number> = { A: 0, B: 0, C: 0 };
  let cenarioN = 0, acimaDaRegua = 0, convergiram = 0, somaNivel = 0;
  for (const l of lista) {
    if (l.porta_escolhida >= 1 && l.porta_escolhida <= 5) porPorta[l.porta_escolhida]++;
    if (l.classe && porClasse[l.classe] !== undefined) porClasse[l.classe]++;
    const nivel = Number(l.sessao?.cenario?.nivel_atribuido);
    const daRegua = Number(l.sessao?.cenario?.nivel_regua);
    if (!(nivel >= 1 && nivel <= 4) || !(daRegua >= 1 && daRegua <= 4)) continue;
    cenarioN++;
    somaNivel += nivel;
    if (nivel > daRegua) acimaDaRegua++;
    else if (nivel === daRegua) convergiram++;
  }

  const linhas = [
    `Leads: ${lista.length} (A: ${porClasse.A} · B: ${porClasse.B} · C: ${porClasse.C})`,
    `Etapas: 1) ${porPorta[1]} · 2) ${porPorta[2]} · 3) ${porPorta[3]} · 4) ${porPorta[4]} · 5) ${porPorta[5]}`,
    cenarioN
      ? `Cenário (etapa 2): ${acimaDaRegua} de ${cenarioN} classificaram a conversa ACIMA do que a régua lê (${convergiram} leram igual) — nível médio atribuído N${(somaNivel / cenarioN).toFixed(1)}`
      : 'Cenário (etapa 2): sem sessões registradas',
  ];
  if (cenarioN > 0 && cenarioN < 7) linhas.push('(amostra < 7 — ainda não publicável, só interno)');
  return linhas.join('\n');
}
