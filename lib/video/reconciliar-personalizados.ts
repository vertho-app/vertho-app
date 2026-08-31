/**
 * Reconciliação de vídeos personalizados — F-V1 do docs/FMEA-PIPELINE.md.
 *
 * O PROBLEMA
 * `personalizeCell` (worker) fotografa os colaboradores de (empresa × cargo × DISC)
 * no INSTANTE do render e gera a saudação "Olá, {nome}" para cada um. Quem entra
 * depois — contratado novo, DISC remapeado, ou simplesmente uma célula renderizada
 * antes de a pessoa existir — cai no deck genérico e fica nele PARA SEMPRE: não há
 * re-disparo. Some também quem falhou no meio (status 'error') ou travou
 * ('processing' sem fim — 5 casos parados desde 14-16/07, medidos em 27/07).
 *
 * Degradação silenciosa clássica: a pessoa vê um vídeo, só que sem o nome. Nada
 * na tela denuncia, e nenhuma contagem acusa.
 *
 * O MECANISMO
 * A personalização só existe acoplada ao render: ela precisa do deck em /tmp
 * (`personalizeCell(job, deckPath)`), então não há caminho "personalizar avulso".
 * Reconciliar = devolver a célula à fila (`render_queued`); o worker re-renderiza o
 * deck e personaliza os faltantes — `personalizeCell` já pula quem está 'done'.
 *
 * POR QUE ISSO NÃO PREJUDICA QUEM JÁ TEM VÍDEO
 * `resolverCelulaVideo` busca a célula com `.neq('status','error')` — ou seja, ela
 * continua sendo encontrada durante o re-render — e, quando o colaborador tem
 * personalizado 'done', devolve ELE com status 'done'. Quem já está personalizado
 * não percebe o re-render. Só quem está sem personalizado vê "preparando seu
 * vídeo", que é exatamente a verdade naquele momento.
 *
 * CUSTO
 * Um render de deck por célula reconciliada. Por isso há `limite` (default baixo):
 * um cron que enfileirasse 50 células de uma vez viraria conta de GPU sem que
 * ninguém tivesse pedido.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

export interface LacunaPersonalizacao {
  cellVideoId: string;
  empresaId: string;
  cargo: string;
  disc: string;
  /** Pessoas da célula sem personalizado utilizável. */
  faltantes: { colaboradorId: string; nome: string; motivo: 'ausente' | 'error' | 'travado' }[];
}

export interface ResultadoReconciliacao {
  lacunas: LacunaPersonalizacao[];
  pessoasSemVideoNominal: number;
  celulasReenfileiradas: string[];
  ignoradasPorLimite: number;
  executado: boolean;
}

/** Considera travado o que está 'processing'/'pending' há mais de N horas. */
const HORAS_ATE_TRAVADO = 2;

/** Página do PostgREST. É o teto de `db-max-rows` do Supabase, não uma escolha. */
const PAGINA = 1000;

/**
 * 🔴 LER TUDO, EM PÁGINAS — e nunca a primeira página fingindo ser o todo.
 *
 * Medido em 31/08/2026, contra o PostgREST de produção: `videos_personalizados`
 * tinha 1.034 linhas nas células servidas e a leitura sem `.range()` devolveu
 * exatamente **1.000**, sem erro e sem aviso. As 34 invisíveis não vieram como
 * "erro de leitura": vieram como AUSÊNCIA, que `motivoDaLacuna` traduz para
 * `'ausente'`. Ou seja, o truncamento entrava aqui disfarçado de conclusão —
 * "estas pessoas não têm vídeo nominal" — e o custo era pago do outro lado:
 * 3 células de macae com cobertura 100% foram devolvidas à fila em 29/08 e
 * ficaram presas em `render_queued` por 3 dias, trocando o vídeo nominal de 102
 * pessoas por "estamos preparando seu vídeo".
 *
 * A ordem é por `id` (PK) porque `.range()` sobre resultado sem ordem estável
 * pode repetir e pular linhas entre páginas — o mesmo defeito, mais difícil de
 * ver.
 *
 * Atingir o TETO de páginas LANÇA. Devolver o que coube seria voltar ao começo:
 * um resultado parcial com cara de completo.
 */
