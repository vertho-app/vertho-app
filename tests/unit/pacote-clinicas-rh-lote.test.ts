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

function mock(sysConfig: Record<string, unknown> | null) {
  return criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? { ...EMPRESA, sys_config: sysConfig } : null),
    lista: (tabela) => (tabela === 'cargos_empresa' ? [{ nome: 'Secretária', top5_workshop: [] }] : []),
  });
}

const secretaria = { id: 's1', nome_completo: 'Ana Souza', cargo: 'Secretária', telefone: '5511999990001', perfil_dominante: null, role: 'colaborador' };
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
