import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_DO_COMERCIAL,
  WHATSAPP_VERTHO,
  linkDeContatoDaDegustacao,
  mensagemDeContato,
  numeroDoComercial,
} from '@/lib/demo/degustacao-contato';
import { COPIA_DEGUSTACAO_GUIADA, DEMO_PROSPECT_TENANTS } from '@/lib/demo/acme-prospect-config';

/**
 * Próximo passo da degustação (o único caminho de saída da página de boas-vindas).
 *
 * A mensagem é enviada pela PESSOA, do aparelho dela: aqui só se prova que o
 * número é de quem convidou, que o texto sai gramaticalmente inteiro para
 * qualquer nome de empresa, e que a troca de pessoa ("sua" na pergunta, "minha"
 * no botão) não se inverte na cópia de um ambiente para outro.
 */

describe('número de quem convidou', () => {
  it('sem registro, vazio ou nulo: cai no número público da Vertho', () => {
    expect(numeroDoComercial(null)).toBe(WHATSAPP_VERTHO);
    expect(numeroDoComercial(undefined)).toBe(WHATSAPP_VERTHO);
    expect(numeroDoComercial('')).toBe(WHATSAPP_VERTHO);
    expect(numeroDoComercial('ninguem@vertho.ai')).toBe(WHATSAPP_VERTHO);
  });

  it('e-mail registrado responde, sem depender de caixa nem de espaço em volta', () => {
    WHATSAPP_DO_COMERCIAL['comercial.teste@vertho.ai'] = '+55 (41) 99999-1234';
    try {
      expect(numeroDoComercial('  Comercial.Teste@Vertho.AI ')).toBe('5541999991234');
    } finally {
      delete WHATSAPP_DO_COMERCIAL['comercial.teste@vertho.ai'];
    }
  });

  it('🔴 chave do protótipo não vira número (a busca é por hasOwnProperty, não por "in")', () => {
    for (const chave of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(numeroDoComercial(chave)).toBe(WHATSAPP_VERTHO);
      expect(numeroDoComercial(chave)).toMatch(/^[0-9]+$/);
    }
  });
});

describe('mensagem que a pessoa envia', () => {
  const base = { nome: 'Lucianna Ferreira', empresa: 'Boehringer', minhaCasa: 'na minha empresa' };

  it('primeiro nome, empresa entre parênteses e o lugar por extenso', () => {
    const texto = mensagemDeContato(base);
    expect(texto).toContain('Aqui é Lucianna (Boehringer).');
    expect(texto).not.toContain('Ferreira');
    expect(texto.endsWith('funcionaria na minha empresa.')).toBe(true);
  });

  it('🔴 o nome da empresa nunca recebe artigo montado (sairia errado em metade dos casos)', () => {
    for (const empresa of ['Boehringer', 'Grupo Sinal', 'Le Pain', 'Ford Slaviero']) {
      const texto = mensagemDeContato({ ...base, empresa });
      expect(texto).toContain(`(${empresa})`);
      expect(texto).not.toMatch(new RegExp(`\\b(da|do|de) ${empresa}`));
    }
  });

  it('sem empresa não sobra parêntese vazio, e sem nome não sobra "Aqui é"', () => {
    expect(mensagemDeContato({ ...base, empresa: '  ' })).toContain('Aqui é Lucianna.');
    expect(mensagemDeContato({ ...base, empresa: '  ' })).not.toContain('(');
    const semNome = mensagemDeContato({ ...base, nome: '   ', empresa: '' });
    expect(semNome).not.toContain('Aqui é');
    expect(semNome.startsWith('Olá! Acabei de ver')).toBe(true);
  });

  it('sem travessão: o texto sai numa conversa de WhatsApp', () => {
    expect(mensagemDeContato(base)).not.toMatch(/[—–]/);
  });
});

describe('link do próximo passo', () => {
  const dados = { nome: 'Lucianna', empresa: 'Boehringer', minhaCasa: 'na minha empresa' };

  it('um link só, para o número de quem convidou, com o texto pronto', () => {
    const url = linkDeContatoDaDegustacao({ ...dados, criadoPor: 'rodrigo@vertho.ai' });
    expect(url.match(/https:\/\//g)).toHaveLength(1);
    const alvo = new URL(url);
    expect(alvo.hostname).toBe('wa.me');
    expect(alvo.pathname.slice(1)).toMatch(/^[0-9]{10,15}$/);
    expect(alvo.searchParams.get('text')).toBe(mensagemDeContato(dados));
  });

  it('quem não está no mapa manda para o número público, nunca para um link quebrado', () => {
    const alvo = new URL(linkDeContatoDaDegustacao({ ...dados, criadoPor: 'outra.pessoa@vertho.ai' }));
    expect(alvo.pathname).toBe(`/${WHATSAPP_VERTHO}`);
  });
});

describe('cópia do próximo passo por ambiente', () => {
  it('todo ambiente de degustação tem a pergunta e o lugar escritos', () => {
    for (const slug of Object.keys(DEMO_PROSPECT_TENANTS)) {
      const contato = COPIA_DEGUSTACAO_GUIADA[slug as keyof typeof COPIA_DEGUSTACAO_GUIADA]?.contato;
      expect(contato, slug).toBeTruthy();
      // 🔴 a pergunta fala COM a pessoa, o botão e a mensagem falam POR ela: é a
      // troca que a cópia de um ambiente para outro inverte sem ninguém notar.
      expect(contato.titulo, slug).toMatch(/\bsua\b/);
      expect(contato.titulo, slug).not.toMatch(/\bminha\b/);
      expect(contato.minhaCasa, slug).toMatch(/^na minha /);
      expect(`Quero ver ${contato.minhaCasa}`, slug).not.toMatch(/[—–]/);
    }
  });

  it('a rede de escolas não é chamada de empresa', () => {
    expect(COPIA_DEGUSTACAO_GUIADA['escolas-acme'].contato.titulo).toContain('rede');
    expect(COPIA_DEGUSTACAO_GUIADA['escolas-acme'].contato.minhaCasa).toBe('na minha rede');
    expect(COPIA_DEGUSTACAO_GUIADA['acme-demo'].contato.minhaCasa).toBe('na minha empresa');
  });
});
