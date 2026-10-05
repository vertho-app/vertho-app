/**
 * O documento público da proposta (`buildProposalDocument`) — o que o CLIENTE lê.
 *
 * Três propriedades que não podem ser perdidas:
 *
 *   1. 🔴 FRONTEIRA DE CUSTO. A partir de 14/09/2026 o documento mostra os
 *      números do programa (pessoas, cargos, ciclos, duração) e eles vêm dos
 *      jsonb `entradas`/`resultado` do orçamento — os MESMOS jsonb que carregam
 *      margem, custo por pessoa, custo de IA, preço de tabela e desconto máximo.
 *      A allowlist de `proposal-programa.ts` é a única porta. O caso abaixo usa
 *      a linha REAL do orçamento da PROP-2026-0008 (valores como estavam no
 *      banco), não uma fixture enxuta: fixture limpa não prova vedação nenhuma.
 *
 *   2. NÃO INVENTAR DESTINATÁRIO. Sem nome no CRM e sem `cliente_nome`, o nome
 *      sai `null` para a página omitir o bloco — o fallback 'Cliente' na capa de
 *      um contrato de sete dígitos era o que a PROP-2026-0008 mostrava.
 *
 *   3. CONTATO SEMPRE RESOLVIDO. Proposta sem RC e sem contato próprio ainda
 *      precisa dizer com quem falar.
 */
import { describe, expect, it } from 'vitest';
import { buildProposalDocument } from '@/lib/sales/proposal-document';
import { extrairProgramaDoOrcamento } from '@/lib/sales/proposal-programa';
import { validarAceite } from '@/lib/sales/proposal-aceite';

// Linha real de `orcamento_cenarios` da PROP-2026-0008 (14/09/2026).
const ORC_REAL = {
  entradas: {
    metodo: 'workshop',
    preset: 'atual',
    jornada: 'jornada',
    nColabs: 1000,
    nPerfis: 50,
    pricing: {
      cotacao: 5.12, custoHora: 500, descontoPct: 0, impostosPct: 20, precoCluster: 2000,
      horasWorkshop: 8, margemAlvoPct: 50, clientesAtivos: 2, contingenciaPct: 10,
      horasMatrizNova: 6, precoMatrizNova: 1000, precoSetupGeral: 2000,
      custoMsgUnitario: 0.035, horasImplantacao: 8, precoPessoaCiclo: 300,
      adicionalWorkshop: 15000, msgsPorPessoaCiclo: 25, horasMatrizAdaptada: 2,
      precoMatrizAdaptada: 500,
    },
    comAvatar: true,
    nClusters: 1,
    matrizNovas: 50,
    ciclosPorAno: 5,
    tipoComissao: 'consultor_integrador',
    conteudoColab: { case: 12, texto: 12, video: 12, podcast: 12 },
    auditarExtracao: true,
    nVideosExtraidos: 0,
  },
  resultado: {
    cargos: 50, ciclos: 5, jornada: 'jornada', parcela: 156900, pessoas: 1000,
    desconto: 0, parcelas: 10, unidades: 1,
    margemAbs: 939528.72144, margemPct: 59.88073431739962,
    piorSaldo: { mes: 1, saldo: -66197.55974800003 },
    custoIABrl: 120615.5296, valorFinal: 1569000, acimaDoPiso: false,
    valorTabela: 1569000, custoTotalBrl: 629471.27856, mesesPrograma: 8,
    descontoMaxPct: 32.93578105799872, custoPorPessoaBrl: 629.47127856,
    custoOperacionalBrl: 286973.8896, investimentoPorPessoaBrl: 1569,
  },
};

/**
 * O que pode atravessar a fronteira. Tudo o mais que existir nos dois jsonb —
 * chave ou valor — é interno.
 *
 * Testar por palavra solta ("custo") daria falso positivo bobo: "Customizações"
 * contém "custo". A régua aqui é a CHAVE do jsonb e o VALOR numérico, que é o
 * que de fato vazaria.
 */
const CHAVES_PERMITIDAS = new Set([
  'pessoas', 'cargos', 'ciclos', 'unidades', 'mesesPrograma',
  'jornada', 'conteudoColab', 'video', 'podcast', 'texto', 'case',
  // Só a CONTAGEM de acessos por simulador (17/09/2026). O preço do simulador
  // mora em `entradas.pricing` e continua de fora.
  'simuladores', 'vendas', 'atendimento', 'lideranca',
]);

/** Toda chave e todo número dos dois jsonb, recursivamente. */
function varrerJsonb(no: unknown, chaves: Set<string>, numeros: Set<number>) {
  if (Array.isArray(no)) {
    for (const item of no) varrerJsonb(item, chaves, numeros);
    return;
  }
  if (no && typeof no === 'object') {
    for (const [k, v] of Object.entries(no)) {
      chaves.add(k);
      varrerJsonb(v, chaves, numeros);
    }
    return;
  }
  if (typeof no === 'number') numeros.add(no);
}

