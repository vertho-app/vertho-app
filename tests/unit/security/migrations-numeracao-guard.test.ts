// Guard: dois arquivos de migration não podem compartilhar o mesmo número.
//
// Por que existe — bateu DUAS VEZES em 06/08/2026, na mesma sessão:
//   · 199-jornadas-sequenciais.sql apareceu enquanto eu escrevia a minha 199;
//   · 204-radar-docentes-agg.sql apareceu enquanto eu escrevia a minha 204.
// Nos dois casos o arquivo do outro trabalho nasceu DEPOIS de eu ter conferido
// `ls migrations/` no início da rodada. Conferir uma vez não basta: o dono edita
// o repo em paralelo, e a janela entre "conferi" e "criei" é onde a colisão mora.
//
// O estrago não é o nome do arquivo. É que a ordem de aplicação passa a ser
// ambígua e quem reconstruir o schema a partir de `migrations/` pode rodar um e
// pular o outro — sem erro, porque cada um isolado é válido.
//
// ⚠️ Este guard varre o DIRETÓRIO, não `git ls-files` — ao contrário dos demais
// guards do repo, e de propósito. A colisão acontece no instante da CRIAÇÃO,
// quando o arquivo ainda é untracked; varrer só o versionado deixaria o guard
// verde exatamente no momento em que ele precisa reclamar. `migrations/` não
// abriga rascunho (a convenção do repo para isso é `scripts/_*`), então varrer o
// diretório não gera falso positivo.
import { readdirSync } from 'fs';
import { describe, it, expect } from 'vitest';

/**
 * Colisões HISTÓRICAS, já aplicadas em produção. Dívida declarada — a lista só
 * pode ENCOLHER, e entrada nova aqui é o bug que este guard existe para pegar.
 *
 * `085`: `085-radar-busca-avancada.sql` + `085-radar-busca-avancada-v2.sql`.
 * Encontrada por este guard na primeira execução. NÃO renumerada de propósito:
 * as duas já rodaram em produção, e escolher um número novo para a "v2" moveria
 * o ponto em que ela roda numa reconstrução do zero — decisão sobre ordem de
 * schema histórico que não cabe a um guard novo tomar de passagem.
 */
const HISTORICAS = ['085'];

/** Pura, para o caso de colisão ser testável sem sujar o diretório real. */
export function numerosDuplicados(nomes: string[]): Record<string, string[]> {
  const porNumero: Record<string, string[]> = {};
  for (const nome of nomes) {
    const m = /^(\d+)-/.exec(nome);
    if (!m) continue;
    (porNumero[m[1]] ||= []).push(nome);
  }
  return Object.fromEntries(Object.entries(porNumero).filter(([, arquivos]) => arquivos.length > 1));
}

describe('Guard: numeração de migrations', () => {
  it('detecta colisão (o caso real de 06/08)', () => {
    const dup = numerosDuplicados([
      '203-endpoint-disabled-reason.sql',
      '204-endpoint-dono-unico.sql',
      '204-radar-docentes-agg.sql',
      '205-outra.sql',
    ]);
    expect(Object.keys(dup)).toEqual(['204']);
    expect(dup['204']).toHaveLength(2);
  });

  it('não acusa numeração sã', () => {
    expect(numerosDuplicados(['201-a.sql', '202-b.sql', '203-c.sql'])).toEqual({});
  });

  it('ignora arquivo sem prefixo numérico', () => {
    expect(numerosDuplicados(['README.md', '_rascunho.sql', '201-a.sql'])).toEqual({});
  });

  it('migrations/ não tem número repetido', () => {
    const arquivos = readdirSync('migrations').filter((f) => f.endsWith('.sql'));
    const dup = numerosDuplicados(arquivos);
    for (const n of HISTORICAS) delete dup[n];
    const lista = Object.entries(dup).map(([n, fs]) => `  ❌ ${n}: ${fs.join(' · ')}`);
    expect(
      lista.join('\n'),
      lista.length
        ? `Migrations com número repetido:\n${lista.join('\n')}\n\n` +
          'A ordem de aplicação fica ambígua e quem reconstruir o schema pode rodar uma e pular a outra, ' +
          'sem erro — cada uma isolada é válida. Renumere a SUA (a do trabalho paralelo não se toca).'
        : '',
    ).toBe('');
  });
});
