import { describe, it, expect } from 'vitest';
import { executarFluxo, type DepsFluxo, type KitItem, type ConteudoItem } from '@/lib/pipeline-fluxo/executor';
import { progressoInicial, ORDEM_ETAPAS, type ParamsFluxo, type EtapaId } from '@/lib/pipeline-fluxo/tipos';

/**
 * O executor é o controle de fluxo do botão "fluxo completo". Estes testes usam dependências falsas que REGISTRAM
 * cada chamada, então provam o que o fluxo FAZ (e, principalmente, o que NÃO faz) sem Trigger, banco ou IA.
 */
type Filas = { ia4?: { itens: string[]; checkOnly?: string[] }; blueprint?: string[]; auditoria?: string[]; pdi?: string[]; trilha?: string[]; kit?: KitItem[]; conteudo?: ConteudoItem[] };

function montar(filas: Filas = {}, extra: Partial<DepsFluxo> = {}) {
  const chamadas: string[] = [];
  const lotes: Array<{ etapa: string; args: any }> = [];
  let relogio = 0;
  let cancelar = false;
  const auditados: string[] = [];
  const trilhas: string[] = [];
  const gravados: any[] = [];
  const kitsEnfileirados: KitItem[] = [];
  const conteudosGerados: ConteudoItem[] = [];
  const deps: DepsFluxo = {
    ler: {
      ia4: async () => { chamadas.push('ler.ia4'); return { itens: filas.ia4?.itens ?? [], checkOnly: filas.ia4?.checkOnly ?? [] }; },
      blueprint: async () => { chamadas.push('ler.blueprint'); return filas.blueprint ?? []; },
      auditoria: async (alvo) => { chamadas.push('ler.auditoria'); return (filas.auditoria ?? alvo).filter((x) => !auditados.includes(x)); },
      pdi: async () => { chamadas.push('ler.pdi'); return filas.pdi ?? []; },
      trilha: async () => { chamadas.push('ler.trilha'); return (filas.trilha ?? []).filter((x) => !trilhas.includes(x)); },
      conteudo: async () => { chamadas.push('ler.conteudo'); return (filas.conteudo ?? []).filter((x) => !conteudosGerados.includes(x)); },
      kit: async () => { chamadas.push('ler.kit'); return filas.kit ?? []; },
    },
    modelos: async () => ({ ia4_avaliacao: 'claude-sonnet-5-5', ia4_check: 'gpt-5.6-terra', blueprint_gerar: 'claude-sonnet-5', pdi_individual: 'claude-sonnet-5', temporada_desafio: 'claude-sonnet-4-6', relatorio_gestor: 'claude-sonnet-5', relatorio_rh: 'claude-sonnet-5' }),
    lote: async (etapa, args) => { chamadas.push(`lote.${etapa}`); lotes.push({ etapa, args }); return { jobId: `job-${etapa}`, adotado: false }; },
    aguardarJob: async (id) => { chamadas.push(`aguardar.${id}`); return { status: 'done' }; },
    gerarConteudo: async (item) => { chamadas.push(`conteudo.${item.descritor}.${item.formato}`); conteudosGerados.push(item); relogio += 10; return { ok: true }; },
    kitEnfileirar: async (item) => { chamadas.push(`kit.enfileirar.${item.competencia}`); kitsEnfileirados.push(item); return { jobId: `kit-${item.competencia}`, adotado: false }; },
    aguardarKits: async (ids) => { chamadas.push('kit.aguardar'); return ids.map((jobId) => ({ jobId, status: 'done' as const, kits: kitsEnfileirados.find((k) => `kit-${k.competencia}` === jobId)?.faltantes.length ?? 0 })); },
    auditar: async (id) => { chamadas.push(`auditar.${id}`); auditados.push(id); relogio += 10; return { ok: true }; },
    gerarTrilha: async (id) => { chamadas.push(`trilha.${id}`); trilhas.push(id); relogio += 10; return { ok: true }; },
    relatorioGestor: async () => { chamadas.push('gestor'); return { ok: true, gerados: 2 }; },
    relatorioRh: async () => { chamadas.push('rh'); return { ok: true }; },
    cancelado: async () => cancelar,
    gravar: async (p) => { gravados.push(JSON.parse(JSON.stringify(p))); },
    agora: () => relogio,
    ...extra,
  };
  return { deps, chamadas, lotes, auditados, trilhas, gravados, kitsEnfileirados, conteudosGerados, cancelar: () => { cancelar = true; } };
}
const params = (p: Partial<ParamsFluxo> = {}): ParamsFluxo => ({ empresaId: 'e1', escopo: {}, permitidos: null, ...p });
const pecaItem = (descritor: string, formato: ConteudoItem['formato'] = 'texto'): ConteudoItem => ({ competencia: 'C', descritor, cargo: 'CAIXA', formato });
const kitItem = (competencia: string, faltantes = ['D', 'I']): KitItem => ({ competencia, descritor: 'd1', cargo: 'CAIXA', faltantes, formatos: ['texto', 'case'], video: false, contexto: 'generico', nivelMin: 1, nivelMax: 2 });
const etapa = (r: any, id: EtapaId) => r.progresso.etapas.find((e: any) => e.id === id);