function propostaBase(over: Record<string, any> = {}) {
  return {
    proposal_number: 'PROP-2026-0008',
    created_at: '2026-09-14T22:43:10.682Z',
    approved_at: '2026-09-14T23:15:58.924Z',
    status: 'approved',
    customer_type: 'empresa',
    cliente_nome: null,
    product_package: 'onboarding',
    number_of_users: 1000,
    number_of_roles_mapped: 50,
    monthly_value: 156900,
    contract_duration_months: 10,
    total_contract_value: 1569000,
    payment_terms: '10 parcelas de R$ 156.900,00',
    discount_requested: 0,
    included_scope: 'Programa Jornada de 7 semanas · 5 ciclos\n1000 pessoas · 1 unidade · 50 cargos mapeados por workshop',
    commercial_notes: null,
    ...over,
  } as any;
}

describe('fronteira de custo do documento público', () => {
  it('extrai só os números do programa — nada de margem, custo ou preço interno', () => {
    const pg = extrairProgramaDoOrcamento(ORC_REAL);

    // Positivo: os números que o cliente PRECISA ver chegaram certos.
    expect(pg).toEqual({
      pessoas: 1000,
      cargos: 50,
      ciclos: 5,
      unidades: 1,
      semanasPorCiclo: 7,          // PROGRAMA_JORNADA
      // 5 ciclos × 2 meses = 10 meses. O jsonb gravou 8 (conta antiga por
      // semanas) e NÃO pode vencer: a duração sai dos ciclos.
      mesesPrograma: 10,
      simuladores: null,           // este orçamento não tem simulador
    });

    // Negativo: o objeto tem EXATAMENTE essas chaves — uma chave a mais aqui
    // seria um campo do orçamento passando junto sem ninguém perceber.
    expect(Object.keys(pg!).sort()).toEqual([
      'cargos', 'ciclos', 'mesesPrograma',
      'pessoas', 'semanasPorCiclo', 'simuladores', 'unidades',
    ]);
  });

  it('nenhuma chave nem número interno do orçamento aparece no VM serializado', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, { orcamento: ORC_REAL });
    const serializado = JSON.stringify(doc);

    const chaves = new Set<string>();
    const numeros = new Set<number>();
    varrerJsonb(ORC_REAL, chaves, numeros);

    // A varredura precisa ter encontrado algo — senão o teste passa por vazio.
    expect(chaves.size).toBeGreaterThan(30);

    const vazadas = [...chaves].filter((k) => !CHAVES_PERMITIDAS.has(k) && serializado.includes(`"${k}"`));
    expect(vazadas).toEqual([]);

    // Números internos: margem, custo, preço de tabela, pior saldo de caixa.
    // O filtro pega fracionários e valores grandes — são esses que identificam
    // a precificação. Inteiros pequenos (20% de imposto, 6 horas de matriz)
    // ficam de fora porque `includes('20')` casaria com "2026" na data e o
    // teste viraria ruído. `1569` idem: o documento MOSTRA R$ 1.569 por
    // participante, derivado de total ÷ pessoas — dado público, não segredo.
    const publicos = new Set([1569000, 156900]);
    const numerosVazados = [...numeros]
      .filter((n) => !Number.isInteger(n) || Math.abs(n) >= 10_000)
      .filter((n) => !publicos.has(n))
      .filter((n) => serializado.includes(String(n)));
    expect(numerosVazados).toEqual([]);

    // ... e o que deveria estar, está: a asserção de ausência sozinha passaria
    // num VM vazio.
    expect(doc.programa?.pessoas).toBe(1000);
    expect(doc.investimento.total).toBe(1569000);
  });

  it('campo NOVO no jsonb do orçamento não vaza por tabela nova', () => {
    const comCampoNovo = {
      entradas: { ...ORC_REAL.entradas, margemNovaMetrica: 777777 },
      resultado: { ...ORC_REAL.resultado, custoSecretoNovo: 888888 },
    };
    const doc = buildProposalDocument(propostaBase(), null, null, { orcamento: comCampoNovo });
    const serializado = JSON.stringify(doc);
    expect(serializado).not.toContain('777777');
    expect(serializado).not.toContain('888888');
  });

  it('jornada desconhecida não vira promessa de 14 semanas', () => {
    // `getProgramaConfigByModo` é fail-safe e devolve o padrão do motor (a
    // Jornada, desde 03/10/2026) para chave desconhecida. Num documento
    // comercial isso seria uma promessa que ninguém precificou: aqui tem que
    // sair null.
    const pg = extrairProgramaDoOrcamento({
      entradas: { jornada: 'jornada_que_nao_existe_mais', conteudoColab: {} },
      resultado: { pessoas: 10, cargos: 2, ciclos: 1, unidades: 1, mesesPrograma: 3 },
    });
    expect(pg?.semanasPorCiclo).toBeNull();
    expect(pg?.pessoas).toBe(10);
  });

  it('a duração customizada soma as competências em sequência, cada uma com o seu fechamento', () => {
    // 6 semanas por competência, 2 competências: duas trilhas de 6 (ou 7 com o fechamento).
    for (const fechamento of [false, true]) {
      const pg = extrairProgramaDoOrcamento({
        entradas: { jornada: 'custom', jornadaCustom: { semanas: 6, numCompetencias: 2, fechamento } },
        resultado: { pessoas: 10, cargos: 2, ciclos: 1, unidades: 1 },
      });
      expect(pg?.semanasPorCiclo).toBe(fechamento ? 14 : 12);
    }
    expect(extrairProgramaDoOrcamento({
      entradas: { jornada: 'custom', jornadaCustom: { semanas: 3, numCompetencias: 1, fechamento: true } },
      resultado: { pessoas: 10 },
    })?.semanasPorCiclo).toBe(4);
    expect(extrairProgramaDoOrcamento({
      entradas: { jornada: 'custom', jornadaCustom: { semanas: 99 } },
      resultado: { pessoas: 10 },
    })?.semanasPorCiclo).toBeNull();
  });

  it('sem orçamento vinculado, o programa é null (fluxo do RC)', () => {
    expect(extrairProgramaDoOrcamento(null)).toBeNull();
    expect(extrairProgramaDoOrcamento({ entradas: {}, resultado: {} })).toBeNull();
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    expect(doc.programa).toBeNull();
    expect(doc.investimento.vendidoPorProjeto).toBe(false);
  });
});

