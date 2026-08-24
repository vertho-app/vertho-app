/**
 * Guard E11: a classe "`error` não checado" para de crescer.
 *
 * O supabase-js **retorna** `{ data, error }` em vez de lançar. Quem não olha o
 * retorno transforma falha de banco em "não encontrado" — e o `try/catch` em
 * volta não vê nada. É a classe nº 1 do "NÃO fazer" do CLAUDE.md, a que mordeu
 * 2× no mesmo dia (27/07), e era a única das oito classes com disciplina no repo
 * **sem guard**: tinha 5 testes de regressão dos sites já corrigidos, que por
 * definição não pegam site novo.
 *
 * `Medido em 24/08:` **1010 sites** em 219 arquivos (830 do detector A, 180 do
 * B) antes desta sprint; **1004** depois dos consertos de B4, B5, B10 e B11. O
 * valor deste guard não é zerar isso — seria uma refatoração de semanas, com
 * risco próprio — é **congelar o estoque** e fazer o site 1005 falhar no CI.
 *
 * 🔑 POR QUE A ALLOWLIST É POR FINGERPRINT, NÃO POR CONTAGEM.
 * O E8 da mesma auditoria mostrou o modo de falha da contagem por arquivo: um
 * arquivo com 24 sites que corrige 1 e cria 1 novo continua verde — a dívida
 * troca de lugar e o guard aplaude. Fingerprint = arquivo + hash do trecho
 * normalizado: sobrevive a mudança de linha (formatação não mexe na lista) e
 * NÃO sobrevive a mudança do trecho, que é exatamente quando alguém deve olhar.
 *
 * Os detectores e seus limites estão em `tests/helpers/supabase-erro-ast.ts`.
 */
import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { varrerRepo, varrerArquivo, arquivosDeProducao } from '../../helpers/supabase-erro-ast';

const config = JSON.parse(readFileSync('config/error-nao-checado-allowlist.json', 'utf-8'));
/** `{ arquivo: { fingerprint: quantas cópias } }` — ver o script gerador. */
const allowlist: Record<string, Record<string, number>> = config.allowlist;

const achados = varrerRepo();

/** Quantas vezes cada fingerprint aparece hoje. */
const vivos = new Map<string, number>();
for (const a of achados) vivos.set(a.fingerprint, (vivos.get(a.fingerprint) || 0) + 1);

const permitido = (fp: string): number => {
  const [file, hash] = fp.split('::');
  return allowlist[file]?.[hash] ?? 0;
};

describe('Guard E11: `error` não checado não cresce', () => {
  it('o guard enxerga o repositório (não passou vazio por engano)', () => {
    expect(arquivosDeProducao().length).toBeGreaterThan(100);
    expect(achados.length).toBeGreaterThan(100);
  });

  it('nenhum site NOVO fora da allowlist', () => {
    // Um fingerprint com 2 cópias declaradas e 3 no código tem 1 site novo: a
    // dívida não pode crescer DENTRO de uma entrada já aprovada.
    const excedentes = new Set<string>();
    for (const [fp, n] of vivos) if (n > permitido(fp)) excedentes.add(fp);
    const vistos = new Map<string, number>();
    const novos = achados.filter((a) => {
      if (!excedentes.has(a.fingerprint)) return false;
      const jaVi = vistos.get(a.fingerprint) || 0;
      vistos.set(a.fingerprint, jaVi + 1);
      return jaVi >= permitido(a.fingerprint); // só as cópias EXCEDENTES
    });
    if (novos.length > 0) {
      const porArquivo: Record<string, typeof novos> = {};
      for (const n of novos) (porArquivo[n.file] ||= []).push(n);
      throw new Error(
        `${novos.length} site(s) NOVO(s) da classe "error não checado":\n` +
        Object.entries(porArquivo).map(([f, ns]) =>
          `  ❌ ${f}\n` + ns.map((n) => `       :${n.line}  [${n.tipo}]\n         ${n.trecho}`).join('\n'),
        ).join('\n') +
        '\n\nO supabase-js RETORNA `{ error }` — try/catch não pega.\n' +
        'Conserto:\n' +
        '  · const { data, error } = await …  → e USE o `error` (500 acionável, ou degradação registrada)\n' +
        '  · mutação: capture o retorno; escrita que falha não pode virar `ok: true`\n' +
        '  · a régua da casa: na CONSTRUÇÃO falhe alto, na ENTREGA degrade com registrarDegradacao\n' +
        '\nSe for falso positivo (cadeia que só parece supabase), declare na allowlist com o motivo.',
      );
    }
  });

  /**
   * A lista só encolhe. Sem isto, corrigir um site deixa a entrada para trás e a
   * folga vira permissão pré-aprovada para o próximo — o mesmo modo de falha que
   * o E8 documentou nas outras duas allowlists.
   */
  it('a allowlist só encolhe (nenhuma entrada stale)', () => {
    const stale: string[] = [];
    for (const [file, hashes] of Object.entries(allowlist)) {
      if (!existsSync(file)) { stale.push(`  🗑️ ${file}: arquivo não existe mais`); continue; }
      for (const [h, n] of Object.entries(hashes)) {
        const agora = vivos.get(`${file}::${h}`) ?? 0;
        if (agora === 0) stale.push(`  ⬇️ ${file}::${h}: corrigido ou reescrito — remova a entrada`);
        else if (agora < n) stale.push(`  ⬇️ ${file}::${h}: declarado ${n}, resta ${agora} — baixe o número`);
      }
    }
    if (stale.length > 0) {
      throw new Error(
        `${stale.length} entrada(s) stale:\n${stale.slice(0, 40).join('\n')}` +
        (stale.length > 40 ? `\n  … e mais ${stale.length - 40}` : '') +
        '\n\nRode `npx tsx scripts/_atualizar-allowlist-erro.ts` e confira o diff: ele só deve ENCOLHER.',
      );
    }
  });

  it('o estoque declarado bate com o medido (a dívida é um número, não uma sensação)', () => {
    expect(config.total_declarado).toBe(achados.length);
  });
});