describe('ordem e execução completa', () => {
  it('roda as 9 etapas NA ORDEM, cada uma recalculando a própria fila', async () => {
    const m = montar({ ia4: { itens: ['r1', 'r2'] }, blueprint: ['a'], pdi: ['a'], trilha: ['a'], kit: [kitItem('c1')], conteudo: [pecaItem('d1', 'audio')] });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(r.resultado).toBe('terminou');
    const marcas = ['ler.ia4', 'lote.ia4', 'ler.blueprint', 'lote.blueprint', 'ler.auditoria', 'auditar.a', 'ler.pdi', 'lote.relatorios', 'ler.conteudo', 'conteudo.d1.audio', 'ler.trilha', 'trilha.a', 'ler.kit', 'kit.enfileirar.c1', 'kit.aguardar', 'gestor', 'rh'];
    const posicoes = marcas.map((c) => m.chamadas.indexOf(c));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b)); // estritamente na ordem
    for (const id of ORDEM_ETAPAS) expect(etapa(r, id).estado, id).toBe('ok');
  });

  it('o IA4 leva o modelo de avaliação E o do check; blueprint e PDI levam o modelo da PRÓPRIA task (config aplicada, não declarada)', async () => {
    const m = montar({ ia4: { itens: ['r1'] }, blueprint: ['a'], pdi: ['a'] });
    await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.lotes.find((l) => l.etapa === 'ia4')!.args.aiConfig).toEqual({ model: 'claude-sonnet-5-5', checkModel: 'gpt-5.6-terra' });
    expect(m.lotes.find((l) => l.etapa === 'blueprint')!.args.aiConfig).toEqual({ model: 'claude-sonnet-5' });
    expect(m.lotes.find((l) => l.etapa === 'relatorios')!.args.aiConfig).toEqual({ model: 'claude-sonnet-5' });
  });

  it('o IA4 leva as respostas da fila e as só-do-check; o blueprint leva as pessoas da fila', async () => {
    const m = montar({ ia4: { itens: ['r1', 'r2'], checkOnly: ['r9'] }, blueprint: ['a', 'b'] });
    await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.lotes.find((l) => l.etapa === 'ia4')!.args).toMatchObject({ itens: ['r1', 'r2'], checkOnly: ['r9'] });
    expect(m.lotes.find((l) => l.etapa === 'blueprint')!.args.colabIds).toEqual(['a', 'b']);
  });
});

