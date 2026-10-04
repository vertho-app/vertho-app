import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * R-23 (03/10/2026): o kit comercial que alimenta o copiloto e o assistente do
 * representante (`sales_materials`, semeado por `scripts/seed-sales-kit.mjs`)
 * vendia o Pulso (módulo fora do ar), respondia "Serve pra NR-1?" com o Pulso,
 * descrevia uma trilha de 14 semanas com missões nas semanas 4, 8 e 12, dizia
 * "PII nunca toca a IA", citava a Plenária e o Dossiê do Gestor (nunca
 * entregues), "dupla IA em toda avaliação" e "delta"/"N3.4" (ninguém do cliente
 * vê nota decimal).
 *
 * A fonte versionada é o seed; o banco só muda quando o dono aplica o SQL
 * gerado. Este teste garante que o seed não volta a prometer o que o produto não
 * entrega, e assim o próximo reseed não desfaz a correção.
 */
type Material = { title: string; category: string; segment: string; description: string; content: string };

function carregarKit(): Material[] {
  const src = readFileSync(join(process.cwd(), 'scripts', 'seed-sales-kit.mjs'), 'utf-8');
  const ini = src.indexOf('const KIT = [');
  expect(ini, 'o seed perdeu a constante KIT').toBeGreaterThan(-1);
  // O array termina na primeira linha que é só "];" depois do início.
  const resto = src.slice(ini);
  const fim = resto.search(/\n\];/);
  expect(fim, 'o seed perdeu o fim da constante KIT').toBeGreaterThan(0);
  const literal = resto.slice('const KIT = '.length, fim + 2);
  return vm.runInNewContext(`(${literal})`) as Material[];
}

const PROIBIDOS: Array<[string, RegExp]> = [
  ['Pulso (módulo fora do ar)', /pulso/i],
  ['"PII nunca toca a IA" (o nome vai à IA em parte dos fluxos)', /PII nunca/i],
  ['trilha de 14 semanas', /14 semanas/i],
  ['missões nas semanas 4, 8 e 12', /sem\s*4\/8\/12/i],
  ['Plenária (nunca entregue)', /plen[aá]ria/i],
  ['Dossiê do Gestor (nunca entregue)', /dossi[eê]/i],
  ['"Dual-IA em toda avaliação"', /dual-?ia/i],
  ['delta (nota decimal não chega ao cliente)', /\bdelta\b/i],
  ['nível com decimal, como N3.4', /\bN[1-4]\.\d\b/],
  ['piloto de 2 semanas', /piloto de 2 semanas|piloto = 2 semanas|Piloto de 2 sem/i],
  ['integração por API, SSO ou HRIS que não existe', /integra por API|puxa dados do HRIS/i],
];

describe('seed do kit comercial: sem promessa que o produto não cumpre', () => {
  const kit = carregarKit();

  it('o seed ainda traz os 12 materiais do kit', () => {
    expect(kit).toHaveLength(12);
    for (const m of kit) {
      expect(m.title).toBeTruthy();
      expect(m.content.length).toBeGreaterThan(200);
    }
  });

  for (const [rotulo, re] of PROIBIDOS) {
    it(`nenhum material cita: ${rotulo}`, () => {
      const achados = kit
        .filter((m) => re.test(m.content) || re.test(m.description))
        .map((m) => m.title);
      expect(achados).toEqual([]);
    });
  }

  it('a resposta de NR-1 diz que não é a finalidade da Vertho e não promete aderência', () => {
    const bc = kit.find((m) => m.title.startsWith('Battlecard — Objeções'))!;
    const linha = bc.content.split('\n').find((l) => l.includes('Serve pra NR-1?'))!;
    expect(linha).toMatch(/Não é a finalidade da Vertho/);
    expect(linha).toMatch(/Não prometa aderência à NR-1/);
  });

  it('a resposta de LGPD descreve o fluxo real, com nome e cargo nos relatórios ao gestor e ao RH', () => {
    const bc = kit.find((m) => m.title.startsWith('Battlecard — Objeções'))!;
    const linha = bc.content.split('\n').find((l) => l.includes('Como fica a LGPD?'))!;
    expect(linha).toMatch(/identificador/);
    expect(linha).toMatch(/relatórios ao gestor e ao RH vão com nome e cargo/);
  });

  it('o mapa da jornada descreve a Jornada de 7 semanas e os programas que existem', () => {
    const mapa = kit.find((m) => m.title.startsWith('Mapa da jornada'))!;
    expect(mapa.content).toMatch(/TRILHA \(sem 1 a 6\)/);
    expect(mapa.content).toMatch(/FECHAMENTO \(sem 7\)/);
    expect(mapa.content).toMatch(/Jornada = 7 semanas/);
    expect(mapa.content).toMatch(/Onboarding = 12 semanas/);
    expect(mapa.content).toMatch(/Personalizado = /);
  });
});
