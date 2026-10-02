import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODELOS_DISPONIVEIS } from '@/lib/ai-tasks';

/**
 * Seletor de modelo em tela LÊ o catálogo central (`MODELOS_DISPONIVEIS`) — não tem lista própria.
 *
 * Medido em 02/10/2026: a tela do IA4 ("Agora (depuração) / Em lote −50%") mantinha
 * uma cópia fixa e ficou sem Sonnet 5.5, Opus 5.5 e GPT 6.1 Sol, que já estavam no
 * catálogo (ou tinham preço e rota) desde o dia anterior. Eram quatro cópias
 * (empresa, fase4, simulador+rota, PPP). Modelo novo entra num lugar só.
 *
 * O guard varre os arquivos VERSIONADOS (`git ls-files`) de `app/` e `components/`
 * atrás de `{ id: '<modelo>', label: … }` literal. O catálogo e o preço vivem em `lib/`.
 */
const RAIZ = join(__dirname, '..', '..', '..');
const PADRAO = /\{\s*id:\s*'(?:claude|gpt|gemini|kimi|qwen|grok|muse)[^']*'\s*,\s*label:/;

function versionados(): string[] {
  const out = execFileSync('git', ['-C', RAIZ, 'ls-files', '--', 'app', 'components'], { encoding: 'utf8' });
  return out.split(/\r?\n/).filter((f) => /\.(ts|tsx)$/.test(f));
}

describe('seletor de modelo lê o catálogo central', () => {
  it('nenhuma tela declara lista fixa de modelos (id literal + label)', () => {
    const achados: string[] = [];
    for (const f of versionados()) {
      const txt = readFileSync(join(RAIZ, f), 'utf8');
      txt.split(/\r?\n/).forEach((linha, i) => { if (PADRAO.test(linha)) achados.push(`${f}:${i + 1}`); });
    }
    expect(achados, `lista fixa de modelos em tela (use MODELOS_DISPONIVEIS de @/lib/ai-tasks):\n${achados.join('\n')}`).toEqual([]);
  });

  it('o padrão enxerga uma lista fixa (a trava sabe falhar)', () => {
    expect(PADRAO.test("  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },")).toBe(true);
    expect(PADRAO.test("  { id: 'gpt-6.1-sol',     label: 'GPT 6.1 Sol' },")).toBe(true);
    expect(PADRAO.test("  { id: 'video_short', icon: '🎬' },")).toBe(false);
  });

  it('o catálogo tem os modelos que a tela do IA4 não mostrava', () => {
    const ids = MODELOS_DISPONIVEIS.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-6.1-sol']));
  });
});
