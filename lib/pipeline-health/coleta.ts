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
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { formatosEntregaveis, escolherFormatoAnunciado } from '@/lib/season-engine/formato-anunciado';
import { normalizePhone } from '@/lib/phone';
import { levantarPlanoKitsCoorte, SEM_TURMA } from '@/lib/season-engine/kit/plano-coorte';
import { TURMA_ENCERRADAS, TURMA_MEMBRO } from '@/lib/status';
import type { EntregaPrevista, EnvioObservado, LacunaKitHorizonte, MbForaDaRegua, DegradacaoRegistro, CelulaVideoSemDeck, PushDiario } from './regras';

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
  /** Deck de vídeo por (core × cargo × DISC) — dezenas de pessoas compartilham a célula. */
  const cacheDeck = new Map<string, boolean>();
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
      // Mesmo flag do caminho real: sem isto o health mediria a semana com dois
      // desafios enquanto o colaborador recebe um — o gêmeo que não roda
      // passando verde (a classe de 29/07).
      desafioUnicoPorCompetencia: getProgramaConfigDaTrilha(t as any).desafioUnicoPorCompetencia,
    });

    const itens = Array.isArray(copia.conteudos_dia) && copia.conteudos_dia.length
      ? copia.conteudos_dia : [{ conteudo: copia.conteudo, descritor: copia.descritor }];
    const item = itens[pilulaAlvo - 1];
    if (!item) continue; // semana single num dia de P2: nada sai, nada a checar
    const cont = item.conteudo || {};

    // Formatos REALMENTE entregáveis — mesma função que o ENVIO usa para decidir
    // o que prometer. Enquanto eram duas implementações, o health media certo e a
    // mensagem prometia errado (35 de 38 em 17/08/2026).
    const formatos = await formatosEntregaveis(sb, {
      empresaId, conteudo: cont, cargo: c.cargo, disc: c.perfil_dominante, cacheDeck,
    });

    const tel = c.whatsapp || c.telefone;
    entregas.push({
      colaboradorId: c.id,
      nome: c.nome_completo || '(sem nome)',
      cargo: c.cargo, disc: c.perfil_dominante,
      semana, pilula: pilulaAlvo,
      descritor: item.descritor ?? null,
      temKit: !!cont.kit_id,
      /*
       * O que a mensagem VAI prometer — a mesma expressão do envio
       * (`trigger-diario-empresa.ts`), fallback incluído.
       *
       * ⚠️ Espelhar o envio é o ponto: enquanto aqui rodava
       * `derivarPrioridadeFormatos[0]` e lá também, a regra pegava o defeito;
       * agora que o envio cruza a preferência com o estoque, repetir a fórmula
       * antiga faria a R1 acusar um problema que não existe mais — e alarme que
       * grita sem motivo é o que ensina a ignorá-lo.
       *
       * A regra continua PODENDO falhar: com `entregaveis` vazio, o envio cai no
       * preferido e a promessa volta a ser falsa. É esse caso que sobra.
       */
      formatoAnunciado: escolherFormatoAnunciado(c, formatos) ?? derivarPrioridadeFormatos(c)[0],
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
// `temDeckPronto` mudou para `lib/season-engine/formato-anunciado.ts`: o ENVIO
// precisa da mesma régua para não prometer um formato que a semana não tem, e
// duas cópias divergiriam na primeira correção.

/**
 * Transforma o plano da coorte nas lacunas do horizonte. PURA e exportada porque a
 * contagem é a parte fácil de errar — errei duas vezes antes de acertar (medido 27/07,
 * Ibipeba, conferido contra um medidor independente que deu 41 temas):
 *  · agregar o tema e rotular com a semana mais próxima → urgente inflado (68 vs 42);
 *  · emitir por (tema × semana) sem dedup → esforço inflado (97), porque o mesmo tema
 *    reaparece nas semanas seguintes e o kit é produzido UMA vez para todas.
 *
 * A unidade de esforço é **(tema × DISC)**, contada na PRIMEIRA semana que a demanda —
 * é ela que define o prazo.
 */
export function montarLacunas(
  plano: Array<{
    competencia: string; descritor: string; cargo: string;
    faltantes: string[]; pessoas: number;
    discsPorSemana: Array<{ semana: number; discs: string[] }>;
  }>,
  diasAteSemana: (semana: number) => number,
): LacunaKitHorizonte[] {
  const porTemaSemana = new Map<string, LacunaKitHorizonte>();
  for (const p of plano) {
    if (!p.faltantes.length) continue;
    const faltaNoTema = new Set(p.faltantes);
    const jaAtribuido = new Set<string>();
    for (const { semana, discs } of [...p.discsPorSemana].sort((a, b) => a.semana - b.semana)) {
      const novos = discs.filter((d) => faltaNoTema.has(d) && !jaAtribuido.has(d));
      if (!novos.length) continue;
      novos.forEach((d) => jaAtribuido.add(d));
      const chave = `${p.competencia}|${p.descritor}|${p.cargo}|${semana}`;
      const atual = porTemaSemana.get(chave);
      if (atual) atual.faltantes.push(...novos);
      else {
        porTemaSemana.set(chave, {
          competencia: p.competencia, descritor: p.descritor, cargo: p.cargo,
          faltantes: [...novos], pessoas: p.pessoas, semana, diasAte: diasAteSemana(semana),
        });
      }
    }
  }
  return [...porTemaSemana.values()];
}

/**
 * HORIZONTE: o que as próximas semanas vão demandar e ainda não existe.
 *
 * Reusa `levantarPlanoKitsCoorte` — o MESMO código que a tela de coorte usa para
 * decidir o que gerar. A regra de ouro desta camada vale aqui também: reimplementar a
 * varredura produziria um alarme que concorda consigo mesmo e diverge do que a
 * geração faria.
 *
 * A janela começa na semana SEGUINTE à mais adiantada da coorte: a semana corrente é
 * problema do pré-voo, e alarmar sobre ela aqui duplicaria o achado.
 */
export async function coletarHorizonteKits(
  sb: any,
  empresaId: string,
  semanasAdiante: number,
  hoje: Date = new Date(),
): Promise<LacunaKitHorizonte[]> {
  // ── UMA VARREDURA POR TURMA (mig 210) ────────────────────────────────────
  //
  // Antes isto rodava uma vez por EMPRESA, e com duas safras o alarme quebrava
  // de duas formas ao mesmo tempo:
  //
  //  1. A JANELA vinha do máximo global (`semana_atual`). Com diretores na
  //     semana 5 e professores na 1, a janela virava [6, 6+N] — e as semanas
  //     2, 3 e 4 dos professores, que são justamente as que vão faltar kit,
  //     NUNCA entravam. A turma nova ficava invisível.
  //  2. A DATA vinha do mínimo global (`inicioMaisCedo`). A demanda da turma
  //     nova era datada pela âncora da antiga, então "semana 3" parecia ter
  //     aberto há semanas — urgente por engano, ou o contrário.
  //
  // O casamento dos dois é pior que cada um: janela de uma turma, régua de
  // outra. Agora cada recorte traz a sua janela e a sua âncora.
  const recortes = await recortesDeHorizonte(sb, empresaId);
  const todas: LacunaKitHorizonte[] = [];

  for (const recorte of recortes) {
    if (!recorte.semanaCorrente) continue;   // ninguém ativo neste recorte
    const de = recorte.semanaCorrente + 1;
    const ate = recorte.semanaCorrente + semanasAdiante;
    const base = await levantarPlanoKitsCoorte(sb, empresaId, {
      semanaMin: de, semanaMax: ate, turmaId: recorte.turmaId,
    });
    if ('error' in base) continue;

    // Data de abertura de uma semana = início mais cedo DESTE recorte + (N-1)×7d.
    // Sem `data_inicio` não dá para datar: cai em 0 dias, que classifica como
    // urgente — preferir o alarme falso ao silêncio, porque o silêncio aqui é
    // indistinguível de "está tudo pronto" (foi assim que a semana 5 passou).
    const inicio = base.inicioMaisCedo ? new Date(`${base.inicioMaisCedo}T00:00:00Z`) : null;
    const diasAteSemana = (n: number): number => {
      if (!inicio) return 0;
      const abre = new Date(inicio.getTime() + (n - 1) * 7 * 86400_000);
      return Math.round((abre.getTime() - hoje.getTime()) / 86400_000);
    };

    for (const lacuna of montarLacunas(base.plano, diasAteSemana)) {
      todas.push({ ...lacuna, turma: recorte.rotulo });
    }
  }

  return todas;
}

/**
 * Os recortes que o horizonte precisa varrer, cada um com a SUA semana corrente.
 *
 * Empresa sem turma nenhuma → um recorte só (`turmaId: null`), idêntico ao que
 * existia. Com turmas → uma por turma ativa, mais um bucket para quem tem envio
 * ativo e nenhuma participação: essa gente não pode sumir do alarme só porque
 * ficou fora da classificação.
 */
async function recortesDeHorizonte(
  sb: any,
  empresaId: string,
): Promise<Array<{ turmaId: string | null; rotulo: string | null; semanaCorrente: number | null }>> {
  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, semana_atual').eq('empresa_id', empresaId).eq('status', 'ativo');
  if (!envios?.length) return [];

  const semanaDe = (linhas: any[]) =>
    linhas.length ? Math.max(1, ...linhas.map((e: any) => Number(e.semana_atual) || 1)) : null;

  const { data: turmas } = await sb.from('turmas')
    .select('id, nome, status').eq('empresa_id', empresaId);
  const ativas = (turmas || []).filter((t: any) => !TURMA_ENCERRADAS.includes(t.status));
  if (!ativas.length) {
    return [{ turmaId: null, rotulo: null, semanaCorrente: semanaDe(envios as any[]) }];
  }

  const { data: membros } = await sb.from('turma_membros')
    .select('colaborador_id, turma_id').eq('empresa_id', empresaId).eq('status', TURMA_MEMBRO.ATIVO);
  // ⚠️ Só participação em turma ATIVA conta como "tem turma". Arquivar a turma
  // não encerra os envios das pessoas: se elas continuassem contando como
  // classificadas, sumiriam do alarme sem nenhum recorte cobri-las — um jeito
  // silencioso de a turma inteira ficar sem kit. (O teste da turma arquivada
  // pegou isto; a primeira versão mapeava qualquer participação ativa.)
  const idsAtivas = new Set(ativas.map((t: any) => t.id));
  const turmaDe = new Map<string, string>(
    (membros || [])
      .filter((m: any) => idsAtivas.has(m.turma_id))
      .map((m: any) => [m.colaborador_id, m.turma_id]),
  );

  const recortes = ativas.map((t: any) => ({
    turmaId: t.id as string,
    rotulo: t.nome as string,
    semanaCorrente: semanaDe((envios as any[]).filter((e) => turmaDe.get(e.colaborador_id) === t.id)),
  }));

  const orfaos = (envios as any[]).filter((e) => !turmaDe.has(e.colaborador_id));
  if (orfaos.length) {
    recortes.push({ turmaId: SEM_TURMA, rotulo: 'sem turma', semanaCorrente: semanaDe(orfaos) });
  }
  return recortes;
}

/**
 * MBs publicados cujo `descritor` não bate com nenhum `nome_curto` da régua daquela
 * competência × cargo (R9). Comparação normalizada (sem acento/caixa) e pelo MESMO
 * critério do resolver: nome do descritor, não título.
 */
export async function coletarMbForaDaRegua(sb: any): Promise<MbForaDaRegua[]> {
  const { data: mbs, error: errMb } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, competencia_id')
    .eq('status', 'publicado').not('descritor', 'is', null).not('competencia_id', 'is', null);
  // Propaga: contagem 0 por falha de query é indistinguível de "está tudo certo".
  if (errMb) throw new Error(`modulos_base_conteudo: ${errMb.message}`);
  if (!mbs?.length) return [];

  const { data: comps, error: errC } = await sb.from('competencias')
    .select('id, nome, cargo, cod_comp, nome_curto');
  if (errC) throw new Error(`competencias: ${errC.message}`);

  const norm = (s: any) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  // (cod_comp|cargo) → conjunto de nome_curto normalizados da régua.
  const regua = new Map<string, Set<string>>();
  const daLinha = new Map<string, any>();
  for (const c of (comps as any[]) || []) {
    daLinha.set(c.id, c);
    if (!c.nome_curto) continue;
    const k = `${c.cod_comp}|${norm(c.cargo)}`;
    if (!regua.has(k)) regua.set(k, new Set());
    regua.get(k)!.add(norm(c.nome_curto));
  }

  const fora: MbForaDaRegua[] = [];
  for (const mb of (mbs as any[])) {
    const linha = daLinha.get(mb.competencia_id);
    if (!linha) continue;                       // competência de outro modelo: fora do escopo
    const nomes = regua.get(`${linha.cod_comp}|${norm(linha.cargo)}`);
    if (!nomes || !nomes.size) continue;        // régua sem nome_curto: nada a cobrar
    if (!nomes.has(norm(mb.descritor))) {
      fora.push({ id: mb.id, competencia: linha.nome, cargo: linha.cargo, descritor: mb.descritor });
    }
  }
  return fora;
}

/**
 * Degradações tocadas nas últimas 24h (R10). `ocorrencias` conta só o dia UTC
 * corrente (registrarDegradacao reseta ao virar o dia), então o volume lido
 * aqui é próximo do real das 24h — antes do reset, o acumulado histórico da
 * chave transformava operação normal em alerta crítico crônico.
 */
export async function coletarDegradacoes(sb: any): Promise<DegradacaoRegistro[]> {
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await sb.from('degradacao_log')
    .select('fluxo, tipo, severidade, ocorrencias')
    .gte('ultima_em', desde);
  // Propaga: 0 por falha de query é indistinguível de "nenhuma degradação".
  if (error) throw new Error(`degradacao_log: ${error.message}`);
  return (data as DegradacaoRegistro[]) || [];
}

/**
 * Entregas de PUSH das últimas 24h (`notification_deliveries`, mig 198).
 *
 * Por que no modo ESTRUTURAL e não no pós-voo: o `triggerDiario` virou um
 * DISPATCHER (enfileira uma task QStash por empresa e retorna), e o pós-voo roda
 * no mesmo request — logo após o ENFILEIRAMENTO, não após os envios. Ler carimbo
 * naquele instante é ler antes de a coisa acontecer. O estrutural roda de
 * madrugada sobre 24h, que é a janela em que a resposta já existe.
 *
 * Lê a tabela de entregas, não os carimbos, e por isso enxerga o que o carimbo
 * não conta: FALHAS (o carimbo só registra sucesso) e entregas PRESAS em
 * `tentativa` — linha gravada antes do envio cujo desfecho nunca chegou, ou
 * seja, o processo morreu no meio. Hoje isso é invisível em qualquer tela.
 */
export async function coletarPushDiario(sb: any): Promise<PushDiario> {
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await sb.from('notification_deliveries')
    .select('status, sent_at')
    .eq('channel', 'webpush')
    .gte('sent_at', desde);
  // Propaga: 0 por falha de query é indistinguível de "nenhum push", que é
  // exatamente a confusão que esta regra existe para desfazer.
  if (error) throw new Error(`notification_deliveries: ${error.message}`);

  const linhas = (data as any[]) || [];
  // Uma hora de folga: `tentativa` recém-gravada é normal (o envio está em
  // curso). O que denuncia é a que envelheceu sem desfecho.
  const limite = Date.now() - 3600_000;
  return {
    total: linhas.length,
    sucesso: linhas.filter((l) => l.status === 'sucesso').length,
    falha: linhas.filter((l) => l.status === 'falha').length,
    presos: linhas.filter((l) => l.status === 'tentativa' && new Date(l.sent_at).getTime() < limite).length,
  };
}

/**
 * Células de vídeo que falharam e seguem SEM deck assistível (R16 / F-V3).
 *
 * Agrupa por (módulo × empresa × cargo × DISC) — a mesma chave da UNIQUE parcial e do
 * resolver da entrega — e só reporta quem tem `error` e ZERO `done` com Bunny. Célula que
 * falhou e foi recuperada depois não vira achado (medido 28/07: 33 de 35 estavam nesse
 * caso; contar `error` cru viraria ruído permanente).
 */
export async function coletarCelulasVideoSemDeck(sb: any): Promise<CelulaVideoSemDeck[]> {
  const { data, error } = await sb.from('videos_gerados')
    .select('modulo_base_id, empresa_id, cargo, disc_dominante, status, bunny_video_id, error, updated_at');
  if (error) throw new Error(`videos_gerados: ${error.message}`);

  const { data: emps } = await sb.from('empresas').select('id, slug');
  const slugDe = Object.fromEntries((emps || []).map((e: any) => [e.id, e.slug]));

  type Acc = { dones: number; erros: number; ultimoErro: string | null; quando: string; cargo: string | null; disc: string | null; empresaId: string | null; moduloBaseId: string | null };
  const porCelula = new Map<string, Acc>();
  for (const v of (data as any[]) || []) {
    const k = `${v.modulo_base_id}|${v.empresa_id}|${v.cargo}|${v.disc_dominante}`;
    const a = porCelula.get(k) || { dones: 0, erros: 0, ultimoErro: null, quando: '', cargo: v.cargo, disc: v.disc_dominante, empresaId: v.empresa_id, moduloBaseId: v.modulo_base_id ?? null };
    if (v.status === 'done' && v.bunny_video_id) a.dones++;
    if (v.status === 'error') {
      a.erros++;
      // Guarda o erro MAIS RECENTE — é o que explica o estado atual da célula.
      if (String(v.updated_at || '') >= a.quando) { a.ultimoErro = v.error || null; a.quando = String(v.updated_at || ''); }
    }
    porCelula.set(k, a);
  }

  const candidatas = [...porCelula.values()].filter((a) => a.erros > 0 && a.dones === 0);

  // ALCANÇABILIDADE (03/09/2026): a entrega chega na célula pelo `modulo_base_id` do
  // CORE da semana. Sem core apontando para o módulo, re-disparar produz vídeo que
  // ninguém vê — e era isso que a ação da R16 recomendava. Uma query para todas as
  // candidatas; a contagem separa "recuperável" de "órfã" em `checarCelulaVideoEmError`.
  const modulos = [...new Set(candidatas.map((a) => a.moduloBaseId).filter(Boolean))] as string[];
  const coresPorModulo = new Map<string, number>();
  if (modulos.length) {
    const { data: cores, error: errCores } = await sb.from('micro_conteudos')
      .select('modulo_base_id').in('modulo_base_id', modulos);
    // LANÇA: com a leitura falhando, TODA célula pareceria órfã e a regra recomendaria
    // "não gaste render" para casos recuperáveis. Errar calado para o lado da inação é
    // tão ruim quanto para o do gasto — e aqui seria indistinguível de um resultado real.
    if (errCores) throw new Error(`micro_conteudos (alcançabilidade da célula): ${errCores.message}`);
    for (const c of (cores as any[]) || []) {
      const id = c.modulo_base_id;
      if (id) coresPorModulo.set(id, (coresPorModulo.get(id) || 0) + 1);
    }
  }

  return candidatas.map((a) => ({
    empresaSlug: a.empresaId ? (slugDe[a.empresaId] || null) : null,
    cargo: a.cargo, disc: a.disc, erros: a.erros, ultimoErro: a.ultimoErro,
    coresAncorados: a.moduloBaseId ? (coresPorModulo.get(a.moduloBaseId) || 0) : 0,
  }));
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
  const colP = pilula === 1 ? 'ultima_pilula1_push_em' : 'ultima_pilula2_push_em';
  const { data } = await sb.from('fase4_envios')
    .select(`colaborador_id, semana_atual, ${colW}, ${colE}, ${colP}, colaboradores!inner(nome_completo, email, telefone, whatsapp)`)
    .eq('empresa_id', empresaId).eq('status', 'ativo');

  // Quem tem push ativo. Uma query, mesmo padrão do cron — e o health precisa
  // saber a APLICABILIDADE do canal, não só o carimbo: sem isso, todo mundo
  // apareceria como "elegível a push e não recebeu", virando alarme crônico.
  const comPush = new Set<string>();
  const { data: eps, error: errEps } = await sb.from('notification_endpoints')
    .select('colaborador_id').eq('empresa_id', empresaId).eq('enabled', true);
  if (errEps) console.warn('[health] endpoints de push:', errEps.message);
  else for (const e of (eps as any[]) || []) comPush.add(e.colaborador_id);

  // Quem NÃO devia receber hoje: semana de 'aplicacao'/'avaliacao' (sem pílula nova)
  // ou semana single num dia de P2 — o cron (triggerDiario) pula os dois casos. O
  // preflight já filtra assim; sem o mesmo filtro aqui, a segunda da semana 4 da
  // Ibipeba reportou "36 elegíveis, 0 WhatsApp/e-mail" quando o correto era 0
  // elegíveis — falso crítico medido em 03/08/2026.
  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, temporada_plano, numero_temporada').eq('empresa_id', empresaId);
  const ultima = new Map<string, any>();
  for (const t of (trilhas as any[] || [])) {
    const p = ultima.get(t.colaborador_id);
    if (!p || Number(t.numero_temporada) > Number(p.numero_temporada)) ultima.set(t.colaborador_id, t);
  }
  const deviaReceber = (r: any): boolean => {
    const plano = (ultima.get(r.colaborador_id)?.temporada_plano || []) as any[];
    const semana = Number(r.semana_atual) || 1;
    const plan = plano.find((s: any) => Number(s.semana) === semana) || plano[semana - 1] || null;
    if (!plan || plan.tipo !== 'conteudo') return false;
    const itens = Array.isArray(plan.conteudos_dia) && plan.conteudos_dia.length
      ? plan.conteudos_dia : (plan.conteudo ? [plan.conteudo] : []);
    return !!itens[pilula - 1];
  };

  const doDia = (ts: any) => (ts && String(new Date(ts).toISOString().slice(0, 10)) === dia ? String(ts) : null);
  return ((data as any[]) || []).filter(deviaReceber).map((r) => {
    const c = r.colaboradores;
    const tel = c.whatsapp || c.telefone;
    return {
      colaboradorId: r.colaborador_id,
      nome: c.nome_completo || '(sem nome)',
      temTelefone: !!tel && !!normalizePhone(tel),
      temEmail: !!c.email,
      temPush: comPush.has(r.colaborador_id),
      carimboWhatsapp: doDia(r[colW]),
      carimboEmail: doDia(r[colE]),
      carimboPush: doDia(r[colP]),
    };
  });
}
