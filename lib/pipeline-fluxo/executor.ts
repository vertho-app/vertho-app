/**
 * EXECUTOR do fluxo completo — o controle de fluxo, sem saber nada de Trigger, Supabase ou IA: tudo o que toca o
 * mundo entra por `DepsFluxo`. Isso permite testar a ordem, os pulos, o cancelamento, a continuação e a simulação
 * sem gastar um centavo, e deixa a task do Trigger.dev (`trigger/fluxo-completo.ts`) só com a fiação.
 *
 * Princípios (todos medidos nesta base):
 *  · CADA ETAPA RECALCULA A SUA FILA REAL ao rodar (não confia na prévia): a prévia é estimativa, a fila de produção
 *    é a verdade. Isso também torna a execução IDEMPOTENTE: rodar de novo (ou continuar depois do orçamento de tempo)
 *    só encontra o que ainda falta.
 *  · NÃO REAVALIA O PASSADO: a auditoria cobre só o blueprint gerado nesta rodada; Gestor e RH só entram se a rodada
 *    gerou PDI novo e o escopo é a empresa inteira (nenhum dos dois filtra por turma).
 *  · UMA ETAPA QUE FALHA NÃO DERRUBA A CADEIA: as seguintes recalculam a própria fila e seguem; o resumo diz onde parou.
 *  · O ORÇAMENTO DE TEMPO conta só COMPUTE (auditoria, trilha, Gestor/RH). A espera por lote da Batch API é
 *    checkpointada pelo Trigger e não conta: um lote de horas não estoura a run.
 */
import { ORDEM_ETAPAS, progressoInicial, type EtapaId, type ParamsFluxo, type ProgressoEtapa, type ProgressoFluxo } from './tipos';

export type ResultadoLote = { jobId: string; adotado: boolean } | { erro: string };
/** Uma peça de biblioteca (conteúdo-base) a gerar antes da trilha: descritor × formato num cargo. */
export interface ConteudoItem { competencia: string; descritor: string; cargo: string; formato: 'audio' | 'texto' | 'case' }

/** Um tema do kit com DISC faltando (um `kit_jobs` por item, como o botão da coorte). */
export interface KitItem {
  competencia: string; descritor: string; cargo: string;
  faltantes: string[]; contexto: string; nivelMin: number; nivelMax: number;
  /** Formatos de conteúdo do kit (texto, case, áudio); o áudio é PRÉ-RENDERIZADO (TTS) quando presente. */
  formatos: string[];
  /** Gera também o vídeo da célula (o vídeo está entre os 2 primeiros de alguém da célula). */
  video: boolean;
}
export type ResultadoKit = { jobId: string; adotado: boolean } | { erro: string };
export type EsperaKit = { jobId: string; status: 'done' | 'error' | 'cancelled'; erro?: string; kits?: number };
export type EsperaJob = { status: 'done' | 'error' | 'cancelled'; erro?: string; ok?: number; falhas?: number };

export interface DepsFluxo {
  ler: {
    ia4(): Promise<{ itens: string[]; checkOnly: string[] }>;
    blueprint(): Promise<string[]>;
    /** Entre `alvo`, quem JÁ TEM blueprint e ainda não foi auditado. */
    auditoria(alvo: string[]): Promise<string[]>;
    pdi(): Promise<string[]>;
    trilha(): Promise<string[]>;
    /** Peças de biblioteca que a trilha vai precisar e ainda não existem. */
    conteudo(): Promise<ConteudoItem[]>;
    kit(): Promise<KitItem[]>;
  };
  modelos(): Promise<Record<string, string>>;
  lote(etapa: 'ia4' | 'blueprint' | 'relatorios', args: { itens?: string[]; checkOnly?: string[]; colabIds?: string[]; aiConfig: Record<string, unknown> }): Promise<ResultadoLote>;
  aguardarJob(jobId: string): Promise<EsperaJob>;
  /** Enfileira UM tema do kit (sem vídeo), adotando o job ativo do mesmo tema. */
  kitEnfileirar(item: KitItem): Promise<ResultadoKit>;
  /** Espera todos os jobs juntos, num único laço de sondagem (um `wait.for` por volta, nunca em paralelo). */
  aguardarKits(jobIds: string[]): Promise<EsperaKit[]>;
  auditar(colaboradorId: string): Promise<{ ok: boolean; erro?: string }>;
  /** Gera UMA peça de biblioteca (áudio já com MP3). */
  gerarConteudo(item: ConteudoItem): Promise<{ ok: boolean; erro?: string }>;
  gerarTrilha(colaboradorId: string, aiConfig: Record<string, unknown>): Promise<{ ok: boolean; erro?: string }>;
  relatorioGestor(aiConfig: Record<string, unknown>): Promise<{ ok: boolean; gerados?: number; erros?: number; erro?: string }>;
  relatorioRh(aiConfig: Record<string, unknown>): Promise<{ ok: boolean; erro?: string }>;
  cancelado(): Promise<boolean>;
  gravar(p: ProgressoFluxo): Promise<void>;
  agora(): number;
}

