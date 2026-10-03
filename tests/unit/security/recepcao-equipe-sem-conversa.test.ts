import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type BancoEmMemoria } from '../../helpers/tabelas-em-memoria';

/**
 * Decisão 5 da revisão de 02/10/2026 (R-10): no Simulador de atendimento, a
 * equipe (gestor e RH) abria cada atendimento e lia a CONVERSA INTEIRA,
 * inclusive em andamento, sem aviso a quem treinava. Agora é como na
 * liderança: a equipe vê nível, relatório e as citações que provam o nível,
 * sem a conversa, e só de atendimento concluído.
 *
 * A fixture tem conversa de verdade (5 turnos) e relatório de verdade
 * (`consolidar` sobre a matriz), com uma fala que a avaliação NÃO cita: é ela
 * que prova a ausência. Fixture vazia passaria por qualquer projeção.
 */
vi.mock('@/lib/permissions', () => ({ can: async () => true }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => { throw new Error('sem banco no teste'); } }));

import { abrirSessao, consolidar } from '@/lib/recepcao/core';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { detalheEquipe } from '@/lib/recepcao/equipe';
import { RECEPCAO_SESSAO } from '@/lib/status';
import type { Insumos } from '@/lib/recepcao/model';

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const CITADA = 'Qual horário funciona para você?';
const NAO_CITADA = 'Minha filha está internada e eu não consigo dormir desde ontem';

function sessao(id: string, status: string) {
  const c = aplicarMatrizAtendimento(structuredClone(catalogoLimites[0]));
  const s: any = abrirSessao(c, 0);
  s.id = id;
  for (let i = 0; i < 5; i++)
    s.historico.push(
      { id: `m${s.historico.length}`, role: 'user', content: i === 2 ? `${NAO_CITADA}, mas vamos resolver.` : `Entendo. ${CITADA} (${i})` },
      { id: `m${s.historico.length + 1}`, role: 'assistant', content: 'Eu quero garantia de sair às três.' },
    );
  s.respostas = 5;
  const insumos: Insumos = {
    dimensoes: c.matriz!.competencias.flatMap((comp) =>
      comp.descritores.map((d) => ({
        id: d.codigo,
        classificacao: 'n3' as const,
        justificativa: 'Perguntou pela disponibilidade antes de propor a alternativa autorizada.',
        evidencias: [{ mensagemId: 'm1', trecho: CITADA }],
        // A régua exige oportunidade em dimensão avaliada; a do caso real cita a abertura.
        oportunidades: [{ mensagemId: 'm0', trecho: s.historico[0].content.slice(0, 30) }],
      })),
    ),
    ocorrencias: [],
    desfecho: { tipo: 'nao_resolvido', justificativa: 'Sustentou o limite.', evidencias: [] },
    feedback: { acerto: 'Sustentou o limite com respeito.', melhoria: 'Ofereça o registro.', novaTentativa: 'Repita o caso.' },
  };
  s.relatorio = consolidar(s, insumos);
  s.status = status;
  return { id, empresa_id: EMPRESA, colaborador_id: 'ana', owner_key: 'colab:ana', created_at: '2026-10-01T12:00:00.000Z', estado: s };
}

let banco: BancoEmMemoria;
beforeEach(() => {
  banco = bancoEmMemoria({
    recepcao_sessoes: [
      sessao('s-concluida', RECEPCAO_SESSAO.CONCLUIDA),
      sessao('s-andamento', RECEPCAO_SESSAO.EM_ANDAMENTO),
      sessao('s-aguardando', RECEPCAO_SESSAO.AGUARDANDO_AVALIACAO),
    ],
    colaboradores: [{ id: 'ana', empresa_id: EMPRESA, nome_completo: 'Ana', email: 'ana@exemplo.test', gestor_email: 'gestora@exemplo.test' }],
  });
});

const ctx = (role: 'rh' | 'gestor', isPlatformAdmin = false) => ({
  empresaId: EMPRESA,
  dominio: 'recepcao_medica',
  sb: banco.client,
  auth: {
    isPlatformAdmin,
    role,
    empresaId: EMPRESA,
    email: 'gestora@exemplo.test',
    colaborador: { id: 'gestora', empresa_id: EMPRESA, email: 'gestora@exemplo.test' },
  },
}) as any;

describe('detalhe da equipe no Simulador de atendimento (R-10)', () => {
  it('a fixture tem a conversa que o teste diz esconder', () => {
    const estado = sessao('x', RECEPCAO_SESSAO.CONCLUIDA).estado;
    expect(JSON.stringify(estado.historico)).toContain(NAO_CITADA);
    expect(JSON.stringify(estado.relatorio)).toContain(CITADA);
  });

  for (const [papel, admin] of [['gestor', false], ['rh', false], ['rh', true]] as const) {
    it(`🔴 ${admin ? 'plataforma' : papel}: sem a conversa, com nível e citações`, async () => {
      const { sessao: d } = await detalheEquipe(ctx(papel, admin), 's-concluida');
      const texto = JSON.stringify(d);
      expect(d).not.toHaveProperty('historico');
      expect(texto).not.toContain(NAO_CITADA);
      expect(texto).not.toContain('Eu quero garantia de sair às três');
      // O que fica: o nível e a prova citada.
      expect(d.relatorio?.nota).not.toBeUndefined();
      expect(texto).toContain(CITADA);
      // As referências situam a citação sem carregar texto.
      expect(d.referencias.length).toBe(11);
      for (const r of d.referencias) expect(Object.keys(r).sort()).toEqual(['id', 'role']);
    });
  }

  it.each(['s-andamento', 's-aguardando'])('🔴 atendimento não concluído (%s) não abre para a equipe', async (id) => {
    await expect(detalheEquipe(ctx('rh'), id)).rejects.toMatchObject({ status: 409 });
  });
});

describe('a tela da equipe não mostra a conversa', () => {
  const TELA = readFileSync('components/recepcao/gestao.tsx', 'utf8');

  it('o detalhe lê `referencias`, não `historico`, e não há mais o bloco da conversa', () => {
    expect(TELA).not.toContain('detalhe.sessao.historico');
    expect(TELA).not.toContain("t('reviewConversation')");
    expect(TELA).toContain('detalhe.sessao.referencias');
    expect(TELA).toContain("t('reviewConversationPrivate')");
  });

  it('só o atendimento concluído ganha o botão de abrir', () => {
    const i = TELA.indexOf('s.status === RECEPCAO_SESSAO.CONCLUIDA ?');
    const j = TELA.indexOf("abrir(s.id)");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});