describe('destinatário e investimento', () => {
  it('sem conta e sem cliente_nome, o nome sai null (a página omite o bloco)', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, { orcamento: ORC_REAL });
    expect(doc.cliente.nome).toBeNull();
  });

  it('a capa não escreve o tipo do cliente depois do nome ("· Empresa", "· Escola")', () => {
    // Pedido do dono em 05/10/2026, vendo a capa da PROP-2026-0010. O VM nem carrega
    // mais o campo: sem consumidor, ele voltaria à capa na primeira edição distraída.
    for (const tipo of ['empresa', 'escola', 'rede_ensino', 'comercio']) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo, cliente_nome: 'Bluefit' }), null, null, {});
      expect(doc.cliente, tipo).toEqual({ nome: 'Bluefit' });
      expect(JSON.stringify(doc.cliente), tipo).not.toMatch(/Empresa|Escola|ensino|Com[ée]rcio/i);
    }
  });

  it('nome em branco no banco também vira null, não string vazia na capa', () => {
    const doc = buildProposalDocument(propostaBase({ cliente_nome: '   ' }), { legal_name: '', trade_name: null }, null, {});
    expect(doc.cliente.nome).toBeNull();
  });

  it('conta do CRM tem precedência sobre o texto livre', () => {
    const doc = buildProposalDocument(
      propostaBase({ cliente_nome: 'Digitado no deal desk' }),
      { legal_name: 'Futuro S.A.', trade_name: 'Futuro' },
      null,
      {},
    );
    expect(doc.cliente.nome).toBe('Futuro');
  });

  it('investimento por participante = total ÷ pessoas', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, { orcamento: ORC_REAL });
    expect(doc.investimento.porPessoa).toBe(1569);
    expect(doc.investimento.vendidoPorProjeto).toBe(true);
  });

  it('sem participantes não se inventa um valor por pessoa', () => {
    const doc = buildProposalDocument(propostaBase({ number_of_users: null }), null, null, {});
    expect(doc.investimento.porPessoa).toBeNull();
  });
});

describe('contato do documento', () => {
  const REP = { name: 'Mariana Costa', email: 'mariana@vertho.ai', phone: '5511988887777' };

  it('contato da própria proposta vence o representante', () => {
    const doc = buildProposalDocument(
      propostaBase({ contact_name: 'Rodrigo Naves', contact_email: 'rodrigo@vertho.ai', contact_phone: '5511911807809' }),
      null, REP, {},
    );
    expect(doc.contato).toEqual({
      nome: 'Rodrigo Naves', email: 'rodrigo@vertho.ai', whatsapp: '5511911807809', origem: 'proposta',
    });
  });

  it('sem contato próprio, usa o representante', () => {
    const doc = buildProposalDocument(propostaBase(), null, REP, {});
    expect(doc.contato.origem).toBe('representante');
    expect(doc.contato.email).toBe('mariana@vertho.ai');
  });

  it('sem nenhum dos dois, cai nos canais públicos da Vertho — nunca em branco', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    expect(doc.contato.origem).toBe('institucional');
    expect(doc.contato.email).toBe('contato@vertho.ai');
    expect(doc.contato.whatsapp).toBeTruthy();
  });
});

