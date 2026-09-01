import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  listarTemplatesDisparaveis,
  prepararLoteTemplate,
  primeiroNome,
} from '@/lib/notifications/envio-template-lote';
import { TRILHA } from '@/lib/status';

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
  empresa?: any;
} = {}) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? (opts.empresa ?? EMPRESA) : null),
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return opts.cargos ?? [{ nome: 'Professor(a)', top5_workshop: ['Autocuidado e bem-estar profissional'] }];
      if (tabela === 'notification_deliveries') return opts.jaReceberam ?? [];
      if (tabela === 'respostas') return opts.respostas ?? [];
      if (tabela === 'banco_cenarios') return opts.cenarios ?? [];
      if (tabela === 'trilhas') return opts.trilhas ?? [];
      return [];
    },
  });
}

const professor = (over: any = {}) => ({
  id: 'c1', nome_completo: 'MARIA DAS DORES SILVA', cargo: 'Professor(a)', telefone: '5522999999999', ...over,
});

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
    // Cadência e credencial ficam de fora por decisão — ver o comentário do módulo.
    expect(nomes).not.toContain('conteudo_semana');
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

  it('não mantém uma segunda aba de WhatsApp com editor de texto livre', () => {
    expect(page).not.toContain('relatorios-whatsapp');
    expect(page).toContain("labelKey: 'tabs.whatsappTemplates'");
    expect(page).toContain("if (tab === 'whatsapp') return handleDispararTemplate();");
  });

  it('mantém o editor fora da aba de templates', () => {
    expect(page).toContain("{tab !== 'whatsapp' && <div");
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

  it('recusa template sem resolvedor — não envia parâmetro no formato errado', async () => {
    const sb = mock();
    await expect(prepararLoteTemplate(sb.client, {
      empresaId: 'emp-1', template: 'conteudo_semana', colabs: [professor()],
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
});
