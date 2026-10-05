import { describe, it, expect, vi, afterEach } from 'vitest';
import { montarAlerta } from '@/lib/pipeline-health/core';
import type { ResultadoCheck } from '@/lib/pipeline-health/types';

/**
 * O alerta é o único ponto do health-check que chega numa pessoa. Dois defeitos reais
 * corrigidos em 27/07, ambos silenciosos porque e-mail não tem quem reclame:
 *  · o assunto contava TIPOS de achado ("2 lacunas") em vez de ocorrências (42 DISC);
 *  · o horizonte não tem `dataAlvo` e o texto dizia "entrega de hoje" — mandando
 *    corrigir a coisa errada, já que ele fala de semanas à frente.
 */
const run = (over: Partial<ResultadoCheck> = {}): ResultadoCheck => ({
  modo: 'preflight', empresaId: 'e1', empresaSlug: 'ibipeba', dataAlvo: '2026-07-29',
  severidade: 'critico', duracaoMs: 10,
  achados: [{ id: 'x', severidade: 'critico', titulo: 'T', contagem: 17, detalhe: 'd' }],
  ...over,
});

describe('montarAlerta', () => {
  it('o assunto conta OCORRÊNCIAS, não tipos de achado', () => {
    const a = montarAlerta([run()]);
    expect(a?.assunto).toContain('17');
  });

  it('soma as ocorrências de vários achados críticos', () => {
    const a = montarAlerta([run({
      achados: [
        { id: 'a', severidade: 'critico', titulo: 'A', contagem: 42, detalhe: 'd' },
        { id: 'b', severidade: 'critico', titulo: 'B', contagem: 3, detalhe: 'd' },
      ],
    })]);
    expect(a?.assunto).toContain('45');
  });

  it('horizonte fala de SEMANAS, nunca de "entrega de hoje"', () => {
    const a = montarAlerta([run({ modo: 'horizonte', dataAlvo: null })]);
    expect(a?.assunto).toContain('próximas semanas');
    expect(a?.assunto).not.toContain('hoje');
  });

  it('run só com aviso não vira alerta (crítico é o gatilho)', () => {
    expect(montarAlerta([run({ severidade: 'aviso' })])).toBeNull();
    expect(montarAlerta([])).toBeNull();
  });

  // Análise de segurança de 05/10/2026: a amostra do alerta leva NOME de pessoa digitado
  // por RH de cliente, e o e-mail vai para os platform admins. Sem escape, um nome com
  // `<a href=//evil>` virava link de phishing dentro do alerta interno.
  it('🔴 nome de pessoa com HTML não vira marcação no e-mail dos admins', () => {
    const a = montarAlerta([run({
      achados: [{
        id: 'x', severidade: 'critico', titulo: 'Sem telefone <b>x</b>', contagem: 1,
        detalhe: 'ver <script>alert(1)</script>',
        amostra: ['<a href="//evil.example">reautentique aqui</a>'],
        acao: 'npx tsx scripts/_gerar-kits-faltantes.ts <semana> --executar',
      }],
      empresaSlug: 'ibipeba<img src=x>', erro: 'falha "feia" <i>',
    })]);
    const html = a!.html;
    expect(html).not.toContain('<a href="//evil.example">');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;a href=&quot;//evil.example&quot;&gt;reautentique aqui&lt;/a&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('ibipeba&lt;img src=x&gt;');
    expect(html).toContain('falha &quot;feia&quot; &lt;i&gt;');
  });

  it('a ação com <semana> aparece escrita, em vez de sumir como tag', () => {
    const a = montarAlerta([run({
      achados: [{ id: 'x', severidade: 'critico', titulo: 'T', contagem: 1, detalhe: 'd', acao: 'npx tsx x.ts <semana> --executar' }],
    })]);
    expect(a!.html).toContain('npx tsx x.ts &lt;semana&gt; --executar');
  });

  it('o assunto é texto, não HTML: não leva entidades', () => {
    const a = montarAlerta([run({ empresaSlug: 'a&b' })]);
    expect(a!.assunto).not.toContain('&amp;');
  });

  it('sem dataAlvo em modo de entrega, não inventa data', () => {
    const a = montarAlerta([run({ dataAlvo: null })]);
    expect(a?.assunto).toContain('hoje');   // fallback explícito, não uma data falsa
  });
});