describe('o que NÃO faz', () => {
  it('fila vazia: a etapa é PULADA e nada é enfileirado', async () => {
    const m = montar({});
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.lotes).toEqual([]);
    expect(etapa(r, 'ia4').estado).toBe('pulado');
    expect(etapa(r, 'ia4').detalhe).toBe('nada pendente');
    expect(r.progresso.resumo).toBe('nada a fazer');
  });

  it('auditoria só dos blueprints desta rodada: sem blueprint na fila, não audita ninguém (não reavalia o passado)', async () => {
    const m = montar({ blueprint: [], auditoria: ['antigo1', 'antigo2'] });
    // o executor passa ao `ler.auditoria` o blueprintAlvo desta rodada, que aqui é vazio
    const depsFiltro: DepsFluxo = { ...m.deps, ler: { ...m.deps.ler, auditoria: async (alvo) => alvo } };
    const r = await executarFluxo(params(), null, depsFiltro, { orcamentoMs: 10_000 });
    expect(m.auditados).toEqual([]);
    expect(etapa(r, 'auditoria').estado).toBe('pulado');
  });

  it('a auditoria recebe EXATAMENTE as pessoas que entraram na fila do blueprint', async () => {
    let recebido: string[] = [];
    const m = montar({ blueprint: ['a', 'b'] }, {});
    const deps: DepsFluxo = { ...m.deps, ler: { ...m.deps.ler, auditoria: async (alvo) => { recebido = alvo; return alvo; } } };
    await executarFluxo(params(), null, deps, { orcamentoMs: 10_000 });
    expect(recebido).toEqual(['a', 'b']);
  });

  it('Gestor e RH NÃO rodam com escopo de turma (nenhum dos dois filtra por turma)', async () => {
    const m = montar({ pdi: ['a'] });
    const r = await executarFluxo(params({ permitidos: ['a', 'b'] }), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.chamadas).not.toContain('gestor');
    expect(m.chamadas).not.toContain('rh');
    expect(etapa(r, 'gestor').detalhe).toMatch(/não filtra por turma/);
  });

  it('Gestor e RH NÃO rodam se a rodada não gerou PDI novo', async () => {
    const m = montar({ trilha: ['a'] });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.chamadas).not.toContain('gestor');
    expect(etapa(r, 'gestor').detalhe).toBe('nenhum PDI novo nesta rodada');
  });

  it('SIMULAÇÃO lê as filas e NÃO enfileira, audita, gera trilha nem relatório', async () => {
    const m = montar({ ia4: { itens: ['r1'] }, blueprint: ['a'], auditoria: ['a'], pdi: ['a'], trilha: ['a'] });
    const r = await executarFluxo(params({ dryRun: true }), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.lotes).toEqual([]);
    expect(m.auditados).toEqual([]);
    expect(m.trilhas).toEqual([]);
    expect(m.chamadas.filter((c) => /^(lote|aguardar|auditar|trilha|gestor|rh)/.test(c))).toEqual([]);
    expect(etapa(r, 'ia4').detalhe).toMatch(/^simulação: 1 resposta/);
    expect(etapa(r, 'pdi').detalhe).toMatch(/^simulação: 1 pessoa/);
    expect(etapa(r, 'gestor').detalhe).toBe('simulação: seria gerado ao final');
    expect(r.progresso.dryRun).toBe(true);
  });

  it('"somente" restringe: as outras etapas nem leem a fila', async () => {
    const m = montar({ ia4: { itens: ['r1'] }, blueprint: ['a'] });
    const r = await executarFluxo(params({ somente: ['blueprint'] }), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.chamadas).not.toContain('ler.ia4');
    expect(etapa(r, 'ia4').estado).toBe('pulado');
    expect(etapa(r, 'blueprint').estado).toBe('ok');
  });
});

