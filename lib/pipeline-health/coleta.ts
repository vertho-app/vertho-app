/**
 * Coleta do health-check: transforma o estado do banco nas estruturas que
 * `regras.ts` avalia.
 *
 * ⚠️ REGRA DE OURO desta camada: a previsão tem que passar pelo MESMO código da
 * entrega. Reimplementar "o que a pessoa vai receber" produz um check que concorda
 * consigo mesmo e diverge da realidade — foi exatamente o erro cometido em 27/07,
 * quando um diagnóstico feito com `resolverKitDaSemana` (caminho de fallback) disse
 * "34 entregas só com áudio" enquanto a entrega real (`precarregarKits`) servia os 3
 * formatos. Por isso aqui se chama `precarregarKits` + `overlayKitNaSemana` sobre uma
 * CÓPIA do plano, igual `loadTemporada` faz.
 */
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { normalizePhone } from '@/lib/phone';
import type { EntregaPrevista, EnvioObservado } from './regras';

/** Dia da semana no fuso do envio (1=segunda … 7=domingo), como o cron calcula. */
export function diaDaSemanaBRT(d: Date): number {
  const brt = new Date(d.getTime() - 3 * 3600_000);
  const dow = brt.getUTCDay(); // 0=domingo
  return dow === 0 ? 7 : dow;
}

/**
 * Qual pílula sai na data alvo, segundo a cadência da empresa? `null` = nenhuma.
 * Espelha os gates de `triggerDiario` (hoje === diaP1 / diaP2 / diaEv).
 */
export function pilulaDoDia(cadencia: any, dia: number): 1 | 2 | null {
  const diaP1 = cadencia?.fase4_dia_pilula ?? 1;
  const diaP2 = cadencia?.fase4_dia_pilula2 ?? 2;
  if (dia === diaP1) return 1;
  if (dia === diaP2) return 2;
  return null;
}

/**
 * Monta as entregas previstas de uma empresa para uma data.
 * Só olha a pílula que REALMENTE sai nesse dia — checar as duas geraria alarme sobre
 * conteúdo que ainda tem dias para ficar pronto.
 */