const MAX_PAGINAS = 100;

async function lerPaginado<T>(rotulo: string, montar: (de: number, ate: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * PAGINA;
    const { data, error } = await montar(de, de + PAGINA - 1);
    // Propaga: sem a lista completa, "nenhuma lacuna" (ou "lacuna") é uma
    // conclusão falsa — o modo de falha que este arquivo existe para combater.
    if (error) throw new Error(`reconciliar: leitura de ${rotulo} falhou (${error.message})`);
    const linhas = (data as T[]) || [];
    out.push(...linhas);
    if (linhas.length < PAGINA) return out;
  }
  throw new Error(`reconciliar: leitura de ${rotulo} passou de ${MAX_PAGINAS * PAGINA} linhas — recusando resultado parcial`);
}

/**
 * Reduz cópias da MESMA célula lógica à que a entrega realmente serve.
 *
 * `videos_gerados` não tem UNIQUE por célula (F-C5) e há cópias reais em produção —
 * 22 medidas em 27/07, uma com 4. `resolverCelulaVideo` lê
 * `.order('created_at', desc).limit(1)`: só a mais recente chega ao colaborador.
 * Sem esta redução, a reconciliação gastaria um render por cópia para curar as
 * MESMAS pessoas, e contaria como "sem vídeo nominal" quem tem o personalizado
 * numa cópia antiga. Medido: 83 pessoas/16 células antes, 25/5 depois.
 */
export function celulasServidas<T extends { modulo_base_id: any; empresa_id: any; cargo: any; disc_dominante: any; created_at: string }>(linhas: T[]): T[] {
  const maisRecente = new Map<string, T>();
  for (const c of linhas || []) {
    const chave = `${c.modulo_base_id}|${c.empresa_id}|${c.cargo}|${c.disc_dominante}`;
    const atual = maisRecente.get(chave);
    if (!atual || new Date(c.created_at).getTime() > new Date(atual.created_at).getTime()) maisRecente.set(chave, c);
  }
  return [...maisRecente.values()];
}

/**
 * Classifica o estado da personalização de UMA pessoa numa célula.
 * `null` = tem vídeo nominal utilizável (nada a fazer).
 */
export function motivoDaLacuna(
  perso: { status: string; created_at: string } | undefined,
  agoraMs = Date.now(),
): 'ausente' | 'error' | 'travado' | null {
  if (!perso) return 'ausente';
  if (perso.status === 'done') return null;
  if (perso.status === 'error') return 'error';
  // 'processing'/'pending' RECENTE é trabalho em andamento — re-enfileirar aqui
  // atropelaria uma personalização que ia terminar sozinha.
  return new Date(perso.created_at).getTime() < agoraMs - HORAS_ATE_TRAVADO * 3600_000 ? 'travado' : null;
}

/**
 * Encontra as lacunas e, com `executar`, devolve as células à fila de render.
 *
 * `limite` é o teto de células re-enfileiradas por execução (custo de GPU).
 * `empresaId` opcional restringe a varredura.
 */
