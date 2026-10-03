import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { semComentarios } from '../helpers/fonte';
import {
  GRAVACAO_TAMANHO_DA_ETIQUETA,
  entradaDaEtiqueta,
  redigirUrlDaGravacao,
} from '@/lib/demo/degustacao-gravacao';
import { etiquetaDaGravacao } from '@/lib/demo/degustacao-gravacao-servidor';
import { emitirCodigoCurto } from '@/lib/demo/degustacao-link-curto';

process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'service-role-key-used-only-by-unit-test';

/**
 * Gravação de tela da degustação C (Sentry Replay, plano de 50 por mês).
 *
 * O que custa caro e não falha sozinho: ligar o replay para o app inteiro (gasta
 * a cota no primeiro dia, e o mesmo código atende clientes reais), mandar o
 * código do convite para um terceiro, e a etiqueta do painel não bater com a do
 * navegador (a gravação existe e ninguém acha).
 */

const SID = 'cccccccccccccccccccc';
const CODIGO = 'AbCdEfGhIjKlMnOpQrStUvWx';

describe('etiqueta da gravação', () => {
  it('o painel (node) e o navegador (crypto.subtle) calculam a MESMA etiqueta', async () => {
    const codigo = emitirCodigoCurto('acme-demo', SID);
    // o mesmo cálculo do componente do navegador
    const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entradaDaEtiqueta(codigo)));
    const doNavegador = Array.from(new Uint8Array(resumo)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, GRAVACAO_TAMANHO_DA_ETIQUETA);
    expect(etiquetaDaGravacao('acme-demo', SID)).toBe(doNavegador);
    expect(doNavegador).toMatch(/^[0-9a-f]{12}$/);
  });

  it('não carrega o código do convite, a sessão nem nome: é um hash', () => {
    const etiqueta = etiquetaDaGravacao('acme-demo', SID);
    expect(etiqueta).not.toContain(SID.slice(0, 6));
    expect(emitirCodigoCurto('acme-demo', SID)).not.toContain(etiqueta);
    expect(entradaDaEtiqueta(CODIGO)).toContain(CODIGO); // a ENTRADA tem o código; a etiqueta não
    expect(etiqueta).not.toContain(CODIGO.slice(0, 6));
  });

  it('muda de sessão para sessão e de ambiente para ambiente (dois leads nunca partilham gravação)', () => {
    const a = etiquetaDaGravacao('acme-demo', SID);
    expect(etiquetaDaGravacao('acme-demo', 'd'.repeat(20))).not.toBe(a);
    expect(etiquetaDaGravacao('escolas-acme', SID)).not.toBe(a);
    expect(etiquetaDaGravacao('acme-demo', SID)).toBe(a);
  });
});

describe('redação de credenciais nas URLs da gravação', () => {
  it('tira o ticket da sala, o código de volta e o passe, e mantém o resto', () => {
    const url = `https://rh-demo.vertho.ai/dashboard/gestor/engajamento?sala=abc.def-123&tela=computador&volta=${CODIGO}&cena=engajamento`;
    const limpa = redigirUrlDaGravacao(url);
    expect(limpa).toBe('https://rh-demo.vertho.ai/dashboard/gestor/engajamento?sala=x&tela=computador&volta=x&cena=engajamento');
    expect(redigirUrlDaGravacao('/auth/degustacao?passe=eyJh.bGci&aviso=aguarde')).toBe('/auth/degustacao?passe=x&aviso=aguarde');
    expect(redigirUrlDaGravacao('/x?ticket=segredo#ancora')).toBe('/x?ticket=x#ancora');
  });

  it('tira o código do link curto do caminho /c/<código>', () => {
    expect(redigirUrlDaGravacao(`https://acme-demo.vertho.ai/c/${CODIGO}`)).toBe('https://acme-demo.vertho.ai/c/x');
    expect(redigirUrlDaGravacao(`https://acme-demo.vertho.ai/c/${CODIGO}?aviso=x`)).toBe('https://acme-demo.vertho.ai/c/x?aviso=x');
  });

  it('não mexe em texto sem credencial, nem em caminho parecido', () => {
    for (const texto of ['/dashboard', 'Início da degustação', '/c/curto', '/cena/abc', 'https://acme-demo.vertho.ai/dashboard?x=1']) {
      expect(redigirUrlDaGravacao(texto)).toBe(texto);
    }
  });

  it('o nome do parâmetro não escapa por caixa', () => {
    expect(redigirUrlDaGravacao('/x?SALA=abc&Volta=def')).toBe('/x?SALA=x&Volta=x');
  });
});

describe('a cota de 50 gravações por mês (guard estático)', () => {
  const rastreados = () => execFileSync('git', ['ls-files', 'app', 'lib', 'components', 'instrumentation-client.ts', 'sentry.client.config.js'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((arquivo) => /\.(ts|tsx|js|mjs)$/.test(arquivo));

  it('o denominador não é zero: o guard enxerga o arquivo de init do Sentry', () => {
    expect(rastreados()).toContain('sentry.client.config.js');
    expect(rastreados().length).toBeGreaterThan(100);
  });

  it('o init do Sentry NÃO liga replay para o app inteiro', () => {
    const fonte = semComentarios(readFileSync('sentry.client.config.js', 'utf8'));
    expect(fonte).not.toMatch(/replayIntegration/);
    // taxa de sessão ou de erro acima de zero gastaria a cota com cliente real
    for (const taxa of fonte.matchAll(/replays(?:Session|OnError)SampleRate\s*:\s*([^,}\n]+)/g)) {
      expect(Number(taxa[1].trim()), taxa[0]).toBe(0);
    }
  });

  it('só o componente da degustação referencia o replay (ninguém liga por outro caminho)', () => {
    const usam = rastreados().filter((arquivo) => /replayIntegration|lazyLoadIntegration|getReplay\(/.test(semComentarios(readFileSync(arquivo, 'utf8'))));
    expect(usam).toEqual(['app/degustacao/gravacao-da-degustacao.tsx']);
  });

  it('o componente só roda para convidado (precisa do código) e recusa navegador automatizado', () => {
    const fonte = semComentarios(readFileSync('app/degustacao/gravacao-da-degustacao.tsx', 'utf8'));
    expect(fonte).toMatch(/if \(!codigo\) return;/);
    expect(fonte).toMatch(/webdriver === true\) return;/);
    expect(fonte).toMatch(/maskAllInputs: true/);
    // nunca o código como valor de tag: só a etiqueta (hash do código)
    expect(fonte).not.toMatch(/setTag\(\s*[^,]+,\s*codigo\s*\)/);
    expect(fonte).toMatch(/setTag\(GRAVACAO_TAG, await etiquetaDoConvite\(codigo\)\)/);
  });
});
