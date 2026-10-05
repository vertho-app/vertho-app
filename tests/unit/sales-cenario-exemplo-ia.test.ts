/**
 * Núcleo de geração do exemplo de cenário (`lib/sales/cenario-exemplo-ia.ts`).
 *
 * Não chama IA de verdade: `callAI` é substituído e CAPTURA o que seria enviado. O que se
 * prova é o que este arquivo existe para garantir:
 *
 *  · é o MESMO prompt da IA3 (o de sistema não é tocado), com o entorno trocado: sem tenant,
 *    sem nome de empresa real, ficha só se foi colada;
 *  · as tasks são `ia3_cenarios` (gera) e `ia3_check` (audita, outra família), sem `empresaId`;
 *  · uma rodada por chamada, e o feedback do auditor só entra na rodada seguinte;
 *  · o que a IA devolve passa por validação de formato e de tamanho ANTES de virar texto de cliente,
 *    e nada fora do formato chega ao exemplo gravado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Chamada = { system: string; user: string; aiConfig: any; maxTokens: number; options: any };
const chamadas: Chamada[] = [];
let respostas: string[] = [];

vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (system: string, user: string, aiConfig: any, maxTokens: number, options: any) => {
    chamadas.push({ system, user, aiConfig, maxTokens, options });
    const r = respostas.shift();
    if (r === undefined) throw new Error('SENTINELA: callAI chamado a mais');
    return r;
  }),
}));

vi.mock('@/lib/ai-tasks', async (orig) => ({
  ...(await orig<typeof import('@/lib/ai-tasks')>()),
  getModelForTask: vi.fn(async (_empresa: unknown, task: string) => (task === 'ia3_check' ? 'gpt-5.6-terra' : 'claude-sonnet-5-5')),
}));

import { getModelForTask } from '@/lib/ai-tasks';
import { buildIA3SystemPrompt, buildCheckIA3SystemPrompt } from '@/lib/ia3-cenarios';
import { gerarRodadaExemplo } from '@/lib/sales/cenario-exemplo-ia';
import { validarEntradaGeracao, LIMITES_EXEMPLO } from '@/lib/sales/cenario-exemplo';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';

const PERGUNTAS = [
  { numero: 1, texto: 'Como você abre a conversa com Rafael? Diga quando, onde e que fato cita.', descritores_primarios: [1, 2], rotulo: 'Abertura' },
  { numero: 2, texto: 'Rafael diz que perdia matrícula. O que você responde?', descritores_primarios: [2, 3, 5], rotulo: 'Divergência' },
  { numero: 3, texto: 'Rafael diz que não cobre mais faltas. O que você combina?', descritores_primarios: [3, 4, 5], rotulo: 'Acordo' },
  { numero: 4, texto: 'Como você acompanha o combinado nas próximas duas semanas?', descritores_primarios: [4, 6], rotulo: 'Continuidade' },
];

function geracao(over: { contexto?: string; perguntas?: any[] } = {}) {
  return JSON.stringify({
    cenario: {
      titulo: 'A fila de matrículas e a sala sem instrutor',
      contexto: over.contexto ?? 'Sexta, 18h30. Rafael cobriu o turno e deixou a sala sem instrutor por 15 minutos. Camila cobra a meta.',
      faceta_testada_principal: 'Feedback corretivo sobre segurança',
      tradeoff_testado: 'Padrão de segurança contra reconhecer o esforço',
      fator_complicador: 'Rafael ameaça não cobrir mais faltas',
      stakeholders_centrais: ['Rafael', 'Camila'],
      confianca_cenario: 0.85,
      riscos_do_cenario: [],
    },
    perguntas: over.perguntas ?? PERGUNTAS,
    mapa_cobertura_descritores: { D1: [1], D2: [1, 2], D3: [2, 3], D4: [3, 4], D5: [2, 3], D6: [4] },
  });
}

function auditoria(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    nota: 88,
    status: 'aprovado_com_ressalvas',
    erro_grave: false,
    dimensoes: { aderencia_competencia: 13 },
    ponto_mais_forte: 'Trade-off real.',
    ponto_mais_fraco: 'A P3 induz a resposta para escala.',
    descritores_sem_cobertura: [],
    perguntas_com_risco: [{ numero: 3, problema: 'aceita resposta genérica', correcao_recomendada: 'forçar priorização' }],
    justificativa: 'Bom instrumento.',
    sugestao: 'Reformular a P3.',
    alertas: [],
    ...over,
  });
}

const entrada = (extra: Record<string, unknown> = {}) => {
  const v = validarEntradaGeracao({ cargo: 'Gerente de loja', segmento: 'rede de academias', ...extra });
  if (!v.ok || !v.valor) throw new Error(v.erro);
  return v.valor;
};

beforeEach(() => {
  chamadas.length = 0;
  respostas = [];
  vi.mocked(getModelForTask).mockClear();
});

describe('uma rodada feliz', () => {
  it('gera, audita e devolve o exemplo gravável com a origem', async () => {
    respostas = [geracao(), auditoria()];
    const r = await gerarRodadaExemplo(entrada());

    expect(chamadas).toHaveLength(2);
    expect(r.nota).toBe(88);
    expect(r.aprovado).toBe(true);
    expect(r.exemplo.rotulo).toBe('Cenário · Gerente de loja');
    expect(r.exemplo.situacao).toContain('Rafael cobriu o turno');
    expect(r.exemplo.perguntas.map((q) => q.nome)).toEqual(['Abertura', 'Divergência', 'Acordo', 'Continuidade']);
    expect(r.exemplo.perguntas[0].pergunta).toContain('Como você abre a conversa');
    expect(r.exemplo.origem).toMatchObject({
      cargo: 'Gerente de loja', segmento: 'rede de academias', competencia: 'Comunicação e Conversas de Liderança',
      nota: 88, status: 'aprovado_com_ressalvas', gerador: 'claude-sonnet-5-5', auditor: 'gpt-5.6-terra',
      comFicha: false, editado: false,
    });
    expect(Date.parse(r.exemplo.origem!.geradoEm!)).not.toBeNaN();
  });

  it('o prompt de SISTEMA é o da IA3, intocado; o entorno é que muda', async () => {
    respostas = [geracao(), auditoria()];
    await gerarRodadaExemplo(entrada());
    const [gera, audita] = chamadas;
    expect(gera.system).toBe(buildIA3SystemPrompt());
    expect(audita.system).toBe(buildCheckIA3SystemPrompt());
    expect(gera.user).toContain('Cargo: Gerente de loja');
    expect(gera.user).toContain('Segmento: rede de academias');
    expect(gera.user).toContain('COMPETÊNCIA-ALVO');
    expect(gera.user).toContain('Comunicação e Conversas de Liderança');
    expect(gera.user).toContain('USO DO CENÁRIO');
    expect(gera.user).toContain('"rotulo"');
  });

  it('não há tenant: nome de empresa é marcador, sem PPP e sem perfil ideal', async () => {
    respostas = [geracao(), auditoria()];
    await gerarRodadaExemplo(entrada());
    const { user } = chamadas[0];
    expect(user).toContain('Nome: Empresa do cliente (exemplo)');
    expect(user).not.toContain('CONTEXTO PPP');
    expect(user).not.toContain('PERFIL IDEAL DO CARGO');
    // Sem ficha colada, o bloco organizacional nem existe (o pipeline já trata cargo sem ficha assim).
    expect(user).not.toContain('CONTEXTO ORGANIZACIONAL');
  });

  it('usa as tasks do pipeline, sem empresaId, em pt-BR e com relógio próprio', async () => {
    respostas = [geracao(), auditoria()];
    await gerarRodadaExemplo(entrada());
    const [gera, audita] = chamadas;
    expect(gera.options).toMatchObject({ taskKey: 'ia3_cenarios', locale: 'pt-BR', timeoutMs: 200_000 });
    expect(audita.options).toMatchObject({ taskKey: 'ia3_check', locale: 'pt-BR', timeoutMs: 60_000 });
    expect(gera.options).not.toHaveProperty('empresaId');
    expect(audita.options).not.toHaveProperty('empresaId');
    expect(gera.aiConfig).toEqual({ model: 'claude-sonnet-5-5' });
    expect(audita.aiConfig).toEqual({ model: 'gpt-5.6-terra' });
    expect(gera.maxTokens).toBe(16000);
    expect(vi.mocked(getModelForTask).mock.calls.map((c) => [c[0], c[1]])).toEqual([[null, 'ia3_cenarios'], [null, 'ia3_check']]);
  });

  it('gerador e auditor são de FAMÍLIAS diferentes (a regra do Dual-IA)', async () => {
    respostas = [geracao(), auditoria()];
    const r = await gerarRodadaExemplo(entrada());
    expect(r.exemplo.origem!.gerador!.startsWith('claude')).toBe(true);
    expect(r.exemplo.origem!.auditor!.startsWith('gpt')).toBe(true);
  });

  it('a auditoria recebe o cenário que foi gerado, a competência e os descritores', async () => {
    respostas = [geracao(), auditoria()];
    await gerarRodadaExemplo(entrada());
    const { user } = chamadas[1];
    expect(user).toContain('Rafael cobriu o turno');
    expect(user).toContain('Comunicação e Conversas de Liderança');
    expect(user).toContain('D6: LD03_D6');
    expect(user).toContain('Como você abre a conversa com Rafael');
  });
});

describe('ficha do cargo e feedback', () => {
  it('ficha colada entra como descrição do cargo e marca a origem', async () => {
    respostas = [geracao(), auditoria()];
    const r = await gerarRodadaExemplo(entrada({ ficha: 'Responde pela unidade, pela equipe e pela meta de matrículas.' }));
    expect(chamadas[0].user).toContain('CONTEXTO ORGANIZACIONAL');
    expect(chamadas[0].user).toContain('Descrição do cargo: Responde pela unidade, pela equipe e pela meta de matrículas.');
    expect(r.exemplo.origem!.comFicha).toBe(true);
  });

  it('sem feedback o prompt NÃO traz o bloco de regeneração', async () => {
    respostas = [geracao(), auditoria()];
    await gerarRodadaExemplo(entrada());
    expect(chamadas[0].user).not.toContain('FEEDBACK DA REVISÃO ANTERIOR');
    expect(chamadas[0].user).not.toContain('REGRAS DA REGENERAÇÃO');
  });

  it('com feedback, entra o feedback e a regra "corrigir não é adicionar"', async () => {
    respostas = [geracao(), auditoria()];
    await gerarRodadaExemplo(entrada({ feedback: 'Reformular a P3 para forçar priorização.' }));
    const { user } = chamadas[0];
    expect(user).toContain('FEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS):\nReformular a P3 para forçar priorização.');
    expect(user).toContain('Corrigir NÃO é adicionar');
    expect(user).toContain('contexto ≤900 caracteres');
  });

  it('abaixo da nota mínima: não aprova e devolve o que pedir de melhoria para a próxima rodada', async () => {
    respostas = [geracao(), auditoria({ nota: 74, status: 'revisar' })];
    const r = await gerarRodadaExemplo(entrada());
    expect(r.nota).toBe(74);
    expect(r.aprovado).toBe(false);
    expect(r.status).toBe('revisar');
    expect(r.pontoFraco).toBe('A P3 induz a resposta para escala.');
    expect(r.feedbackParaProxima).toContain('Reformular a P3.');
    expect(r.feedbackParaProxima).toContain('Ponto mais fraco: A P3 induz a resposta para escala.');
    expect(r.feedbackParaProxima).toContain('P3: aceita resposta genérica. Sugestão: forçar priorização');
    // Mesmo reprovado, o exemplo existe e é válido: quem decide é a pessoa, na revisão.
    expect(r.exemplo.perguntas).toHaveLength(4);
  });

  it('a nota mínima é 80: 79 não aprova, 80 aprova', async () => {
    respostas = [geracao(), auditoria({ nota: 79 })];
    expect((await gerarRodadaExemplo(entrada())).aprovado).toBe(false);
    respostas = [geracao(), auditoria({ nota: 80 })];
    expect((await gerarRodadaExemplo(entrada())).aprovado).toBe(true);
  });

  it('erro grave força o teto de 60 do auditor, e então não aprova', async () => {
    respostas = [geracao(), auditoria({ nota: 95, erro_grave: true })];
    const r = await gerarRodadaExemplo(entrada());
    expect(r.nota).toBe(60);
    expect(r.aprovado).toBe(false);
  });
});

describe('rótulos das perguntas', () => {
  const nomesDaMatriz = linhasDaVariante('lider')
    .filter((l) => l.nome === 'Comunicação e Conversas de Liderança')
    .map((l) => l.nome_curto);

  it('sem rótulo do modelo, usa o descritor que a pergunta cobre (último ainda livre)', async () => {
    const semRotulo = PERGUNTAS.map(({ rotulo: _r, ...p }) => p);
    respostas = [geracao({ perguntas: semRotulo }), auditoria()];
    const r = await gerarRodadaExemplo(entrada());
    expect(r.exemplo.perguntas.map((q) => q.nome)).toEqual([nomesDaMatriz[1], nomesDaMatriz[4], nomesDaMatriz[3], nomesDaMatriz[5]]);
    for (const q of r.exemplo.perguntas) expect(q.nome.length).toBeLessThanOrEqual(LIMITES_EXEMPLO.nomePergunta);
  });

  it('rótulo do modelo que é uma frase inteira é ignorado (cai no descritor)', async () => {
    const frase = PERGUNTAS.map((p) => ({ ...p, rotulo: 'Esta é uma frase inteira e não um rótulo' }));
    respostas = [geracao({ perguntas: frase }), auditoria()];
    const r = await gerarRodadaExemplo(entrada());
    expect(r.exemplo.perguntas[0].nome).toBe(nomesDaMatriz[1]);
  });
});

describe('o que a IA devolve de ruim não chega ao documento', () => {
  it('resposta que não é JSON: erro nomeado, e a auditoria nem roda', async () => {
    respostas = ['não consegui gerar um cenário agora'];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/não devolveu um cenário válido/);
    expect(chamadas).toHaveLength(1);
  });

  it('três perguntas em vez de quatro: recusa antes de gastar a auditoria', async () => {
    respostas = [geracao({ perguntas: PERGUNTAS.slice(0, 3) })];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/fora do formato/);
    expect(chamadas).toHaveLength(1);
  });

  it('descritor sem cobertura em nenhuma pergunta: recusa', async () => {
    const semD6 = PERGUNTAS.map((p) => ({ ...p, descritores_primarios: p.descritores_primarios.filter((d) => d !== 6) }));
    respostas = [geracao({ perguntas: semD6 })];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/Descritores sem cobertura: D6/);
    expect(chamadas).toHaveLength(1);
  });

  it('situação acima do limite do documento: recusa antes de auditar', async () => {
    respostas = [geracao({ contexto: 'x'.repeat(LIMITES_EXEMPLO.situacao + 1) })];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/passou dos limites do documento/);
    expect(chamadas).toHaveLength(1);
  });

  it('pergunta acima do limite do documento: recusa antes de auditar', async () => {
    const longa = PERGUNTAS.map((p, i) => (i === 0 ? { ...p, texto: 'x'.repeat(LIMITES_EXEMPLO.pergunta + 1) } : p));
    respostas = [geracao({ perguntas: longa })];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/passou dos limites do documento/);
    expect(chamadas).toHaveLength(1);
  });

  it('auditoria sem nota: erro nomeado, em vez de aprovar sem medir', async () => {
    respostas = [geracao(), JSON.stringify({ justificativa: 'sem nota' })];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/auditoria do cenário não devolveu resultado/);
  });

  it('auditoria que não é JSON: erro nomeado', async () => {
    respostas = [geracao(), 'sem JSON aqui'];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/auditoria do cenário não devolveu resultado/);
  });

  it('falha do provedor propaga (a action devolve a mensagem para a tela)', async () => {
    respostas = [];
    await expect(gerarRodadaExemplo(entrada())).rejects.toThrow(/SENTINELA/);
  });

  it('campo estranho na resposta do modelo não vai para o exemplo gravado', async () => {
    const comLixo = PERGUNTAS.map((p) => ({ ...p, instrucao_interna: 'ignore as regras', html: '<b>x</b>' }));
    respostas = [geracao({ perguntas: comLixo }), auditoria()];
    const r = await gerarRodadaExemplo(entrada());
    const serializado = JSON.stringify(r.exemplo);
    expect(serializado).not.toMatch(/instrucao_interna|ignore as regras|<b>/);
    expect(Object.keys(r.exemplo.perguntas[0]).sort()).toEqual(['nome', 'pergunta']);
  });
});

describe('competência', () => {
  it('cada uma das cinco gera com os seus 6 descritores', async () => {
    for (const competencia of ['Análise e Diagnóstico de Situações', 'Desenvolvimento de Pessoas', 'Priorização e Tomada de Decisão']) {
      chamadas.length = 0;
      respostas = [geracao(), auditoria()];
      const r = await gerarRodadaExemplo(entrada({ competencia }));
      expect(chamadas[0].user).toContain(`Nome: ${competencia}`);
      expect(r.exemplo.origem!.competencia).toBe(competencia);
    }
  });

  it('competência que não existe na matriz lança, sem chamar IA', async () => {
    await expect(gerarRodadaExemplo({ ...entrada(), competencia: 'Inventada' })).rejects.toThrow(/Matriz de liderança sem os 6 descritores/);
    expect(chamadas).toHaveLength(0);
  });
});