export type ResultadoExecucao = { resultado: 'terminou' | 'continuar' | 'cancelado'; progresso: ProgressoFluxo };

/** Quantos jobs de kit rodam ao mesmo tempo (TTS compartilhado entre podcast e vídeo). */
const KIT_ONDA = 3;

const aiConfigDe = (modelos: Record<string, string>, chave: string, extra: Record<string, unknown> = {}) =>
  (modelos[chave] ? { model: modelos[chave], ...extra } : { ...extra });

/** Pool simples: no máximo `limite` em voo; para de LANÇAR novos quando `parar()` é verdade (os em voo terminam). */
async function pool<T>(itens: T[], limite: number, fn: (i: T) => Promise<void>, parar: () => Promise<boolean> | boolean): Promise<{ restantes: number }> {
  let proximo = 0;
  const trabalhador = async () => {
    for (;;) {
      if (await parar()) return;
      // Checar e tomar o índice SEM `await` no meio: com 2+ workers, checar antes do `await parar()` deixava dois deles passarem no
      // último item e o segundo pegava `itens[itens.length]` (undefined), que virava uma falha fantasma (e uma chamada com item vazio).
      if (proximo >= itens.length) return;
      const i = proximo++;
      await fn(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return { restantes: itens.length - Math.min(proximo, itens.length) };
}

export async function executarFluxo(
  params: ParamsFluxo,
  inicial: ProgressoFluxo | null,
  deps: DepsFluxo,
  opts: { orcamentoMs: number; concorrencia?: number },
): Promise<ResultadoExecucao> {
  const prog: ProgressoFluxo = inicial ? { ...inicial, etapas: inicial.etapas.map((e) => ({ ...e, jobIds: [...e.jobIds] })) } : progressoInicial(!!params.dryRun);
  prog.execucoes = (inicial?.execucoes ?? 0) + 1;
  prog.dryRun = !!params.dryRun;
  const concorrencia = opts.concorrencia ?? 3;
  const dryRun = !!params.dryRun;
  const etapaDe = (id: EtapaId): ProgressoEtapa => prog.etapas.find((e) => e.id === id)!;
  const selecionada = (id: EtapaId) => !params.somente || params.somente.includes(id);
  const empresaInteira = params.permitidos == null;

  let gastoMs = 0;
  const salvar = (atual?: string) => { if (atual !== undefined) prog.atual = atual; return deps.gravar(prog); };
  const semOrcamento = (t0: number) => gastoMs + (deps.agora() - t0) > opts.orcamentoMs;

  prog.modelos = await deps.modelos();
  await salvar('começando');

  for (const id of ORDEM_ETAPAS) {
    const e = etapaDe(id);
    if (!selecionada(id)) { if (e.estado === 'aguardando') { e.estado = 'pulado'; e.detalhe = 'fora da seleção desta rodada'; } continue; }
    // Etapa que já terminou numa execução anterior NÃO repete (idempotência da continuação). `parcial` conta como
    // terminada: repetir a cada continuação re-enfileiraria as mesmas falhas e pagaria de novo. Só `aguardando` e a
    // `rodando` que ficou no meio (orçamento de tempo) entram.
    if (e.estado !== 'aguardando' && e.estado !== 'rodando') continue;
    if (await deps.cancelado()) return { resultado: 'cancelado', progresso: prog };

    e.estado = 'rodando';
    await salvar(`${e.titulo}: lendo a fila`);

    // ─── etapas em LOTE (Batch API): enfileira, espera, conta ───────────────────────────────────────────
    if (id === 'ia4' || id === 'blueprint' || id === 'pdi') {
      const fila = id === 'ia4' ? await deps.ler.ia4() : null;
      const colabIds = id === 'blueprint' ? await deps.ler.blueprint() : id === 'pdi' ? await deps.ler.pdi() : [];
      let total = id === 'ia4' ? fila!.itens.length + fila!.checkOnly.length : colabIds.length;
      if (total === 0) { e.estado = 'pulado'; e.detalhe = 'nada pendente'; await salvar(); continue; }
      e.total += total;
      if (dryRun) { e.estado = 'pulado'; e.detalhe = `simulação: ${total} ${id === 'ia4' ? 'resposta(s)' : 'pessoa(s)'} na fila`; await salvar(); continue; }

      const aiConfig = id === 'ia4'
        ? aiConfigDe(prog.modelos!, 'ia4_avaliacao', prog.modelos!.ia4_check ? { checkModel: prog.modelos!.ia4_check } : {})
        : aiConfigDe(prog.modelos!, id === 'blueprint' ? 'blueprint_gerar' : 'pdi_individual');
      // O lote da IA4 conta avaliação E check como itens (`progress.resultados`): o total da etapa passa para a MESMA
      // unidade, senão a tela mostrava "2/1" (medido na 1ª execução real, 02/10). Só vale fora da simulação, que
      // continua contando respostas.
      if (id === 'ia4' && (aiConfig as any).checkModel) { const unidadesLote = fila!.itens.length * 2 + fila!.checkOnly.length; e.total += unidadesLote - total; total = unidadesLote; }
      const enf = await deps.lote(id === 'pdi' ? 'relatorios' : id, id === 'ia4'
        ? { itens: fila!.itens, checkOnly: fila!.checkOnly, aiConfig }
        : { colabIds, aiConfig });
      if ('erro' in enf) { e.estado = 'erro'; e.falhas += total; e.detalhe = enf.erro; await salvar(); continue; }
      if (!e.jobIds.includes(enf.jobId)) e.jobIds.push(enf.jobId);
      if (id === 'blueprint') prog.blueprintAlvo = [...new Set([...(prog.blueprintAlvo || []), ...colabIds])];
      await salvar(`${e.titulo}: ${enf.adotado ? 'aguardando o lote que já estava rodando' : 'lote enviado'}, aguardando`);

      const fim = await deps.aguardarJob(enf.jobId);
      if (fim.status === 'cancelled') { e.estado = 'erro'; e.detalhe = 'lote cancelado'; await salvar(); return { resultado: 'cancelado', progresso: prog }; }
      if (fim.status === 'error') { e.estado = 'erro'; e.falhas += total; e.detalhe = fim.erro || 'o lote terminou com erro'; await salvar(); continue; }
      const ok = fim.ok ?? total; const falhas = fim.falhas ?? Math.max(0, total - ok);
      e.feitos += ok; e.falhas += falhas;
      e.estado = falhas === 0 ? 'ok' : ok === 0 ? 'erro' : 'parcial';
      if (falhas) e.detalhe = `${falhas} item(ns) com erro no lote`;
      await salvar();
      continue;
    }

    // ─── auditoria, conteúdos e trilha: COMPUTE por item, em pool, com orçamento de tempo ──────────────
    if (id === 'auditoria' || id === 'trilha' || id === 'conteudo') {
      const fila: any[] = id === 'auditoria' ? await deps.ler.auditoria(prog.blueprintAlvo || []) : id === 'trilha' ? await deps.ler.trilha() : await deps.ler.conteudo();
      if (fila.length === 0) { e.estado = e.total > 0 ? 'ok' : 'pulado'; if (e.estado === 'pulado') e.detalhe = id === 'auditoria' ? 'nenhum blueprint novo para auditar' : id === 'conteudo' ? 'biblioteca já completa' : 'nada pendente'; await salvar(); continue; }
      if (dryRun) { e.total += fila.length; e.estado = 'pulado'; e.detalhe = `simulação: ${fila.length} ${id === 'conteudo' ? 'peça(s) de biblioteca' : 'pessoa(s)'} na fila`; await salvar(); continue; }
      // Total = o que já foi tratado nas execuções anteriores + o que ainda está na fila agora.
      e.total = e.feitos + e.falhas + fila.length;

      const t0 = deps.agora();
      const aiConfig = id === 'trilha' ? aiConfigDe(prog.modelos!, 'temporada_desafio') : {};
      let cancelou = false;
      // Conteúdos em concorrência BAIXA: o áudio leva TTS e o TTS do Vertex é compartilhado com o vídeo (F-V4).
      const { restantes } = await pool(fila, id === 'conteudo' ? Math.min(concorrencia, 2) : concorrencia, async (colab) => {
        let r: { ok: boolean; erro?: string };
        try { r = id === 'auditoria' ? await deps.auditar(colab) : id === 'conteudo' ? await deps.gerarConteudo(colab) : await deps.gerarTrilha(colab, aiConfig); }
        catch (err: any) { r = { ok: false, erro: String(err?.message || err).slice(0, 160) }; }
        if (r.ok) e.feitos++; else { e.falhas++; e.detalhe = r.erro || e.detalhe; }
        await salvar(`${e.titulo}: ${e.feitos + e.falhas}/${e.total}`);
      }, async () => {
        if (await deps.cancelado()) { cancelou = true; return true; }
        return semOrcamento(t0);
      });
      gastoMs += deps.agora() - t0;
      if (cancelou) return { resultado: 'cancelado', progresso: prog };
      if (restantes > 0) {
        // Acabou o orçamento de tempo desta execução: a etapa continua na PRÓXIMA (a fila é recalculada lá).
        e.estado = 'rodando'; await salvar(`${e.titulo}: continua na próxima execução (${restantes} restante(s))`);
        return { resultado: 'continuar', progresso: prog };
      }
      e.estado = e.falhas === 0 ? 'ok' : e.feitos === 0 ? 'erro' : 'parcial';
      await salvar();
      continue;
    }

    // ─── Kit semanal: lê o plano das trilhas (por isso vem DEPOIS da trilha), um job por tema, sem vídeo ──────
    if (id === 'kit') {
      const itens = await deps.ler.kit();
      const totalKits = itens.reduce((n, i) => n + i.faltantes.length, 0);
      if (totalKits === 0) { e.estado = 'pulado'; e.detalhe = 'nenhum kit faltando'; await salvar(); continue; }
      e.total += totalKits;
      if (dryRun) { e.estado = 'pulado'; e.detalhe = `simulação: ${totalKits} kit(s) (tema × DISC) em ${itens.length} tema(s)`; await salvar(); continue; }

      // Em ONDAS: com áudio e vídeo no kit, todos os jobs de uma vez disputariam o mesmo TTS (o do podcast e o das
      // narrações de vídeo são o mesmo fornecedor: auto-saturação medida em 12/08, F-V4 do FMEA).
      let ok = 0; let falhas = 0;
      for (let ini = 0; ini < itens.length; ini += KIT_ONDA) {
        if (ini > 0 && await deps.cancelado()) { e.feitos += ok; e.falhas += falhas; await salvar(); return { resultado: 'cancelado', progresso: prog }; }
        const onda = itens.slice(ini, ini + KIT_ONDA);
        const jobs = new Map<string, number>();
        for (const item of onda) {
          const enf = await deps.kitEnfileirar(item);
          if ('erro' in enf) { falhas += item.faltantes.length; e.detalhe = enf.erro; continue; }
          jobs.set(enf.jobId, item.faltantes.length);
          if (!e.jobIds.includes(enf.jobId)) e.jobIds.push(enf.jobId);
        }
        await salvar(`${e.titulo}: ${Math.min(ini + KIT_ONDA, itens.length)}/${itens.length} tema(s) enviados, aguardando`);
        if (jobs.size === 0) continue;
        const fins = await deps.aguardarKits([...jobs.keys()]);
        if (fins.some((f) => f.status === 'cancelled')) { e.estado = 'erro'; e.detalhe = 'job de kit cancelado'; e.feitos += ok; e.falhas += falhas; await salvar(); return { resultado: 'cancelado', progresso: prog }; }
        for (const f of fins) {
          const esperados = jobs.get(f.jobId) ?? 0;
          // `done` sem contagem de kits publicados não vale `ok`: o job fechar não prova que o kit existe.
          const feitos = f.status === 'done' ? Math.min(esperados, f.kits ?? 0) : 0;
          ok += feitos; falhas += esperados - feitos;
          if (f.status === 'error' && f.erro) e.detalhe = f.erro;
        }
      }
      e.feitos += ok; e.falhas += falhas;
      e.estado = falhas === 0 ? 'ok' : ok === 0 ? 'erro' : 'parcial';
      if (falhas && !e.detalhe) e.detalhe = `${falhas} kit(s) não gerados`;
      await salvar();
      continue;
    }

    // ─── Gestor e RH: ao FINAL, só com escopo = empresa inteira e PDI novo nesta rodada ─────────────────
    if (id === 'gestor' || id === 'rh') {
      // Em simulação nada foi gerado, então "PDI novo" é o que a etapa do PDI TERIA gerado (total na fila).
      const pdiNovo = etapaDe('pdi').feitos > 0 || (dryRun && etapaDe('pdi').total > 0);
      if (!empresaInteira) { e.estado = 'pulado'; e.detalhe = 'não filtra por turma: gere manualmente se quiser'; await salvar(); continue; }
      if (!pdiNovo) { e.estado = 'pulado'; e.detalhe = 'nenhum PDI novo nesta rodada'; await salvar(); continue; }
      if (dryRun) { e.estado = 'pulado'; e.detalhe = 'simulação: seria gerado ao final'; await salvar(); continue; }
      // Sem orçamento de tempo sobrando nesta execução: Gestor/RH rodam na próxima (a etapa fica `rodando`).
      if (gastoMs > opts.orcamentoMs) { await salvar(`${e.titulo}: continua na próxima execução`); return { resultado: 'continuar', progresso: prog }; }
      const t0 = deps.agora();
      e.total = 1;
      const aiConfig = aiConfigDe(prog.modelos!, id === 'gestor' ? 'relatorio_gestor' : 'relatorio_rh');
      let r: { ok: boolean; erro?: string; gerados?: number; erros?: number };
      try { r = id === 'gestor' ? await deps.relatorioGestor(aiConfig) : await deps.relatorioRh(aiConfig); }
      catch (err: any) { r = { ok: false, erro: String(err?.message || err).slice(0, 160) }; }
      gastoMs += deps.agora() - t0;
      if (r.ok) { e.feitos = (r as any).gerados ?? 1; e.estado = (r as any).erros ? 'parcial' : 'ok'; if ((r as any).erros) { e.falhas = (r as any).erros; e.detalhe = `${(r as any).erros} gestor(es) com erro`; } }
      else { e.estado = 'erro'; e.falhas = 1; e.detalhe = r.erro; }
      await salvar();
      continue;
    }
  }

  const partes = prog.etapas.filter((e) => e.estado !== 'pulado' || e.detalhe?.startsWith('simulação'))
    .map((e) => `${e.titulo}: ${e.estado === 'pulado' ? (e.detalhe || 'pulado') : `${e.feitos} ok${e.falhas ? ` · ${e.falhas} falha(s)` : ''}`}`);
  prog.resumo = partes.join(' | ') || 'nada a fazer';
  await salvar('concluído');
  return { resultado: 'terminou', progresso: prog };
}