describe('falhas', () => {
  it('uma etapa que falha NÃO derruba a cadeia: as seguintes seguem e o resumo diz onde falhou', async () => {
    const m = montar({ ia4: { itens: ['r1'] }, blueprint: ['a'] }, { lote: async (etapa) => (etapa === 'ia4' ? { erro: 'Trigger fora do ar' } : { jobId: 'j', adotado: false }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'ia4').estado).toBe('erro');
    expect(etapa(r, 'ia4').detalhe).toBe('Trigger fora do ar');
    expect(etapa(r, 'blueprint').estado).toBe('ok');
    expect(r.resultado).toBe('terminou');
  });

  it('lote que termina em erro: etapa em erro, e a cadeia continua', async () => {
    const m = montar({ blueprint: ['a'], pdi: ['a'] }, { aguardarJob: async (id) => (id === 'j1' ? { status: 'error', erro: 'batch expirou' } : { status: 'done' }), lote: async (e) => ({ jobId: e === 'blueprint' ? 'j1' : 'j2', adotado: false }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'blueprint').estado).toBe('erro');
    expect(etapa(r, 'pdi').estado).toBe('ok');
  });

  it('itens com erro no lote: etapa PARCIAL, com a contagem', async () => {
    const m = montar({ pdi: ['a', 'b', 'c'] }, { aguardarJob: async () => ({ status: 'done', ok: 2, falhas: 1 }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'pdi')).toMatchObject({ estado: 'parcial', feitos: 2, falhas: 1 });
  });

  it('exceção ao auditar/gerar trilha de UMA pessoa vira falha dela; as outras seguem', async () => {
    const m = montar({ trilha: ['a', 'b', 'c'] }, { gerarTrilha: async (id) => { if (id === 'b') throw new Error('boom'); return { ok: true }; } });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'trilha')).toMatchObject({ estado: 'parcial', feitos: 2, falhas: 1 });
  });

  it('Gestor com erro vira etapa em erro, sem derrubar o RH', async () => {
    const m = montar({ pdi: ['a'] }, { relatorioGestor: async () => ({ ok: false, erro: 'sem gestores' }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'gestor').estado).toBe('erro');
    expect(etapa(r, 'rh').estado).toBe('ok');
  });
});

describe('cancelamento', () => {
  it('cancelado ANTES de uma etapa: para ali e não enfileira nada', async () => {
    const m = montar({ ia4: { itens: ['r1'] }, blueprint: ['a'] });
    m.cancelar();
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(r.resultado).toBe('cancelado');
    expect(m.lotes).toEqual([]);
  });

  it('cancelado NO MEIO do pool: para de lançar novas pessoas', async () => {
    const m = montar({ trilha: ['a', 'b', 'c', 'd', 'e', 'f'] });
    let n = 0;
    const deps: DepsFluxo = { ...m.deps, gerarTrilha: async (id) => { if (++n === 2) m.cancelar(); m.trilhas.push(id); return { ok: true }; } };
    const r = await executarFluxo(params(), null, deps, { orcamentoMs: 10_000, concorrencia: 1 });
    expect(r.resultado).toBe('cancelado');
    expect(m.trilhas.length).toBeLessThan(6);
  });

  it('lote cancelado (pelo admin) encerra o fluxo como cancelado', async () => {
    const m = montar({ blueprint: ['a'], pdi: ['a'] }, { aguardarJob: async () => ({ status: 'cancelled' }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(r.resultado).toBe('cancelado');
    expect(m.chamadas).not.toContain('ler.pdi');
  });
});

describe('orçamento de tempo e continuação', () => {
  it('estourado no meio da trilha: devolve "continuar" com a etapa ainda `rodando` e o resto contado', async () => {
    const m = montar({ trilha: ['a', 'b', 'c', 'd'] });
    // cada trilha gasta 10; orçamento 15 => 2 pessoas (a 2ª passa do limite), as demais ficam para a próxima
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 15, concorrencia: 1 });
    expect(r.resultado).toBe('continuar');
    expect(etapa(r, 'trilha').estado).toBe('rodando');
    expect(etapa(r, 'trilha').feitos).toBe(2);
    expect(etapa(r, 'trilha').total).toBe(4);
  });

  it('a CONTINUAÇÃO retoma de onde parou: não refaz etapas concluídas nem as pessoas já feitas, e fecha a conta', async () => {
    const m = montar({ blueprint: ['a'], trilha: ['a', 'b', 'c', 'd'] });
    const r1 = await executarFluxo(params(), null, m.deps, { orcamentoMs: 15, concorrencia: 1 });
    expect(r1.resultado).toBe('continuar');
    const lotesAntes = m.lotes.length;
    const r2 = await executarFluxo(params(), r1.progresso, m.deps, { orcamentoMs: 1000, concorrencia: 1 });
    expect(r2.resultado).toBe('terminou');
    expect(m.lotes.length).toBe(lotesAntes);                 // o lote do blueprint NÃO foi reenfileirado
    expect(m.trilhas.sort()).toEqual(['a', 'b', 'c', 'd']);  // ninguém gerado duas vezes
    expect(etapa(r2, 'trilha')).toMatchObject({ estado: 'ok', feitos: 4, total: 4 });
    expect(r2.progresso.execucoes).toBe(2);
  });

  it('etapa PARCIAL conta como terminada: a continuação não re-enfileira as mesmas falhas', async () => {
    let chamadasPdi = 0;
    const m = montar({ pdi: ['a', 'b'], trilha: ['x', 'y', 'z'] }, { lote: async (e) => { if (e === 'relatorios') chamadasPdi++; return { jobId: 'j', adotado: false }; }, aguardarJob: async () => ({ status: 'done', ok: 1, falhas: 1 }) });
    const r1 = await executarFluxo(params(), null, m.deps, { orcamentoMs: 15, concorrencia: 1 });
    expect(r1.resultado).toBe('continuar');
    await executarFluxo(params(), r1.progresso, m.deps, { orcamentoMs: 1000, concorrencia: 1 });
    expect(chamadasPdi).toBe(1);
  });

  it('o orçamento conta só COMPUTE: esperar um lote (que pode levar horas) não o consome', async () => {
    let relogio = 0;
    const m = montar({ ia4: { itens: ['r'] }, trilha: ['a'] }, { agora: () => relogio, aguardarJob: async () => { relogio += 1_000_000; return { status: 'done' }; } });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 100 });
    expect(r.resultado).toBe('terminou'); // a espera de 1.000.000 não estourou o orçamento de 100
  });
});

describe('lote já em andamento', () => {
  it('adota o lote que já estava rodando (não dispara outro) e espera por ele', async () => {
    const m = montar({ blueprint: ['a'] }, { lote: async () => ({ jobId: 'ja-rodando', adotado: true }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.chamadas).toContain('aguardar.ja-rodando');
    expect(etapa(r, 'blueprint').jobIds).toEqual(['ja-rodando']);
    expect(r.progresso.atual).toBe('concluído');
  });
});

describe('persistência do progresso', () => {
  it('grava o progresso ao longo da execução (a tela acompanha) e o último estado é "concluído"', async () => {
    const m = montar({ blueprint: ['a'] });
    await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.gravados.length).toBeGreaterThan(5);
    expect(m.gravados[m.gravados.length - 1].atual).toBe('concluído');
    expect(m.gravados[0].modelos).toBeTruthy(); // os modelos efetivos ficam registrados
  });
  it('progressoInicial lista todas as etapas pendentes', () => {
    const p = progressoInicial();
    expect(p.etapas.map((e) => e.id)).toEqual(ORDEM_ETAPAS);
    expect(p.etapas.every((e) => e.estado === 'aguardando')).toBe(true);
  });
});

describe('kit semanal (depois da trilha, sem vídeo)', () => {
  it('enfileira UM job por tema, espera todos juntos e conta kits (tema × DISC) como unidade', async () => {
    const m = montar({ kit: [kitItem('c1', ['D', 'I']), kitItem('c2', ['S'])] });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.kitsEnfileirados.map((k) => k.competencia)).toEqual(['c1', 'c2']);
    expect(m.chamadas.filter((c) => c === 'kit.aguardar')).toHaveLength(1);
    expect(etapa(r, 'kit')).toMatchObject({ estado: 'ok', total: 3, feitos: 3, falhas: 0 });
    expect(etapa(r, 'kit').jobIds).toEqual(['kit-c1', 'kit-c2']);
  });

  it('o kit vem DEPOIS da trilha: lê a fila só quando a trilha terminou (o plano nasce da trilha)', async () => {
    const m = montar({ trilha: ['a'], kit: [kitItem('c1')] });
    await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.chamadas.indexOf('trilha.a')).toBeLessThan(m.chamadas.indexOf('ler.kit'));
  });

  it('simulação: conta e NÃO enfileira nem espera', async () => {
    const m = montar({ kit: [kitItem('c1', ['D', 'I', 'S'])] });
    const r = await executarFluxo(params({ dryRun: true }), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'kit')).toMatchObject({ estado: 'pulado', total: 3 });
    expect(etapa(r, 'kit').detalhe).toMatch(/simulação: 3 kit/);
    expect(m.kitsEnfileirados).toHaveLength(0);
    expect(m.chamadas).not.toContain('kit.aguardar');
  });

  it('sem kit faltando: pulada, sem enfileirar', async () => {
    const m = montar({ kit: [] });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'kit').estado).toBe('pulado');
    expect(m.kitsEnfileirados).toHaveLength(0);
  });

  it('job `done` que publicou MENOS kits que o esperado é parcial (fechar o job não prova que o kit existe)', async () => {
    const m = montar({ kit: [kitItem('c1', ['D', 'I', 'S', 'C'])] }, {
      aguardarKits: async (ids) => ids.map((jobId) => ({ jobId, status: 'done' as const, kits: 3 })),
    });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'kit')).toMatchObject({ estado: 'parcial', feitos: 3, falhas: 1 });
  });

  it('job `done` SEM contagem de kits não vale ok', async () => {
    const m = montar({ kit: [kitItem('c1')] }, { aguardarKits: async (ids) => ids.map((jobId) => ({ jobId, status: 'done' as const })) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'kit')).toMatchObject({ estado: 'erro', feitos: 0, falhas: 2 });
  });

  it('falha ao enfileirar UM tema não derruba os outros; o resumo mostra o parcial', async () => {
    const m = montar({ kit: [kitItem('c1'), kitItem('c2')] }, {
      kitEnfileirar: async (item) => (item.competencia === 'c1' ? { erro: 'trigger fora' } : { jobId: 'kit-c2', adotado: false }),
      aguardarKits: async (ids) => ids.map((jobId) => ({ jobId, status: 'done' as const, kits: 2 })),
    });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'kit')).toMatchObject({ estado: 'parcial', feitos: 2, falhas: 2 });
  });

  it('todos os enfileiramentos falham: etapa com erro, cadeia segue (Gestor/RH recalculam a própria fila)', async () => {
    const m = montar({ kit: [kitItem('c1')], pdi: ['a'] }, { kitEnfileirar: async () => ({ erro: 'trigger fora' }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'kit')).toMatchObject({ estado: 'erro', falhas: 2 });
    expect(r.resultado).toBe('terminou');
  });

  it('job de kit cancelado encerra o fluxo como cancelado', async () => {
    const m = montar({ kit: [kitItem('c1')] }, { aguardarKits: async (ids) => ids.map((jobId) => ({ jobId, status: 'cancelled' as const })) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(r.resultado).toBe('cancelado');
  });

  it('continuação: kit já terminado numa execução anterior NÃO repete (não paga duas vezes)', async () => {
    const m1 = montar({ kit: [kitItem('c1')] });
    const r1 = await executarFluxo(params(), null, m1.deps, { orcamentoMs: 10_000 });
    const m2 = montar({ kit: [kitItem('c1')] });
    await executarFluxo(params(), r1.progresso, m2.deps, { orcamentoMs: 10_000 });
    expect(m2.kitsEnfileirados).toHaveLength(0);
  });
});

describe('IA4: total na MESMA unidade do lote (avaliação e check contam como itens)', () => {
  it('com modelo de check, 2 respostas + 1 só-check = 5 itens do lote (tela "5/5", não "5/3")', async () => {
    const m = montar({ ia4: { itens: ['r1', 'r2'], checkOnly: ['r3'] } }, { aguardarJob: async () => ({ status: 'done', ok: 5, falhas: 0 }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'ia4')).toMatchObject({ estado: 'ok', total: 5, feitos: 5, falhas: 0 });
  });
  it('sem modelo de check, o total segue contando as respostas', async () => {
    const m = montar({ ia4: { itens: ['r1', 'r2'] } }, { modelos: async () => ({ ia4_avaliacao: 'm' }), aguardarJob: async () => ({ status: 'done', ok: 2, falhas: 0 }) });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'ia4')).toMatchObject({ total: 2, feitos: 2 });
  });
  it('simulação continua contando RESPOSTAS (nada vai ao lote)', async () => {
    const m = montar({ ia4: { itens: ['r1', 'r2'], checkOnly: ['r3'] } });
    const r = await executarFluxo(params({ dryRun: true }), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'ia4').total).toBe(3);
  });
});

