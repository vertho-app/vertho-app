import { describe, expect, it } from 'vitest';
import { checarModelosConfigurados } from '@/lib/pipeline-health/regras';
import { reunirModelosConfigurados } from '@/lib/pipeline-health/coleta-modelos';

/**
 * R14 — modelo configurado que não existe mais no provedor.
 *
 * Os casos abaixo são o incidente REAL de 25/08/2026, não fixtures inventadas:
 * a ACME Demo tinha `ia3_check` e `ia4_check` com override explícito para
 * `gpt-5.4`. `Medido:` o id devolve HTTP 403 com a chave do projeto e some da
 * listagem `/v1/models`, enquanto `gpt-5.4-2026-03-05` e `gpt-5.6-terra`
 * continuam lá. Override explícito vence o pin, então os dois auditores Dual-IA
 * daquele tenant apontavam para o nada.
 *
 * 🔑 O que este check pega e nenhuma validação de escrita pegaria: o valor era
 * VÁLIDO quando gravado e morreu depois, no provedor.
 */
const obs = (over: Partial<Parameters<typeof checarModelosConfigurados>[0][number]> = {}) => ({
  modelo: 'gpt-5.6-terra',
  origens: ['default:ia4_check'],
  familia: 'openai',
  temRota: true,
  temPreco: true,
  existeNoProvedor: true as boolean | null,
  ...over,
});
const ids = (a: ReturnType<typeof checarModelosConfigurados>) => a.map((x) => x.id);

describe('checarModelosConfigurados', () => {
  it('tudo vivo, roteado e precificado → nenhum achado', () => {
    expect(checarModelosConfigurados([obs(), obs({ modelo: 'claude-sonnet-5', familia: 'anthropic' })])).toEqual([]);
  });

  it('o caso ACME Demo: gpt-5.4 configurado e ausente do provedor → CRÍTICO', () => {
    const a = checarModelosConfigurados([
      obs(),
      obs({ modelo: 'gpt-5.4', origens: ['ACME Demo:ia3_check', 'ACME Demo:ia4_check'], existeNoProvedor: false }),
    ]);
    expect(ids(a)).toContain('modelo-inexistente');
    const achado = a.find((x) => x.id === 'modelo-inexistente')!;
    expect(achado.severidade).toBe('critico');
    expect(achado.contagem).toBe(1);
    // A amostra tem que dizer ONDE está configurado — sem isso o alerta não é acionável.
    expect(achado.amostra?.[0]).toContain('ACME Demo:ia3_check');
  });

  it('cegueira vira achado PRÓPRIO, não silêncio', () => {
    // Se o provedor não responde, os demais checks ficariam mudos e o verde
    // pareceria aprovação. Este é o mesmo princípio do R13.
    const a = checarModelosConfigurados([obs({ existeNoProvedor: null, motivoCegueira: 'HTTP 401' })]);
    expect(ids(a)).toEqual(['modelo-check-cego']);
    expect(a[0].detalhe).toContain('HTTP 401');
  });

  it('cegueira NÃO é confundida com inexistência', () => {
    const a = checarModelosConfigurados([obs({ existeNoProvedor: null, motivoCegueira: 'timeout' })]);
    expect(ids(a)).not.toContain('modelo-inexistente');
  });

  it('modelo sem rota → crítico (iria para a Anthropic com etiqueta errada)', () => {
    const a = checarModelosConfigurados([obs({ modelo: 'llama-9', familia: null, temRota: false, existeNoProvedor: null, motivoCegueira: 'família desconhecida' })]);
    expect(ids(a)).toContain('modelo-sem-rota');
    expect(a.find((x) => x.id === 'modelo-sem-rota')!.severidade).toBe('critico');
  });

  it('modelo sem preço → aviso (ledger nasce sem custo)', () => {
    const a = checarModelosConfigurados([obs({ modelo: 'gpt-5.9-novo', temPreco: false })]);
    expect(ids(a)).toContain('modelo-sem-preco');
    expect(a.find((x) => x.id === 'modelo-sem-preco')!.severidade).toBe('aviso');
  });

  it('lista vazia não vira achado (0 nunca é ocorrência)', () => {
    expect(checarModelosConfigurados([])).toEqual([]);
  });
});

/**
 * O falso positivo que a PRIMEIRA rodada real produziu, travado.
 *
 * O coletor traduzia família → `provider` para achar o endpoint. Os dois
 * vocabulários divergem: `familiaDoModelo('kimi-k3')` = 'moonshot', mas o campo
 * `provider` daquela entrada = 'kimi' (idem 'alibaba' vs 'qwen'). O lookup caía
 * no default e ia perguntar à OPENAI se `kimi-k3` existe — resposta "não", e o
 * alarme gritava sobre um modelo saudável.
 *
 * Alarme com falso positivo é pior que silêncio: treina a ignorar o alarme.
 */
describe('vocabulário de família × provider', () => {
  it('toda família tem prefixo reconhecido, e o endpoint sai do PREFIXO não do nome', async () => {
    const { PROVEDORES_OPENAI_COMPAT } = await import('@/lib/ai-provedores');
    const { familiaDoModelo } = await import('@/lib/ai-tasks');
    for (const p of PROVEDORES_OPENAI_COMPAT) {
      // Provedor novo sem prefixo em familiaDoModelo → lança, e o coletor o
      // trataria como "família desconhecida" (cego) para sempre.
      expect(() => familiaDoModelo(`${p.prefixo}-qualquer-coisa`), `prefixo ${p.prefixo} sem família`).not.toThrow();
    }
    // E o registro explícito da divergência: ela EXISTE e é por isso que a
    // resolução de endpoint não pode passar pelo nome da família.
    expect(familiaDoModelo('kimi-k3')).toBe('moonshot');
    expect(PROVEDORES_OPENAI_COMPAT.find((p) => p.prefixo === 'kimi')!.provider).toBe('kimi');
    expect(familiaDoModelo('qwen3.8-max')).toBe('alibaba');
    expect(PROVEDORES_OPENAI_COMPAT.find((p) => p.prefixo === 'qwen')!.provider).toBe('qwen');
  });
});

describe('reunirModelosConfigurados', () => {
  it('junta default por task, dropdown e config de cada tenant, com a origem', () => {
    const mapa = reunirModelosConfigurados([
      { nome: 'ACME Demo', sysConfig: { ai: { modelo_padrao: 'claude-sonnet-4-6', modelos: { ia3_check: 'gpt-5.4' } } } },
      { nome: 'Bett', sysConfig: { ai: { modelo_padrao: 'claude-sonnet-4-6' } } },
    ]);
    // O override do tenant tem que aparecer — é justamente ele que vence o pin.
    expect(mapa.get('gpt-5.4')).toEqual(['ACME Demo:ia3_check']);
    // E o modelo_padrao dos dois tenants converge na MESMA entrada, com as duas origens.
    expect(mapa.get('claude-sonnet-4-6')).toEqual(
      expect.arrayContaining(['ACME Demo:modelo_padrao', 'Bett:modelo_padrao']),
    );
    // Defaults de task entram sozinhos, sem depender de tenant nenhum.
    expect([...mapa.keys()]).toContain('gpt-5.6-terra');
  });

  it('tenant sem bloco ai não quebra a coleta', () => {
    const mapa = reunirModelosConfigurados([{ nome: 'Vazia', sysConfig: {} }, { nome: 'Nula', sysConfig: null }]);
    expect([...mapa.keys()].length).toBeGreaterThan(0);
  });
});
