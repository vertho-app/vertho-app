import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { maskColaborador } from '@/lib/pii-masker';

/**
 * Superfícies de conversa fora da jornada (R-44, 03/10/2026).
 *
 * Beto no app: o contexto levava `Nome: <nome completo>` e o plano de
 * desenvolvimento com o nome, e as falas iam cruas. Agora a IA lê o
 * identificador e a pessoa lê a resposta com o primeiro nome dela.
 * Nome e contatos sintéticos.
 *
 * A avaliação de evidência do Praticar (`actions/tutor-evidencia.ts`) também
 * era coberta aqui; saiu com a página legada em 03/10/2026 (R-125): ninguém a
 * alcançava a não ser por URL direta, e nunca gravou uma evidência.
 */

const h = vi.hoisted(() => ({ sb: null as any, callAIChat: vi.fn(), callAI: vi.fn() }));
const COLAB = { id: 'col-1', empresa_id: 'emp-1', nome_completo: 'Helmar Miranda', cargo: 'Gestão Escolar', perfil_dominante: 'S' };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ email: 'helmar@escola.br', empresaId: 'emp-1', colaborador: { id: 'col-1' } }),
}));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => COLAB }));
vi.mock('@/actions/ai-client', () => ({ callAIChat: h.callAIChat, callAI: h.callAI }));
vi.mock('@/lib/fase4/contexto-semanal', () => ({ resolverContextoSemanal: async () => null }));
vi.mock('@/lib/blueprint/resumo', () => ({ carregarBlueprintResumo: async () => 'PLANO: Helmar Miranda vai praticar a escuta.' }));
vi.mock('@/lib/cargo-contexto', () => ({ carregarCargoInfo: async () => null, formatBlocoCargo: () => '' }));

import { chatWithBeto } from '@/app/actions/beto';

const ALIAS = maskColaborador(COLAB).masked!.nome;

beforeEach(() => {
  h.callAIChat.mockReset();
  h.callAI.mockReset();
  h.sb = criarSupabaseMock({
    // `colaboradores` responde sem id: o alias sai do nome.
    resolver: (t) => (t === 'empresas'
      ? { nome: 'Escola' }
      : t === 'colaboradores' ? { nome_completo: COLAB.nome_completo, cargo: COLAB.cargo, perfil_dominante: 'S', empresa_id: 'emp-1' } : null),
  });
});

describe('Beto no app: conversa sem o nome', () => {
  it('contexto, plano e falas vão com o identificador; a resposta volta com o primeiro nome', async () => {
    h.callAIChat.mockResolvedValue(`${ALIAS}, vamos praticar a escuta.`);
    const resposta = await chatWithBeto(
      'Sou o Helmar, meu telefone é (75) 99999-1234. Como pratico?',
      [{ role: 'assistant', content: 'Helmar, em que posso ajudar?' }],
    );

    const [system, messages] = h.callAIChat.mock.calls[0];
    const enviado = `${system}\n${JSON.stringify(messages)}`;
    expect(enviado).not.toMatch(/Helmar|99999-1234/);
    expect(system).toContain(`Nome: ${ALIAS}`);
    expect(system).toContain(`PLANO: ${ALIAS} vai praticar a escuta.`);
    expect(messages.at(-1).content).toBe(`Sou o ${ALIAS}, meu telefone é [telefone]. Como pratico?`);
    expect(resposta).toBe('Helmar, vamos praticar a escuta.');
  });
});
