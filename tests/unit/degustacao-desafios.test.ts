import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { semComentarios } from '../helpers/fonte';
import {
  resumoParaEncaminhar,
  DESAFIOS_CHAVES,
  OUTRO_DESAFIO_MAX,
  alvoDoDesafio,
  caminhoBaseDaCena,
  cenaDaSala,
  copiaDaVersaoC,
  desafioDoAlvo,
  desafioDoAmbiente,
  desafiosDaLista,
  desafiosDoAmbiente,
  ehDesafio,
  limparOutroDesafio,
  ordemDosDesafios,
} from '@/lib/demo/degustacao-desafios';
import { ORIENTACAO_POR_AMBIENTE } from '@/lib/demo/degustacao-orientacao';
import { DEMO_PROSPECT_TENANTS } from '@/lib/demo/acme-prospect-config';

/**
 * Os desafios da degustação C: a fonte única do que o lead escolhe e de onde a
 * escolha o leva. O que mais custa é o que NÃO falha sozinho: caminho que o
 * produto não usa, chave que atravessa a rede virando destino, lista que não gira.
 */

const AMBIENTES = Object.keys(DEMO_PROSPECT_TENANTS);
const PAPEIS = ['rh', 'gestor', 'usuario'] as const;

describe('os desafios de cada ambiente', () => {
  it('o denominador não é zero: há ambientes e há chaves', () => {
    expect(AMBIENTES.length).toBeGreaterThanOrEqual(3);
    expect(DESAFIOS_CHAVES).toHaveLength(5);
  });

  it('todo ambiente tem os cinco desafios, uma vez cada, na mesma ordem de chaves', () => {
    for (const slug of AMBIENTES) {
      const lista = desafiosDoAmbiente(slug);
      expect(lista.map((d) => d.chave), slug).toEqual([...DESAFIOS_CHAVES]);
    }
  });

  it('cada desafio tem sala válida, caminho do próprio painel e três pontos preenchidos', () => {
    for (const slug of AMBIENTES) {
      for (const d of desafiosDoAmbiente(slug)) {
        expect(PAPEIS, `${slug}/${d.chave}`).toContain(d.sala);
        expect(d.caminho, `${slug}/${d.chave}`).toMatch(/^\/dashboard(\/|\?|$)/);
        expect(d.caminho).not.toMatch(/\/\/|https?:|\\/);
        expect(d.pontos).toHaveLength(3);
        for (const texto of [d.titulo, d.frase, d.tema, d.emGeral, d.com, ...d.pontos]) {
          expect(texto.trim().length).toBeGreaterThan(8);
        }
      }
    }
  });

  it('a cena aponta para uma tela que o PRÓPRIO produto já oferece naquela sala', () => {
    // O painel não pode levar a pessoa a uma tela que a orientação do papel não
    // conhece: seria uma rota que ninguém mais exercita nem mantém.
    for (const slug of AMBIENTES) {
      for (const d of desafiosDoAmbiente(slug)) {
        const orientacao = (ORIENTACAO_POR_AMBIENTE as Record<string, any>)[slug][d.sala];
        const conhecidos = [orientacao.casa, ...orientacao.destinos.map((x: { path: string }) => x.path)];
        expect(conhecidos, `${slug}/${d.chave} -> ${d.sala} ${d.caminho}`).toContain(d.caminho);
      }
    }
  });

  it('a copy sai sem travessão, sem minuto em número e a frase da mensagem sem ponto final', () => {
    for (const slug of AMBIENTES) {
      const copia = copiaDaVersaoC(slug);
      for (const texto of [copia.tituloAntes, copia.tituloDestaque, copia.perfilTexto, copia.convite]) {
        expect(texto).not.toMatch(/[—–]/);
        expect(texto).not.toMatch(/\d+\s*(min|minutos)\b/i);
      }
      for (const d of desafiosDoAmbiente(slug)) {
        for (const texto of [d.titulo, d.tema, d.emGeral, d.com, ...d.pontos]) {
          expect(texto, `${slug}/${d.chave}`).not.toMatch(/[—–]/);
        }
        // A frase entra em "Um dos meus desafios hoje é ...": o ponto é da mensagem.
        expect(d.frase).not.toMatch(/[.!?]$/);
        expect(d.titulo).toMatch(/[.]$/);
      }
    }
  });

  it('🔴 o texto da gestão não promete quem está parado: a tela ao lado pode dizer "ninguém parado"', () => {
    // Medido na tela em produção (03/10/2026, Escolas): "PRECISAM DE APOIO 0 · ninguém
    // parado". Um ponto que dissesse "quem precisa de apoio" seria desmentido pelo número
    // ao lado. Contar (quantos) vale com 0 e com N; apontar (quem) não.
    for (const slug of AMBIENTES) {
      const gestao = desafioDoAmbiente(slug, 'gestao')!;
      for (const texto of [gestao.titulo, gestao.com, gestao.emGeral, ...gestao.pontos]) {
        expect(texto, `${slug}: ${texto}`).not.toMatch(/quem precisa|quem est[áa] parad/i);
      }
      expect(gestao.pontos.join(' ')).toMatch(/quantos precisam de apoio/);
    }
  });

  it('vocabulário de escola nas Escolas e de empresa nas empresas (a cópia não vaza de um para o outro)', () => {
    const escolas = JSON.stringify(desafiosDoAmbiente('escolas-acme')) + JSON.stringify(copiaDaVersaoC('escolas-acme'));
    const empresa = JSON.stringify(desafiosDoAmbiente('acme-demo')) + JSON.stringify(copiaDaVersaoC('acme-demo'));
    expect(escolas).toMatch(/professor/i);
    expect(empresa).not.toMatch(/professor|coordena[çc]ão|rede\b/i);
    expect(escolas).not.toMatch(/\bgestores?\b|\bseu time\b/i);
  });

  it('ambiente desconhecido cai nas empresas, nunca em lista vazia', () => {
    expect(desafiosDoAmbiente('macae')).toEqual(desafiosDoAmbiente('acme-demo'));
    expect(desafiosDoAmbiente('constructor')).toHaveLength(5);
    expect(desafiosDoAmbiente(undefined)).toHaveLength(5);
  });
});