describe('aceite', () => {
  it('proposta aprovada e dentro da validade pode ser aceita', () => {
    const doc = buildProposalDocument(
      propostaBase({ approved_at: new Date().toISOString() }), null, null, {},
    );
    expect(doc.podeAceitar).toBe(true);
    expect(doc.aceite).toBeNull();
  });


  it('proposta COM representante não é aceita pelo link — o aceite dele fecha oportunidade e comissão', () => {
    // `markProposalAccepted` fecha a oportunidade como ganha, ativa a conta e
    // materializa os eventos de comissão. Um carimbo vindo do link público
    // pularia os três, em silêncio.
    const doc = buildProposalDocument(
      propostaBase({ representante_id: 'rc-1', approved_at: new Date().toISOString() }),
      null, null, {},
    );
    expect(doc.podeAceitar).toBe(false);
  });

  it('proposta expirada não pode ser aceita pela página', () => {
    const velha = new Date(Date.now() - 60 * 86400_000).toISOString();
    const doc = buildProposalDocument(propostaBase({ approved_at: velha }), null, null, {});
    expect(doc.expirada).toBe(true);
    expect(doc.podeAceitar).toBe(false);
  });

  it('rascunho não pode ser aceito nem que o link vaze', () => {
    const doc = buildProposalDocument(
      propostaBase({ status: 'draft', approved_at: new Date().toISOString() }), null, null, {},
    );
    expect(doc.podeAceitar).toBe(false);
  });

  it('aceite já registrado aparece com quem assinou', () => {
    const doc = buildProposalDocument(
      propostaBase({
        status: 'accepted',
        accepted_at: '2026-09-15T13:00:00.000Z',
        accepted_by_name: 'Ana Prado',
        accepted_by_role: 'Diretora de RH',
      }),
      null, null, {},
    );
    expect(doc.aceite).toEqual({ nome: 'Ana Prado', cargo: 'Diretora de RH', em: '2026-09-15T13:00:00.000Z' });
    expect(doc.podeAceitar).toBe(false);
  });

  it('validação exige nome, cargo e e-mail plausível', () => {
    expect(validarAceite({ nome: 'Ana Prado', cargo: 'RH', email: 'ana@empresa.com.br' }))
      .toEqual({ ok: true, valor: { nome: 'Ana Prado', cargo: 'RH', email: 'ana@empresa.com.br' } });

    expect(validarAceite({ nome: 'A', cargo: 'RH', email: 'ana@empresa.com' })).toMatchObject({ campo: 'nome' });
    expect(validarAceite({ nome: 'Ana Prado', cargo: '', email: 'ana@empresa.com' })).toMatchObject({ campo: 'cargo' });
    expect(validarAceite({ nome: 'Ana Prado', cargo: 'RH', email: 'ana@empresa' })).toMatchObject({ campo: 'email' });
    expect(validarAceite({ nome: 'Ana Prado', cargo: 'RH', email: '' })).toMatchObject({ campo: 'email' });
  });

  it('normaliza espaços e caixa antes de gravar', () => {
    const r = validarAceite({ nome: '  Ana   Prado ', cargo: ' Diretora ', email: ' ANA@Empresa.COM.br ' });
    expect(r).toEqual({ ok: true, valor: { nome: 'Ana Prado', cargo: 'Diretora', email: 'ana@empresa.com.br' } });
  });
});

describe('conteúdo institucional', () => {
  it('o que é PROMETIDO não cita bloco off-line (Pulso saiu do ar em 31/08/2026)', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, { orcamento: ORC_REAL });
    // Só o que o documento promete entregar. `naoIncluso` fica de fora de
    // propósito: lá "eNPS" e "nine-box" aparecem para NEGAR, que é o certo.
    const prometido = JSON.stringify([
      doc.entregas, doc.paraPessoa, doc.paraInstituicao, doc.cronograma, doc.pilares,
    ]).toLowerCase();
    expect(prometido).not.toContain('pulso');
    expect(prometido).not.toContain('enps');
    expect(prometido).not.toContain('nine-box');
    expect(prometido).not.toContain('seleção de pessoas');
  });

  it('o "não incluso" continua negando avaliação de desempenho e ATS', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    const naoIncluso = doc.naoIncluso.join(' ').toLowerCase();
    expect(naoIncluso).toContain('nine-box');
    expect(naoIncluso).toContain('ats');
    expect(naoIncluso).toContain('enps');
  });

  it('todas as seções institucionais têm conteúdo (o documento nunca fica esquelético)', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    expect(doc.pilares.length).toBe(3);
    expect(doc.entregas.length).toBeGreaterThanOrEqual(6);
    expect(doc.paraPessoa.length).toBeGreaterThanOrEqual(4);
    expect(doc.paraInstituicao.length).toBeGreaterThanOrEqual(4);
    expect(doc.cronograma.length).toBeGreaterThanOrEqual(4);
    expect(doc.cronograma.every((e) => e.descricao.length > 20)).toBe(true);
  });
});

