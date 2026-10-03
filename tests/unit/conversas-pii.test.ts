import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { maskColaborador } from '@/lib/pii-masker';

/**
 * Superfícies de conversa fora da jornada (R-44, 03/10/2026).
 *
 * Beto no app: o contexto levava `Nome: <nome completo>` e o plano de
 * desenvolvimento com o nome, e as falas iam cruas. Praticar: a avaliação da
 * evidência levava o nome completo e o texto cru. Agora a IA lê o identificador
 * e a pessoa lê a resposta com o primeiro nome dela.
 * Nome e contatos sintéticos.
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
import { avaliarEvidencia } from '@/actions/tutor-evidencia';

const ALIAS = maskColaborador(COLAB).masked!.nome;

beforeEach(() => {
  h.callAIChat.mockReset();
  h.callAI.mockReset();
  h.sb = criarSupabaseMock({
    // `colaboradores` responde só as colunas que o Praticar seleciona (sem id).
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

describe('Praticar: a evidência é avaliada sem o nome', () => {
  it('identificador e texto mascarados; o feedback volta com o primeiro nome', async () => {
    // A rota lê o colaborador sem id: o alias sai do nome, o mesmo aqui.
    const alias = maskColaborador({ nome_completo: COLAB.nome_completo }).masked!.nome;
    h.callAI.mockResolvedValue(JSON.stringify({ pontos_total: 8, feedback: `${alias}, a conversa com a família foi concreta.` }));
    const r: any = await avaliarEvidencia('col-1', 'emp-1', 2, 'Eu, Helmar Miranda, liguei para a família. helmar@escola.br');
    const user = String(h.callAI.mock.calls[0][1]);
    expect(user).not.toMatch(/Helmar|helmar@/);
    expect(user).toContain(`Colaborador: ${alias}`);
    expect(user).toContain(`Eu, ${alias}, liguei para a família. [email]`);
    expect(r.feedback).toBe('Helmar, a conversa com a família foi concreta.');
  });
});
