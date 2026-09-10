import { describe, it, expect } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { levantarPlanoDesafios } from '@/lib/season-engine/kit/plano-desafios';
import { coletarQaTts } from '@/lib/pipeline-health/coleta';
import { fechamentoSeguro, pareceFechamento } from '@/lib/season-engine/fechamento-conversa';

function fixture() {
  const semana = (n: number, a = 'Regulação', b = 'Feedback') => ({ semana: n, tipo: 'conteudo', conteudos_dia: [a, b].map(descritor => ({ competencia: 'Autocuidado', descritor })) });
  const dados: Record<string, any[]> = {
    fase4_envios: [{ id: 'e1', colaborador_id: 'p1', semana_atual: 2 }],
    colaboradores: [{ id: 'p1', cargo: 'Professor(a)', perfil_dominante: 'C' }],
    trilhas: [{ id: 't1', colaborador_id: 'p1', numero_temporada: 1, programa_modo: 'regular', programa_config: { desafioUnicoPorCompetencia: true }, temporada_plano: [semana(1, 'Antigo', 'Passado'), semana(2), semana(3, 'Feedback', 'Regulação'), semana(7, 'Distante', 'Futuro')] }],
    kit_briefs: ['Regulação', 'Feedback'].map((descritor, i) => ({ id: `b${i}`, competencia: 'Autocuidado', descritor, empresa_id: 'emp', cargo: 'Professor(a)', modulo_base_id: `m${i}`, brief: { ideia_central: descritor } })),
    kit_desafios_semana: [],
  };
  const sb = criarSupabaseMock({ lista: tabela => dados[tabela] || [] });
  return { sb, dados, semana };
}

describe('preparação do desafio usa demanda atual, com núcleo canônico', () => {
  it('deduplica o par invertido e a pessoa, ignorando passado e fora do horizonte', async () => {
    const { sb } = fixture();
    const plano = await levantarPlanoDesafios(sb.client, 'emp', 4);
    expect(plano).toHaveLength(1);
    expect(plano[0].pessoas).toEqual(['p1']);
    expect(plano[0].distancia).toBe(0);
    expect(plano[0].nucleos).toHaveLength(2);
  });
  it('considera só a última temporada, mesmo que a query devolva a antiga primeiro', async () => {
    const { sb, dados, semana } = fixture();
    dados.trilhas.push({ ...dados.trilhas[0], id: 't2', numero_temporada: 2, temporada_plano: [semana(2, 'Novo', 'Tema')] });
    const plano = await levantarPlanoDesafios(sb.client, 'emp');
    expect(plano).toHaveLength(1);
    expect(plano[0].descritores).toEqual(['Novo', 'Tema']);
    expect(plano[0].nucleos).toHaveLength(0);
  });
  it('tarefa publicada curinga cobre o cargo e não causa nova geração', async () => {
    const { sb, dados } = fixture();
    dados.kit_desafios_semana = [{ competencia: 'Autocuidado', descritores_norm: ['feedback', 'regulacao'], cargo: 'todos', disc: 'C', desafio: { desafio_texto: 'Ação integrada já disponível.' } }];
    expect(await levantarPlanoDesafios(sb.client, 'emp')).toEqual([]);
  });
  it('erro de leitura não vira nenhuma demanda', async () => {
    const { sb } = fixture();
    sb.falharEm({ tabela: 'kit_desafios_semana', op: 'select', mensagem: 'offline' });
    await expect(levantarPlanoDesafios(sb.client, 'emp')).rejects.toThrow(/kit_desafios_semana/);
  });
});

it('TTS separa modelos e exclui demonstração e resoluções verificadas', async () => {
  const base = { origem: 'portao', feature: 'tts_podcast', voz: 'Aoede', tentativa: 1, ok: false, publicado: true, created_at: new Date().toISOString() };
  const sb = criarSupabaseMock({ lista: tabela => tabela === 'empresas' ? [{ id: 'demo' }] : tabela === 'tts_qa_log' ? [
    { ...base, id: 1, modelo: 'modelo-a', empresa_id: 'real' },
    { ...base, id: 2, modelo: 'modelo-b', empresa_id: 'real' },
    { ...base, id: 3, modelo: 'modelo-a', empresa_id: 'demo' },
    { ...base, id: 4, modelo: 'modelo-a', empresa_id: 'real', resolved_at: new Date().toISOString() },
  ] : [] });
  const r = await coletarQaTts(sb.client);
  expect(r.portao).toHaveLength(2);
  expect(r.portao.map(p => p.tentativas)).toEqual([1, 1]);
  expect(new Set(r.portao.map(p => p.modelo)).size).toBe(2);
});

it('último recurso encerra sem pergunta ou avaliação inventada', () => {
  expect(pareceFechamento(fechamentoSeguro())).toBe(true);
  expect(pareceFechamento(fechamentoSeguro(false), { marcadores: false })).toBe(true);
  expect(fechamentoSeguro()).not.toMatch(/você demonstrou|você se comprometeu/i);
});
