import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { encontrarCelulaVideoDemo } from '@/lib/demo/celula-video';

const cfg = { id: 'fixa', moduloId: 'modulo', empresaId: 'demo', cargo: 'Professor(a)', disc: 'S' };
const fixa = {
  id: cfg.id, modulo_base_id: cfg.moduloId, empresa_id: cfg.empresaId,
  cargo: cfg.cargo, disc_dominante: cfg.disc, status: 'error',
};

function banco(rows: Record<string, string>[], falha?: string) {
  return {
    from: () => {
      let encontrados = [...rows];
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          encontrados = encontrados.filter((row) => row[key] === value);
          return query;
        },
        neq: (key: string, value: string) => {
          encontrados = encontrados.filter((row) => row[key] !== value);
          return query;
        },
        maybeSingle: async () => ({
          data: encontrados.length === 1 ? { id: encontrados[0].id } : null,
          error: falha ? { message: falha } : encontrados.length > 1 ? { message: 'mais de uma linha' } : null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

describe('recuperação do vídeo fixo da demo no reset', () => {
  it('recupera o ID em falha para atualizar o asset pronto sem colidir com a PK', async () => {
    expect(await encontrarCelulaVideoDemo(banco([fixa]), cfg)).toEqual({ id: 'fixa' });
  });

  it('preserva a célula viva quando um novo render já substituiu a tentativa falha', async () => {
    const nova = { ...fixa, id: 'nova', status: 'done' };
    expect(await encontrarCelulaVideoDemo(banco([fixa, nova]), cfg)).toEqual({ id: 'nova' });
  });

  it('não confunde tentativas antigas falhas com a célula declarada pelo fixture', async () => {
    expect(await encontrarCelulaVideoDemo(banco([{ ...fixa, id: 'antiga' }, fixa]), cfg))
      .toEqual({ id: 'fixa' });
    expect(await encontrarCelulaVideoDemo(banco([{ ...fixa, id: 'antiga' }]), cfg)).toBeNull();
  });

  it.each(['empresa_id', 'modulo_base_id', 'cargo', 'disc_dominante'])(
    'não recupera um ID fora do escopo de %s', async (campo) => {
      expect(await encontrarCelulaVideoDemo(banco([{ ...fixa, [campo]: 'outro' }]), cfg)).toBeNull();
    },
  );

  it('retorna vazio somente quando é necessário inserir uma célula', async () => {
    expect(await encontrarCelulaVideoDemo(banco([]), cfg)).toBeNull();
  });

  it('propaga falha de leitura em vez de tratá-la como ausência', async () => {
    await expect(encontrarCelulaVideoDemo(banco([], 'indisponível'), cfg)).rejects.toThrow('indisponível');
  });
});
