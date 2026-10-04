import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Cenário B INTEGRADOR do Onboarding (R-21, 04/10/2026).
 *
 * O fechamento só aceita o B que cobre TODAS as competências da trilha, e o lote
 * gera um B por célula: o Onboarding (5 competências) chegava ao fim do programa e
 * recebia 424. `lib/cenario-b-integrador.ts` é o gerador que faltava. Estes testes
 * provam o gerador (prompt, validação, formato gravado, idempotência, falha visível)
 * e a ESCOLHA: o integrador é achado pela trilha de 5 e por nenhuma outra.
 *
 * Nenhuma chamada de IA é real: `callAI` é o mock do wrapper.
 */

const h = vi.hoisted(() => ({
  sbRaw: null as any,
  tdb: null as any,
  callAI: vi.fn(),
  contexto: vi.fn(),
  modelo: vi.fn(),
}));

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => h.tdb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: vi.fn() }));
vi.mock('@/lib/ai-tasks', async (importOriginal) => ({ ...(await importOriginal<any>()), getModelForTask: h.modelo }));
vi.mock('@/lib/ia3-cenarios', async (importOriginal) => ({ ...(await importOriginal<any>()), montarContextoIA3: h.contexto }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import {
  SYSTEM_CENARIO_B_INTEGRADOR,
  buildCenarioBIntegradorPrompts,
  normalizarCenarioBIntegrador,
  montarDadosCenarioBIntegrador,
  gerarCenarioBIntegradorCore,
  listarAlvosDoIntegrador,
  type ContextoIntegrador,
} from '@/lib/cenario-b-integrador';
import { escolherCenarioB, perguntasDoCenarioB, celulasSemCenarioB } from '@/lib/season-engine/cenario-b';
import { competenciasDoOnboardingDoCargo } from '@/lib/season-engine/onboarding-competencias';
import { REGRA_ANONIMIZACAO_INSTITUICOES } from '@/lib/ia3-cenarios';

const COMPS = ['Comunicação', 'Planejamento', 'Liderança de Equipes', 'Gestão do Tempo', 'Resiliência'];
const CARGO = 'Analista';

const A_MAPEAMENTO = {
  competencia: 'Comunicação', titulo: 'O cliente que sumiu',
  descricao: 'Um cliente antigo deixou de responder mensagens depois do reajuste de preço e a equipe comercial precisa decidir como retomar o contato sem pressionar.',
};

const palavras = (n: number, base = 'situacao') => Array.from({ length: n }, (_, i) => `${base}${String.fromCharCode(97 + (i % 26))}${i}`).join(' ');

function respostaValida(over: Record<string, unknown> = {}) {
  return {
    titulo: 'A entrega que mudou de dono',
    descricao: `Na sexta-feira, a coordenadora Marina avisa que a entrega do mês passou para o seu time. ${palavras(90)}`,
    perguntas: COMPS.map((c) => ({ competencia: c, pergunta: `Como você agiria em ${c}?`, objetivo_diagnostico: `Revela ${c}.` })),
    por_que_integra: 'As competências se encontram na mesma entrega.',
    tradeoff_testado: 'Velocidade contra qualidade.',
    armadilha_de_resposta_generica: 'Resposta vaga não escolhe nada.',
    stakeholders_centrais: ['Marina'],
    referencia_avaliacao: { nivel_1: 'a', nivel_2: 'b', nivel_3: 'c', nivel_4: 'd' },
    dilema_etico_embutido: { valor_testado: 'Transparência', caminho_facil: 'omitir', caminho_etico: 'avisar' },
    confianca_cenario: 0.8,
    riscos_do_cenario: ['risco'],
    ...over,
  };
}

function ctxIntegrador(over: Partial<ContextoIntegrador> = {}): ContextoIntegrador {
  return {
    empresa: { nome: 'Acme', segmento: 'Varejo' },
    cargoNome: CARGO,
    cargoDetalhe: { descricao: 'Analisa pedidos', principais_entregas: 'Relatório semanal' },
    valores: ['Respeito', 'Transparência'],
    contextoPPP: '',
    gabCIS: null,
    competencias: COMPS.map((nome, i) => ({
      nome, cod_comp: `C0${i}`, descricao: `Descrição de ${nome}`,
      descritores: [{ cod_desc: `C0${i}_D1`, nome_curto: `Descritor de ${nome}`, n1_gap: `lacuna ${i}`, n2_desenvolvimento: 'em desenvolvimento', n3_meta: 'meta', n4_referencia: 'referência' }],
    })),
    cenariosA: [A_MAPEAMENTO],
    ...over,
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────────

describe('prompt do integrador', () => {
  const TRAVESSAO = new RegExp('['+String.fromCharCode(0x2013, 0x2014, 0x2015)+']');

  it('traz TODAS as competências, na ordem, com a régua N1 a N4 de cada uma', () => {
    const { user } = buildCenarioBIntegradorPrompts(ctxIntegrador());
    const posicoes = COMPS.map((c) => user.indexOf(`Competência ${COMPS.indexOf(c) + 1}: ${c}`));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    for (const nivel of ['N1 (lacuna)', 'N2 (em desenvolvimento)', 'N3 (meta)', 'N4 (referência)']) expect(user).toContain(nivel);
    expect(user).toContain('COMPETÊNCIAS DA TRILHA (5)');
    expect(user).toContain('Escreva UM caso e 5 perguntas, uma por competência');
  });

  it('o system pede UMA situação, uma pergunta por competência e o campo "competencia" no formato do JSON', () => {
    expect(SYSTEM_CENARIO_B_INTEGRADOR).toContain('UMA SITUAÇÃO SÓ');
    expect(SYSTEM_CENARIO_B_INTEGRADOR).toContain('UMA PERGUNTA POR COMPETÊNCIA');
    expect(SYSTEM_CENARIO_B_INTEGRADOR).toContain('"competencia": "nome da competência, exatamente como na lista"');
    expect(SYSTEM_CENARIO_B_INTEGRADOR).toContain('ANONIMIZAÇÃO DE INSTITUIÇÕES');
  });

  it('os cenários do Mapeamento entram como "não repetir"; sem eles o bloco some', () => {
    expect(buildCenarioBIntegradorPrompts(ctxIntegrador()).user).toContain('O cliente que sumiu');
    expect(buildCenarioBIntegradorPrompts(ctxIntegrador({ cenariosA: [] })).user).not.toContain('CENÁRIOS DO MAPEAMENTO');
  });

  it('sem travessão: nem o system, nem o user, nem o exemplo de JSON (o modelo copia o exemplo)', () => {
    const { system, user } = buildCenarioBIntegradorPrompts(ctxIntegrador());
    // A regra de anonimização é o texto COMPARTILHADO com o cenário A (golden em
    // ia3/prompt-golden) e traz dois travessões de pontuação em prosa, não em exemplo.
    // Tudo o que este prompt escreve por conta própria, inclusive o JSON de exemplo, é limpo.
    expect(TRAVESSAO.test(system.replace(REGRA_ANONIMIZACAO_INSTITUICOES, ''))).toBe(false);
    expect(TRAVESSAO.test(user)).toBe(false);
  });

  it('a correção da tentativa anterior vai no fim do user', () => {
    const { user } = buildCenarioBIntegradorPrompts(ctxIntegrador(), 'Faltam perguntas para: Resiliência');
    expect(user.endsWith('Faltam perguntas para: Resiliência')).toBe(true);
    expect(user).toContain('CORREÇÃO NECESSÁRIA');
  });
});

// ── Validação ───────────────────────────────────────────────────────────────

describe('normalizarCenarioBIntegrador', () => {
  const normaliza = (dados: any, a = [A_MAPEAMENTO]) => normalizarCenarioBIntegrador(dados, COMPS, a);

  it('resposta completa: uma pergunta por competência, no nome canônico', () => {
    const r: any = normaliza(respostaValida());
    expect(r.cenario.perguntas.map((p: any) => p.competencia)).toEqual(COMPS);
  });

  it('a ordem das perguntas é a da trilha, não a que o modelo escreveu; o nome casa sem caixa', () => {
    const embaralhada = respostaValida({
      perguntas: [...COMPS].reverse().map((c) => ({ competencia: c.toUpperCase(), pergunta: `Pergunta de ${c}` })),
    });
    const r: any = normaliza(embaralhada);
    expect(r.cenario.perguntas.map((p: any) => p.competencia)).toEqual(COMPS);
    expect(r.cenario.perguntas[0].pergunta).toBe('Pergunta de Comunicação');
  });

  it('competência da trilha SEM pergunta reprova, com o nome (o scorer pontuaria os descritores dela sem evidência)', () => {
    const r: any = normaliza(respostaValida({ perguntas: respostaValida().perguntas.slice(0, 4) }));
    expect(r.ok).toBe(false);
    expect(r.erros.join(' ')).toContain('Faltam perguntas para: Resiliência');
  });

  it('pergunta de competência que a trilha não tem reprova', () => {
    const r: any = normaliza(respostaValida({ perguntas: [...respostaValida().perguntas, { competencia: 'Negociação', pergunta: 'x?' }] }));
    expect(r.erros.join(' ')).toContain('"Negociação", que não é uma das competências da trilha');
  });

  it('pergunta vazia, lista ausente e JSON que não é objeto reprovam', () => {
    expect((normaliza(respostaValida({ perguntas: [{ competencia: 'Comunicação', pergunta: '  ' }] })) as any).erros.join(' ')).toContain('A pergunta 1 está vazia');
    expect((normaliza(respostaValida({ perguntas: undefined })) as any).erros.join(' ')).toContain('Faltam as perguntas');
    expect((normaliza(null) as any).erros).toEqual(['A resposta não trouxe um JSON de cenário']);
  });

  it('pergunta demais reprova (a pessoa responde tudo por escrito antes da arguição)', () => {
    const r: any = normaliza(respostaValida({ perguntas: [...respostaValida().perguntas, { competencia: 'Resiliência', pergunta: 'mais uma?' }, { competencia: 'Resiliência', pergunta: 'e outra?' }] }));
    expect(r.erros.join(' ')).toContain('Perguntas demais (7)');
  });

  it('uma segunda pergunta numa competência é aceita (até N+1) e fica junto da primeira', () => {
    const r: any = normaliza(respostaValida({ perguntas: [...respostaValida().perguntas, { competencia: 'Comunicação', pergunta: 'E se o cliente reagir mal?' }] }));
    expect(r.ok).toBe(true);
    expect(r.cenario.perguntas.map((p: any) => p.competencia).slice(0, 2)).toEqual(['Comunicação', 'Comunicação']);
  });

  it('descrição curta demais, longa demais e ausente reprovam', () => {
    expect((normaliza(respostaValida({ descricao: 'Curta.' })) as any).erros.join(' ')).toContain('Descrição curta demais');
    expect((normaliza(respostaValida({ descricao: palavras(500) })) as any).erros.join(' ')).toContain('Descrição longa demais');
    expect((normaliza(respostaValida({ descricao: '' })) as any).erros).toContain('Cenário sem descrição');
  });

  it('caso calcado num cenário do Mapeamento reprova (mede a memória, não a competência)', () => {
    const calcado = respostaValida({ descricao: A_MAPEAMENTO.descricao + ' ' + palavras(3) });
    const r: any = normaliza(calcado);
    expect(r.erros.join(' ')).toContain('Semelhança excessiva com o cenário do Mapeamento de "Comunicação"');
  });

  it('mais de 2 personagens centrais e confiança fora de 0 a 1 reprovam, como no B por célula', () => {
    const r: any = normaliza(respostaValida({ stakeholders_centrais: ['A', 'B', 'C'], confianca_cenario: 1.5 }));
    expect(r.erros).toEqual(expect.arrayContaining(['Max 2 stakeholders', 'confianca fora de 0-1']));
  });
});

// ── Formato gravado ─────────────────────────────────────────────────────────

describe('montarDadosCenarioBIntegrador: a linha de banco_cenarios', () => {
  const linha = () => {
    const r: any = normalizarCenarioBIntegrador(respostaValida(), COMPS, []);
    return montarDadosCenarioBIntegrador(CARGO, COMPS, r.cenario);
  };

  it('é um B no mesmo lugar e formato dos B por célula, sem âncora de competência', () => {
    const l: any = linha();
    expect(l.tipo_cenario).toBe('cenario_b');
    expect(l.cargo).toBe(CARGO);
    // NULL não colide no índice único (empresa, cargo, competencia_id) da mig 261:
    // ancorar numa das 5 esbarraria no B dela e faria a reavaliação servir o integrador.
    expect(l.competencia_id).toBeNull();
    expect(l.titulo).toBe('A entrega que mudou de dono');
  });

  it('declara a cobertura exata das 5 competências, com a competência de cada pergunta', () => {
    const { alternativas: alt }: any = linha();
    expect(alt.competencias_integradas).toEqual(COMPS);
    expect(alt.cobertura_exata).toBe(true);
    expect(alt.competencia_por_pergunta).toEqual({ p1: 'Comunicação', p2: 'Planejamento', p3: 'Liderança de Equipes', p4: 'Gestão do Tempo', p5: 'Resiliência' });
    expect(alt.faceta_avaliada).toBe(COMPS.join(' + '));
    expect(alt.origem).toBe('cenarios_b_integrador');
  });

  it('só p1..p4 existem como COLUNAS; a 5ª pergunta vive em alternativas, que é o que a rota lê', () => {
    const l: any = linha();
    expect([l.p1, l.p2, l.p3, l.p4].every(Boolean)).toBe(true);
    expect(l.p5).toBeUndefined();
    expect(l.alternativas.p5).toBe('Como você agiria em Resiliência?');
    const servidas = perguntasDoCenarioB(l.alternativas);
    expect(servidas).toHaveLength(5);
    expect(servidas.map((p) => p.dimensao)).toEqual(COMPS);
  });

  it('o objetivo de cada pergunta e o resto do formato do B (dilema, referência) acompanham', () => {
    const { alternativas: alt }: any = linha();
    expect(alt.objetivo_diagnostico.p3).toBe('Revela Liderança de Equipes.');
    expect(alt.dilema_etico).toEqual({ valor_testado: 'Transparência', caminho_facil: 'omitir', caminho_etico: 'avisar' });
    expect(alt.referencia_avaliacao.nivel_3).toBe('c');
    expect(alt.confianca_cenario).toBe(0.8);
  });
});

// ── Escolha: quem acha o integrador ─────────────────────────────────────────

describe('o integrador é achado pelo fechamento da trilha de 5, e por nenhuma outra', () => {
  const rowDoIntegrador = (id = 'b-int') => {
    const r: any = normalizarCenarioBIntegrador(respostaValida(), COMPS, []);
    const l: any = montarDadosCenarioBIntegrador(CARGO, COMPS, r.cenario);
    return { id, created_at: '2026-10-04T12:00:00Z', ...l };
  };
  const escolhe = async (rows: any[], trilha: string[], cargo = CARGO) => {
    // O mock não filtra sozinho: aplica o `.in('cargo', [...])` que a escolha pediu.
    const sb = criarSupabaseMock({
      lista: (t, _c, cadeia) => {
        if (t !== 'banco_cenarios') return [];
        const cargos = cadeia.find((c) => c.metodo === 'in' && c.args[0] === 'cargo')?.args[1] as string[] | undefined;
        return cargos ? rows.filter((r) => cargos.includes(r.cargo)) : rows;
      },
    });
    return escolherCenarioB(sb.client, 'emp-1', cargo, trilha, { registrar: false });
  };

  it('a trilha do Onboarding (as 5, em qualquer ordem e caixa) encontra o integrador', async () => {
    const r = await escolhe([rowDoIntegrador()], [...COMPS].reverse().map((c) => c.toLowerCase()));
    expect(r.motivo).toBe('ok');
    expect(r.cenario?.id).toBe('b-int');
  });

  it('uma trilha de UMA competência (Jornada) NÃO recebe o integrador: avaliaria 1 competência contra um caso de 5', async () => {
    const r = await escolhe([rowDoIntegrador()], ['Comunicação']);
    expect(r.cenario).toBeNull();
    expect(r.motivo).toBe('sem-elegivel');
  });

  it('trilha com um subconjunto ou com uma competência a mais também não', async () => {
    expect((await escolhe([rowDoIntegrador()], COMPS.slice(0, 4))).cenario).toBeNull();
    expect((await escolhe([rowDoIntegrador()], [...COMPS, 'Negociação'])).cenario).toBeNull();
  });

  it('é do cargo: outro cargo não o recebe', async () => {
    expect((await escolhe([rowDoIntegrador()], COMPS, 'Gerente')).cenario).toBeNull();
  });

  it('o integrador de cobertura "pelo menos" de Ibipeba segue servindo o subconjunto (nada mudou para ele)', async () => {
    const ibipeba = { id: 'b-ibipeba', titulo: 't', descricao: 'd', cargo: 'Gestão Escolar', competencia_id: null, created_at: '2026-09-01T00:00:00Z', alternativas: { p1: 'x', competencias_integradas: ['A', 'B', 'C'] } };
    expect((await escolhe([ibipeba], ['A', 'B'], 'Gestão Escolar')).cenario?.id).toBe('b-ibipeba');
  });

  it('o lote por célula continua gerando o B de cada competência: o integrador não mascara a célula', () => {
    const A = (id: string, comp: string) => ({ id, titulo: id, descricao: id, cargo: CARGO, competencia_id: comp, ppp_escola_id: null, created_at: '2026-09-01T00:00:00Z' });
    const nomes = new Map([['c1', 'Comunicação'], ['c2', 'Planejamento']]);
    const integrador = rowDoIntegrador();
    const faltantes = celulasSemCenarioB([A('a1', 'c1'), A('a2', 'c2')], [integrador], nomes);
    expect(faltantes.map((c) => c.referencia.id).sort()).toEqual(['a1', 'a2']);
  });
});

// ── Competências do Onboarding por cargo ────────────────────────────────────

describe('competenciasDoOnboardingDoCargo: as mesmas competências da geração, sem olhar a pessoa', () => {
  const tdbCom = (top5: unknown) => criarSupabaseMock({ resolver: (t) => (t === 'cargos_empresa' ? { top5_workshop: top5 } : null) });

  it('o Top 5 do cargo, nas 5 primeiras, sem repetir (caixa) nem inventar', async () => {
    const sb = tdbCom(['Comunicação', 'comunicação', 'Planejamento', 'Liderança de Equipes', 'Gestão do Tempo', 'Resiliência', 'Extra']);
    expect(await competenciasDoOnboardingDoCargo(sb.client, CARGO, {}, 5)).toEqual({ competencias: COMPS });
  });

  it('o override da config efetiva vem primeiro e o Top 5 completa', async () => {
    const sb = tdbCom(['Comunicação', 'Planejamento', 'Resiliência']);
    const r: any = await competenciasDoOnboardingDoCargo(sb.client, CARGO, { competencias_onboarding: ['Negociação', 'Planejamento'] }, 4);
    expect(r.competencias).toEqual(['Negociação', 'Planejamento', 'Comunicação', 'Resiliência']);
  });

  it('menos de 5: recusa com o código da geração (nada de integrador para 3 competências)', async () => {
    const r: any = await competenciasDoOnboardingDoCargo(tdbCom(['A', 'B', 'C']).client, CARGO, {}, 5);
    expect(r.codigo).toBe('onboarding_competencias_insuficientes');
    expect(r.error).toContain('tem 3');
  });

  it('nenhuma competência e falha de leitura recusam com o motivo', async () => {
    expect(((await competenciasDoOnboardingDoCargo(tdbCom([]).client, CARGO, {}, 5)) as any).codigo).toBe('onboarding_sem_competencias');
    const sb = tdbCom(COMPS);
    sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout' });
    const r: any = await competenciasDoOnboardingDoCargo(sb.client, CARGO, {}, 5);
    expect(r.codigo).toBe('onboarding_top5_leitura');
    expect(r.error).toContain('timeout');
  });
});

// ── Geração ─────────────────────────────────────────────────────────────────

let bRows: any[] = [];

function montarMocks() {
  const parent = (nome: string, i: number) => ({ id: `cp-${i}`, nome, cod_comp: `C0${i}`, cod_desc: null, pilar: 'P', descricao: `Descrição de ${nome}`, cargo: CARGO });
  const desc = (i: number) => [{ cod_desc: `C0${i}_D1`, nome_curto: `Descritor ${i}`, n1_gap: 'g', n2_desenvolvimento: 'd', n3_meta: 'm', n4_referencia: 'r' }];
  h.tdb = criarSupabaseMock({
    lista: (tabela, cols, cadeia) => {
      if (tabela === 'competencias') {
        if (cols.includes('n1_gap')) {
          const cod = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'cod_comp')?.args[1] as string;
          return desc(Number(cod.slice(2)));
        }
        return COMPS.flatMap((nome, i) => [parent(nome, i), { ...parent(nome, i), id: `cd-${i}`, cod_desc: `C0${i}_D1` }]);
      }
      if (tabela === 'banco_cenarios') return [{ id: 'a-1', titulo: A_MAPEAMENTO.titulo, descricao: A_MAPEAMENTO.descricao, cargo: CARGO, competencia_id: 'cp-0', ppp_escola_id: null, created_at: '2026-09-01T00:00:00Z' }];
      return [];
    },
    escritaUnica: (_t, _op, payload) => ({ id: 'novo-id', titulo: payload?.titulo }),
  });
  h.sbRaw = criarSupabaseMock({ lista: (t) => (t === 'banco_cenarios' ? bRows : []) });
  h.contexto.mockResolvedValue({
    ok: true,
    ctx: { tdb: h.tdb.client, empresa: { nome: 'Acme', segmento: 'Varejo' }, comp: parent(COMPS[0], 0), descritores: desc(0), contextoPPP: '', valores: ['Respeito'], cargoDetalhe: {}, gabCIS: null },
  });
}

beforeEach(() => {
  bRows = [];
  h.callAI.mockReset();
  h.contexto.mockReset();
  h.modelo.mockReset();
  h.modelo.mockResolvedValue('claude-sonnet-4-6');
  montarMocks();
});

const roda = (extra: Record<string, unknown> = {}) => gerarCenarioBIntegradorCore(h.sbRaw.client, { empresaId: 'emp-1', cargo: CARGO, competencias: COMPS, ...extra });
const gravacoes = () => h.tdb.escritas.filter((e: any) => e.tabela === 'banco_cenarios');

describe('gerarCenarioBIntegradorCore', () => {
  it('gera, valida e grava UM B integrador; chama a IA pelo wrapper com a task própria e o tenant', async () => {
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida()));
    const r: any = await roda();
    expect(r).toMatchObject({ ok: true, status: 'gerado', cenarioId: 'novo-id', perguntas: 5, tentativas: 1 });

    expect(h.callAI).toHaveBeenCalledTimes(1);
    const [system, user, aiConfig, maxTokens, opts] = h.callAI.mock.calls[0];
    expect(system).toBe(SYSTEM_CENARIO_B_INTEGRADOR);
    expect(user).toContain('Competência 5: Resiliência');
    expect(user).toContain('O cliente que sumiu'); // o A de rede do Mapeamento entra como "não repetir"
    expect(aiConfig).toEqual({ model: 'claude-sonnet-4-6' }); // a task resolve o modelo: callAI não consulta getModelForTask
    expect(h.modelo).toHaveBeenCalledWith('emp-1', 'cenarios_b_integrador');
    expect(maxTokens).toBeGreaterThanOrEqual(8000);
    expect(opts).toMatchObject({ taskKey: 'cenarios_b_integrador', empresaId: 'emp-1' });

    const [g] = gravacoes();
    expect(g.op).toBe('insert');
    expect(g.payload).toMatchObject({ cargo: CARGO, competencia_id: null, tipo_cenario: 'cenario_b' });
    expect(g.payload.alternativas).toMatchObject({ cobertura_exata: true, competencias_integradas: COMPS });
  });

  it('o modelo escolhido na tela vale; o resto da config do picker não vai ao wrapper', async () => {
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida()));
    await roda({ aiConfig: { model: 'claude-sonnet-5-5' } });
    expect(h.callAI.mock.calls[0][2]).toEqual({ model: 'claude-sonnet-5-5' });
    expect(h.modelo).not.toHaveBeenCalled();
  });

  it('IDEMPOTENTE: se o fechamento destas competências já acharia um B, não chama a IA nem grava', async () => {
    const r0: any = normalizarCenarioBIntegrador(respostaValida(), COMPS, []);
    bRows = [{ id: 'b-ja', created_at: '2026-10-01T00:00:00Z', ...montarDadosCenarioBIntegrador(CARGO, COMPS, r0.cenario) }];
    const r: any = await roda();
    expect(r).toMatchObject({ ok: true, status: 'ja-existe', cenarioId: 'b-ja', perguntas: 5, tentativas: 0 });
    expect(h.callAI).not.toHaveBeenCalled();
    expect(gravacoes()).toHaveLength(0);
  });

  it('o B por célula de cada competência NÃO conta como integrador: gera mesmo assim', async () => {
    bRows = COMPS.map((_, i) => ({ id: `b-${i}`, titulo: 't', descricao: 'd', cargo: CARGO, competencia_id: `cp-${i}`, created_at: '2026-09-01T00:00:00Z', alternativas: { p1: 'x' } }));
    h.sbRaw = criarSupabaseMock({ lista: (t) => (t === 'banco_cenarios' ? bRows : t === 'competencias' ? COMPS.map((nome, i) => ({ id: `cp-${i}`, nome })) : []) });
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida()));
    const r: any = await roda();
    expect(r.status).toBe('gerado');
  });

  it('validação reprovada: UMA nova tentativa, com os erros no prompt, e só então grava', async () => {
    h.callAI
      .mockResolvedValueOnce(JSON.stringify(respostaValida({ perguntas: respostaValida().perguntas.slice(0, 3) })))
      .mockResolvedValueOnce(JSON.stringify(respostaValida()));
    const r: any = await roda();
    expect(r).toMatchObject({ ok: true, status: 'gerado', tentativas: 2 });
    expect(h.callAI).toHaveBeenCalledTimes(2);
    expect(h.callAI.mock.calls[1][1]).toContain('CORREÇÃO NECESSÁRIA');
    expect(h.callAI.mock.calls[1][1]).toContain('Faltam perguntas para: Gestão do Tempo, Resiliência');
    expect(gravacoes()).toHaveLength(1);
  });

  it('reprovada nas duas: NADA é gravado e o erro diz o que faltou (o admin vê)', async () => {
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida({ perguntas: respostaValida().perguntas.slice(0, 2) })));
    const r: any = await roda();
    expect(r).toMatchObject({ ok: false, motivo: 'validacao', tentativas: 2 });
    expect(r.erro).toContain('Faltam perguntas para: Liderança de Equipes, Gestão do Tempo, Resiliência');
    expect(h.callAI).toHaveBeenCalledTimes(2);
    expect(gravacoes()).toHaveLength(0);
  });

  it('resposta sem JSON conta como reprovação (e é tentada de novo)', async () => {
    h.callAI.mockResolvedValueOnce('desculpe, não consegui').mockResolvedValueOnce(JSON.stringify(respostaValida()));
    const r: any = await roda();
    expect(r.status).toBe('gerado');
    expect(h.callAI.mock.calls[1][1]).toContain('A resposta não trouxe um JSON de cenário');
  });

  it('a IA que lança vira erro visível, sem gravar e sem segunda cobrança', async () => {
    h.callAI.mockRejectedValue(new Error('overloaded'));
    const r: any = await roda();
    expect(r).toMatchObject({ ok: false, motivo: 'ia' });
    expect(r.erro).toContain('overloaded');
    expect(h.callAI).toHaveBeenCalledTimes(1);
    expect(gravacoes()).toHaveLength(0);
  });

  it('competência do Top 5 que não está na matriz do cargo: erro com o nome, ANTES de gastar IA', async () => {
    const r: any = await roda({ competencias: [...COMPS.slice(0, 4), 'Negociação'] });
    expect(r).toMatchObject({ ok: false, motivo: 'competencia-sem-matriz' });
    expect(r.erro).toContain('Negociação');
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('competência sem descritor na matriz: erro com o nome, sem IA', async () => {
    h.tdb = criarSupabaseMock({
      lista: (tabela, cols) => {
        if (tabela === 'competencias') {
          if (cols.includes('n1_gap')) return [];
          return COMPS.map((nome, i) => ({ id: `cp-${i}`, nome, cod_comp: `C0${i}`, cod_desc: null, cargo: CARGO }));
        }
        return [];
      },
    });
    h.contexto.mockResolvedValue({ ok: true, ctx: { empresa: { nome: 'Acme' }, comp: {}, descritores: [{ cod_desc: 'x' }], contextoPPP: '', valores: [], cargoDetalhe: {}, gabCIS: null } });
    const r: any = await roda();
    expect(r).toMatchObject({ ok: false, motivo: 'competencia-sem-descritores' });
    expect(r.erro).toContain('Planejamento');
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('falha de leitura da matriz LANÇA para o admin como erro, não vira "sem competência"', async () => {
    h.tdb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'pool esgotado' });
    const r: any = await roda();
    expect(r).toMatchObject({ ok: false, motivo: 'leitura' });
    expect(r.erro).toContain('pool esgotado');
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('falha ao gravar devolve o erro (o texto gerado e pago não some calado)', async () => {
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida()));
    h.tdb.falharEm({ tabela: 'banco_cenarios', op: 'insert', mensagem: 'violação de política' });
    const r: any = await roda();
    expect(r).toMatchObject({ ok: false, motivo: 'gravacao' });
    expect(r.erro).toContain('violação de política');
  });

  it('dois disparos ao mesmo tempo: se outro gravou enquanto este gerava, descarta o gerado (não há índice único para ele)', async () => {
    let leituras = 0;
    h.sbRaw = criarSupabaseMock({
      lista: (t) => {
        if (t !== 'banco_cenarios') return [];
        leituras++;
        if (leituras === 1) return [];
        const r0: any = normalizarCenarioBIntegrador(respostaValida(), COMPS, []);
        return [{ id: 'b-outro', created_at: '2026-10-04T12:00:00Z', ...montarDadosCenarioBIntegrador(CARGO, COMPS, r0.cenario) }];
      },
    });
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida()));
    const r: any = await roda();
    expect(r).toMatchObject({ ok: true, status: 'ja-existe', cenarioId: 'b-outro' });
    expect(gravacoes()).toHaveLength(0);
  });

  it('entrada inválida: sem cargo ou com uma competência só não chama nada', async () => {
    expect(await roda({ cargo: ' ' })).toMatchObject({ ok: false, motivo: 'entrada' });
    expect(await roda({ competencias: ['Comunicação', 'comunicação'] })).toMatchObject({ ok: false, motivo: 'entrada' });
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('SUBSTITUIR refaz o integrador no lugar: atualiza a MESMA linha, só depois de validar, e limpa as colunas p1..p4 que sobram', async () => {
    const r0: any = normalizarCenarioBIntegrador(respostaValida(), COMPS, []);
    bRows = [{ id: 'b-ja', created_at: '2026-10-01T00:00:00Z', ...montarDadosCenarioBIntegrador(CARGO, COMPS, r0.cenario) }];
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida({ titulo: 'Outro caso' })));
    const r: any = await roda({ substituir: true });
    expect(r).toMatchObject({ ok: true, status: 'gerado', cenarioId: 'b-ja' });
    const [g] = gravacoes();
    expect(g.op).toBe('update');
    expect(g.payload.titulo).toBe('Outro caso');
    expect(h.tdb.chamadas.some((c: any) => c.metodo === 'eq' && c.args[0] === 'id' && c.args[1] === 'b-ja')).toBe(true);
  });

  it('SUBSTITUIR sem integrador existente recusa (nada a substituir) e não gasta IA', async () => {
    const r: any = await roda({ substituir: true });
    expect(r.ok).toBe(false);
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('SUBSTITUIR com texto reprovado NÃO altera a linha existente', async () => {
    const r0: any = normalizarCenarioBIntegrador(respostaValida(), COMPS, []);
    bRows = [{ id: 'b-ja', created_at: '2026-10-01T00:00:00Z', ...montarDadosCenarioBIntegrador(CARGO, COMPS, r0.cenario) }];
    h.callAI.mockResolvedValue(JSON.stringify(respostaValida({ perguntas: [] })));
    const r: any = await roda({ substituir: true });
    expect(r.ok).toBe(false);
    expect(gravacoes()).toHaveLength(0);
  });
});

