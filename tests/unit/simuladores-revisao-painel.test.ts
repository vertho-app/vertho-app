import { describe, it, expect } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { resumoRevisoes } from '@/lib/simuladores/revisao-painel';
import { referenciaEncontros } from '@/lib/simulador-lideranca/revisao-contexto';
import { episodio } from '../fixtures/simulador-lideranca';
const destino = {
  tabela: 'sim_lideranca_revisoes',
  alvo: 'jornada_id',
} as const;
describe('última revisão do recorte atual', () => {
  it('jornada avançada fica pendente; parecer mais recente substitui o anterior na contagem', async () => {
    const sb = criarSupabaseMock({
      lista: () => [
        {
          jornada_id: 'a',
          parecer: 'parcialmente',
          contexto: { referencia: 'atual' },
        },
        {
          jornada_id: 'a',
          parecer: 'discordo',
          contexto: { referencia: 'atual' },
        },
        {
          jornada_id: 'b',
          parecer: 'concordo',
          contexto: { referencia: 'antiga' },
        },
        { jornada_id: 'c', parecer: 'discordo', contexto: null },
      ],
    });
    expect(
      await resumoRevisoes(
        sb.client,
        destino,
        ['a', 'b', 'c'].map((id) => ({ id, referencia: 'atual' })),
      ),
    ).toEqual({
      total: 3,
      pendentes: 2,
      concordo: 0,
      parcialmente: 1,
      discordo: 0,
    });
    sb.falharEm({ tabela: destino.tabela, op: 'select', mensagem: 'timeout' });
    expect(await resumoRevisoes(sb.client, destino, [{ id: 'a' }])).toBeNull();
  });
  it('referência muda com nova devolutiva, mas não com ordenação', () => {
    const a = {
      ...episodio(0),
      id: 'a',
      avaliacao: { sintese: 'primeira' } as any,
    };
    const b = {
      ...episodio(1),
      id: 'b',
      avaliacao: { sintese: 'segunda' } as any,
    };
    expect(referenciaEncontros([a, b])).toBe(referenciaEncontros([b, a]));
    expect(referenciaEncontros([a])).not.toBe(referenciaEncontros([a, b]));
    expect(referenciaEncontros([a])).not.toBe(
      referenciaEncontros([{ ...a, avaliacao: { sintese: 'outra' } as any }]),
    );
  });
});
