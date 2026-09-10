/**
 * Guard: nome de voz do Gemini TTS só vive em lib/tts/elenco.ts.
 *
 * Por quê (06/09/2026): a voz estava escrita em cinco lugares e a saudação nominal
 * saiu num modelo diferente do corpo do vídeo. Personagem = voz + modelo + alvo,
 * junto, num lugar só. O guard varre os arquivos VERSIONADOS de produção (a mesma
 * régua dos outros guards: `git ls-files`), ignora comentários, e falha em literal
 * de voz fora do elenco. A allowlist é dívida declarada — só encolhe.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { ELENCO, type PerfilVoz } from '@/lib/tts/elenco';

const VOZES_GEMINI = ['Aoede', 'Iapetus', 'Vindemiatrix', 'Achird', 'Callirrhoe', 'Gacrux', 'Leda', 'Pulcherrima', 'Algieba', 'Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr', 'Enceladus'];
const PADRAO = new RegExp(`['"\`](${VOZES_GEMINI.join('|')})['"\`]`, 'g');
/** Ids de MODELO de TTS também: o bug da saudação (06/09) era um default de modelo
 *  (`gemini-3.1-flash-tts-preview`) num arquivo satélite, não um nome de voz. */
const PADRAO_MODELO = /['"`](gemini-[0-9.]+-(?:flash|pro)[a-z-]*tts[a-z-]*|pt-BR-Chirp3-HD-[A-Za-z]+)['"`]/g;
const DIRS = ['actions/', 'app/', 'lib/', 'components/', 'trigger/'];
/** Onde o nome PODE aparecer: o elenco, a assinatura (chaveada por voz) e o canário (direção por voz). */
const ALLOWLIST = new Set(['lib/tts/elenco.ts', 'lib/tts/assinaturas-voz.ts', 'lib/tts/canario.ts']);
/** Onde o id de MODELO pode aparecer além do elenco: o catálogo de preços (lista todos os ids, por construção). */
const ALLOWLIST_MODELO = new Set(['lib/tts/elenco.ts', 'lib/ia-cost-catalog.ts']);

function arquivos(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8' });
  return out.split('\0').filter((f) => ['.ts', '.tsx'].includes(extname(f)) && DIRS.some((d) => f.startsWith(d)) && !f.includes('/tests/'));
}
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Guard: nomes de voz só no elenco', () => {
  it('o elenco tem voz, modelo e alvo por personagem', () => {
    for (const p of Object.values(ELENCO)) {
      expect(VOZES_GEMINI).toContain(p.voz);
      expect(p.modeloVertex).toMatch(/tts/);
      expect(p.alvoF0Hz).toBeGreaterThan(80);
    }
  });

  it('nenhum arquivo de produção fora da allowlist escreve um nome de voz em literal', () => {
    const violacoes: string[] = [];
    for (const f of arquivos()) {
      if (ALLOWLIST.has(f)) continue;
      const src = semComentarios(readFileSync(f, 'utf-8'));
      const hits = [...src.matchAll(PADRAO)].map((m) => m[1]);
      if (hits.length) violacoes.push(`${f} (${[...new Set(hits)].join(', ')})`);
    }
    expect(violacoes, `Nome de voz em literal fora do elenco:\n  ${violacoes.join('\n  ')}\nUse ELENCO.<personagem>.voz (lib/tts/elenco.ts).`).toEqual([]);
  });

  it('nenhum arquivo de produção fora da allowlist escreve um id de MODELO de TTS em literal', () => {
    const violacoes: string[] = [];
    for (const f of arquivos()) {
      if (ALLOWLIST_MODELO.has(f)) continue;
      const src = semComentarios(readFileSync(f, 'utf-8'));
      const hits = [...src.matchAll(PADRAO_MODELO)].map((m) => m[1]);
      if (hits.length) violacoes.push(`${f} (${[...new Set(hits)].join(', ')})`);
    }
    expect(violacoes, `Id de modelo de TTS em literal fora do elenco:\n  ${violacoes.join('\n  ')}\nUse ELENCO.<personagem>.modeloVertex / modeloAiStudio (lib/tts/elenco.ts).`).toEqual([]);
  });

  /**
   * O ALVO tem que conter o take que foi APROVADO.
   *
   * `Medido 10/09/2026`: o alvo do Beto foi para 170 Hz — o centro de uma amostra de 6
   * takes — enquanto o take em que o Rodrigo escolheu a voz tinha 123 Hz. Ficou 5,9 st
   * fora, e por três dias o portão reprovou o registro escolhido e aprovou outro: as
   * devolutivas publicadas saíram 4,5 a 8,2 st acima da voz aprovada, sem nenhum sinal.
   *
   * A invariante não é o VALOR do alvo (recalibrar é livre e desejável) — é que a faixa
   * dele continue cobrindo a decisão humana. Alvo que se afasta do aprovado significa
   * que a escolha precisa ser refeita, não que o número precisa ser ajustado sozinho.
   */
  it('o alvo de cada personagem cobre o registro em que a voz foi APROVADA', () => {
    const st = (a: number, b: number) => 12 * Math.log2(a / b);
    const fora: string[] = [];
    // `ELENCO` é inferido com tipos literais; o cast pelo contrato dá acesso ao campo
    // opcional sem afrouxar nada — quem não o declara cai no `continue` abaixo.
    for (const [personagem, p] of Object.entries(ELENCO) as [string, PerfilVoz][]) {
      if (!p.aprovadoF0Hz) continue; // só valida quem declara a âncora
      const dist = Math.abs(st(p.aprovadoF0Hz, p.alvoF0Hz));
      const tol = p.tolSt ?? 1;
      if (dist > tol) {
        fora.push(`${personagem}: aprovado em ${p.aprovadoF0Hz} Hz, alvo ${p.alvoF0Hz} Hz ±${tol} st → ${dist.toFixed(2)} st FORA da faixa`);
      }
    }
    expect(fora, `Alvo descolado da voz aprovada:\n  ${fora.join('\n  ')}\nRecalibrar o alvo é livre; afastá-lo do take aprovado exige refazer a escolha (kit voz × rosto) com texto do USO REAL.`).toEqual([]);
  });
});