export async function coletarEntregasPrevistas(
  sb: any,
  empresaId: string,
  dataAlvo: Date,
): Promise<{ entregas: EntregaPrevista[]; pilulaAlvo: 1 | 2 | null }> {
  const { data: emp } = await sb.from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  const pilulaAlvo = pilulaDoDia((emp?.sys_config as any)?.cadencia, diaDaSemanaBRT(dataAlvo));
  if (!pilulaAlvo) return { entregas: [], pilulaAlvo: null };

  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, semana_atual, colaboradores!inner(id, nome_completo, email, telefone, whatsapp, cargo, perfil_dominante, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('empresa_id', empresaId).eq('status', 'ativo');
  if (!envios?.length) return { entregas: [], pilulaAlvo };

  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, temporada_plano, competencia_foco, numero_temporada').eq('empresa_id', empresaId);
  const ultima = new Map<string, any>();
  for (const t of (trilhas as any[] || [])) {
    const p = ultima.get(t.colaborador_id);
    if (!p || Number(t.numero_temporada) > Number(p.numero_temporada)) ultima.set(t.colaborador_id, t);
  }

  // Cache dos kits por (cargo × DISC): a coorte inteira compartilha poucos pares, e
  // sem isso o preflight faz 3 queries POR PESSOA.
  const cacheKits = new Map<string, any>();
  const entregas: EntregaPrevista[] = [];

  for (const e of (envios as any[])) {
    const c = e.colaboradores;
    const semana = Number(e.semana_atual) || 1;
    const t = ultima.get(e.colaborador_id);
    const plan = (t?.temporada_plano || []).find((s: any) => Number(s.semana) === semana);
    if (!plan || plan.tipo !== 'conteudo') continue;

    const chave = `${c.cargo}|${c.perfil_dominante}`;
    if (!cacheKits.has(chave)) {
      // SEM `.catch` aqui, de propósito: se o pré-carregamento falhar, o health-check
      // tem que ACUSAR (o try/catch por empresa em core.ts vira o achado
      // 'check-falhou'). Engolir produziria uma previsão feita pelo caminho de
      // fallback — parecendo saudável enquanto mede outra coisa.
      cacheKits.set(chave, await precarregarKits(sb, { empresaId, disc: c.perfil_dominante, cargo: c.cargo }));
    }
    const copia = JSON.parse(JSON.stringify(plan));
    await overlayKitNaSemana(sb, copia, {
      empresaId, disc: c.perfil_dominante, cargo: c.cargo,
      formatoPref: formatoPreferido(c), competenciaFoco: t?.competencia_foco || null,
      kitsCache: cacheKits.get(chave),
    });

    const itens = Array.isArray(copia.conteudos_dia) && copia.conteudos_dia.length
      ? copia.conteudos_dia : [{ conteudo: copia.conteudo, descritor: copia.descritor }];
    const item = itens[pilulaAlvo - 1];
    if (!item) continue; // semana single num dia de P2: nada sai, nada a checar
    const cont = item.conteudo || {};

    // Formatos REALMENTE entregáveis: os do kit/build + vídeo só se a célula tiver
    // deck pronto. `formatos_disponiveis` nunca contém vídeo (é do pipeline de célula).
    const formatos = Object.keys(cont.formatos_disponiveis || {}).filter((f) => f !== 'video');
    if (await temDeckPronto(sb, empresaId, cont.core_id, c.cargo, c.perfil_dominante)) formatos.push('video');

    const tel = c.whatsapp || c.telefone;
    entregas.push({
      colaboradorId: c.id,
      nome: c.nome_completo || '(sem nome)',
      cargo: c.cargo, disc: c.perfil_dominante,
      semana, pilula: pilulaAlvo,
      descritor: item.descritor ?? null,
      temKit: !!cont.kit_id,
      // O texto da pílula usa `derivarPrioridadeFormatos[0]` (cron-jobs.ts), que NÃO é
      // a mesma função do overlay (`formatoPreferido`). Duas implementações da mesma
      // ideia — F-estrutural 10 do FMEA. Aqui usa-se a do TEXTO, que é quem promete.
      formatoAnunciado: derivarPrioridadeFormatos(c)[0],
      formatosDisponiveis: formatos,
      coreId: cont.core_id ?? null,
      desafioPlaceholder: /^Aplique /i.test(String(cont.desafio_texto || '')),
      telefoneValido: !!tel && !!normalizePhone(tel),
      temEmail: !!c.email,
    });
  }
  return { entregas, pilulaAlvo };
}

/** A célula de vídeo do core tem deck ASSISTÍVEL? (status done + ids do Bunny) */
async function temDeckPronto(sb: any, empresaId: string, coreId: string | null, cargo: string | null, disc: string | null): Promise<boolean> {
  const d1 = String(disc || '').charAt(0).toUpperCase();
  if (!coreId || !cargo || !['D', 'I', 'S', 'C'].includes(d1)) return false;
  const { data: mc } = await sb.from('micro_conteudos').select('modulo_base_id').eq('id', coreId).eq('empresa_id', empresaId).maybeSingle();
  if (!(mc as any)?.modulo_base_id) return false;
  const { data: deck } = await sb.from('videos_gerados')
    .select('id').eq('modulo_base_id', (mc as any).modulo_base_id).eq('empresa_id', empresaId)
    .eq('cargo', cargo).eq('disc_dominante', d1).eq('status', 'done')
    .not('bunny_video_id', 'is', null).limit(1).maybeSingle();
  return !!deck;
}

/** Estado dos carimbos do dia (postflight). */
export async function coletarEnviosDoDia(
  sb: any,
  empresaId: string,
  dataAlvo: Date,
  pilula: 1 | 2,
): Promise<EnvioObservado[]> {
  const dia = dataAlvo.toISOString().slice(0, 10);
  const colW = pilula === 1 ? 'ultima_pilula1_whatsapp_em' : 'ultima_pilula2_whatsapp_em';
  const colE = pilula === 1 ? 'ultima_pilula1_email_em' : 'ultima_pilula2_email_em';
  const { data } = await sb.from('fase4_envios')
    .select(`colaborador_id, ${colW}, ${colE}, colaboradores!inner(nome_completo, email, telefone, whatsapp)`)
    .eq('empresa_id', empresaId).eq('status', 'ativo');

  const doDia = (ts: any) => (ts && String(new Date(ts).toISOString().slice(0, 10)) === dia ? String(ts) : null);
  return ((data as any[]) || []).map((r) => {
    const c = r.colaboradores;
    const tel = c.whatsapp || c.telefone;
    return {
      colaboradorId: r.colaborador_id,
      nome: c.nome_completo || '(sem nome)',
      temTelefone: !!tel && !!normalizePhone(tel),
      temEmail: !!c.email,
      carimboWhatsapp: doDia(r[colW]),
      carimboEmail: doDia(r[colE]),
    };
  });
}
