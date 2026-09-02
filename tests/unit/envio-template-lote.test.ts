import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  listarTemplatesDisparaveis,
  prepararLoteTemplate,
  primeiroNome,
} from '@/lib/notifications/envio-template-lote';
import { ENVIO, PROGRESSO, TRILHA } from '@/lib/status';

/**
 * A tela de Envios deixou de mandar texto livre e passou a disparar TEMPLATE.
 * O que estes testes protegem é o que a tela não mostra: quem foi EXCLUÍDO do
 * lote e por quê. Um alvo que some em silêncio é indistinguível de "mandei para
 * todo mundo" — o defeito que a reescrita existe para corrigir.
 */

const EMPRESA = {
  id: 'emp-1',
  nome: 'Secretaria Municipal de Macaé/RJ',
  slug: 'macae',
  is_demo: false,
};

function mock(opts: {
  cargos?: any[];
  jaReceberam?: any[];
  respostas?: any[];
  cenarios?: any[];
  trilhas?: any[];
  envios?: any[];
  progressos?: any[];
  relatorios?: any[];
  empresa?: any;
} = {}) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? (opts.empresa ?? EMPRESA) : null),
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return opts.cargos ?? [{ nome: 'Professor(a)', top5_workshop: ['Autocuidado e bem-estar profissional'] }];
      if (tabela === 'notification_deliveries') return opts.jaReceberam ?? [];
      if (tabela === 'respostas') return opts.respostas ?? [];
      if (tabela === 'banco_cenarios') return opts.cenarios ?? [{ cargo: 'Professor(a)', competencia_id: 'comp-1' }];
      if (tabela === 'trilhas') return opts.trilhas ?? [];
      if (tabela === 'fase4_envios') return opts.envios ?? [];
      if (tabela === 'temporada_semana_progresso') return opts.progressos ?? [];
      if (tabela === 'relatorios') return opts.relatorios ?? [];
      return [];
    },
  });
}

const professor = (over: any = {}) => ({
  id: 'c1', nome_completo: 'MARIA DAS DORES SILVA', cargo: 'Professor(a)', telefone: '5522999999999', perfil_dominante: 'D', ...over,
});

const planoCadencia = [
  {
    semana: 1,
    tipo: 'conteudo',
    conteudos_dia: [{ conteudo: { core_titulo: 'Escuta ativa' } }],
  },
  {
    semana: 2,
    tipo: 'conteudo',
    conteudos_dia: [{ conteudo: { core_titulo: 'Comunicação clara' } }],
  },
  { semana: 3, tipo: 'aplicacao' },
];

function contextoCadencia(over: {
  semanaAtual?: number;
  plano?: any[];
  progressos?: any[];
  ultimaAtividade?: string | null;
} = {}) {
  return {
    envios: [{
      colaborador_id: 'c1',
      semana_atual: over.semanaAtual ?? 2,
      status: ENVIO.ATIVO,
      ultima_pilula1_em: over.ultimaAtividade ?? '2025-01-01T12:00:00.000Z',
      ultima_pilula2_em: null,
      ultima_evidencia_em: null,
    }],
    trilhas: [{
      id: 'trilha-1',
      colaborador_id: 'c1',
      status: TRILHA.ATIVA,
      numero_temporada: 1,
      temporada_plano: over.plano ?? planoCadencia,
      competencia_foco: 'Comunicação',
      data_inicio: '2025-01-06',
    }],
    progressos: over.progressos ?? [{
      trilha_id: 'trilha-1',
      colaborador_id: 'c1',
      semana: 1,
      status: PROGRESSO.CONCLUIDO,
      reflexao: null,
      feedback: null,
    }],
  };
}

describe('primeiroNome', () => {
  it('normaliza só o que está TODO em maiúsculas', () => {
    expect(primeiroNome('MARIA DAS DORES')).toBe('Maria');
    expect(primeiroNome('Ana Lúcia')).toBe('Ana');
    // Grafia escolhida por alguém é preservada — não é "consertar", é respeitar.
    expect(primeiroNome('McDonald Souza')).toBe('McDonald');
    expect(primeiroNome('')).toBe('Olá');
  });
});