describe('a chave é a única coisa que atravessa a rede', () => {
  it('só as cinco chaves são desafio (propriedade de protótipo e lixo não passam)', () => {
    for (const chave of DESAFIOS_CHAVES) expect(ehDesafio(chave)).toBe(true);
    for (const lixo of ['constructor', '__proto__', 'toString', 'RESULTADO', '', ' resultado', null, undefined, 1, {}]) {
      expect(ehDesafio(lixo), String(lixo)).toBe(false);
      expect(desafioDoAmbiente('acme-demo', lixo)).toBeNull();
    }
  });

  it('a cena só vale na sala que responde ao desafio', () => {
    expect(cenaDaSala('acme-demo', 'rh', 'engajamento')?.caminho).toBe('/dashboard/gestor/engajamento');
    expect(cenaDaSala('acme-demo', 'gestor', 'engajamento')).toBeNull();
    expect(cenaDaSala('acme-demo', 'usuario', 'engajamento')).toBeNull();
    expect(cenaDaSala('acme-demo', 'usuario', 'personalizacao')?.caminho).toBe('/dashboard/temporada');
    expect(cenaDaSala('acme-demo', 'gestor', 'gestao')?.caminho).toBe('/dashboard/gestor');
    expect(cenaDaSala('acme-demo', 'rh', 'diagnostico')?.caminho).toContain('organization-dna');
    expect(cenaDaSala('acme-demo', 'admin', 'engajamento')).toBeNull();
    expect(cenaDaSala('acme-demo', 'rh', '../../etc')).toBeNull();
  });

  it('o caminho base da cena não leva a query (é com ele que o pathname é comparado)', () => {
    expect(caminhoBaseDaCena({ caminho: '/dashboard/relatorios?document=organization-dna' })).toBe('/dashboard/relatorios');
    expect(caminhoBaseDaCena({ caminho: '/dashboard/gestor' })).toBe('/dashboard/gestor');
  });

  it('o alvo de exploração vai e volta, e só reconhece o prefixo dor- com chave conhecida', () => {
    for (const chave of DESAFIOS_CHAVES) expect(desafioDoAlvo(alvoDoDesafio(chave))).toBe(chave);
    for (const alvo of ['engajamento', 'dor-', 'dor-constructor', 'dor-resultado ', 'DOR-resultado', null, 3]) {
      expect(desafioDoAlvo(alvo), String(alvo)).toBeNull();
    }
  });

  it('a lista de desafios do contato filtra chave desconhecida, repetida e não texto', () => {
    expect(desafiosDaLista('engajamento, resultado,engajamento,constructor,,x')).toEqual(['engajamento', 'resultado']);
    expect(desafiosDaLista('')).toEqual([]);
    expect(desafiosDaLista(undefined)).toEqual([]);
    expect(desafiosDaLista(['resultado'])).toEqual([]);
  });
});

describe('a ordem dos cartões gira por sessão', () => {
  const lista = [...DESAFIOS_CHAVES];

  it('é sempre uma rotação da mesma lista (nenhum desafio some nem repete)', () => {
    for (const sid of ['0000aaaaaaaaaaaaaaaa', 'ffffaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbb', '1a2b3c4d5e6f7a8b9c0d']) {
      const ordem = ordemDosDesafios(sid, lista);
      expect([...ordem].sort()).toEqual([...lista].sort());
      const i = lista.indexOf(ordem[0]);
      expect([...lista.slice(i), ...lista.slice(0, i)]).toEqual(ordem);
    }
  });

  it('todas as cinco posições aparecem como primeiro item (se não girar, o clique mede posição)', () => {
    const primeiros = new Set<string>();
    for (let n = 0; n < 5; n += 1) {
      // `parseInt(sid.slice(0,4),16) % 5` varre 0..4 com estes quatro dígitos hex
      primeiros.add(ordemDosDesafios(`${n.toString(16).padStart(4, '0')}aaaaaaaaaaaaaaaa`, lista)[0]);
    }
    expect(primeiros.size).toBe(5);
  });

  it('é determinística (a segunda visita mostra a MESMA ordem) e não quebra com sessão estranha', () => {
    expect(ordemDosDesafios('bbbbbbbbbbbbbbbbbbbb', lista)).toEqual(ordemDosDesafios('bbbbbbbbbbbbbbbbbbbb', lista));
    expect(ordemDosDesafios('zzzz', lista)).toEqual(lista);
    expect(ordemDosDesafios(undefined, lista)).toEqual(lista);
    expect(ordemDosDesafios('bbbbbbbbbbbbbbbbbbbb', [])).toEqual([]);
  });
});