/**
 * Revisão de 02/10/2026: o texto institucional prometia o que o produto não entrega.
 * Cada caso abaixo é uma frase que chegou ao cliente pela página e pelo PDF.
 */
describe('o que a proposta promete existe no produto (revisão de 02/10/2026)', () => {
  const prometidoDe = (doc: ReturnType<typeof buildProposalDocument>) => JSON.stringify([
    doc.entregas, doc.paraPessoa, doc.paraInstituicao, doc.cronograma, doc.pilares,
  ]).toLowerCase();

  it('não promete Plenária nem Dossiê do Gestor, que nunca foram gerados (R-12)', () => {
    const prometido = prometidoDe(buildProposalDocument(propostaBase(), null, null, {}));
    expect(prometido).not.toContain('plenária');
    expect(prometido).not.toContain('dossiê');
    expect(prometido).toContain('relatório do gestor');
    expect(prometido).toContain('pdf executivo de fim de jornada');
  });

  it('mostra nível e avanço, nunca nota nem delta (R-24)', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    const prometido = prometidoDe(doc);
    expect(prometido).not.toContain('nota final');
    expect(prometido).not.toContain('sustenta a nota');
    expect(prometido).not.toContain('delta');
    expect(doc.pilares[2].texto).toContain('o nível de partida');
    expect(doc.pilares[2].texto).toContain('o avanço em cada comportamento');
  });

  it('a dupla IA fica onde ela roda: mapeamento, PDI e cenários (R-133)', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    const prometido = prometidoDe(doc);
    expect(prometido).not.toContain('nunca sai de um único julgamento');
    expect(prometido).not.toContain('cada avaliação crítica');
    expect(doc.pilares[0].texto).toContain('No mapeamento, no PDI e na geração dos cenários, uma segunda IA');
  });

  it('o mapeamento se chama mapeamento, não avaliação (R-50)', () => {
    const prometido = prometidoDe(buildProposalDocument(propostaBase(), null, null, {}));
    expect(prometido).not.toContain('avaliação por cenários');
    expect(prometido).toContain('mapeamento por cenários');
  });

  it('o texto que vai ao cliente não usa travessão', () => {
    for (const tipo of ['escola', 'empresa']) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo }), null, null, {});
      expect(prometidoDe(doc), tipo).not.toMatch(/[–—]/);
    }
  });
});

describe('blocos vindos dos decks de venda (17/09/2026)', () => {
  it('escola e rede de ensino leem a versão de educação; o resto, a corporativa', () => {
    for (const tipo of ['escola', 'rede_ensino']) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo }), null, null, {});
      expect(doc.segmento, tipo).toBe('educacao');
      expect(doc.cenario.rotulo).toMatch(/Coordenação/);
      expect(doc.personalizacao.pessoas.map((p) => p.nome)).toContain('Professora A');
      expect(doc.gestao.niveis).toMatch(/escola/);
    }
    for (const tipo of ['empresa', 'comercio', 'outro', null]) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo }), null, null, {});
      expect(doc.segmento, String(tipo)).toBe('corporativo');
      expect(doc.cenario.rotulo).toMatch(/Gerente de loja/);
      expect(doc.personalizacao.pessoas.map((p) => p.nome)).toContain('Pessoa A');
      expect(doc.gestao.niveis).toMatch(/organização/);
    }
  });

  it('o cenário tem as 4 perguntas abertas que o produto gera (p1 a p4)', () => {
    // Cada segmento rotula as quatro com o que o seu caso testa: o da educação segue
    // os rótulos do deck; o corporativo, desde 05/10/2026, usa os descritores da
    // competência com que o caso foi gerado (ver `CENARIO` em proposal-document.ts).
    const rotulos: Record<string, string[]> = {
      escola: ['Escolha', 'Execução', 'Tensão humana', 'Sustentação'],
      empresa: ['Abertura', 'Divergência', 'Acordo', 'Continuidade'],
    };
    for (const tipo of ['escola', 'empresa']) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo }), null, null, {});
      expect(doc.cenario.perguntas.map((q) => q.nome), tipo).toEqual(rotulos[tipo]);
      // Pergunta aberta e que pergunta: o instrumento não tem múltipla escolha.
      expect(doc.cenario.perguntas.every((q) => q.pergunta.includes('?')), tipo).toBe(true);
    }
  });

  it('o PDI aparece nas entregas e no que cada participante recebe', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    expect(doc.entregas.map((e) => e.titulo)).toContain('Plano de Desenvolvimento Individual (PDI)');
    expect(doc.paraPessoa.some((i) => /\bPDI\b/.test(i))).toBe(true);
  });

  it('os três fundadores vêm com foto e bio', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {});
    expect(doc.fundadores.map((f) => f.nome)).toEqual(['Samuel Protetti', 'Juliane Cavalcante', 'Rodrigo Naves']);
    expect(doc.fundadores.every((f) => f.arquivo.endsWith('.jpg') && f.bio.length > 40)).toBe(true);
  });

  it('o texto novo não usa glifo que a fonte do PDF não tem nem traz os erros dos decks', () => {
    for (const tipo of ['escola', 'empresa']) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo }), null, null, {});
      const texto = JSON.stringify([doc.curadoria, doc.cenario, doc.personalizacao, doc.fundadores, doc.gestao]);
      expect(texto).not.toMatch(/[→←✓✔✗✘✕≥≤●★]/);
      expect(texto).not.toMatch(/diferençação|não sala|expedicação/);
    }
  });
});

