import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { criarSupabaseMock } from '../../helpers/supabase-mock';
import { upsertRelatorioAgregado } from '@/actions/fase5/_shared';

/**
 * B11 da auditoria 22/08 — `upsertRelatorioAgregado` era read-modify-write, não
 * atômico, e silencioso nos dois ramos.
 *
 * A corrida foi PROVADA no banco, em sandbox isolada, com duas conexões e
 * transações reais (24/08): `select + insert` concorrente produziu **2 linhas**;
 * o upsert nativo sobre a coluna gerada produziu **1 linha e 0 erro**. Um teste
 * unitário sequencial não consegue exprimir isso — o que ele PODE provar, e é o
 * que está aqui, é que a forma mudou: não existe mais janela entre ler e
 * escrever, e a falha não passa mais em silêncio.
 *
 * 🔴 E o achado que apareceu ao consertar: os QUATRO tipos que esta função grava
 * não cabiam em `relatorios_tipo_check`. O Postgres recusava, o erro era
 * descartado e a action devolvia `success: true` — os quatro tipos tinham ZERO
 * linhas no banco. O último bloco deste arquivo existe para isso não voltar.
 */

const TIPO = 'rh_manual';

describe('B11 — o upsert do relatório agregado é atômico', () => {
  it('é UMA operação: não há mais select antes da escrita (a janela sumiu)', async () => {
    const sb = criarSupabaseMock({});
    await upsertRelatorioAgregado(sb.client, TIPO, { a: 1 });

    expect(sb.escritas).toHaveLength(1);
    expect(sb.escritas[0].op).toBe('upsert');
    // o select prévio era a janela da corrida
    expect(sb.chamadas.filter((c) => c.metodo === 'select')).toHaveLength(0);
  });

  it('nomeia o índice certo em onConflict (a coluna GERADA, não colaborador_id)', async () => {
    const sb = criarSupabaseMock({});
    await upsertRelatorioAgregado(sb.client, TIPO, { a: 1 });

    const upsert = sb.chamadas.find((c) => c.metodo === 'upsert');
    expect(upsert?.args[1]).toEqual({ onConflict: 'empresa_id,tipo,colab_key' });
  });

  it('🔴 falha de escrita LANÇA — antes, os chamadores devolviam success:true sem ter gravado', async () => {
    const sb = criarSupabaseMock({ falhas: [{ tabela: 'relatorios', op: 'upsert', mensagem: 'violates check constraint' }] });
    await expect(upsertRelatorioAgregado(sb.client, TIPO, { a: 1 }))
      .rejects.toThrow(/não foi possível salvar o relatório "rh_manual"/);
  });
});

/**
 * Guard do achado: todo `tipo` gravado no código tem de caber no CHECK do banco.
 *
 * A lista é lida da MIGRATION, não copiada — copiar aqui a faria envelhecer em
 * silêncio, que é a mesma classe do bug. `Medido em 24/08:` quatro tipos usados
 * pelo código estavam fora do CHECK desde sempre (ele veio do baseline do GAS), e
 * o único sintoma era o relatório não existir.
 */
describe('todo tipo de relatório gravado cabe no CHECK do banco', () => {
  const migration = readFileSync('migrations/224-relatorios-tipo-check-fase5.sql', 'utf-8');
  const permitidos = new Set(
    [...migration.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]),
  );

  const arquivos = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8' })
    .split('\0')
    .filter((f) => /^(actions|lib|app|trigger)\/.*\.tsx?$/.test(f));

  /** `upsertRelatorioAgregado(tdb, 'x'` e `.from('relatorios').insert({… tipo: 'x'`. */
  function tiposUsados(): Array<{ file: string; tipo: string }> {
    const achados: Array<{ file: string; tipo: string }> = [];
    for (const f of arquivos) {
      let src: string;
      try { src = readFileSync(f, 'utf-8'); } catch { continue; }
      if (!src.includes('relatorios')) continue;
      for (const m of src.matchAll(/upsertRelatorioAgregado\s*\([^,]+,\s*'([^']+)'/g)) {
        achados.push({ file: f, tipo: m[1] });
      }
      if (/from\(\s*'relatorios'\s*\)/.test(src)) {
        for (const m of src.matchAll(/tipo:\s*'([a-z_]+)'/g)) achados.push({ file: f, tipo: m[1] });
      }
    }
    return achados;
  }

  it('a lista de permitidos foi lida da migration (não é uma cópia vazia)', () => {
    expect(permitidos.size).toBeGreaterThanOrEqual(9);
    expect(permitidos.has('plenaria_evolucao')).toBe(true);
  });

  it('nenhum tipo gravado pelo código está fora do CHECK', () => {
    const fora = tiposUsados().filter((u) => !permitidos.has(u.tipo));
    if (fora.length > 0) {
      throw new Error(
        `${fora.length} tipo(s) de relatório que o banco vai RECUSAR:\n` +
        fora.map((u) => `  ❌ ${u.file}: '${u.tipo}'`).join('\n') +
        '\n\nO CHECK `relatorios_tipo_check` recusa, e se a escrita não checar `{ error }`\n' +
        'o relatório simplesmente não existe — foi assim que 4 tipos da fase 5 ficaram\n' +
        'com ZERO linhas sem ninguém notar. Amplie o CHECK numa migration nova.',
      );
    }
  });
});