/**
 * 🔑 OS TRÊS DETECTORES, EXERCITADOS.
 *
 * O detector B existe porque o guard que a auditoria descreveu primeiro —
 * "procure `const { data } = await …`" — teria ficado VERDE sobre B4 e B5, os
 * dois achados que motivaram a sprint: os dois escreviam `await sb.from(...)
 * .update(...)` sem destructuring nenhum. Um guard que dá cobertura ao que não
 * vê é pior que nenhum.
 *
 * O detector C achou ZERO sites reais no repo. Zero é um resultado legítimo —
 * mas indistinguível de "o detector está quebrado" sem uma fixture. Daí estas.
 */
describe('os detectores, contra fixture', () => {
  const varrer = (src: string) => varrerArquivo('fixture.ts', src);

  it('A: destructuring sem `error` é achado', () => {
    const a = varrer(`async function f(sb) {
      const { data } = await sb.from('trilhas').select('*').eq('id', 1);
      return data;
    }`);
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('A-destructuring-sem-error');
  });

  it('A: com `error` na lista, e usado, não é achado', () => {
    expect(varrer(`async function f(sb) {
      const { data, error } = await sb.from('trilhas').select('*').eq('id', 1);
      if (error) throw new Error(error.message);
      return data;
    }`)).toHaveLength(0);
  });

  it('A: `error` renomeado também conta como capturado', () => {
    expect(varrer(`async function f(sb) {
      const { data, error: errTrilha } = await sb.from('trilhas').select('*');
      if (errTrilha) throw new Error(errTrilha.message);
      return data;
    }`)).toHaveLength(0);
  });

  it('B: mutação com o resultado inteiramente ignorado é achado (é a forma de B4/B5)', () => {
    const a = varrer(`async function f(sb, payload, id) {
      await sb.from('temporada_semana_progresso').update(payload).eq('id', id);
      return { ok: true };
    }`);
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('B-mutacao-ignorada');
  });

  it('B: LEITURA solta não é achado (não há dano em descartar um select)', () => {
    expect(varrer(`async function f(sb) {
      await sb.from('trilhas').select('id');
    }`)).toHaveLength(0);
  });

  it('C: capturar `error` e nunca ler é achado — conformidade aparente', () => {
    const a = varrer(`async function f(sb) {
      const { data, error } = await sb.from('trilhas').select('*');
      return data;
    }`);
    expect(a).toHaveLength(1);
    expect(a[0].tipo).toBe('C-error-nao-lido');
  });

  it('o fingerprint sobrevive a mudança de LINHA e muda com o TRECHO', () => {
    const base = `async function f(sb) {
      const { data } = await sb.from('trilhas').select('*');
      return data;
    }`;
    const comLinhaAntes = `// comentário novo em cima\n${base}`;
    const outroTrecho = base.replace("'trilhas'", "'colaboradores'");

    expect(varrer(comLinhaAntes)[0].fingerprint).toBe(varrer(base)[0].fingerprint);
    expect(varrer(outroTrecho)[0].fingerprint).not.toBe(varrer(base)[0].fingerprint);
  });
});
