// O lock tem que distinguir "outro processo está gravando" de "alguém morreu
// segurando a chave".
//
// 🔴 Medido 25/08/2026: a fase 0d foi interrompida no meio de uma cena. O
// `finally` que solta o lock nunca rodou, e a retomada seguinte morreu em
// EEXIST antes de escrever um byte — com uma mensagem que mandava "apague se
// for lixo de um crash", decisão que quem lê não tem como tomar. O código tem
// a informação: o pid está gravado no arquivo.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adquirirLock } from '@/lib/season-engine/cena/arquivo';

const dirs: string[] = [];
const novoDestino = () => {
  const d = mkdtempSync(join(tmpdir(), 'cena-lock-'));
  dirs.push(d);
  return join(d, 'rodada.json');
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('adquirirLock', () => {
  it('grava o próprio pid e solta no unlock', () => {
    const saida = novoDestino();
    const solta = adquirirLock(saida);
    expect(existsSync(`${saida}.lock`)).toBe(true);
    expect(readFileSync(`${saida}.lock`, 'utf8').trim()).toBe(String(process.pid));
    solta();
    expect(existsSync(`${saida}.lock`)).toBe(false);
  });

  it('RECUSA quando o dono do lock está VIVO', () => {
    // O processo atual está vivo por definição — serve de dono legítimo.
    const saida = novoDestino();
    writeFileSync(`${saida}.lock`, String(process.pid));
    expect(() => adquirirLock(saida)).toThrow(/VIVO/);
    expect(
      existsSync(`${saida}.lock`),
      'e não pode ter apagado o lock de quem está trabalhando',
    ).toBe(true);
  });

  it('ASSUME o lock quando o dono morreu, e avisa alto', () => {
    const saida = novoDestino();
    // 2^22 está acima do pid máximo usual e não corresponde a processo nenhum.
    writeFileSync(`${saida}.lock`, '4194304');
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const solta = adquirirLock(saida);
    expect(readFileSync(`${saida}.lock`, 'utf8').trim()).toBe(String(process.pid));
    expect(aviso, 'assumir em silêncio é fallback invisível — proibido').toHaveBeenCalled();
    expect(String(aviso.mock.calls[0][0])).toContain('órfão');
    solta();
  });

  it('lock sem pid legível também é órfão — mas o aviso sai igual', () => {
    // Lock de uma versão anterior, ou write interrompido: não dá para provar
    // que há dono, e travar a retomada para sempre é pior que assumir avisando.
    const saida = novoDestino();
    writeFileSync(`${saida}.lock`, '');
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const solta = adquirirLock(saida);
    expect(aviso).toHaveBeenCalled();
    solta();
  });
});
