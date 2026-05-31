import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocka a IA para testar o saneamento do plano de forma determinística.
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
import { callAI } from '@/actions/ai-client';
import { parseBlocks, planLayout } from '@/lib/conteudo-layout-plan';

// ids: 0=h2 Conceito, 1=p antecipar, 2=p reclamar, 3=h2 Fecho, 4=p vale
const md = `# T
## Conceito
Antecipar é observar um sinal e decidir conscientemente o que fazer.

Reclamar é apontar o erro e esperar que outro resolva.

## Fecho
Vale a reflexão final aqui.
`;

const allItemRefs = (plan: any): number[] =>
  plan.pages.flatMap((p: any) => p.items).flatMap((it: any) =>
    'ref' in it ? [it.ref]
      : 'affirm' in it ? [...it.affirm.refs, ...it.negate.refs]
      : 'left' in it ? [...it.left.refs, ...it.right.refs] : []);

describe('sanitize — diagram/comparison sem lados duplicados', () => {
  beforeEach(() => vi.clearAllMocks());

  it('descarta diagram com o MESMO bloco nos dois lados (sem contraste real)', async () => {
    (callAI as any).mockResolvedValue(JSON.stringify({
      summary: 's',
      pages: [{ role: 'conceito', items: [
        { as: 'heading', ref: 0 },
        { as: 'diagram', affirm: { refs: [1] }, negate: { refs: [1] } },
        { as: 'paragraph', ref: 2 },
      ] }],
    }));
    const plan = await planLayout(parseBlocks(md, { skipFirstH1: true }), { titulo: 'T' });
    const diagrams = plan!.pages.flatMap(p => p.items).filter(it => it.as === 'diagram');
    expect(diagrams).toHaveLength(0);            // mesmo bloco nos dois lados → descartado
    expect(allItemRefs(plan)).toContain(1);      // bloco não se perde: reanexado
  });

  it('mantém diagram com blocos DIFERENTES e refs disjuntos', async () => {
    (callAI as any).mockResolvedValue(JSON.stringify({
      summary: 's',
      pages: [{ role: 'conceito', items: [{ as: 'diagram', affirm: { refs: [1] }, negate: { refs: [2] } }] }],
    }));
    const plan = await planLayout(parseBlocks(md, { skipFirstH1: true }), { titulo: 'T' });
    const diagram = plan!.pages.flatMap(p => p.items).find(it => it.as === 'diagram') as any;
    expect(diagram).toBeTruthy();
    expect(diagram.affirm.refs).toEqual([1]);
    expect(diagram.negate.refs).toEqual([2]);
  });

  it('comparison: lado direito nunca repete bloco do esquerdo', async () => {
    (callAI as any).mockResolvedValue(JSON.stringify({
      summary: 's',
      pages: [{ role: 'comparativo', items: [
        { as: 'heading', ref: 0 },
        { as: 'comparison', left: { refs: [1, 2] }, right: { refs: [2, 4] } },
      ] }],
    }));
    const plan = await planLayout(parseBlocks(md, { skipFirstH1: true }), { titulo: 'T' });
    const cmp = plan!.pages.flatMap(p => p.items).find(it => it.as === 'comparison') as any;
    expect(cmp).toBeTruthy();
    expect(cmp.left.refs).toEqual([1, 2]);
    expect(cmp.right.refs).toEqual([4]);          // 2 já estava no left → removido
  });

  it('descarta comparison com lado direito totalmente sobreposto ao esquerdo', async () => {
    (callAI as any).mockResolvedValue(JSON.stringify({
      summary: 's',
      pages: [{ role: 'comparativo', items: [
        { as: 'heading', ref: 0 },
        { as: 'comparison', left: { refs: [1, 2] }, right: { refs: [2] } },
      ] }],
    }));
    const plan = await planLayout(parseBlocks(md, { skipFirstH1: true }), { titulo: 'T' });
    const cmp = plan!.pages.flatMap(p => p.items).find(it => it.as === 'comparison');
    expect(cmp).toBeFalsy();                       // right vazio após dedup → descartado
  });
});