describe('simuladores incluídos (17/09/2026)', () => {
  const comSimuladores = (simuladores: any, preco = 37.5) => ({
    ...ORC_REAL,
    entradas: {
      ...(ORC_REAL as any).entradas,
      simuladores,
      // As duas formas que o jsonb tem: a de antes de 02/10 (um preço só, em
      // `pricing`) e a régua por simulador. Nenhuma das duas pode chegar ao documento.
      pricing: { ...(ORC_REAL as any).entradas.pricing, precoSimuladorPessoaCiclo: preco },
      configSimuladores: {
        vendas: { precoPessoaCiclo: preco, treinosPessoaCiclo: 6, turnosPorTreino: 8, custoFixoTreinoUsd: 0.1, custoTurnoUsd: 0.0075 },
        atendimento: { precoPessoaCiclo: preco, treinosPessoaCiclo: 6, turnosPorTreino: 8, custoFixoTreinoUsd: 0.166, custoTurnoUsd: 0.0069 },
        lideranca: { precoPessoaCiclo: preco, treinosPessoaCiclo: 5, turnosPorTreino: 8, custoFixoTreinoUsd: 0.09, custoTurnoUsd: 0.005 },
      },
    },
  });

  it('cada simulador com acesso vira um cartão, com a contagem do orçamento', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {
      orcamento: comSimuladores({ vendas: 100, atendimento: 0, lideranca: 100 }),
    });
    expect(doc.simuladores.map((x) => [x.nome, x.pessoas])).toEqual([
      ['Simulador de vendas', 100],
      ['Simulador de liderança', 100],
    ]);
    expect(doc.simuladores.every((x) => x.descricao.length > 60)).toBe(true);
  });

  it('sem simulador no orçamento (ou sem orçamento) a seção some', () => {
    expect(buildProposalDocument(propostaBase(), null, null, { orcamento: ORC_REAL }).simuladores).toEqual([]);
    expect(buildProposalDocument(propostaBase(), null, null, {}).simuladores).toEqual([]);
  });

  it('acesso nunca passa das pessoas do programa, e lixo no jsonb vira zero', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {
      orcamento: comSimuladores({ vendas: 5000, atendimento: 'x', lideranca: -2, extra: 9 }),
    });
    expect(doc.simuladores.map((x) => [x.nome, x.pessoas])).toEqual([['Simulador de vendas', 1000]]);
  });

  it('o preço do simulador não chega ao documento', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {
      orcamento: comSimuladores({ vendas: 100, atendimento: 0, lideranca: 0 }, 37.5),
    });
    const serializado = JSON.stringify(doc);
    expect(serializado).not.toContain('37.5');
    expect(serializado).not.toContain('precoSimulador');
    expect(serializado).not.toContain('precoPessoaCiclo');
    expect(serializado).not.toContain('custoFixoTreinoUsd');
  });

  it('nenhum simulador promete revisão humana, extinta em 22/09/2026 (R-04)', () => {
    const doc = buildProposalDocument(propostaBase(), null, null, {
      orcamento: comSimuladores({ vendas: 100, atendimento: 100, lideranca: 100 }),
    });
    expect(doc.simuladores).toHaveLength(3);
    for (const s of doc.simuladores) {
      expect(s.descricao.toLowerCase(), s.nome).not.toContain('revisão humana');
      expect(s.descricao, s.nome).not.toMatch(/[–—]/);
    }
    const atendimento = doc.simuladores.find((s) => s.nome === 'Simulador de atendimento');
    expect(atendimento?.descricao).toContain('fala literal da pessoa');
  });
});

