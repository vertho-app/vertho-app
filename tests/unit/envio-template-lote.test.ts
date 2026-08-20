import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  listarTemplatesDisparaveis,
  prepararLoteTemplate,
  primeiroNome,
} from '@/lib/notifications/envio-template-lote';

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
  empresa?: any;
} = {}) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? (opts.empresa ?? EMPRESA) : null),
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return opts.cargos ?? [{ nome: 'Professor(a)', top5_workshop: ['Autocuidado e bem-estar profissional'] }];
      if (tabela === 'notification_deliveries') return opts.jaReceberam ?? [];
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
    expect(nomes).toContain('boas_vindas_v2');
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
