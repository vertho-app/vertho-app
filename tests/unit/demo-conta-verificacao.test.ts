import { describe, it, expect, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  VERIFICACAO_EMAIL,
  VERIFICACAO_MOLDE_EMAIL,
  VERIFICACAO_NOME,
  reporContaDeVerificacao,
} from '@/lib/demo/conta-verificacao';

/**
 * A conta que o E2E usa para entrar no produto, e o reset noturno que a apagava.
 *
 * 🔴 `Medido: 01/09 a 09/09/2026` — **185 de 188 runs vermelhos**. O reset do
 * tenant demo apaga `colaboradores` inteiro, e a conta sobrevivia em
 * `auth.users`: o login continuava passando, e o CI relatava cinco falhas de
 * locator em cinco telas — sintomas de uma causa que nenhum deles nomeava.
 *
 * A recomposição roda no fim do reset. O que estes casos protegem é o que a
 * torna confiável: ela não pode LANÇAR (abortar o reset por causa da conta de
 * verificação deixaria o ambiente de demonstração pela metade, que é caro), e
 * tem que produzir a conta CERTA — clone do molde com identidade trocada, senão
 * o E2E entra e não encontra as telas que percorre.
 */

const MOLDE = {
  id: 'molde-1',
  created_at: '2026-01-01',
  updated_at: '2026-01-02',
  auth_user_id: 'auth-da-helena',
  empresa_id: 'emp-1',
  email: VERIFICACAO_MOLDE_EMAIL,
  nome_completo: 'Helena Duarte',
  cargo: 'Gerente de Recursos Humanos',
  role: 'rh',
  perfil_dominante: 'S',
};

let molde: any = MOLDE;

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'colaboradores' ? molde : null),
});

beforeEach(() => { sb.reset(); molde = MOLDE; });

describe('conta de verificação do E2E', () => {
  it('repõe a conta clonando o molde, com a identidade trocada', async () => {
    const r = await reporContaDeVerificacao(sb.client, 'emp-1');
    expect(r.ok).toBe(true);

    const insert = sb.escritas.find((e) => e.op === 'insert');
    expect(insert?.payload).toMatchObject({
      email: VERIFICACAO_EMAIL,
      nome_completo: VERIFICACAO_NOME,
      role: 'rh', // o papel vem do molde: é ele que dá acesso às telas do E2E
      perfil_dominante: 'S',
    });
  });

  it('🔴 não carrega as chaves do molde — id e auth_user_id ficam de fora', async () => {
    // Copiar o `auth_user_id` faria a conta de verificação apontar para a conta
    // de auth da Helena: o E2E logaria como ela sem nunca dizer isso.
    await reporContaDeVerificacao(sb.client, 'emp-1');
    const insert = sb.escritas.find((e) => e.op === 'insert');
    expect(insert?.payload).not.toHaveProperty('id');
    expect(insert?.payload).not.toHaveProperty('auth_user_id');
    expect(insert?.payload).not.toHaveProperty('created_at');
  });

  it('apaga a conta antiga antes de inserir — é idempotente por construção', async () => {
    await reporContaDeVerificacao(sb.client, 'emp-1');
    const ops = sb.escritas.map((e) => e.op);
    expect(ops).toEqual(['delete', 'insert']);
  });

  it('🔴 falha de leitura do molde NÃO lança: devolve o motivo', async () => {
    // Lançar aqui abortaria o reset no meio, e o tenant de demonstração ficaria
    // pela metade — foi exatamente assim que o ACME parou em 09/09.
    sb.falharEm({ tabela: 'colaboradores', op: 'select', mensagem: 'timeout no pool' });
    const r = await reporContaDeVerificacao(sb.client, 'emp-1');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/molde/);
    expect(sb.escritas).toHaveLength(0);
  });

  it('🔴 falha do insert também é reportada, e não passa por sucesso', async () => {
    // supabase-js RETORNA `{ error }`. Sem checar, a função diria ok:true e o
    // reset seguinte "consertaria" um problema que nunca foi consertado.
    sb.falharEm({ tabela: 'colaboradores', op: 'insert', mensagem: 'violação de not-null' });
    const r = await reporContaDeVerificacao(sb.client, 'emp-1');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/inserir/);
  });

  it('molde ausente é motivo, não exceção', async () => {
    molde = null;
    const r = await reporContaDeVerificacao(sb.client, 'emp-1');
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain(VERIFICACAO_MOLDE_EMAIL);
  });
});