describe('o "outro desafio" é texto do lead que vai para uma URL', () => {
  it('colapsa espaço, remove controle e separador de linha, e corta em 140', () => {
    expect(limparOutroDesafio('  meu   time\n\tnão\u0007 engaja  ')).toBe('meu time não engaja');
    expect(limparOutroDesafio('a' + String.fromCharCode(0x2028) + 'b' + String.fromCharCode(0x2029) + 'c')).toBe('a b c');
    expect(limparOutroDesafio('x'.repeat(500))).toHaveLength(OUTRO_DESAFIO_MAX);
    expect(limparOutroDesafio('a'.repeat(139) + '  b')).toBe('a'.repeat(139));
  });

  it('o que não é texto vira vazio', () => {
    for (const v of [undefined, null, 5, {}, ['a'], '', '   \n ']) expect(limparOutroDesafio(v)).toBe('');
  });

  it('não altera acento nem pontuação do lead', () => {
    expect(limparOutroDesafio('Não sei por onde começar: é tudo urgente?')).toBe('Não sei por onde começar: é tudo urgente?');
  });
});

describe('o resumo que o lead encaminha', () => {
  const itens = (slug: string, chaves: string[]) => chaves.map((c) => {
    const d = desafioDoAmbiente(slug, c)!;
    return { titulo: d.titulo, com: d.com };
  });

  it('sem desafio visto não há resumo', () => {
    expect(resumoParaEncaminhar([])).toBe('');
  });

  it('leva título e resposta de cada desafio, na ordem em que foram vistos', () => {
    const texto = resumoParaEncaminhar(itens('acme-demo', ['engajamento', 'resultado']));
    const d1 = desafioDoAmbiente('acme-demo', 'engajamento')!;
    const d2 = desafioDoAmbiente('acme-demo', 'resultado')!;
    expect(texto).toContain('Desafios que vi:');
    expect(texto.indexOf(d1.titulo)).toBeGreaterThan(-1);
    expect(texto.indexOf(d1.titulo)).toBeLessThan(texto.indexOf(d2.titulo));
    expect(texto).toContain(`Com a Vertho: ${d1.com}`);
    expect(texto).toContain(`Com a Vertho: ${d2.com}`);
  });

  it('o cabeçalho concorda com a quantidade, e o perfil só aparece se foi feito', () => {
    const um = resumoParaEncaminhar(itens('acme-demo', ['gestao']));
    expect(um).toContain('Desafio que vi:');
    expect(um).not.toContain('Desafios que vi:');
    expect(um).not.toMatch(/perfil comportamental/);
    expect(resumoParaEncaminhar(itens('acme-demo', ['gestao']), { perfilFeito: true })).toContain('Também fiz o mapeamento do meu perfil comportamental.');
  });

  it('🔴 nunca leva credencial, link do convite, nome nem travessão, em nenhum ambiente', () => {
    for (const slug of AMBIENTES) {
      const texto = resumoParaEncaminhar(itens(slug, [...DESAFIOS_CHAVES]), { perfilFeito: true });
      // o link do convite é individual e é a credencial do lead
      expect(texto, slug).not.toMatch(/https?:|\/c\/|passe|ticket|sala=|volta=/i);
      // nenhum token do tamanho do código do convite (24 caracteres base64url)
      expect(texto, slug).not.toMatch(/[A-Za-z0-9_-]{24}/);
      expect(texto, slug).not.toMatch(/[—–]/);
      expect(texto.endsWith('Para saber mais: vertho.ai'), slug).toBe(true);
    }
  });

  it('🔴 o componente do início não passa código, passe nem nome para o resumo', () => {
    const fonte = semComentarios(readFileSync('app/degustacao/diagnostico-guiado.tsx', 'utf8'));
    const chamada = fonte.match(/resumoParaEncaminhar\(([\s\S]*?)\);/)?.[1] ?? '';
    expect(chamada.length).toBeGreaterThan(10);
    expect(chamada).not.toMatch(/codigo|passe|primeiroNome/);
  });

  it('o botão de contato da cena sem ticket leva ao "Próximo passo" do início (a âncora existe nos dois lados)', () => {
    const cena = readFileSync('app/dashboard/cena-degustacao.tsx', 'utf8');
    const inicio = readFileSync('app/degustacao/diagnostico-guiado.tsx', 'utf8');
    expect(cena).toMatch(/#proximo-passo/);
    expect(inicio).toMatch(/id="proximo-passo"/);
    // sem ticket não há botão desabilitado e mudo
    expect(semComentarios(cena)).not.toMatch(/disabled=\{!ticket\}/);
  });
});
