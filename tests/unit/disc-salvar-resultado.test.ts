import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { desfechoDoSalvamento } from '@/lib/disc-salvar-resultado';

/**
 * R-84 (revisão de 02/10/2026): no mapeamento comportamental, a falha ao gravar
 * ia para um estado que a tela nunca mostrava. A pessoa lia "Você mapeou o seu
 * perfil!", perdia as 14 respostas ao sair e depois era barrada no Diagnóstico
 * por falta do Perfil. Agora o encerramento só vem com o servidor dizendo
 * `success: true`; o resto vira a fase de erro com "Tentar de novo".
 */
describe('desfechoDoSalvamento', () => {
  it('gravou: segue para o encerramento', async () => {
    expect(await desfechoDoSalvamento(async () => ({ success: true }), 'x')).toEqual({ fase: 'closing' });
  });

  it('o servidor recusou: fase de erro com a mensagem dele', async () => {
    expect(await desfechoDoSalvamento(async () => ({ success: false, error: 'timeout' }), 'padrão'))
      .toEqual({ fase: 'erro', erro: 'timeout' });
  });

  it('a chamada lançou (rede): fase de erro, nunca o encerramento', async () => {
    expect(await desfechoDoSalvamento(async () => { throw new Error('Failed to fetch'); }, 'padrão'))
      .toEqual({ fase: 'erro', erro: 'Failed to fetch' });
  });

  it('resposta vazia ou sem `success: true` não conta como gravado', async () => {
    expect((await desfechoDoSalvamento(async () => undefined, 'padrão')).fase).toBe('erro');
    expect((await desfechoDoSalvamento(async () => ({}), 'padrão'))).toEqual({ fase: 'erro', erro: 'padrão' });
  });

  it('"Tentar de novo" reenvia o mesmo: a função de salvar é chamada de novo, sem pedir respostas', async () => {
    const salvar = vi.fn()
      .mockResolvedValueOnce({ success: false, error: 'pool' })
      .mockResolvedValueOnce({ success: true });
    expect((await desfechoDoSalvamento(salvar, 'x')).fase).toBe('erro');
    expect((await desfechoDoSalvamento(salvar, 'x')).fase).toBe('closing');
    expect(salvar).toHaveBeenCalledTimes(2);
  });
});

describe('a tela usa o desfecho (guard de fonte)', () => {
  const f = readFileSync('app/dashboard/perfil-comportamental/mapeamento/page.tsx', 'utf8');
  it('o encerramento só vem depois de um desfecho que não é erro', () => {
    expect(f).toMatch(/desfechoDoSalvamento\(\(\) => salvarPerfilComportamental\(resultadoPendente\.current\)/);
    expect(f).toMatch(/if \(desfecho\.fase === 'erro'\) \{[\s\S]{0,120}setPhase\(PHASE\.SAVE_ERROR\);[\s\S]{0,20}return;/);
  });
  it('a fase de erro existe na tela, com o botão de tentar de novo', () => {
    expect(f).toMatch(/phase === PHASE\.SAVE_ERROR/);
    expect(f).toMatch(/t\('saveError\.retry'\)/);
  });
});
