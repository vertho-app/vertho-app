import { beforeEach, expect, test, vi } from 'vitest';
import { cenarioSchema, competenciaSchema, rotuloClassificacao } from '@/lib/recepcao/schema';
import { cenario as legado } from '@/lib/recepcao/cenario.mjs';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { competenciasBase } from '@/lib/recepcao/competencias-base';
import { abrirSessao, consolidar, escalaDaRubrica, promptAvaliador } from '@/lib/recepcao/core';
import type { Insumos } from '@/lib/recepcao/model';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const permissoes = vi.hoisted(() => ({ contentManage: true }));
vi.mock('@/lib/permissions', () => ({ can: async () => permissoes.contentManage }));
import { listarCompetencias, editarCompetencia } from '@/lib/recepcao/competencias';

// ---------- schema: duas formas, nunca misturadas ----------
test('rubrica em quatro níveis e rubrica legada são aceitas; mistura e dimensão sem escala são recusadas', () => {
  expect(cenarioSchema.safeParse(catalogoLimites[0]).success).toBe(true);
  expect(cenarioSchema.safeParse(legado).success).toBe(true);
  expect(escalaDaRubrica(catalogoLimites[0].rubrica)).toBe('n4');
  expect(escalaDaRubrica(cenarioSchema.parse(legado).rubrica)).toBe('legado');
  const misto = structuredClone(catalogoLimites[0]) as any;
  const { niveis, ...semNiveis } = misto.rubrica[0];
  misto.rubrica[0] = { ...semNiveis, adequado: 'a', parcial: 'p', insuficiente: 'i' };
  const r1 = cenarioSchema.safeParse(misto);
  expect(r1.success).toBe(false);
  expect(JSON.stringify(r1.success ? [] : r1.error.issues)).toMatch(/uma só escala/);
  const ambos = structuredClone(catalogoLimites[0]) as any;
  ambos.rubrica[1] = { ...ambos.rubrica[1], adequado: 'a', parcial: 'p', insuficiente: 'i' };
  expect(cenarioSchema.safeParse(ambos).success).toBe(false);
  const nenhum = structuredClone(catalogoLimites[0]) as any;
  delete nenhum.rubrica[2].niveis;
  expect(cenarioSchema.safeParse(nenhum).success).toBe(false);
});

test('catálogos x.2 usam a biblioteca base: todas as dimensões com os quatro níveis e rubricaVersao própria', () => {
  for (const c of [...catalogoInicial, ...catalogoLimites]) {
    expect(c.rubrica.every(d => d.niveis && competenciasBase.some(b => b.codigo === d.id && b.niveis.n4 === d.niveis!.n4))).toBe(true);
    expect(c.rubrica.every(d => !d.adequado && !d.parcial && !d.insuficiente)).toBe(true);
  }
  expect(catalogoInicial[0].rubricaVersao).toBe('1.2-n4');
  expect(catalogoLimites[0].rubricaVersao).toBe('3.2-n4');
  expect(competenciasBase.every(b => competenciaSchema.safeParse(b).success)).toBe(true);
});

// ---------- consolidação na escala nova ----------
function sessaoN4() {
  const s = abrirSessao(catalogoLimites[0], 0);
  s.historico.push({ id: 'm1', role: 'user', content: 'Sinto muito pelas duas alterações. Só há 17/09 às 18h com a Dra. Helena.' });
  s.historico.push({ id: 'm2', role: 'assistant', content: 'Já ouvi. Não aceito.' });
  s.respostas = 1;
  return s;
}
const ref = (mensagemId: string, trecho: string) => ({ mensagemId, trecho });
function insumos(s: ReturnType<typeof sessaoN4>, classificacao: (id: string) => Insumos['dimensoes'][number]['classificacao']): Insumos {
  return {
    dimensoes: s.cenario.rubrica.map(d => { const c = classificacao(d.id); return { id: d.id, classificacao: c, justificativa: 'Observado.',
      evidencias: c === 'nao_observavel' || c === 'n1' ? [] : [ref('m1', 'Só há 17/09 às 18h')], oportunidades: c === 'nao_observavel' ? [] : [ref('m0', s.historico[0].content.slice(0, 20))] }; }),
    ocorrencias: [], desfecho: { tipo: 'nao_resolvido', justificativa: 'Recusa mantida.', evidencias: [ref('m2', 'Não aceito.')] },
    feedback: { acerto: 'a', melhoria: 'b', novaTentativa: 'c' },
  };
}
test('escala n4: tudo n4 = 100, tudo n2 = 33,3, mistura pondera pelos pesos, nao_observavel sai da cobertura', () => {
  const s = sessaoN4();
  expect(consolidar(s, insumos(s, () => 'n4'))!.nota).toBe(100);
  expect(consolidar(s, insumos(s, () => 'n2'))!.nota).toBe(33.3);
  expect(consolidar(s, insumos(s, () => 'n1'))!.nota).toBe(0);
  // acolhimento (20) em n4, o resto (80) em n2: (20*3 + 80*1) / (3*100) = 0,4667
  expect(consolidar(s, insumos(s, id => (id === 'acolhimento' ? 'n4' : 'n2')))!.nota).toBe(46.7);
  const parcial = consolidar(s, insumos(s, id => (id === 'procedimentos' ? 'nao_observavel' : 'n3')))!;
  expect(parcial.coberturaPercentual).toBe(90); expect(parcial.nota).toBe(66.7); expect(parcial.situacao).toBe('avaliacao_parcial');
});
test('escala n4: classificação legada é recusada, n2+ exige evidência, n1 não', () => {
  const s = sessaoN4();
  expect(() => consolidar(s, insumos(s, () => 'adequado'))).toThrow('Classificação inválida para a escala');
  const semEvidencia = insumos(s, () => 'n2'); semEvidencia.dimensoes[0].evidencias = [];
  expect(() => consolidar(s, semEvidencia)).toThrow('Mérito exige evidência');
  expect(consolidar(s, insumos(s, () => 'n1'))!.nota).toBe(0);
  const legadoS = abrirSessao(cenarioSchema.parse(legado), 0);
  legadoS.historico.push({ id: 'm1', role: 'user', content: 'Sinto muito. Temos 17/09/2026 às 18h.' }); legadoS.respostas = 1;
  const legadoInsumos = insumos(legadoS as any, () => 'n4' as any);
  expect(() => consolidar(legadoS, legadoInsumos)).toThrow('Classificação inválida para a escala');
});