export async function reconciliarPersonalizados(opts: {
  executar?: boolean;
  limite?: number;
  empresaId?: string;
} = {}): Promise<ResultadoReconciliacao> {
  const { executar = false, limite = 3, empresaId } = opts;
  const sb = createSupabaseAdmin();

  // 1) Células prontas e servíveis. Só 'done': célula em render já vai personalizar
  //    ao terminar, e re-enfileirar o que está na fila seria trabalho em dobro.
  const celulasRaw = await lerPaginado<any>('células', (de, ate) => {
    let q = sb.from('videos_gerados')
      .select('id, empresa_id, cargo, disc_dominante, modulo_base_id, created_at')
      .eq('status', 'done')
      .not('bunny_video_id', 'is', null)
      .order('id')
      .range(de, ate);
    if (empresaId) q = q.eq('empresa_id', empresaId);
    return q;
  });
  if (!celulasRaw?.length) {
    return { lacunas: [], pessoasSemVideoNominal: 0, celulasReenfileiradas: [], ignoradasPorLimite: 0, executado: executar };
  }

  const celulas = celulasServidas(celulasRaw as any[]);

  // ⚠️ A leitura que truncou em 29/08/2026 (1.000 de 1.034). Ver `lerPaginado`.
  const persoTodos = await lerPaginado<any>('personalizados', (de, ate) => sb
    .from('videos_personalizados')
    .select('cell_video_id, colaborador_id, status, created_at')
    .in('cell_video_id', celulas.map((c: any) => c.id))
    .order('id')
    .range(de, ate));

  const persoPorCelula = new Map<string, Map<string, { status: string; created_at: string }>>();
  for (const p of (persoTodos as any[] || [])) {
    if (!persoPorCelula.has(p.cell_video_id)) persoPorCelula.set(p.cell_video_id, new Map());
    persoPorCelula.get(p.cell_video_id)!.set(p.colaborador_id, { status: p.status, created_at: p.created_at });
  }

  // 2) Colaboradores de cada célula — mesma regra do worker: cargo exato + 1ª letra
  //    do DISC + nome preenchido (sem nome não há saudação a montar).
  //    Paginado pela MESMA razão: 382 hoje, mas é a lista que decide quem "não
  //    tem vídeo" — truncar aqui inverte o erro (esconderia lacuna real).
  const empresas = [...new Set(celulas.map((c: any) => c.empresa_id).filter(Boolean))];
  const colabs = await lerPaginado<any>('colaboradores', (de, ate) => sb
    .from('colaboradores')
    .select('id, nome_completo, cargo, perfil_dominante, empresa_id')
    .in('empresa_id', empresas)
    .order('id')
    .range(de, ate));

  const agora = Date.now();
  const lacunas: LacunaPersonalizacao[] = [];

  for (const cel of (celulas as any[])) {
    const disc = String(cel.disc_dominante || '').trim().toUpperCase();
    if (!cel.empresa_id || !cel.cargo || !['D', 'I', 'S', 'C'].includes(disc)) continue;

    const daCelula = (colabs as any[] || []).filter((c) =>
      c.empresa_id === cel.empresa_id &&
      c.cargo === cel.cargo &&
      String(c.perfil_dominante || '').trim().charAt(0).toUpperCase() === disc &&
      String(c.nome_completo || '').trim());
    if (!daCelula.length) continue;

    const perso = persoPorCelula.get(cel.id) || new Map();
    const faltantes: LacunaPersonalizacao['faltantes'] = [];
    for (const c of daCelula) {
      const motivo = motivoDaLacuna(perso.get(c.id), agora);
      if (motivo) faltantes.push({ colaboradorId: c.id, nome: c.nome_completo, motivo });
    }

    if (faltantes.length) {
      lacunas.push({ cellVideoId: cel.id, empresaId: cel.empresa_id, cargo: cel.cargo, disc, faltantes });
    }
  }

  // Mais faltantes primeiro: com teto de custo, curar a célula que destrava 4
  // pessoas vale mais que a que destrava 1.
  lacunas.sort((a, b) => b.faltantes.length - a.faltantes.length);
  const pessoasSemVideoNominal = lacunas.reduce((s, l) => s + l.faltantes.length, 0);

  if (!executar) {
    return { lacunas, pessoasSemVideoNominal, celulasReenfileiradas: [], ignoradasPorLimite: Math.max(0, lacunas.length - limite), executado: false };
  }

  // 3) Devolve à fila, respeitando o teto.
  const alvos = lacunas.slice(0, limite);
  const reenfileiradas: string[] = [];
  for (const l of alvos) {
    // Libera os presos ANTES: `personalizeCell` só pula quem está 'done', mas um
    // registro em 'error'/'processing' antigo seria sobrescrito de qualquer forma —
    // apagar deixa o estado limpo e evita ler "processing" de uma tentativa morta.
    const idsPresos = l.faltantes.filter((f) => f.motivo !== 'ausente').map((f) => f.colaboradorId);
    if (idsPresos.length) {
      await sb.from('videos_personalizados').delete()
        .eq('cell_video_id', l.cellVideoId).in('colaborador_id', idsPresos);
    }
    const { error } = await sb.from('videos_gerados')
      .update({ status: 'render_queued', etapa: 'render', claimed_at: null, error: null, updated_at: new Date().toISOString() })
      .eq('id', l.cellVideoId)
      .eq('status', 'done');   // guarda: só sai de 'done' (não atropela render em curso)
    if (error) { console.error(`[reconciliar] falha ao enfileirar ${l.cellVideoId}: ${error.message}`); continue; }
    reenfileiradas.push(l.cellVideoId);
  }

  // 4) Sem worker, a fila fica parada — enfileirar sem provisionar seria trocar
  //    "sem vídeo nominal" por "célula presa em render_queued".
  //
  // 🔴 ISTO ERA UM COMENTÁRIO, NÃO UM COMPORTAMENTO (até 31/08/2026). A chamada
  // existia e o RETORNO era descartado, então "não consegui subir box" chegava
  // aqui idêntico a "subiu": em 29/08 três células saíram de `done` e ficaram
  // em `render_queued` por 3 dias, com 102 pessoas de macae vendo "estamos
  // preparando seu vídeo" no lugar do vídeo com o nome delas — que estava
  // pronto no Bunny o tempo todo. Agora o resultado é LIDO e, sem ninguém para
  // drenar, o enfileiramento é DESFEITO.
  if (reenfileiradas.length) {
    let vivas = 0;
    let motivo = 'exceção antes da resposta';
    try {
      const { ensureRenderWorker } = await import('@/lib/video/ensure-render-worker');
      const r = await ensureRenderWorker();
      vivas = r.alive ?? 0;
      motivo = r.reason || (r.provisioned ? 'provisionou' : 'sem motivo');
      console.log(`[reconciliar] ensureRenderWorker → provisioned=${r.provisioned} alive=${vivas} (${motivo})`);
    } catch (e: any) {
      motivo = e?.message || 'exceção';
      console.error('[reconciliar] ensureRenderWorker falhou:', motivo);
    }

    // `alive === 0` cobre os dois modos em que ninguém drena: config ausente
    // (nem dá para perguntar à Hetzner) e ladder sem capacidade. O caso legítimo
    // de `provisioned: false` — já há box de sobra — chega aqui com `alive > 0`.
    if (!vivas) {
      const { error } = await sb.from('videos_gerados')
        .update({ status: 'done', etapa: 'upload', updated_at: new Date().toISOString() })
        .in('id', reenfileiradas)
        .eq('status', 'render_queued');   // guarda: não desfaz o que um worker já pegou
      console.error(`[reconciliar] sem box de render (${motivo}) — desfazendo ${reenfileiradas.length} enfileiramento(s)${error ? ` FALHOU: ${error.message}` : ''}`);
      // Fallback com rastro (regra do projeto): sem isto, "a reconciliação não
      // aconteceu" seria indistinguível de "não havia lacuna".
      await registrarDegradacao({
        fluxo: 'video',
        tipo: DEGRADACAO.RECONCILIACAO_SEM_WORKER,
        chave: 'reconciliar-videos',
        severidade: 'aviso',
        detalhe: { celulas: reenfileiradas.length, pessoasSemVideoNominal, motivo, rollback: !error },
      }, sb);
      if (!error) {
        return {
          lacunas, pessoasSemVideoNominal,
          celulasReenfileiradas: [],   // nada ficou enfileirado: dizer 3 seria mentir no log do cron
          ignoradasPorLimite: Math.max(0, lacunas.length - alvos.length),
          executado: true,
        };
      }
    }
  }

  return {
    lacunas, pessoasSemVideoNominal,
    celulasReenfileiradas: reenfileiradas,
    ignoradasPorLimite: Math.max(0, lacunas.length - alvos.length),
    executado: true,
  };
}