describe('linguagem por segmento e cenário do gerente de loja (05/10/2026)', () => {
  // Os três simuladores ligados: o de atendimento era um dos textos que diziam
  // "instituição" para uma empresa.
  const orcComSimuladores = {
    ...ORC_REAL,
    entradas: { ...(ORC_REAL as any).entradas, simuladores: { vendas: 100, atendimento: 100, lideranca: 100 } },
  };
  /** Todo texto corrido do documento, menos o escopo (que é dado digitado, não texto da casa). */
  const textoDaCasa = (doc: ReturnType<typeof buildProposalDocument>) => JSON.stringify([
    doc.termos, doc.entregas, doc.paraPessoa, doc.paraInstituicao, doc.cronograma, doc.pilares,
    doc.curadoria, doc.cenario, doc.personalizacao, doc.gestao, doc.naoIncluso, doc.premissas,
    doc.proximosPassos, doc.simuladores,
  ]);

  it('empresa não lê "instituição" em lugar nenhum: uma rede de academias leu "A instituição recebe"', () => {
    for (const tipo of ['empresa', 'comercio', 'outro', null]) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo }), null, null, { orcamento: orcComSimuladores });
      expect(textoDaCasa(doc), String(tipo)).not.toMatch(/institui[çc][ãa]o|institui[çc][õo]es/i);
    }
  });

  it('escola e rede de ensino seguem dizendo "instituição": a palavra é deles', () => {
    for (const tipo of ['escola', 'rede_ensino']) {
      const doc = buildProposalDocument(propostaBase({ customer_type: tipo }), null, null, { orcamento: orcComSimuladores });
      expect(doc.termos.entidade, tipo).toBe('instituição');
      expect(doc.entregas[0].texto, tipo).toContain('Subdomínio próprio da instituição');
      expect(doc.cronograma[0].descricao, tipo).toContain('identidade visual da instituição');
      expect(doc.simuladores.find((s) => s.nome === 'Simulador de atendimento')?.descricao, tipo).toContain('a instituição pode adaptar');
    }
  });

  it('com nome, o quadro "Quem recebe o quê" e o aceite nomeiam o cliente, sem artigo', () => {
    const doc = buildProposalDocument(propostaBase({ customer_type: 'empresa', cliente_nome: 'Bluefit' }), null, null, {});
    expect(doc.cliente.nome).toBe('Bluefit');
    expect(doc.termos.colunaCliente).toBe('Bluefit recebe');
    expect(doc.termos.emNomeDe).toBe('de Bluefit');
    // O artigo de uma marca não se deduz ("a Bluefit", "o Itaú"): o título do
    // quadro e o texto corrido ficam no substantivo genérico, nunca em "da Bluefit".
    expect(doc.termos.tituloQuemRecebe).toBe('Para cada pessoa, e para a empresa');
    expect(doc.termos.deEntidade).toBe('da empresa');
    expect(JSON.stringify(doc.termos)).not.toMatch(/\b(da|do|para a|para o) Bluefit/);
  });

  it('sem nome, os mesmos campos caem no substantivo do segmento', () => {
    const emp = buildProposalDocument(propostaBase({ customer_type: 'empresa', cliente_nome: null }), null, null, {});
    expect(emp.termos).toEqual({
      entidade: 'empresa', deEntidade: 'da empresa', tituloQuemRecebe: 'Para cada pessoa, e para a empresa',
      colunaCliente: 'A empresa recebe', emNomeDe: 'da empresa',
    });
    const esc = buildProposalDocument(propostaBase({ customer_type: 'escola', cliente_nome: null }), null, null, {});
    expect(esc.termos.colunaCliente).toBe('A instituição recebe');
    expect(esc.termos.emNomeDe).toBe('da instituição');
  });

  it('o nome da conta do CRM vence o texto livre, também nos termos', () => {
    const doc = buildProposalDocument(
      propostaBase({ customer_type: 'empresa', cliente_nome: 'texto livre' }),
      { legal_name: 'Bluefit Academias S.A.', trade_name: 'Bluefit' }, null, {},
    );
    expect(doc.termos.colunaCliente).toBe('Bluefit recebe');
  });

  describe('o exemplo corporativo é um caso de gerente de loja', () => {
    const cen = () => buildProposalDocument(propostaBase({ customer_type: 'empresa' }), null, null, {}).cenario;

    it('não é mais o de expedição de caminhões, que chegou a uma rede de academias', () => {
      const texto = JSON.stringify(cen());
      expect(texto).not.toMatch(/caminh[ãõ]|expedi[çc]|confer[êe]ncia dupla|conferentes|Diego|Renata/i);
      expect(cen().rotulo).toBe('Cenário · Gerente de loja');
      // O rótulo vai em caixa alta e espaçada numa coluna estreita do PDF: passou de
      // 33 caracteres, quebra e deixa uma palavra sozinha na segunda linha.
      expect(cen().rotulo.length).toBeLessThanOrEqual(33);
      expect(cen().situacao).toMatch(/unidade da rede/);
    });

    it('respeita os limites do instrumento (os do prompt da IA3): contexto ≤ 900, pergunta ≤ 200, 4 perguntas, 2 nomes', () => {
      const { situacao, perguntas } = cen();
      expect(situacao.length).toBeLessThanOrEqual(900);
      expect(perguntas).toHaveLength(4);
      for (const q of perguntas) expect(q.pergunta.length, q.nome).toBeLessThanOrEqual(200);
      // Máx. 2 stakeholders nomeados: Rafael e Camila.
      const nomes = new Set(`${situacao} ${perguntas.map((q) => q.pergunta).join(' ')}`.match(/\b(Rafael|Camila|Diego|Renata|Marcos|Ana|João|Maria)\b/g));
      expect([...nomes].sort()).toEqual(['Camila', 'Rafael']);
    });

    it('não nomeia empresa nem cidade reais (anonimização da IA3) e não cita travessão', () => {
      const texto = JSON.stringify(cen());
      expect(texto).not.toMatch(/Bluefit|Smart Fit|Selfit|Bodytech|Gympass|Wellhub|Amazon|ACME|Boehringer/i);
      expect(texto).not.toMatch(/[–—]/);
    });

    it('diz que é um exemplo: o cliente não confunde com o cenário dele', () => {
      expect(cen().fechamento).toMatch(/este caso é só um exemplo/);
    });
  });
});