// ---------- prompt ----------
test('prompt do avaliador segue a escala da rubrica e leva os quatro descritores', () => {
  const n4 = promptAvaliador(catalogoLimites[0]);
  expect(n4).toMatch(/n1, n2, n3 ou n4/); expect(n4).toMatch(/"classificacao":"n1\|n2\|n3\|n4\|nao_observavel"/);
  // A rubrica vai serializada: os quatro descritores aparecem como o objeto niveis (aspas internas escapadas).
  expect(n4).toContain('"niveis":' + JSON.stringify(competenciasBase[0].niveis));
  expect(n4).not.toMatch(/adequado \(2\)/);
  const leg = promptAvaliador(cenarioSchema.parse(legado));
  expect(leg).toMatch(/adequado \(2\)/); expect(leg).not.toMatch(/n1, n2, n3 ou n4/);
  expect(rotuloClassificacao.n4).toBe('N4 · Referência');
});

// ---------- serviço da biblioteca ----------
let sb: ReturnType<typeof criarSupabaseMock>, ctx: any;
const linha = { id: '40000000-0000-4000-8000-000000000001', codigo: 'acolhimento', nome: 'Acolhimento', descricao: 'd', niveis: competenciasBase[0].niveis, ativo: true, revisao: 2 };
beforeEach(() => {
  permissoes.contentManage = true;
  sb = criarSupabaseMock({ lista: () => [linha], resolver: () => linha });
  ctx = { empresaId: 'e', ownerKey: 'admin:x', sb: sb.client, auth: { isPlatformAdmin: true, role: 'rh' } };
});
test('leitura exige content.manage; escrita exige plataforma e não grava nada quando negada', async () => {
  expect((await listarCompetencias(ctx)).podeEditar).toBe(true);
  ctx.auth.isPlatformAdmin = false;
  expect((await listarCompetencias(ctx)).podeEditar).toBe(false);
  await expect(editarCompetencia(ctx, { acao: 'competencia', op: 'salvar', conteudo: competenciasBase[0] } as any)).rejects.toThrow('editada pela plataforma');
  permissoes.contentManage = false;
  await expect(listarCompetencias(ctx)).rejects.toThrow('não permite');
  expect(sb.escritas).toEqual([]);
});
test('criar grava a competência ativa; editar exige revisão atual e código estável; excluir é desativar', async () => {
  const criada = await editarCompetencia(ctx, { acao: 'competencia', op: 'salvar', conteudo: competenciasBase[1] } as any);
  expect(sb.escritas.map(e => e.op)).toEqual(['insert']);
  expect((sb.escritas[0].payload as any).codigo).toBe('compreensao'); expect((sb.escritas[0].payload as any).ativo).toBe(true);
  expect(criada.codigo).toBe('compreensao');
  await expect(editarCompetencia(ctx, { acao: 'competencia', op: 'salvar', id: linha.id, revisao: 1, conteudo: { ...competenciasBase[0] } } as any)).rejects.toThrow('mudou');
  await expect(editarCompetencia(ctx, { acao: 'competencia', op: 'salvar', id: linha.id, revisao: 2, conteudo: { ...competenciasBase[0], codigo: 'outro' } } as any)).rejects.toThrow('código não muda');
  sb.reset();
  await editarCompetencia(ctx, { acao: 'competencia', op: 'excluir', id: linha.id, revisao: 2 } as any);
  expect(sb.escritas).toHaveLength(1); expect(sb.escritas[0].op).toBe('update'); expect((sb.escritas[0].payload as any).ativo).toBe(false); expect((sb.escritas[0].payload as any).revisao).toBe(3);
});
test('falha de leitura do banco vira 503, não lista vazia', async () => {
  sb.falharEm({ tabela: 'recepcao_competencias', op: 'select', mensagem: 'timeout' });
  await expect(listarCompetencias(ctx)).rejects.toMatchObject({ status: 503 });
});
