/**
 * O ranking de adequação da demo escolar precisa MOSTRAR uma régua.
 *
 * `Medido: 02/09/2026` — com o DISC anterior, os 9 professores do diretório
 * caíam todos em "Aderente". Um ranking inteiramente verde não demonstra
 * critério nenhum: demonstra uma lista de pessoas. Os valores atuais foram
 * escolhidos com o próprio motor como oráculo, para distribuir as faixas.
 *
 * Este guard não confere números: confere o EFEITO. Ele roda o motor real
 * (`calcularFitUnificado`) com o gabarito real (do golden) sobre o DISC real
 * (do roster) e exige que a demo continue tendo verde, amarelo e algo abaixo do
 * corte. Trocar um DISC "só um pouquinho" volta a achatar o ranking sem que
 * nada mais no repositório reclame.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DIRETORIO_ESCOLAR } from '@/lib/demo/rosters/escolar';
import { calcularFitUnificado } from '@/lib/scoring/fit-v2-adapter';
import { comportamentosDoDisc } from '@/lib/demo/reset-acme-demo';
import { deriveProfile } from '@/lib/disc-mapeamento';

const fixture = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'lib', 'demo', 'escolas-demo-fixture.json'), 'utf8'),
);

/** Faixas que o motor devolve, do topo para a base. */
const ACIMA_DO_CORTE = new Set(['Aderente', 'Aderente com ressalvas']);

function faixaDe(pessoa: any, cargo: any): string {
  const disc = {
    D: pessoa.d_natural, I: pessoa.i_natural, S: pessoa.s_natural, C: pessoa.c_natural,
  };
  const score: any = calcularFitUnificado(cargo.gabarito, {
    nome_completo: pessoa.nome_completo,
    cargo: pessoa.cargo,
    d_natural: disc.D, i_natural: disc.I, s_natural: disc.S, c_natural: disc.C,
    perfil_dominante: deriveProfile(disc),
    ...comportamentosDoDisc(disc.D, disc.I, disc.S, disc.C),
  }, { ehLideranca: cargo.eh_lideranca, cargoNome: pessoa.cargo });
  return score?.recomendacao || 'erro';
}

describe('faixas do ranking escolar', () => {
  const cargoDocente = (fixture.cargos || []).find((c: any) => c.nome === 'Professor(a)');

  it('o golden tem o cargo docente com gabarito', () => {
    // Sem esta âncora o teste inteiro mede o nada e passa por vacuidade.
    expect(cargoDocente?.gabarito?.tela4).toBeTruthy();
  });

  it('o DISC de cada professor soma 200 (régua do produto)', () => {
    const somas = DIRETORIO_ESCOLAR.map((p: any) => ({
      nome: p.nome_completo,
      soma: p.d_natural + p.i_natural + p.s_natural + p.c_natural,
    }));
    expect(somas.filter((s) => s.soma !== 200)).toEqual([]);
  });

  it('distribui verde, amarelo e abaixo do corte', () => {
    const faixas = DIRETORIO_ESCOLAR.map((p: any) => ({
      nome: p.nome_completo,
      faixa: faixaDe(p, cargoDocente),
    }));

    // Denominador: sem professores avaliados, "tem variedade" não significa nada.
    expect(faixas.length).toBeGreaterThanOrEqual(8);
    expect(faixas.filter((f) => f.faixa === 'erro')).toEqual([]);

    const aderentes = faixas.filter((f) => f.faixa === 'Aderente');
    const ressalvas = faixas.filter((f) => f.faixa === 'Aderente com ressalvas');
    const abaixo = faixas.filter((f) => !ACIMA_DO_CORTE.has(f.faixa));

    expect({
      aderentes: aderentes.length,
      ressalvas: ressalvas.length,
      abaixoDoCorte: abaixo.length,
      detalhe: faixas,
    }).toMatchObject({
      aderentes: expect.any(Number),
    });
    expect(aderentes.length, 'nenhum professor aderente').toBeGreaterThan(0);
    expect(ressalvas.length, 'nenhum professor com ressalvas').toBeGreaterThan(0);
    expect(abaixo.length, 'nenhum professor abaixo do corte').toBeGreaterThan(0);
  });
});
