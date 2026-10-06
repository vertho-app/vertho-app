/**
 * Reanálise de segurança de 05/10/2026, item 4: dois pontos pequenos de confiança em entrada do cliente.
 *
 *  1. A tela da semana aceitava mensagem do player Bunny com `event.origin.includes('mediadelivery.net')`.
 *     `https://mediadelivery.net.evil.com` e `http://x.mediadelivery.net` passavam. Agora é igualdade com a
 *     origem exata do player (`eOrigemDoPlayerBunny`).
 *  2. `resolverEscopoDoGestor` recebe o cliente do banco como argumento e morava em um arquivo `'use server'`,
 *     onde todo export é um endpoint. Passou para `lib/gestor/escopo.ts`; o arquivo de actions não pode
 *     voltar a exportá-la.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eOrigemDoPlayerBunny, ORIGEM_DO_PLAYER_BUNNY } from '@/lib/conteudo/bunny-embed';

const raiz = join(__dirname, '..', '..', '..');
const ler = (rel: string) => readFileSync(join(raiz, rel), 'utf8');

describe('origem do player Bunny: igualdade, e não substring', () => {
  it('aceita só a origem exata do player', () => {
    expect(ORIGEM_DO_PLAYER_BUNNY).toBe('https://iframe.mediadelivery.net');
    expect(eOrigemDoPlayerBunny('https://iframe.mediadelivery.net')).toBe(true);
  });

  it.each([
    'https://mediadelivery.net.evil.com',
    'https://iframe.mediadelivery.net.evil.com',
    'https://evil.com/?https://iframe.mediadelivery.net',
    'http://iframe.mediadelivery.net',
    'https://iframe.mediadelivery.net:8443',
    'https://iframe.mediadelivery.net/',
    'https://IFRAME.mediadelivery.net',
    'https://evilmediadelivery.net',
    'https://mediadelivery.net',
    '',
    'null',
  ])('🔴 recusa %s', (origem) => {
    expect(eOrigemDoPlayerBunny(origem)).toBe(false);
  });

  it.each([undefined, null, 0, {}, ['https://iframe.mediadelivery.net']])('recusa entrada que não é texto: %j', (v) => {
    expect(eOrigemDoPlayerBunny(v)).toBe(false);
  });

  it('a tela da semana usa o helper e não voltou à substring', () => {
    const fonte = ler('app/dashboard/temporada/semana/[week]/page.tsx');
    expect(fonte).toContain('eOrigemDoPlayerBunny(event.origin)');
    expect(fonte).not.toMatch(/origin\.includes\(\s*['"]mediadelivery/);
    expect(fonte).not.toMatch(/\.includes\(\s*['"]mediadelivery\.net['"]\s*\)/);
  });
});

describe('a régua de escopo do gestor não é endpoint', () => {
  const ehUseServer = (fonte: string) => /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use server['"]/.test(fonte);

  it('lib/gestor/escopo.ts exporta a função e NÃO é um arquivo "use server"', () => {
    const fonte = ler('lib/gestor/escopo.ts');
    expect(fonte).toMatch(/export async function resolverEscopoDoGestor\(/);
    expect(ehUseServer(fonte)).toBe(false);
  });

  it('as actions do gestor continuam "use server" e não exportam a régua', () => {
    const fonte = ler('app/dashboard/gestor/actions.ts');
    expect(ehUseServer(fonte)).toBe(true);
    expect(fonte).not.toMatch(/export\s+(async\s+)?function\s+resolverEscopoDoGestor/);
    expect(fonte).not.toMatch(/export\s*\{[^}]*resolverEscopoDoGestor/);
    expect(fonte).toMatch(/import\s*\{[^}]*resolverEscopoDoGestor[^}]*\}\s*from\s*['"]@\/lib\/gestor\/escopo['"]/);
  });

  it('nenhum outro arquivo "use server" importa a régua de um lugar que a reexporte como action', () => {
    const consumidores = ['app/dashboard/gestor/actions.ts'];
    for (const rel of consumidores) {
      expect(ler(rel)).not.toMatch(/export\s*\{[^}]*resolverEscopoDoGestor[^}]*\}\s*from/);
    }
  });
});
