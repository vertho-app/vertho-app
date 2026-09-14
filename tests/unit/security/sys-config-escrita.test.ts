import { describe, expect, it, vi } from 'vitest';
import { gravarSysConfig } from '@/lib/sys-config-escrita';

/**
 * LOST UPDATE em `empresas.sys_config` — nove call-sites gravam o objeto
 * INTEIRO. Duas abas abertas (ou um admin e um cron) e o último write apaga a
 * chave que o outro acabou de gravar, sem erro em lugar nenhum.
 *
 * A trava usa `updated_at` (trigger `set_updated_at` BEFORE UPDATE em
 * `empresas`) como versão: o UPDATE leva `.eq('updated_at', lido)` e, se zero
 * linhas voltarem, a mutação é REAPLICADA sobre o estado novo. Por isso a
 * mutação entra como FUNÇÃO — objeto pronto carrega uma leitura velha dentro.
 */

/** Client mínimo que simula a corrida: cada update compara o `updated_at` pedido. */
function bancoFalso(inicial: Record<string, any>, opts: { escritaConcorrenteAntesDaTentativa?: number; mutarConcorrente?: (c: any) => any } = {}) {
  const estado = { sys_config: inicial, updated_at: 't1' };
  let versao = 1;
  let leituras = 0;
  const updates: any[] = [];
  const client = {
    from: () => {
      let versaoPedida: string | null = null;
      let payload: any = null;
      const b: any = {
        select: () => b,
        update: (p: any) => { payload = p; return b; },
        eq: (col: string, val: any) => { if (col === 'updated_at') versaoPedida = val; return b; },
        maybeSingle: async () => {
          leituras += 1;
          if (opts.escritaConcorrenteAntesDaTentativa === leituras && opts.mutarConcorrente) {
            // Alguém grava DEPOIS desta leitura e antes do nosso update.
            setTimeout(() => {}, 0);
            queueMicrotask(() => {
              estado.sys_config = opts.mutarConcorrente!(estado.sys_config);
              versao += 1; estado.updated_at = `t${versao}`;
            });
          }
          return { data: { ...estado }, error: null };
        },
        then: (res: any) => {
          updates.push({ payload, versaoPedida });
          const perdeu = versaoPedida !== estado.updated_at;
          if (!perdeu) {
            estado.sys_config = payload.sys_config;
            versao += 1; estado.updated_at = `t${versao}`;
          }
          return Promise.resolve({ data: perdeu ? [] : [{ id: 'emp' }], error: null }).then(res);
        },
      };
      return b;
    },
  };
  return { client, estado, updates, leituras: () => leituras };
}

describe('gravarSysConfig', () => {
  it('grava a mutação e pinta o UPDATE com o updated_at lido', async () => {
    const { client, estado, updates } = bancoFalso({ ai: { x: 1 } });
    const r = await gravarSysConfig(client, 'emp', (atual) => ({ ...atual, modulos: { pulso: true } }));
    expect(r.ok).toBe(true);
    expect(estado.sys_config).toEqual({ ai: { x: 1 }, modulos: { pulso: true } });
    expect(updates[0].versaoPedida).toBe('t1');   // sem isto, o update sobrescreve cego
  });

  it('write concorrente no meio: REAPLICA a mutação sobre o estado novo (não apaga a chave do outro)', async () => {
    const { client, estado, updates } = bancoFalso(
      { ai: { x: 1 } },
      { escritaConcorrenteAntesDaTentativa: 1, mutarConcorrente: (c) => ({ ...c, cadencia: { dia: 'segunda' } }) },
    );
    const r = await gravarSysConfig(client, 'emp', (atual) => ({ ...atual, modulos: { pulso: true } }));
    expect(r.ok).toBe(true);
    // As DUAS chaves sobrevivem — é exatamente o que o read-modify-write cru perdia.
    expect(estado.sys_config).toEqual({ ai: { x: 1 }, cadencia: { dia: 'segunda' }, modulos: { pulso: true } });
    expect(updates).toHaveLength(2);
  });

  it('mutação pode ABORTAR com motivo, e nada é gravado', async () => {
    const { client, estado, updates } = bancoFalso({ votacao_ativa: true });
    const r = await gravarSysConfig(client, 'emp', (atual) => (atual.votacao_ativa ? { erro: 'Feche a votação primeiro.' } : atual));
    expect(r).toMatchObject({ ok: false, erro: 'Feche a votação primeiro.' });
    expect(updates).toHaveLength(0);
    expect(estado.sys_config).toEqual({ votacao_ativa: true });
  });

  it('empresaId vazio e empresa inexistente falham sem escrever', async () => {
    const { client, updates } = bancoFalso({});
    expect(await gravarSysConfig(client, '', () => ({}))).toMatchObject({ ok: false });
    const semEmpresa = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
    expect(await gravarSysConfig(semEmpresa, 'emp', () => ({}))).toMatchObject({ ok: false, erro: 'Empresa não encontrada.' });
    expect(updates).toHaveLength(0);
  });

  it('erro de leitura volta como erro — não vira gravação sobre objeto vazio', async () => {
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'timeout' } }) }) }) }) };
    const r = await gravarSysConfig(sb, 'emp', () => ({ qualquer: 1 }));
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/timeout/);
  });

  it('perdendo as duas tentativas, devolve CONFLITO com mensagem para o operador', async () => {
    // `updated_at` muda a cada leitura: nenhuma tentativa consegue casar a versão.
    let n = 0;
    const sb = {
      from: () => {
        const b: any = {
          select: () => b, update: () => b, eq: () => b,
          maybeSingle: async () => ({ data: { sys_config: {}, updated_at: `v${++n}` }, error: null }),
          then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
        };
        return b;
      },
    };
    const r = await gravarSysConfig(sb, 'emp', (a) => ({ ...a, x: 1 }));
    expect(r).toMatchObject({ ok: false, conflito: true });
    expect(r.erro).toMatch(/alterada por outra pessoa/i);
  });
});