// ── Quem precisa de um integrador ───────────────────────────────────────────

describe('listarAlvosDoIntegrador', () => {
  const COLABS = [
    { id: 'c1', cargo: CARGO, programa_modo: null },
    { id: 'c2', cargo: CARGO, programa_modo: null },
    { id: 'c3', cargo: 'Gerente', programa_modo: 'jornada' },
  ];
  let sysConfig: any;
  let top5: Record<string, string[]>;
  let colabs: any[];

  function mocks() {
    h.sbRaw = criarSupabaseMock({
      resolver: (t) => (t === 'empresas' ? { sys_config: sysConfig } : null),
      lista: (t) => (t === 'banco_cenarios' ? bRows : []),
    });
    h.tdb = criarSupabaseMock({
      resolver: (t, _c, cadeia) => {
        if (t !== 'cargos_empresa') return null;
        const nome = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'nome')?.args[1] as string;
        return { top5_workshop: top5[nome] ?? [] };
      },
      lista: (t) => (t === 'colaboradores' ? colabs : []),
    });
  }

  beforeEach(() => {
    sysConfig = { programa_modo: 'onboarding' };
    top5 = { [CARGO]: COMPS, Gerente: COMPS };
    colabs = COLABS;
    mocks();
  });

  it('agrupa quem está em Onboarding por cargo e conta as pessoas; quem não está fica fora', async () => {
    const r: any = await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1');
    expect(r.ok).toBe(true);
    expect(r.pessoasOnboarding).toBe(2);
    expect(r.alvos).toEqual([{ cargo: CARGO, competencias: COMPS, pessoas: 2, jaTem: false, cenarioId: null }]);
    expect(r.avisos).toEqual([]);
  });

  it('"já tem" é a MESMA escolha do fechamento: o integrador de cobertura exata conta, o B por célula não', async () => {
    const r0: any = normalizarCenarioBIntegrador(respostaValida(), COMPS, []);
    bRows = [{ id: 'b-por-celula', titulo: 't', descricao: 'd', cargo: CARGO, competencia_id: 'cp-0', created_at: '2026-09-01T00:00:00Z', alternativas: { p1: 'x' } }];
    expect(((await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1')) as any).alvos[0].jaTem).toBe(false);
    bRows.push({ id: 'b-int', created_at: '2026-10-04T00:00:00Z', ...montarDadosCenarioBIntegrador(CARGO, COMPS, r0.cenario) });
    const r: any = await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1');
    expect(r.alvos[0]).toMatchObject({ jaTem: true, cenarioId: 'b-int' });
  });

  it('cargo cujas competências a geração recusaria vira AVISO com o motivo, não some', async () => {
    top5[CARGO] = ['A', 'B', 'C'];
    const r: any = await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1');
    expect(r.alvos).toEqual([]);
    expect(r.avisos.join(' ')).toContain(`Cargo "${CARGO}" (2 pessoa(s))`);
    expect(r.avisos.join(' ')).toContain('tem 3');
  });

  it('pessoa em Onboarding sem cargo é avisada, não ignorada em silêncio', async () => {
    colabs = [{ id: 'c9', cargo: null, programa_modo: null }, ...COLABS];
    mocks();
    const r: any = await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1');
    expect(r.avisos.join(' ')).toContain('1 pessoa(s) em Onboarding sem cargo');
  });

  it('empresa sem ninguém em Onboarding: lista vazia', async () => {
    sysConfig = { programa_modo: 'jornada' };
    colabs = COLABS.map((c) => ({ ...c, programa_modo: null }));
    mocks();
    const r: any = await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1');
    expect(r).toMatchObject({ ok: true, alvos: [], pessoasOnboarding: 0 });
  });

  it('o override de competências da config efetiva separa grupos do mesmo cargo', async () => {
    sysConfig = { programa_modo: 'onboarding', competencias_onboarding: ['Negociação'] };
    mocks();
    const r: any = await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1');
    expect(r.alvos[0].competencias).toEqual(['Negociação', ...COMPS.slice(0, 4)]);
  });

  it('falha de leitura volta como erro (não vira "ninguém em Onboarding")', async () => {
    h.tdb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout' });
    const r: any = await listarAlvosDoIntegrador(h.sbRaw.client, 'emp-1');
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('timeout');
  });
});