/**
 * O ASSUNTO por MODO. Medido na prova de canal de 28/07: um run `estrutural` saiu como
 * "1 problema(s) na entrega de hoje" — mandava olhar a entrega quando o achado era de
 * integridade. O assunto é a única linha que a pessoa lê antes de decidir se abre.
 */
describe('montarAlerta — escopo do assunto por modo', () => {
  const critico = (over: Partial<ResultadoCheck>): ResultadoCheck => ({
    modo: 'preflight', empresaId: null, empresaSlug: 's', dataAlvo: null,
    severidade: 'critico', duracaoMs: 0,
    achados: [{ id: 'x', severidade: 'critico', titulo: 'T', contagem: 3, detalhe: 'd' }],
    ...over,
  });

  it('estrutural fala de INTEGRIDADE, não de entrega', () => {
    const a = montarAlerta([critico({ modo: 'estrutural' })]);
    expect(a?.assunto).toContain('integridade');
    expect(a?.assunto).not.toContain('entrega');
  });

  it('horizonte fala de próximas SEMANAS', () => {
    const a = montarAlerta([critico({ modo: 'horizonte' })]);
    expect(a?.assunto).toContain('próximas semanas');
  });

  it('entrega usa a DATA quando existe', () => {
    const a = montarAlerta([critico({ modo: 'preflight', dataAlvo: '2026-08-10' })]);
    expect(a?.assunto).toContain('2026-08-10');
  });

  it('modos MISTURADOS caem no texto de entrega (não escondem o crítico)', () => {
    const a = montarAlerta([critico({ modo: 'estrutural' }), critico({ modo: 'preflight', dataAlvo: '2026-08-10' })]);
    expect(a?.assunto).toContain('entrega');
    expect(a?.assunto).toContain('6');   // 3 + 3 ocorrências
  });
});

/**
 * `destinosDoAlerta()` — separação de 28/07. `ADMIN_EMAILS` é usada como FALLBACK DE
 * AUTORIZAÇÃO de platform-admin (`admin-actions.ts`, `board/actions.ts`): pôr um e-mail
 * ali "para receber alerta" concedia acesso cross-tenant. Então o destino do alerta virou
 * `HEALTH_ALERT_EMAILS`, com a antiga só como compatibilidade.
 */
describe('destinosDoAlerta — env dedicada', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('prefere HEALTH_ALERT_EMAILS quando as duas existem', async () => {
    vi.stubEnv('HEALTH_ALERT_EMAILS', 'alerta@x.com');
    vi.stubEnv('ADMIN_EMAILS', 'admin@x.com');
    const { destinosDoAlerta } = await import('@/lib/pipeline-health/core');
    expect(destinosDoAlerta()).toEqual(['alerta@x.com']);
  });

  it('cai em ADMIN_EMAILS só quando a dedicada está ausente (compat)', async () => {
    vi.stubEnv('HEALTH_ALERT_EMAILS', '');
    vi.stubEnv('ADMIN_EMAILS', 'admin@x.com, outro@x.com');
    const { destinosDoAlerta } = await import('@/lib/pipeline-health/core');
    expect(destinosDoAlerta()).toEqual(['admin@x.com', 'outro@x.com']);
  });

  it('sem nenhuma das duas: lista vazia (R8 acusa)', async () => {
    vi.stubEnv('HEALTH_ALERT_EMAILS', '');
    vi.stubEnv('ADMIN_EMAILS', '');
    const { destinosDoAlerta } = await import('@/lib/pipeline-health/core');
    expect(destinosDoAlerta()).toEqual([]);
  });
});