describe('kit em ONDAS (TTS compartilhado entre podcast e vídeo)', () => {
  const muitos = (n: number) => Array.from({ length: n }, (_, i) => kitItem(`c${i + 1}`, ['D']));

  it('no máximo 3 jobs por vez: espera a onda terminar antes de enfileirar a seguinte', async () => {
    const ordem: string[] = [];
    const m = montar({ kit: muitos(7) }, {
      kitEnfileirar: async (item) => { ordem.push(`enf.${item.competencia}`); return { jobId: `kit-${item.competencia}`, adotado: false }; },
      aguardarKits: async (ids) => { ordem.push(`esp[${ids.length}]`); return ids.map((jobId) => ({ jobId, status: 'done' as const, kits: 1 })); },
    });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(ordem.filter((o) => o.startsWith('esp'))).toEqual(['esp[3]', 'esp[3]', 'esp[1]']);
    expect(ordem.indexOf('enf.c4')).toBeGreaterThan(ordem.indexOf('esp[3]'));
    expect(etapa(r, 'kit')).toMatchObject({ estado: 'ok', total: 7, feitos: 7 });
  });

  it('cancelamento ENTRE as ondas encerra sem enfileirar as seguintes e guarda o que já saiu', async () => {
    let esperas = 0;
    const m = montar({ kit: muitos(7) }, {
      aguardarKits: async (ids) => { esperas++; return ids.map((jobId) => ({ jobId, status: 'done' as const, kits: 1 })); },
    });
    const dep = { ...m.deps, cancelado: async () => esperas >= 1 };
    const r = await executarFluxo(params(), null, dep, { orcamentoMs: 10_000 });
    expect(r.resultado).toBe('cancelado');
    expect(m.kitsEnfileirados).toHaveLength(3);
    expect(etapa(r, 'kit').feitos).toBe(3);
  });
});

