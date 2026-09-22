/**
 * Guard: `dedupe_key` de `whatsapp_mensagens_enviadas` só é LIDO pela caixa de entrada.
 *
 * Por que existe (22/09/2026): `lib/whatsapp/registro-saida.ts` grava `dedupe_key` SÓ quando a
 * origem é `inbox` (as chaves da cadência se repetem toda semana e colidiriam no índice único).
 * Quem procura ali a chave de outra origem nunca acha nada, e o código segue como se não houvesse
 * envio anterior. Foi assim que o limite de links do Beto (1 a cada 5 min, 3 por dia) procurou
 * `beto-acesso:*` nas enviadas e não segurou link nenhum. `Medido:` 7 respostas do Beto gravadas,
 * 0 com chave; as chaves estavam em `notification_deliveries`. O teste de unidade passava porque o
 * mock devolvia as mesmas linhas para qualquer tabela.
 *
 * A chave de envio de QUALQUER origem vive em `notification_deliveries.dedupe_key`.
 *
 * O que conta como leitura: um encadeamento que começa em `.from('whatsapp_mensagens_enviadas')`
 * e cita `dedupe_key` antes do `;`, sem `.insert(`/`.upsert(`/`.update(` (gravar a chave é o
 * trabalho do registro e da própria caixa).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Leitores legítimos: consultam as chaves que eles mesmos gravam. */
const LEITORES_PERMITIDOS = new Set([
  // Duplo clique no envio da caixa (`prepararEnvio`): a chave é da própria caixa.
  'app/admin-v2/cliente/inbox-actions.ts',
]);

function arquivosDeCodigo(): string[] {
  return execFileSync('git', ['ls-files', '-z', '*.ts', '*.tsx'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\0')
    .filter((f) => f && !f.startsWith('tests/') && existsSync(f));
}

const RE_FROM = /from\(\s*['"`]whatsapp_mensagens_enviadas['"`]\s*\)/g;

/** Leituras de `dedupe_key` nas enviadas, por arquivo (com a linha de cada uma). */
function leiturasDeDedupe(fonte: string): number[] {
  const linhas: number[] = [];
  for (const m of fonte.matchAll(RE_FROM)) {
    const inicio = m.index ?? 0;
    const fim = fonte.indexOf(';', inicio);
    const trecho = fonte.slice(inicio, fim === -1 ? undefined : fim);
    if (!/dedupe_key/.test(trecho)) continue;
    if (/\.(insert|upsert|update)\(/.test(trecho)) continue;
    linhas.push(fonte.slice(0, inicio).split('\n').length);
  }
  return linhas;
}

describe('dedupe_key das enviadas é só da caixa', () => {
  const arquivos = arquivosDeCodigo();

  it('a varredura enxerga o repositório (lista vazia passaria em tudo)', () => {
    expect(arquivos.length).toBeGreaterThan(500);
    expect(arquivos).toContain('lib/whatsapp/registro-saida.ts');
  });

  it('nenhum código fora da caixa procura chave nas enviadas', () => {
    const violacoes = arquivos
      .filter((f) => !LEITORES_PERMITIDOS.has(f))
      .flatMap((f) => leiturasDeDedupe(readFileSync(f, 'utf-8')).map((l) => `${f}:${l}`));
    expect(
      violacoes,
      'Lendo dedupe_key de whatsapp_mensagens_enviadas: lá só a caixa grava a chave. '
      + 'Procure em notification_deliveries (ver o cabeçalho deste teste).',
    ).toEqual([]);
  });

  it('a lista de permitidos não guarda entrada morta', () => {
    for (const f of LEITORES_PERMITIDOS) {
      expect(existsSync(f), `${f} não existe mais`).toBe(true);
      expect(leiturasDeDedupe(readFileSync(f, 'utf-8')).length, `${f} não lê mais a chave`).toBeGreaterThan(0);
    }
  });

  it('o detector distingue leitura de gravação', () => {
    expect(leiturasDeDedupe(
      "const r = await tdb.raw.from('whatsapp_mensagens_enviadas')\n  .select('dedupe_key, erro')\n  .like('dedupe_key', 'x:%');",
    )).toEqual([1]);
    expect(leiturasDeDedupe(
      "await client.from('whatsapp_mensagens_enviadas').insert({ dedupe_key: k, texto });",
    )).toEqual([]);
    expect(leiturasDeDedupe(
      "await tdb.from('whatsapp_mensagens_enviadas').select('texto, origem');",
    )).toEqual([]);
  });
});