describe('"meses de programa" na capa é o número de prestações (05/10/2026)', () => {
  // A PROP-2026-0010: 5 ciclos × 2 = 10 meses de programa, e 11 parcelas pela regra de
  // 02/10 (uma além do programa). A capa dizia "10 meses de programa" e o investimento
  // "11×"; o dono pediu que os dois números sejam o mesmo.
  const orc5Ciclos = { entradas: (ORC_REAL as any).entradas, resultado: (ORC_REAL as any).resultado };

  it('com 11 parcelas, a capa mostra 11, não os 10 que saem dos ciclos', () => {
    const doc = buildProposalDocument(propostaBase({ contract_duration_months: 11 }), null, null, { orcamento: orc5Ciclos });
    expect(extrairProgramaDoOrcamento(orc5Ciclos)?.mesesPrograma).toBe(10);
    expect(doc.programa?.mesesPrograma).toBe(11);
    expect(doc.investimento.meses).toBe(11);
    expect(doc.programa?.mesesPrograma).toBe(doc.investimento.meses);
  });

  it('acompanha a proposta em qualquer número de parcelas: é a mesma fonte do cartão "Parcelas"', () => {
    for (const parcelas of [1, 2, 3, 10, 11, 25]) {
      const doc = buildProposalDocument(propostaBase({ contract_duration_months: parcelas }), null, null, { orcamento: orc5Ciclos });
      expect(doc.programa?.mesesPrograma, `${parcelas} parcelas`).toBe(parcelas);
    }
  });

  it('parcelas ausentes ou inválidas não apagam a duração: cai nos ciclos', () => {
    for (const lixo of [null, undefined, 0, -3, 2.5, 'x']) {
      const doc = buildProposalDocument(propostaBase({ contract_duration_months: lixo }), null, null, { orcamento: orc5Ciclos });
      expect(doc.programa?.mesesPrograma, String(lixo)).toBe(10);
    }
  });

  it('só troca a duração: os demais números do programa seguem os do orçamento', () => {
    const doc = buildProposalDocument(propostaBase({ contract_duration_months: 11 }), null, null, { orcamento: orc5Ciclos });
    expect(doc.programa).toMatchObject({ pessoas: 1000, cargos: 50, ciclos: 5, unidades: 1, semanasPorCiclo: 7 });
  });

  it('sem orçamento (fluxo do RC) continua sem programa: nada de duração inventada', () => {
    const doc = buildProposalDocument(propostaBase({ contract_duration_months: 11 }), null, null, {});
    expect(doc.programa).toBeNull();
  });
});