describe('conteúdos (biblioteca) ANTES da trilha', () => {
  it('a biblioteca é gerada antes da trilha: a trilha aborta sem conteúdo-base, então a ordem é a regra', async () => {
    const m = montar({ trilha: ['a'], conteudo: [pecaItem('d1'), pecaItem('d2')] });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(m.chamadas.indexOf('conteudo.d2.texto')).toBeLessThan(m.chamadas.indexOf('trilha.a'));
    expect(etapa(r, 'conteudo')).toMatchObject({ estado: 'ok', total: 2, feitos: 2, falhas: 0 });
  });

  it('biblioteca completa: pulada com a razão dita', async () => {
    const m = montar({ conteudo: [] });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'conteudo')).toMatchObject({ estado: 'pulado', detalhe: 'biblioteca já completa' });
  });

  it('simulação: conta as peças e NÃO gera nada', async () => {
    const m = montar({ conteudo: [pecaItem('d1'), pecaItem('d2', 'audio')] });
    const r = await executarFluxo(params({ dryRun: true }), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'conteudo')).toMatchObject({ estado: 'pulado', total: 2 });
    expect(etapa(r, 'conteudo').detalhe).toMatch(/simulação: 2 peça\(s\) de biblioteca/);
    expect(m.conteudosGerados).toHaveLength(0);
  });

  it('falha de UMA peça não derruba as outras nem a cadeia; o estado vira parcial', async () => {
    const m = montar({ conteudo: [pecaItem('d1'), pecaItem('d2'), pecaItem('d3')], trilha: ['a'] }, {
      gerarConteudo: async (item) => (item.descritor === 'd2' ? { ok: false, erro: 'IA fora' } : { ok: true }),
    });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'conteudo')).toMatchObject({ estado: 'parcial', feitos: 2, falhas: 1 });
    expect(r.resultado).toBe('terminou');
    expect(m.trilhas).toContain('a');
  });

  it('exceção ao gerar uma peça vira falha da peça, não da etapa', async () => {
    const m = montar({ conteudo: [pecaItem('d1')] }, { gerarConteudo: async () => { throw new Error('explodiu'); } });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000 });
    expect(etapa(r, 'conteudo')).toMatchObject({ estado: 'erro', falhas: 1 });
    expect(etapa(r, 'conteudo').detalhe).toMatch(/explodiu/);
  });

  it('concorrência BAIXA (TTS compartilhado com o vídeo): no máximo 2 peças ao mesmo tempo', async () => {
    let emVoo = 0; let pico = 0;
    const m = montar({ conteudo: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map((d) => pecaItem(d, 'audio')) }, {
      gerarConteudo: async () => { emVoo++; pico = Math.max(pico, emVoo); await new Promise((r) => setTimeout(r, 5)); emVoo--; return { ok: true }; },
    });
    await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000, concorrencia: 5 });
    expect(pico).toBeLessThanOrEqual(2);
  });

  it('acabou o orçamento de tempo: continua na próxima execução, e a continuação só pega o que falta', async () => {
    const m = montar({ conteudo: [pecaItem('d1'), pecaItem('d2'), pecaItem('d3'), pecaItem('d4')] });
    const r1 = await executarFluxo(params(), null, m.deps, { orcamentoMs: 15, concorrencia: 1 });
    expect(r1.resultado).toBe('continuar');
    expect(etapa(r1, 'conteudo').estado).toBe('rodando');
    const r2 = await executarFluxo(params(), r1.progresso, m.deps, { orcamentoMs: 10_000 });
    expect(r2.resultado).toBe('terminou');
    expect(m.conteudosGerados).toHaveLength(4);
    expect(new Set(m.conteudosGerados.map((i) => i.descritor)).size).toBe(4);
  });
});

