import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  adquirirLock, carregarShards, escreverAtomico, lockPath, shardPath,
} from '@/lib/season-engine/cena/arquivo';

const dir = join(tmpdir(), `cena-arquivo-${process.pid}-${Date.now()}`);
const saida = join(dir, 'cena-fase0c.json');

afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

describe('gravação incremental — o buraco da fase 0c', () => {
  it('escreverAtomico deixa o destino inteiro, nunca truncado', () => {
    mkdirSync(dir, { recursive: true });
    escreverAtomico(saida, { n: 1 });
    escreverAtomico(saida, { n: 2, extra: 'x'.repeat(1000) });
    expect(JSON.parse(readFileSync(saida, 'utf8'))).toEqual({ n: 2, extra: 'x'.repeat(1000) });
  });

  it('carregarShards para no primeiro ausente e NÃO pula o buraco', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(shardPath(saida, 1), JSON.stringify({ i: 1 }));
    writeFileSync(shardPath(saida, 2), JSON.stringify({ i: 2 }));
    expect(carregarShards(saida, 10)).toHaveLength(2);
  });

  it('r07 sem r06 LANÇA — era o 6/10 que sumiu e o 7/10 que apareceu', () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(shardPath(saida, 1), JSON.stringify({ i: 1 }));
    writeFileSync(shardPath(saida, 3), JSON.stringify({ i: 3 }));
    expect(() => carregarShards(saida, 10)).toThrow(/buraco/);
  });

  it('dois processos no mesmo saida: o segundo bate no lock', () => {
    mkdirSync(dir, { recursive: true });
    const unlock = adquirirLock(saida);
    try {
      expect(() => adquirirLock(saida)).toThrow(/já existe um processo/);
      expect(existsSync(lockPath(saida))).toBe(true);
    } finally {
      unlock();
    }
    expect(existsSync(lockPath(saida))).toBe(false);
  });
});
