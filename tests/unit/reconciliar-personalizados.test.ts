import { describe, it, expect } from 'vitest';
import { celulasServidas, motivoDaLacuna } from '@/lib/video/reconciliar-personalizados';

/**
 * F-V1 — vídeo nominal que nunca chega.
 *
 * `personalizeCell` fotografa a coorte no instante do render: quem entra depois
 * fica no deck genérico PARA SEMPRE, porque não há re-disparo. Some junto quem
 * falhou ('error') ou travou ('processing' sem fim). É degradação silenciosa —
 * a pessoa vê um vídeo, só que sem o nome, e nenhuma contagem acusa.
 *
 * As duas decisões que definem se a reconciliação acerta ou desperdiça render.
 */

describe('celulasServidas · só a cópia que a entrega lê', () => {
  const cel = (id: string, created_at: string, over: any = {}) =>
    ({ id, modulo_base_id: 'm1', empresa_id: 'e1', cargo: 'Gestão Escolar', disc_dominante: 'I', created_at, ...over });

  it('entre cópias da mesma célula, mantém a MAIS RECENTE', () => {
    // `resolverCelulaVideo` faz .order('created_at', desc).limit(1) — só ela é servida.
    const r = celulasServidas([
      cel('antiga', '2026-07-01T00:00:00Z'),
      cel('nova', '2026-07-20T00:00:00Z'),
      cel('meio', '2026-07-10T00:00:00Z'),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('nova');
  });

  it('células logicamente diferentes NÃO são fundidas', () => {
    const r = celulasServidas([
      cel('a', '2026-07-01T00:00:00Z'),
      cel('b', '2026-07-01T00:00:00Z', { disc_dominante: 'D' }),
      cel('c', '2026-07-01T00:00:00Z', { cargo: 'Coordenação Pedagógica' }),
      cel('d', '2026-07-01T00:00:00Z', { modulo_base_id: 'm2' }),
      cel('e', '2026-07-01T00:00:00Z', { empresa_id: 'e2' }),
    ]);
    expect(r).toHaveLength(5);
  });

  it('o caso real: 4 cópias da mesma célula viram 1', () => {
    // Medido em 27/07: sem esta redução a reconciliação reportava 83 pessoas em 16
    // células; com ela, 25 em 5 — e gastaria 4 renders para curar as MESMAS pessoas.
    const r = celulasServidas(['2026-07-01', '2026-07-05', '2026-07-09', '2026-07-14']
      .map((d, i) => cel(`c${i}`, `${d}T00:00:00Z`)));
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('c3');
  });

  it('lista vazia/nula não quebra', () => {
    expect(celulasServidas([])).toEqual([]);
    expect(celulasServidas(null as any)).toEqual([]);
  });
});

describe('motivoDaLacuna · quem precisa de re-render', () => {
  const AGORA = new Date('2026-07-27T12:00:00Z').getTime();
  const hMenos = (h: number) => new Date(AGORA - h * 3600_000).toISOString();

  it('sem registro → ausente (o caso de quem entrou depois do render)', () => {
    expect(motivoDaLacuna(undefined, AGORA)).toBe('ausente');
  });

  it('done → null: tem vídeo nominal, nada a fazer', () => {
    expect(motivoDaLacuna({ status: 'done', created_at: hMenos(100) }, AGORA)).toBeNull();
  });

  it('error → recupera', () => {
    expect(motivoDaLacuna({ status: 'error', created_at: hMenos(1) }, AGORA)).toBe('error');
  });

  it('processing RECENTE → null: está em andamento, não atropelar', () => {
    // Re-enfileirar aqui mataria uma personalização que ia terminar sozinha.
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(0.5) }, AGORA)).toBeNull();
  });

  it('processing ANTIGO → travado (caso real: 5 presos desde 14-16/07)', () => {
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(300) }, AGORA)).toBe('travado');
  });

  it('a fronteira de 2h é o que separa "em andamento" de "travado"', () => {
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(1.9) }, AGORA)).toBeNull();
    expect(motivoDaLacuna({ status: 'processing', created_at: hMenos(2.1) }, AGORA)).toBe('travado');
  });

  it('pending segue a mesma régua de processing', () => {
    expect(motivoDaLacuna({ status: 'pending', created_at: hMenos(0.5) }, AGORA)).toBeNull();
    expect(motivoDaLacuna({ status: 'pending', created_at: hMenos(5) }, AGORA)).toBe('travado');
  });
});