describe('pool do executor: cada item roda UMA vez (sem item fantasma no último)', () => {
  it('3 itens com 3 workers e parar() assíncrono: nenhum item é chamado vazio nem repetido, em auditoria, conteúdos e trilha', async () => {
    const chamadosA: any[] = []; const chamadosC: any[] = []; const chamadosT: any[] = [];
    const m = montar({ blueprint: ['a', 'b', 'c'], conteudo: [pecaItem('d1'), pecaItem('d2'), pecaItem('d3')], trilha: ['x', 'y', 'z'] }, {
      auditar: async (id) => { chamadosA.push(id); await new Promise((r) => setTimeout(r, 3)); return { ok: true }; },
      gerarConteudo: async (item) => { chamadosC.push(item); await new Promise((r) => setTimeout(r, 3)); return { ok: true }; },
      gerarTrilha: async (id) => { chamadosT.push(id); await new Promise((r) => setTimeout(r, 3)); return { ok: true }; },
    });
    const r = await executarFluxo(params(), null, m.deps, { orcamentoMs: 10_000, concorrencia: 3 });
    expect(chamadosA.filter((x) => x === undefined)).toHaveLength(0);
    expect(chamadosC.filter((x) => x === undefined)).toHaveLength(0);
    expect(chamadosT.filter((x) => x === undefined)).toHaveLength(0);
    expect(new Set(chamadosA).size).toBe(chamadosA.length);
    expect(etapa(r, 'conteudo')).toMatchObject({ estado: 'ok', feitos: 3, falhas: 0 });
    expect(etapa(r, 'trilha')).toMatchObject({ estado: 'ok', feitos: 3, falhas: 0 });
  });
});
