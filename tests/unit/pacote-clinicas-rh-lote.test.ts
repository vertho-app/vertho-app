import { describe, expect, it } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { prepararLoteTemplate } from '@/lib/notifications/envio-template-lote';
import { MOTIVO_RH_FORA_DO_LOTE, pacoteClinicasLigado } from '@/lib/pacote-clinicas';

/**
 * Pacote de clínicas (onlabel, decisão de 23/10/2026): o RH da empresa só recebe os relatórios.
 * Medido antes desta regra: `boas_vindas_v2` não exige nada da pessoa e `avaliacao_pendente` só
 * exige que ela não tenha feito o perfil, então os dois alcançavam a conta de RH em qualquer lote
 * que a incluísse no escopo (em Ibipeba, 07/10, os 3 RH internos entraram no convite).
 *
 * O que este teste guarda: com a chave ligada o RH sai de TODO template, com o motivo na prévia
 * ("quem NÃO recebe e por quê"); sem a chave, nada muda para os outros tenants.
 */

const EMPRESA = { id: 'emp-onlabel', nome: 'onlabel', slug: 'onlabel', is_demo: false };
const CONSULTORIO = { id: 'esc-lima', nome: 'Consultório Dra. Lima' };

function mock(sysConfig: Record<string, unknown> | null) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? { ...EMPRESA, sys_config: sysConfig } : null),
    lista: (tabela) => {
      if (tabela === 'cargos_empresa') return [{ nome: 'Secretária', top5_workshop: [] }];
      if (tabela === 'escolas') return [CONSULTORIO, { id: 'esc-outra', nome: 'Clínica Outra' }];
      if (tabela === 'colaboradores') return [{ id: 's1', escola_id: CONSULTORIO.id }, { id: 's2', escola_id: null }, { id: 'rh1', escola_id: null }];
      return [];
    },
  });
}

const secretaria = { id: 's1', nome_completo: 'Ana Souza', cargo: 'Secretária', telefone: '5511999990001', perfil_dominante: null, role: 'colaborador' };
const semConsultorio = { id: 's2', nome_completo: 'Bia Costa', cargo: 'Secretária', telefone: '5511999990003', perfil_dominante: null, role: 'colaborador' };
const rh = { id: 'rh1', nome_completo: 'Carla RH', cargo: null, telefone: '5511999990002', perfil_dominante: null, role: 'rh' };

async function lote(template: string, sysConfig: Record<string, unknown> | null) {
  return prepararLoteTemplate(mock(sysConfig).client, { empresaId: EMPRESA.id, template, colabs: [secretaria, rh] });
}

describe('pacote de clínicas: RH fora dos lotes de WhatsApp', () => {
  for (const template of ['boas_vindas_v2', 'avaliacao_pendente']) {
    it(`com a chave ligada, ${template} não chega ao RH e a prévia diz por quê`, async () => {
      const r = await lote(template, { pacote_clinicas: true });
      expect(r.alvos.map((a) => a.colaboradorId)).toEqual(['s1']);
      const motivo = r.excluidos.find((e) => e.motivo === MOTIVO_RH_FORA_DO_LOTE);
      expect(motivo?.quantidade).toBe(1);
      expect(motivo?.amostra).toEqual(['Carla RH']);
    });

    it(`sem a chave, ${template} segue como antes (o RH continua no lote)`, async () => {
      const r = await lote(template, {});
      expect(r.alvos.map((a) => a.colaboradorId).sort()).toEqual(['rh1', 's1']);
      expect(r.excluidos.some((e) => e.motivo === MOTIVO_RH_FORA_DO_LOTE)).toBe(false);
    });
  }

  it('a chave liga só com true literal (JSONB livre não liga por "true" ou 1)', () => {
    expect(pacoteClinicasLigado({ pacote_clinicas: true })).toBe(true);
    expect(pacoteClinicasLigado({ pacote_clinicas: 'true' })).toBe(false);
    expect(pacoteClinicasLigado({ pacote_clinicas: 1 })).toBe(false);
    expect(pacoteClinicasLigado(null)).toBe(false);
    expect(pacoteClinicasLigado(undefined)).toBe(false);
  });
});

/**
 * Decisão do dono (24/10/2026): no pacote, o "programa da {{instituição}}" das mensagens é o CONSULTÓRIO
 * da secretária (`colaboradores.escola_id` → `escolas.nome`), que ela conhece; a onlabel ela não
 * reconhece. Os dois templates abaixo têm a instituição em `{{2}}` (params[1]).
 */
describe('pacote de clínicas: a instituição das mensagens é o consultório', () => {
  for (const template of ['boas_vindas_v2', 'avaliacao_pendente']) {
    it(`com a chave ligada, ${template} leva o nome do consultório da pessoa`, async () => {
      const sb = mock({ pacote_clinicas: true });
      const r = await prepararLoteTemplate(sb.client, { empresaId: EMPRESA.id, template, colabs: [secretaria, semConsultorio] });
      expect(r.alvos.map((a) => [a.colaboradorId, a.params[1]])).toEqual([['s1', 'Consultório Dra. Lima']]);
      // Quem está sem consultório não recebe "no programa da onlabel": sai do lote, com o nome na prévia.
      const vazio = r.excluidos.find((e) => e.motivo === 'parâmetro do template ficou vazio');
      expect(vazio?.amostra).toEqual(['Bia Costa']);
      // A leitura é da empresa do lote, nas duas tabelas.
      expect(sb.chamadas.some((c) => c.tabela === 'escolas' && c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === EMPRESA.id)).toBe(true);
      expect(sb.chamadas.some((c) => c.tabela === 'colaboradores' && c.metodo === 'eq' && c.args[0] === 'empresa_id' && c.args[1] === EMPRESA.id)).toBe(true);
    });

    it(`sem a chave, ${template} segue com o nome da empresa e nem lê os consultórios`, async () => {
      const sb = mock({});
      const r = await prepararLoteTemplate(sb.client, { empresaId: EMPRESA.id, template, colabs: [secretaria, semConsultorio] });
      expect(r.alvos.map((a) => [a.colaboradorId, a.params[1]])).toEqual([['s1', 'onlabel'], ['s2', 'onlabel']]);
      expect(sb.usou('escolas', 'select')).toBe(false);
    });
  }

  for (const tabela of ['escolas', 'colaboradores']) {
    it(`leitura de ${tabela} que falha derruba o lote (não cai para o nome da empresa)`, async () => {
      const sb = mock({ pacote_clinicas: true });
      sb.falharEm({ tabela, op: 'select', mensagem: 'timeout no pool' });
      await expect(prepararLoteTemplate(sb.client, { empresaId: EMPRESA.id, template: 'boas_vindas_v2', colabs: [secretaria] }))
        .rejects.toThrow(/timeout no pool/);
    });
  }
});
