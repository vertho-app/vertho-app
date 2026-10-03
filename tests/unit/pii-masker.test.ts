/**
 * Máscara de PII antes da IA (R-05, 03/10/2026).
 *
 * O defeito que estes testes fecham: o mesmo mapa servia para mascarar e para
 * desmascarar, então `maskTextPII` trocava o nome completo pelo alias e, logo
 * em seguida, o alias pelo primeiro nome. O texto ia à IA com o nome da pessoa,
 * e o primeiro nome sozinho nunca era mascarado. Os testes antigos só olhavam o
 * nome completo, que era justamente o caso que "funcionava".
 *
 * Nomes e contatos são sintéticos.
 */
import { describe, it, expect } from 'vitest';
import {
  maskColaborador, maskTextPII, unmaskPII, maskDeepPII, unmaskDeepPII, maskEmpresa, juntarMapas,
} from '@/lib/pii-masker';

const ana = maskColaborador({ id: 'col-ana', nome_completo: 'Ana Beatriz Teste', email: 'ana@exemplo.com' });
const ALIAS = ana.masked!.nome;

describe('maskTextPII: o que vai à IA não leva o nome', () => {
  it('nome completo vira o alias e o primeiro nome NÃO volta no lugar dele', () => {
    const out = maskTextPII('Ana Beatriz Teste respondeu ao cenário.', ana.map);
    expect(out).toBe(`${ALIAS} respondeu ao cenário.`);
    expect(out).not.toMatch(/Ana/);
  });

  it('primeiro nome isolado é mascarado, em qualquer caixa', () => {
    const out = maskTextPII('Ana, você disse. Depois a ana repetiu e ANA confirmou.', ana.map);
    expect(out).toBe(`${ALIAS}, você disse. Depois a ${ALIAS} repetiu e ${ALIAS} confirmou.`);
  });

  it('não casa dentro de outra palavra, inclusive com acento colado', () => {
    const texto = 'A Análise da banana, a Ananda e o anabolizante.';
    expect(maskTextPII(texto, ana.map)).toBe(texto);
  });

  it('nome composto e primeiro + último também identificam', () => {
    const out = maskTextPII('Falei com Ana Beatriz e com Ana Teste.', ana.map);
    expect(out).toBe(`Falei com ${ALIAS} e com ${ALIAS}.`);
  });

  it('nome com acento: casa a forma digitada sem acento e respeita a fronteira depois da letra acentuada', () => {
    const joao = maskColaborador({ id: 'col-joao', nome_completo: 'João Lúcio Prado' });
    const a = joao.masked!.nome;
    expect(maskTextPII('João, Joao e JOÃO. Joãozinho não.', joao.map)).toBe(`${a}, ${a} e ${a}. Joãozinho não.`);
    const lucia = maskColaborador({ id: 'col-lucia', nome_completo: 'Lúcia Ramos' });
    const l = lucia.masked!.nome;
    expect(maskTextPII('Lúcia, a Lucia e Lúcias.', lucia.map)).toBe(`${l}, a ${l} e Lúcias.`);
  });

  it('partícula não vira "segundo nome": Maria do Socorro sai inteira, sem sobrar o Socorro', () => {
    const m = maskColaborador({ id: 'col-maria', nome_completo: 'Maria do Socorro Silva' });
    const a = m.masked!.nome;
    expect(maskTextPII('Maria do Socorro pediu ajuda.', m.map)).toBe(`${a} pediu ajuda.`);
  });

  it('nome que também é palavra comum: só a forma com maiúscula é o nome', () => {
    const clara = maskColaborador({ id: 'col-clara', nome_completo: 'Clara Souza' });
    const a = clara.masked!.nome;
    expect(maskTextPII('Clara, busquei uma comunicação clara.', clara.map)).toBe(`${a}, busquei uma comunicação clara.`);
    // O nome completo continua sem restrição de caixa.
    expect(maskTextPII('clara souza assinou.', clara.map)).toBe(`${a} assinou.`);
  });

  it('o e-mail cadastrado vira o e-mail-alias; outro e-mail, telefone e CPF viram marcador', () => {
    const out = maskTextPII(
      'Escreva para ana@exemplo.com, ana.souza@outra.com ou xana@exemplo.com; tel (11) 99999-8888; CPF 123.456.789-01.',
      ana.map,
    );
    expect(out).toBe(`Escreva para ${ana.masked!.email}, [email] ou [email]; tel [telefone]; CPF [cpf].`);
  });

  it('não lê o mapa de volta: um alias no texto continua alias', () => {
    expect(maskTextPII(`${ALIAS} disse`, ana.map)).toBe(`${ALIAS} disse`);
  });

  it('nome logo depois de um escape de JSON também é mascarado', () => {
    const serializado = JSON.stringify({ resumo: 'linha 1\nAna disse que sim' });
    expect(maskTextPII(serializado, ana.map)).toBe(JSON.stringify({ resumo: `linha 1\n${ALIAS} disse que sim` }));
  });

  it('sem mapa: só os marcadores genéricos', () => {
    expect(maskTextPII('Ana: ana@exemplo.com', null)).toBe('Ana: [email]');
  });
});

describe('unmaskPII: o que a pessoa lê volta com o nome', () => {
  it('alias vira o primeiro nome; e-mail-alias vira o e-mail', () => {
    expect(unmaskPII(`${ALIAS}, você escreveu para ${ana.masked!.email}.`, ana.map))
      .toBe('Ana, você escreveu para ana@exemplo.com.');
  });

  it('tolera a IA trocar o sublinhado ou a caixa do alias', () => {
    const [prefixo, hash] = ALIAS.split('_');
    expect(unmaskPII(`${prefixo} ${hash} e ${prefixo.toLowerCase()}-${hash}`, ana.map)).toBe('Ana e Ana');
  });

  it('não lê o mapa de ida: o nome no texto fica como está', () => {
    expect(unmaskPII('Ana Beatriz Teste', ana.map)).toBe('Ana Beatriz Teste');
  });

  it('nome com cifrão no texto real não é interpretado como padrão de troca', () => {
    const c = maskColaborador({ id: 'x', nome_completo: 'Zé', email: 'ze$&@exemplo.com' });
    expect(unmaskPII(c.masked!.email!, c.map)).toBe('ze$&@exemplo.com');
  });
});

describe('versões profundas e empresa', () => {
  it('maskDeepPII e unmaskDeepPII percorrem objeto e lista sem tocar nas chaves', () => {
    const obj = { Ana: 'Ana fez', lista: ['oi Ana', 3, null], aninhado: { t: 'ana@exemplo.com' } };
    const m = maskDeepPII(obj, ana.map);
    expect(m).toEqual({ Ana: `${ALIAS} fez`, lista: [`oi ${ALIAS}`, 3, null], aninhado: { t: ana.masked!.email } });
    expect(obj.Ana).toBe('Ana fez'); // não muta a entrada
    expect(unmaskDeepPII(m, ana.map)).toEqual({ Ana: 'Ana fez', lista: ['oi Ana', 3, null], aninhado: { t: 'ana@exemplo.com' } });
  });

  it('mapas de empresa e colaborador se juntam sem um desfazer o outro', () => {
    const emp = maskEmpresa({ id: 'emp-1', nome: 'Escola Horizonte' });
    const mapas = juntarMapas(ana.map, emp.map);
    const out = maskTextPII('Ana trabalha na Escola Horizonte.', mapas);
    expect(out).toBe(`${ALIAS} trabalha na ${emp.masked!.nome}.`);
    expect(unmaskPII(out, mapas)).toBe('Ana trabalha na Escola Horizonte.');
  });
});