describe('listarTemplatesDisparaveis', () => {
  it('só oferece template que tem contrato de parâmetros', () => {
    const nomes = listarTemplatesDisparaveis().map((t) => t.template);
    expect(nomes).toContain('avaliacao_competencias');
    expect(nomes).toContain('avaliacao_parcial');
    expect(nomes).toContain('boas_vindas_v2');
    expect(nomes).toContain('trilha_liberada_v2');
    expect(nomes).toContain('trilha_concluida');
    // A cadência canônica também pode ser recuperada manualmente; a prévia usa
    // o contexto individual antes de incluir alguém no lote.
    expect(nomes).toContain('conteudo_semana');
    expect(nomes).toContain('semana_pendente_v2');
    expect(nomes).toContain('conteudo_semana_pendente_v3');
    expect(nomes).toContain('missao_semana_v2');
    expect(nomes).toContain('registro_desafio');
    expect(nomes).toContain('registro_evidencia');
    expect(nomes).toContain('retomada_trilha');
    // Credencial continua no fluxo de acesso, nunca num lote genérico.
    expect(nomes).not.toContain('acesso_vertho');
    expect(nomes).not.toContain('otp_acesso');
  });

  it('expõe o corpo LITERAL aprovado, não uma paráfrase', () => {
    const t = listarTemplatesDisparaveis().find((x) => x.template === 'avaliacao_competencias')!;
    expect(t.corpo).toContain('{{1}}');
    expect(t.corpo).toContain('mapeamento comportamental');
    expect(t.variaveis).toHaveLength(3);
  });
});

describe('tela de Envios', () => {
  const page = readFileSync('app/admin/whatsapp/page.tsx', 'utf8');
  const actions = readFileSync('app/admin/whatsapp/actions.ts', 'utf8');

  it('não mantém uma segunda aba de WhatsApp com editor de texto livre', () => {
    expect(page).not.toContain('relatorios-whatsapp');
    expect(page).toContain("labelKey: 'tabs.whatsappTemplates'");
    expect(page).toContain("if (tab === 'whatsapp') return handleDispararTemplate();");
  });

  it('mantém o editor fora da aba de templates', () => {
    expect(page).toContain("{tab !== 'whatsapp' && <div");
  });

  it('calcula o público do template no escopo inteiro e trata seleções como refinamentos', () => {
    expect(actions).toContain('colabs: colabs.escopo');
    expect(actions).toContain('idsRefinados: new Set(colabs.lista.map');
    expect(page).toContain("t('templateMode.funnelEligible')");
    expect(page).toContain("t('templateMode.funnelRefined')");
  });
});

