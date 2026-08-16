// R13 · o template LIGADO em cada papel da cadência.
//
// 🔴 A falha real que originou a regra (15/08/2026): a pílula semanal — o
// disparo de maior volume do produto — apontava para um template que a Meta
// reclassificou de UTILITY para MARKETING. Nada quebrou: aprovado, enviado,
// entregue. Só que MARKETING custa ~6×, e o único lugar onde isso apareceria é
// a fatura. O nome vem de env *Sensitive* (ilegível até pelo CLI) e
// `templateAtivo()` não tinha nenhum outro consumidor.
//
// As três consequências são diferentes, e por isso as severidades também:
// INEXISTENTE e não-aprovado = a mensagem NÃO SAI (132001); MARKETING = sai e
// custa 6×.
import { describe, it, expect } from 'vitest';
import { checarTemplatesLigados, type TemplateLigadoObservado } from '@/lib/pipeline-health/regras';

const ok = (papel: string, nome: string, categoria = 'UTILITY'): TemplateLigadoObservado =>
  ({ papel, nome, status: 'APPROVED', categoria, motivo: null });

const ids = (a: ReturnType<typeof checarTemplatesLigados>) => a.map((x) => x.id);

describe('R13 — templates ligados', () => {
  it('tudo aprovado e UTILITY: nenhum achado', () => {
    expect(checarTemplatesLigados([ok('pilula', 'conteudo_semana'), ok('acesso', 'acesso_vertho')])).toEqual([]);
  });

  it('papel DESLIGADO é estado legítimo, não achado', () => {
    const r = checarTemplatesLigados([
      { papel: 'pilula', nome: null, status: null, categoria: null, motivo: null },
      { papel: 'perfil', nome: null, status: null, categoria: null, motivo: null },
    ]);
    expect(r).toEqual([]);
  });

  it('🔴 MARKETING vira aviso — funciona, entrega, e custa 6× em silêncio', () => {
    const r = checarTemplatesLigados([ok('pilula', 'pilula_semanal', 'MARKETING'), ok('acesso', 'acesso_vertho')]);
    expect(ids(r)).toContain('template-ligado-marketing');
    const a = r.find((x) => x.id === 'template-ligado-marketing')!;
    expect(a.severidade).toBe('aviso');
    expect(a.contagem).toBe(1);
    // A amostra tem que dizer QUAL papel e QUAL template — senão o achado manda
    // procurar em seis variáveis de ambiente ilegíveis.
    expect(a.amostra).toEqual(['pilula → pilula_semanal']);
  });

  it('🔴 nome que a Meta não conhece é CRÍTICO — a mensagem não sai (132001)', () => {
    const r = checarTemplatesLigados([
      { papel: 'pilula', nome: 'conteudo_semana\n', status: 'INEXISTENTE', categoria: null, motivo: null },
    ]);
    const a = r.find((x) => x.id === 'template-ligado-inexistente')!;
    expect(a.severidade).toBe('critico');
    expect(a.contagem).toBe(1);
  });

  it('🔴 PENDING ligado é crítico — a cadência daquele papel fica muda', () => {
    const r = checarTemplatesLigados([
      { papel: 'pilula', nome: 'conteudo_semana_v2', status: 'PENDING', categoria: 'MARKETING', motivo: null },
    ]);
    expect(ids(r)).toContain('template-ligado-nao-aprovado');
    expect(r.find((x) => x.id === 'template-ligado-nao-aprovado')!.severidade).toBe('critico');
  });

  it('🔴 cegueira NÃO passa por "tudo certo"', () => {
    // Se a consulta à Meta falhou, os outros checks ficariam mudos — e mudo é
    // indistinguível de verde. É a mesma régua do R12.
    const r = checarTemplatesLigados([
      { papel: 'pilula', nome: 'conteudo_semana', status: null, categoria: null, motivo: 'timeout ao consultar a Meta' },
    ]);
    expect(ids(r)).toEqual(['template-ligado-check-cego']);
    expect(r[0].detalhe).toContain('timeout');
  });

  it('cego não é contado como MARKETING nem como inexistente', () => {
    const r = checarTemplatesLigados([
      { papel: 'pilula', nome: 'x', status: null, categoria: 'MARKETING', motivo: 'sem WABA_ID/token para consultar a Meta' },
    ]);
    expect(ids(r)).not.toContain('template-ligado-marketing');
  });

  it('vários papéis com o mesmo problema entram no MESMO achado, contados', () => {
    const r = checarTemplatesLigados([
      ok('pilula', 'pilula_semanal', 'MARKETING'),
      ok('retomada', 'nudge_inatividade', 'MARKETING'),
      ok('acesso', 'acesso_vertho'),
    ]);
    expect(r.find((x) => x.id === 'template-ligado-marketing')!.contagem).toBe(2);
  });
});
