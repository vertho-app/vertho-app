import { describe, it, expect } from 'vitest';
import {
  cadeiraDoCargo,
  cadeirasPresentes,
  enriquecerComContatos,
  formatarParticipantes,
  parseParticipantes,
} from '@/lib/copiloto/participantes';

describe('cadeiraDoCargo', () => {
  it('põe cada cargo na cadeira que ele ocupa na decisão', () => {
    expect(cadeiraDoCargo('CFO')).toBe('financeiro');
    expect(cadeiraDoCargo('Gerente de Controladoria')).toBe('financeiro');
    expect(cadeiraDoCargo('Head de T&D')).toBe('RH');
    expect(cadeiraDoCargo('Diretora de Recursos Humanos')).toBe('RH');
    expect(cadeiraDoCargo('Coordenadora Pedagógica')).toBe('RH');
    expect(cadeiraDoCargo('COO')).toBe('operações');
    expect(cadeiraDoCargo('Gerente de Logística')).toBe('operações');
    expect(cadeiraDoCargo('CTO')).toBe('TI');
    expect(cadeiraDoCargo('CEO')).toBe('patrocinador');
    expect(cadeiraDoCargo('Sócio-fundador')).toBe('patrocinador');
  });

  it('área vence hierarquia: um diretor de RH é RH, não patrocinador', () => {
    expect(cadeiraDoCargo('Diretor de RH')).toBe('RH');
    expect(cadeiraDoCargo('Diretor Financeiro')).toBe('financeiro');
    // Sem área declarada, quem dirige é quem banca.
    expect(cadeiraDoCargo('Diretor')).toBe('patrocinador');
  });

  it('não chuta cadeira para cargo que não reconhece', () => {
    expect(cadeiraDoCargo('')).toBeNull();
    expect(cadeiraDoCargo('Analista')).toBeNull();
    expect(cadeiraDoCargo('Consultor externo')).toBeNull();
  });
});

describe('parseParticipantes', () => {
  it('lê o formato que os chips do CRM produzem', () => {
    const lista = parseParticipantes('Maria Souza, Head de T&D; Paulo Reis, CFO');
    expect(lista).toEqual([
      { nome: 'Maria Souza', cargo: 'Head de T&D', seat: 'RH' },
      { nome: 'Paulo Reis', cargo: 'CFO', seat: 'financeiro' },
    ]);
  });

  it('quem foi digitado sem cargo continua na sala', () => {
    const lista = parseParticipantes('Ana Lima');
    expect(lista).toEqual([{ nome: 'Ana Lima', cargo: '', seat: null }]);
  });

  it('o cargo pode ter vírgula sem quebrar o nome', () => {
    const [p] = parseParticipantes('Renata Alves, Diretora de RH, unidade Sul');
    expect(p.nome).toBe('Renata Alves');
    expect(p.cargo).toBe('Diretora de RH, unidade Sul');
    expect(p.seat).toBe('RH');
  });

  it('campo vazio não inventa participante', () => {
    expect(parseParticipantes('')).toEqual([]);
    expect(parseParticipantes('  ;  ; ')).toEqual([]);
  });
});

describe('enriquecerComContatos', () => {
  it('o cargo do CRM completa quem veio só com o nome', () => {
    const lista = enriquecerComContatos(parseParticipantes('Paulo Reis'), [
      { name: 'Paulo Reis', role: 'CFO' },
    ]);
    expect(lista[0]).toEqual({ nome: 'Paulo Reis', cargo: 'CFO', seat: 'financeiro' });
  });

  it('o CRM vence o que foi digitado, porque é a fonte que o cliente confirmou', () => {
    const lista = enriquecerComContatos(parseParticipantes('Paulo Reis, financeiro'), [
      { name: 'paulo reis', role: 'Diretor de Suprimentos' },
    ]);
    expect(lista[0].cargo).toBe('Diretor de Suprimentos');
  });

  it('quem não está no CRM mantém o que o vendedor escreveu', () => {
    const lista = enriquecerComContatos(parseParticipantes('Convidado Externo, CTO'), [
      { name: 'Outra Pessoa', role: 'CFO' },
    ]);
    expect(lista[0]).toEqual({ nome: 'Convidado Externo', cargo: 'CTO', seat: 'TI' });
  });

  it('contato sem cargo no CRM não apaga o cargo digitado', () => {
    const lista = enriquecerComContatos(parseParticipantes('Maria Souza, Head de T&D'), [
      { name: 'Maria Souza', role: null },
    ]);
    expect(lista[0].cargo).toBe('Head de T&D');
    expect(lista[0].seat).toBe('RH');
  });
});

describe('o que chega ao prompt', () => {
  it('cada linha diz nome, cargo e cadeira', () => {
    const texto = formatarParticipantes(parseParticipantes('Maria Souza, Head de T&D; Ana Lima'));
    expect(texto).toContain('- Maria Souza | Head de T&D | cadeira: RH');
    expect(texto).toContain('- Ana Lima | cargo não informado | cadeira: não identificada');
  });

  it('sem participantes, o prompt recebe o mesmo texto de antes', () => {
    expect(formatarParticipantes([])).toBe('não informados');
  });

  it('as cadeiras presentes saem sem repetição, para as rotas priorizarem', () => {
    const lista = parseParticipantes('Maria, Head de T&D; Renata, Coordenadora Pedagógica; Paulo, CFO');
    expect(cadeirasPresentes(lista)).toEqual(['RH', 'financeiro']);
  });
});
