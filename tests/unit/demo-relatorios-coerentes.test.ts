import { describe, it, expect } from 'vitest';
import { construirLeiturasDemo } from '@/lib/demo/relatorios-coerentes';
import { personalizarArtefatoDemo } from '@/lib/demo/reset-acme-demo';
const cargo = [{ nome: 'Professor', top5_workshop: ['Aprendizagem', 'Didática'] }];
const pessoa = (id: string, extra = {}) => ({ id, email: `${id}@demo`, nome_completo: id, cargo: 'Professor', role: 'colaborador', gestor_email: 'gestor@demo', ...extra });
const nota = (id: string, competencia: string, value: number) => ({ colaborador_id: id, competencia, descritor: 'D1', nota: value });
describe('leituras demonstrativas derivadas do mesmo diagnóstico', () => {
  it('Marina com média 3,10 recebe N3 no cartão e na narrativa; pendência não vira zero', () => {
    const rows = construirLeiturasDemo('Rede de Escolas ACME', [pessoa('gestor', { role: 'gestor', cargo: 'Coordenador' }), pessoa('Marina'), pessoa('pendente')], cargo,
      [nota('Marina', 'Aprendizagem', 3.1), nota('Marina', 'Didática', 1.52)]);
    const gestor: any = rows[0].conteudo, rh: any = rows.at(-1)!.conteudo;
    expect(gestor.resumo_executivo.leitura_geral).toContain('2 pessoas');
    expect(gestor.destaques_evolucao[0]).toMatchObject({ nome: 'Marina', nivel: 3 });
    expect(gestor.resumo_executivo.principal_avanco).toContain('N3, nota 3,10');
    expect(rh.indicadores).toMatchObject({ total_avaliados: 1, total_avaliacoes: 2 });
    expect(gestor.analise_por_competencia[0].distribuicao).toEqual({n1:0,n2:0,n3:1,n4:0});
  });
  it('usa o Top 5 do cargo, exclui pessoas externas e separa avaliações parciais', () => {
    const rows = construirLeiturasDemo('Sinal', [pessoa('completo'), pessoa('parcial')], cargo,
      [nota('completo','Aprendizagem',3.51),nota('completo','Didática',2.99),nota('parcial','Aprendizagem',4),nota('externo','Didática',1),nota('completo','Outro simulador',1)]);
    const rh: any = rows.at(-1)!.conteudo;
    expect(rh.indicadores).toMatchObject({ total_avaliados:1,total_avaliacoes:2,pct_nivel_2:50,pct_nivel_4:50 });
    expect(rh.indicadores.media_geral).toBe(3.25);
  });
  it('personalização da marca é idempotente inclusive com ACME no nome final', () => {
    for(const input of ['A ACME Demo', 'Rede ACME', 'Rede de Escolas ACME', 'Rede Rede de Escolas ACME']) {
      const output = personalizarArtefatoDemo(input, 'escolas-acme');
      expect(output).not.toMatch(/Rede Rede|ACME Demo|ACME de Escolas/);
      expect(personalizarArtefatoDemo(output, 'escolas-acme')).toBe(output);
    }
    expect(personalizarArtefatoDemo('da ACME Demo', 'gruposinal')).toBe('do Grupo Sinal');
  });
});
