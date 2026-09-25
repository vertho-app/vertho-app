/**
 * O veredito da auditoria do PDI ganhou um leitor (25/09/2026).
 *
 * Desde 27/08 a auditoria gravava em `conteudo.auditoria` e nenhuma tela lia.
 * O resumo é o que a aba PDI de relatórios mostra: contagem com denominador,
 * reprovados primeiro e, de cada um, só o que não passou.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resumirAuditoriaPlanos } from '@/lib/relatorios/pdi-audit-resumo';
import { semComentarios } from '../helpers/fonte';

const auditoria = (status: string, checks: any[] = []) => ({ status, resumo: `resumo ${status}`, checks });
const check = (status: string, titulo: string, ocorrencias: string[] = []) => ({ id: titulo, status, titulo, ocorrencias });

describe('resumirAuditoriaPlanos', () => {
  const nomes = new Map([['a', 'Ana'], ['b', 'Bruno'], ['c', 'Carla'], ['d', 'Davi'], ['e', 'Eva']]);
  const linhas = [
    { colaborador_id: 'a', auditoria: auditoria('pass', [check('pass', 'ok')]) },
    { colaborador_id: 'b', auditoria: auditoria('fail', [check('pass', 'ok'), check('fail', 'Afirmação sem lastro', ['trecho 1']), check('warn', 'Jargão', ['sprint'])]) },
    { colaborador_id: 'c', auditoria: null },
    { colaborador_id: 'd', auditoria: auditoria('warn', [check('warn', 'Genérica')]) },
    { colaborador_id: 'e', auditoria: { status: 'aprovadissimo', checks: [] } },
  ];

  it('conta com denominador: cada PDI entra em exatamente uma faixa', () => {
    const r = resumirAuditoriaPlanos(linhas, nomes);
    expect(r).toMatchObject({ total: 5, pass: 1, warn: 1, fail: 1, semAuditoria: 2 });
    expect(r.pass + r.warn + r.fail + r.semAuditoria).toBe(r.total);
  });

  it('status fora do contrato vira "sem auditoria", não aprovado', () => {
    const r = resumirAuditoriaPlanos(linhas, nomes);
    const eva = r.itens.find((i) => i.colaboradorId === 'e')!;
    expect(eva.status).toBeNull();
    expect(eva.resumo).toBeNull();
  });

  it('ordena reprovado, alerta, aprovado, sem auditoria; e por nome dentro da faixa', () => {
    const r = resumirAuditoriaPlanos(linhas, nomes);
    expect(r.itens.map((i) => i.nome)).toEqual(['Bruno', 'Davi', 'Ana', 'Carla', 'Eva']);
  });

  it('pendências são só o que não passou, com as ocorrências citadas', () => {
    const bruno = resumirAuditoriaPlanos(linhas, nomes).itens[0];
    expect(bruno.pendencias).toEqual([
      { titulo: 'Afirmação sem lastro', status: 'fail', ocorrencias: ['trecho 1'] },
      { titulo: 'Jargão', status: 'warn', ocorrencias: ['sprint'] },
    ]);
  });

  it('corta ocorrências longas e numerosas (a tela não vira o JSON inteiro)', () => {
    const muitas = Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(500, 'x'));
    const r = resumirAuditoriaPlanos([{ colaborador_id: 'a', auditoria: auditoria('fail', [check('fail', 'X', muitas)]) }], nomes);
    const oc = r.itens[0].pendencias[0].ocorrencias;
    expect(oc).toHaveLength(6);
    expect(Math.max(...oc.map((o) => o.length))).toBe(400);
    expect(oc[0].endsWith('…')).toBe(true);
  });

  it('não corta a justificativa de tamanho real (máx. medido 334 caracteres)', () => {
    const real = 'Autocuidado e bem-estar profissional: "a rotina ainda não tem pontos fixos…" — '.padEnd(334, 'y');
    const r = resumirAuditoriaPlanos([{ colaborador_id: 'a', auditoria: auditoria('fail', [check('fail', 'X', [real])]) }], nomes);
    expect(r.itens[0].pendencias[0].ocorrencias[0]).toBe(real);
  });

  it('pessoa sem nome no mapa não some da lista', () => {
    const r = resumirAuditoriaPlanos([{ colaborador_id: 'zz', auditoria: null }], nomes);
    expect(r.itens[0]).toMatchObject({ colaboradorId: 'zz', nome: '(sem nome)', status: null });
  });
});

describe('regerarPdi', () => {
  const fonte = semComentarios(readFileSync('app/admin/empresas/[empresaId]/relatorios/auditoria-actions.ts', 'utf-8'));

  it('resolve o modelo da task e o passa ao core (o callAI não consulta getModelForTask)', () => {
    expect(fonte).toMatch(/getModelForTask\(\s*empresaId\s*,\s*'pdi_individual'\s*\)/);
    expect(fonte).toMatch(/gerarRelatorioIndividual\([^)]*\{\s*model\s*\}\s*\)/);
  });

  it('exige a permissão de regerar e grava no log de admin', () => {
    expect(fonte).toMatch(/requireAdminAction\(\s*'ai\.audit\.regenerate'\s*\)/);
    expect(fonte).toMatch(/acao:\s*'pdi\.regerar'/);
  });
});