describe('prepararLoteTemplate', () => {
  it('monta os params na ordem do contrato do template escolhido', async () => {
    const sb = mock();
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'avaliacao_competencias', colabs: [professor()],
    });
    expect(lote.alvos).toHaveLength(1);
    expect(lote.alvos[0].params).toEqual([
      'Maria',
      'Autocuidado e bem-estar profissional',
      'https://macae.vertho.ai/dashboard/assessment',
    ]);
  });

  it('o MESMO destinatário recebe {{2}} diferente conforme o template', async () => {
    const sb = mock();
    const comp = await prepararLoteTemplate(sb.client, { empresaId: 'emp-1', template: 'avaliacao_competencias', colabs: [professor()] });
    const pend = await prepararLoteTemplate(sb.client, { empresaId: 'emp-1', template: 'avaliacao_pendente', colabs: [professor()] });
    expect(comp.alvos[0].params[1]).toBe('Autocuidado e bem-estar profissional');
    expect(pend.alvos[0].params[1]).toBe('Secretaria Municipal de Macaé/RJ');
  });

  it('avaliação parcial usa o progresso individual e exclui quem ainda não começou', async () => {
    const sb = mock({
      cenarios: [
        { cargo: 'Professor(a)', competencia_id: 'comp-1' },
        { cargo: 'Professor(a)', competencia_id: 'comp-2' },
      ],
      respostas: [{ colaborador_id: 'c1', competencia_id: 'comp-1' }],
    });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1',
      template: 'avaliacao_parcial',
      colabs: [professor(), professor({ id: 'c2', nome_completo: 'João' })],
    });
    expect(lote.alvos).toHaveLength(1);
    expect(lote.alvos[0].params).toEqual([
      'Maria', '1', '2', 'https://macae.vertho.ai/dashboard/assessment',
    ]);
    expect(lote.excluidos).toContainEqual(expect.objectContaining({
      motivo: 'avaliação ainda não iniciada', quantidade: 1,
    }));
  });

  it('avaliação pendente inclui só quem tem cenários e ainda não respondeu', async () => {
    const sb = mock({ respostas: [{ colaborador_id: 'c2', competencia_id: 'comp-1' }] });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1',
      template: 'avaliacao_pendente',
      colabs: [professor(), professor({ id: 'c2', nome_completo: 'João' })],
    });

    expect(lote.alvos.map((a) => a.colaboradorId)).toEqual(['c1']);
    expect(lote.excluidos).toContainEqual(expect.objectContaining({
      motivo: 'avaliação já iniciada', quantidade: 1,
    }));
  });

  it('avaliação por competências exige perfil comportamental concluído', async () => {
    const sb = mock();
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1',
      template: 'avaliacao_competencias',
      colabs: [professor({ perfil_dominante: null })],
    });

    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos[0]).toMatchObject({
      motivo: 'perfil comportamental ainda não concluído', quantidade: 1,
    });
  });

  it('resultado do perfil exige um perfil comportamental disponível', async () => {
    const sb = mock();
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1',
      template: 'resultado_perfil',
      colabs: [professor(), professor({ id: 'c2', nome_completo: 'João', perfil_dominante: null })],
    });

    expect(lote.alvos.map((a) => a.colaboradorId)).toEqual(['c1']);
    expect(lote.elegiveisPeloTemplate).toBe(1);
  });

  it('plano de desenvolvimento exige relatório individual/PDI gerado', async () => {
    const sb = mock({ relatorios: [{ colaborador_id: 'c1' }] });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1',
      template: 'plano_desenvolvimento',
      colabs: [professor(), professor({ id: 'c2', nome_completo: 'João' })],
    });

    expect(lote.alvos.map((a) => a.colaboradorId)).toEqual(['c1']);
    expect(lote.excluidos).toContainEqual(expect.objectContaining({
      motivo: 'relatório individual/PDI ainda não foi gerado', quantidade: 1,
    }));
  });

  it('aplica refinamentos somente depois da regra automática e expõe o funil', async () => {
    const sb = mock();
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1',
      template: 'resultado_perfil',
      colabs: [professor(), professor({ id: 'c2', nome_completo: 'João' })],
      idsRefinados: new Set(['c2']),
    });

    expect(lote).toMatchObject({
      totalNoEscopo: 2,
      elegiveisPeloTemplate: 2,
      removidosPorFiltros: 1,
      aposRefinamentos: 1,
    });
    expect(lote.alvos.map((a) => a.colaboradorId)).toEqual(['c2']);
  });

  it('trilha liberada usa competência e duração da trilha ativa real', async () => {
    const sb = mock({
      trilhas: [{
        colaborador_id: 'c1',
        status: TRILHA.ATIVA,
        competencia_foco: 'Gestão Escolar',
        competencias_foco: ['Gestão Escolar'],
        temporada_plano: Array.from({ length: 7 }, (_, i) => ({ semana: i + 1 })),
        numero_temporada: 1,
      }],
    });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'trilha_liberada_v2', colabs: [professor()],
    });
    expect(lote.alvos[0].params).toEqual([
      'Maria', 'Gestão Escolar', '7', 'https://macae.vertho.ai/dashboard/temporada',
    ]);
  });

  it('trilha liberada exclui quem já iniciou alguma atividade', async () => {
    const sb = mock({
      trilhas: [{
        id: 'trilha-1', colaborador_id: 'c1', status: TRILHA.ATIVA,
        competencia_foco: 'Gestão Escolar', competencias_foco: null,
        temporada_plano: [{ semana: 1 }], numero_temporada: 1,
      }],
      progressos: [{
        trilha_id: 'trilha-1', iniciado_em: '2026-08-30T10:00:00.000Z',
        conteudo_consumido: false, reflexao: null, feedback: null, tira_duvidas: null,
      }],
    });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'trilha_liberada_v2', colabs: [professor()],
    });

    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos[0]).toMatchObject({ motivo: 'trilha já iniciada', quantidade: 1 });
  });

  it('trilha concluída recusa quem ainda está com a jornada ativa', async () => {
    const sb = mock({
      trilhas: [{
        colaborador_id: 'c1', status: TRILHA.ATIVA, competencia_foco: 'Gestão Escolar',
        competencias_foco: null, temporada_plano: [{ semana: 1 }], numero_temporada: 1,
      }],
    });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'trilha_concluida', colabs: [professor()],
    });
    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos[0]).toMatchObject({ motivo: 'trilha ainda não concluída', quantidade: 1 });
  });

  it('exclui quem não tem competência no top5_workshop, com o motivo', async () => {
    const sb = mock({ cargos: [{ nome: 'Professor(a)', top5_workshop: [] }] });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'avaliacao_competencias', colabs: [professor()],
    });
    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos[0]).toMatchObject({ motivo: 'cargo sem competência em top5_workshop', quantidade: 1 });
    expect(lote.excluidos[0].amostra).toContain('MARIA DAS DORES SILVA');
  });

  it('exclui quem não tem telefone', async () => {
    const sb = mock();
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'avaliacao_competencias',
      colabs: [professor({ telefone: null, whatsapp: null })],
    });
    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos.map((e) => e.motivo)).toContain('sem telefone/WhatsApp');
  });

  it('idempotência é POR TEMPLATE: quem já recebeu ESTE não entra, e é contado', async () => {
    const sb = mock({ jaReceberam: [{ colaborador_id: 'c1' }] });
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'avaliacao_competencias', colabs: [professor(), professor({ id: 'c2', nome_completo: 'João' })],
    });
    expect(lote.alvos.map((a) => a.colaboradorId)).toEqual(['c2']);
    expect(lote.jaReceberam).toBe(1);
    expect(lote.elegiveisPeloTemplate).toBe(2);
    expect(lote.aposRefinamentos).toBe(2);
  });

  it('a consulta de idempotência filtra pelo template ESCOLHIDO', async () => {
    const sb = mock();
    await prepararLoteTemplate(sb.client, { empresaId: 'emp-1', template: 'boas_vindas_v2', colabs: [professor()] });
    const eqs = sb.chamadas.filter((c) => c.tabela === 'notification_deliveries' && c.metodo === 'eq');
    expect(eqs.some((c) => c.args[0] === 'kind' && c.args[1] === 'boas_vindas_v2')).toBe(true);
    expect(eqs.some((c) => c.args[0] === 'empresa_id' && c.args[1] === 'emp-1')).toBe(true);
  });

  it('recusa tenant de demonstração', async () => {
    const sb = mock({ empresa: { ...EMPRESA, is_demo: true } });
    await expect(prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'avaliacao_competencias', colabs: [professor()],
    })).rejects.toThrow(/demonstração/i);
  });

  it('conteúdo semanal usa a semana que a pessoa consegue abrir e o tema do plano real', async () => {
    const sb = mock(contextoCadencia());
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'conteudo_semana', colabs: [professor()],
    });

    expect(lote.alvos).toHaveLength(1);
    expect(lote.alvos[0]).toMatchObject({
      params: ['Maria', '2', 'Comunicação clara', 'https://macae.vertho.ai/dashboard/temporada/semana/2'],
      botaoParam: null,
      dedupeKey: 'conteudo_semana:c1:semana:2',
    });
  });

  it('encerramento do conteúdo usa a cadência ativa e inclui quem ainda não chegou à avaliação final', async () => {
    const plano = [
      { semana: 1, tipo: 'conteudo', conteudos_dia: [{ conteudo: { core_titulo: 'Escuta ativa' } }] },
      { semana: 2, tipo: 'avaliacao' },
    ];
    const sb = mock(contextoCadencia({ semanaAtual: 1, plano, progressos: [] }));
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'encerramento_conteudo', colabs: [professor()],
    });

    expect(lote.alvos).toHaveLength(1);
    expect(lote.alvos[0].params).toEqual([
      'Maria', 'Secretaria Municipal de Macaé/RJ', 'https://macae.vertho.ai/dashboard/temporada/semana/1',
    ]);
  });

  it('semana pendente usa calendário no corpo, acessível no corpo e no botão', async () => {
    const sb = mock(contextoCadencia({
      semanaAtual: 3,
      progressos: [{
        trilha_id: 'trilha-1', colaborador_id: 'c1', semana: 1,
        status: PROGRESSO.CONCLUIDO, reflexao: null, feedback: null,
      }],
    }));
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'semana_pendente_v2', colabs: [professor()],
    });

    expect(lote.alvos[0]).toMatchObject({
      params: ['Maria', '3', '2'],
      botaoParam: 'macae/2',
      dedupeKey: 'semana_pendente_v2:c1:calendario:3:pendente:2',
    });
  });

  it('semana pendente exclui quem está em dia, em vez de inventar uma pendência', async () => {
    const sb = mock(contextoCadencia({ semanaAtual: 2 }));
    const lote = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'semana_pendente_v2', colabs: [professor()],
    });

    expect(lote.alvos).toHaveLength(0);
    expect(lote.excluidos[0]).toMatchObject({ motivo: 'não tem semana anterior pendente', quantidade: 1 });
  });

  it('distingue missão de conteúdo pela semana carimbada no plano', async () => {
    const sb = mock(contextoCadencia({
      semanaAtual: 3,
      progressos: [
        { trilha_id: 'trilha-1', colaborador_id: 'c1', semana: 1, status: PROGRESSO.CONCLUIDO },
        { trilha_id: 'trilha-1', colaborador_id: 'c1', semana: 2, status: PROGRESSO.CONCLUIDO },
      ],
    }));
    const missao = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'missao_semana_v2', colabs: [professor()],
    });
    const conteudo = await prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'conteudo_semana', colabs: [professor()],
    });

    expect(missao.alvos[0].params).toEqual([
      'Maria', '3', 'https://macae.vertho.ai/dashboard/temporada/semana/3',
    ]);
    expect(conteudo.alvos).toHaveLength(0);
    expect(conteudo.excluidos[0].motivo).toMatch(/aplicação/);
  });

  it('idempotência do template recorrente vale por semana, não para a vida inteira', async () => {
    const anterior = mock({
      ...contextoCadencia(),
      jaReceberam: [{ colaborador_id: 'c1', dedupe_key: 'conteudo_semana:c1:semana:1' }],
    });
    const loteNovo = await prepararLoteTemplate(anterior.client, {
      empresaId: 'emp-1', template: 'conteudo_semana', colabs: [professor()],
    });
    expect(loteNovo.alvos).toHaveLength(1);
    expect(loteNovo.jaReceberam).toBe(0);

    const mesmoSlot = mock({
      ...contextoCadencia(),
      jaReceberam: [{ colaborador_id: 'c1', dedupe_key: 'conteudo_semana:c1:semana:2' }],
    });
    const loteRepetido = await prepararLoteTemplate(mesmoSlot.client, {
      empresaId: 'emp-1', template: 'conteudo_semana', colabs: [professor()],
    });
    expect(loteRepetido.alvos).toHaveLength(0);
    expect(loteRepetido.jaReceberam).toBe(1);
  });

  it('recusa template sem resolvedor — não envia parâmetro no formato errado', async () => {
    const sb = mock();
    await expect(prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'conteudo_semana_v2', colabs: [professor()],
    })).rejects.toThrow(/não é disparável/i);
  });

  it('propaga erro de query em vez de devolver lote vazio', async () => {
    const sb = mock();
    sb.falharEm({ tabela: 'cargos_empresa', op: 'select', mensagem: 'timeout no pool' });
    await expect(prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'avaliacao_competencias', colabs: [professor()],
    })).rejects.toThrow(/timeout no pool/);
  });

  it('falha na telemetria não vira "ninguém recebeu ainda"', async () => {
    const sb = mock();
    sb.falharEm({ tabela: 'notification_deliveries', op: 'select', mensagem: 'relação ausente' });
    await expect(prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'avaliacao_competencias', colabs: [professor()],
    })).rejects.toThrow(/relação ausente/);
  });
  /**
   * `encerramento_conteudo` — quem ficou com semanas em aberto quando o
   * programa encerrou a etapa de conteúdo.
   *
   * 🔴 O QUE ESTES CASOS IMPEDEM (medido 02/09/2026, Ibipeba). A primeira versão
   * do resolvedor excluía por `semanaAcessivel >= semanaCenarioB`, e o dry-run
   * mostrou as 8 pessoas que já haviam concluído TODO o conteúdo dentro do lote,
   * prestes a receber "na sua trilha ainda há semanas em aberto".
   *
   * A causa é o significado de `primeiraSemanaAcessivel`: ela parte da semana do
   * CALENDÁRIO e desce até a primeira que abre — nunca sobe acima dele. Com o
   * calendário na 7, quem concluiu tudo tem `semanaAcessivel` 7, não 9, e a
   * comparação com o fim do plano não exclui ninguém enquanto o calendário não
   * chegar lá. O sinal certo é a semana acessível estar CONCLUÍDA.
   */
  describe('encerramento_conteudo', () => {
    it('inclui quem tem a semana acessível em aberto, com o link dela', async () => {
      const sb = mock(contextoCadencia({
        semanaAtual: 7,
        progressos: [{ trilha_id: 'trilha-1', colaborador_id: 'c1', semana: 1, status: PROGRESSO.CONCLUIDO, reflexao: null, feedback: null }],
      }));
      const lote = await prepararLoteTemplate(sb.client, {
        empresaId: 'emp-1', template: 'encerramento_conteudo', colabs: [professor()],
      });
      expect(lote.alvos).toHaveLength(1);
      // {{3}} é o link da semana que ela CONSEGUE abrir (2), não a do calendário (7).
      expect(lote.alvos[0].params[2]).toContain('/semana/2');
    });

    it('EXCLUI quem concluiu a semana acessível, mesmo com o calendário atrás do fim do plano', async () => {
      // Reproduz o caso real de Ibipeba: o plano vai até a 4 (avaliação), o
      // CALENDÁRIO ainda está na 3 e a pessoa concluiu 1, 2 e 3. A semana
      // acessível é 3 — a que o calendário aponta —, e ela está concluída.
      // Pela régua antiga (`semanaAcessivel >= semanaCenarioB`), 3 < 4 e a
      // pessoa entraria no lote.
      const sb = mock(contextoCadencia({
        semanaAtual: 3,
        plano: [...planoCadencia, { semana: 4, tipo: 'avaliacao' }],
        progressos: [
          { trilha_id: 'trilha-1', colaborador_id: 'c1', semana: 1, status: PROGRESSO.CONCLUIDO, reflexao: null, feedback: null },
          { trilha_id: 'trilha-1', colaborador_id: 'c1', semana: 2, status: PROGRESSO.CONCLUIDO, reflexao: null, feedback: null },
          { trilha_id: 'trilha-1', colaborador_id: 'c1', semana: 3, status: PROGRESSO.CONCLUIDO, reflexao: null, feedback: null },
        ],
      }));
      const lote = await prepararLoteTemplate(sb.client, {
        empresaId: 'emp-1', template: 'encerramento_conteudo', colabs: [professor()],
      });
      expect(lote.alvos).toHaveLength(0);
      expect(lote.excluidos[0]).toMatchObject({
        motivo: 'concluiu a última semana que pode abrir; não há conteúdo em aberto',
        quantidade: 1,
      });
    });

    it('exclui quem não tem trilha ativa — a mensagem afirma um estado da trilha', async () => {
      const sb = mock({ envios: [], trilhas: [] });
      const lote = await prepararLoteTemplate(sb.client, {
        empresaId: 'emp-1', template: 'encerramento_conteudo', colabs: [professor()],
      });
      expect(lote.alvos).toHaveLength(0);
      expect(lote.excluidos[0].motivo).toMatch(/sem cadência ativa ou trilha gerada/);
    });
  });
});
