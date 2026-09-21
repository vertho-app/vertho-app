import { describe, expect, it } from 'vitest';
import {
  ORIENTACAO_POR_AMBIENTE,
  linksDaOrientacao,
  naCasaDoPapel,
  orientacaoDaDegustacao,
  personasDaOrientacao,
  primeiroCodigoDeConvidado,
} from '@/lib/demo/degustacao-orientacao';
import { DEMO_PRESENTATION_ROOMS, listarPapeisDeApresentacao } from '@/lib/demo/presentation';

/**
 * A primeira ação dentro de cada visão da degustação.
 *
 * O que estes testes seguram: a linha só existe onde a pessoa acabou de chegar,
 * os links apontam para telas que o papel abre, e pessoa nenhuma vira link com
 * id escrito à mão (o reset recria os colaboradores toda madrugada).
 */

describe('qual orientação vale para cada visão', () => {
  it('todo ambiente de sala tem os três papéis, cada um com a casa certa', () => {
    for (const slug of Object.keys(DEMO_PRESENTATION_ROOMS)) {
      for (const papel of ['gestor', 'rh', 'usuario'] as const) {
        const orientacao = orientacaoDaDegustacao(slug, papel);
        expect(orientacao, `${slug}/${papel}`).toBeTruthy();
        expect(orientacao!.texto.length, `${slug}/${papel}`).toBeGreaterThan(20);
        expect(orientacao!.destinos.length, `${slug}/${papel}`).toBeGreaterThan(0);
      }
      expect(orientacaoDaDegustacao(slug, 'gestor')!.casa).toBe('/dashboard/gestor');
      expect(orientacaoDaDegustacao(slug, 'rh')!.casa).toBe('/dashboard');
      expect(orientacaoDaDegustacao(slug, 'usuario')!.casa).toBe('/dashboard');
    }
  });

  it('🔴 a casa de cada papel é o destino que a sala usa para entrar', () => {
    // Se as duas listas divergirem, a pessoa chega numa tela e a dica espera
    // por outra: ela simplesmente nunca aparece, sem erro em lugar nenhum.
    for (const papel of listarPapeisDeApresentacao()) {
      const orientacao = orientacaoDaDegustacao(papel.tenantSlug, papel.key);
      expect(orientacao!.casa, `${papel.tenantSlug}/${papel.key}`).toBe(papel.homePath);
    }
  });

  it('ambiente ou papel que não existe não inventa dica', () => {
    expect(orientacaoDaDegustacao('empresa-de-verdade', 'gestor')).toBeNull();
    expect(orientacaoDaDegustacao('acme-demo', 'diretoria')).toBeNull();
    expect(orientacaoDaDegustacao(null, 'gestor')).toBeNull();
    expect(orientacaoDaDegustacao('acme-demo', 42)).toBeNull();
  });

  it('🔴 chave do protótipo não vira dica (busca por hasOwnProperty, não por "in")', () => {
    for (const chave of ['constructor', 'toString', '__proto__', 'valueOf']) {
      expect(orientacaoDaDegustacao(chave, 'gestor')).toBeNull();
      expect(orientacaoDaDegustacao('acme-demo', chave)).toBeNull();
    }
  });
});

describe('o que cada visão manda olhar', () => {
  const acme = ORIENTACAO_POR_AMBIENTE['acme-demo'];
  const escolas = ORIENTACAO_POR_AMBIENTE['escolas-acme'];

  it('RH e direção abrem engajamento, evolução, adequação e DNA', () => {
    for (const ambiente of [acme, escolas]) {
      const paths = ambiente.rh.destinos.map((d) => d.path);
      expect(paths).toEqual([
        '/dashboard/gestor/engajamento',
        '/dashboard/gestor/equipe-evolucao',
        '/dashboard/gestor/ranking',
        '/dashboard/relatorios?document=organization-dna',
      ]);
      expect(ambiente.rh.destinos.some((d) => d.pessoa)).toBe(false);
    }
  });

  it('gestor vê o engajamento e abre uma pessoa, apontada por e-mail de persona', () => {
    expect(acme.gestor.destinos[0].path).toBe('/dashboard/gestor/engajamento');
    expect(acme.gestor.destinos[1].pessoa).toBe('bruna.demo@vertho.ai');
    expect(escolas.gestor.destinos[1].pessoa).toBe('marina.demo@vertho.ai');
    // 🔴 nenhum id escrito no código: o reset das 04:00 recria os colaboradores
    for (const ambiente of Object.values(ORIENTACAO_POR_AMBIENTE)) {
      for (const papel of Object.values(ambiente)) {
        for (const destino of papel.destinos) {
          expect(destino.path).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
          expect(destino.path).not.toMatch(/colaborador=/);
        }
      }
    }
  });

  it('a jornada do participante promete o que a semana tem', () => {
    // as palavras são do dono (18/09): formatos de conteúdo, prática e dúvidas
    for (const ambiente of [acme, escolas]) {
      expect(ambiente.usuario.texto).toMatch(/formatos/);
      expect(ambiente.usuario.texto).toMatch(/dúvidas/);
      expect(ambiente.usuario.texto).toMatch(/prática/);
      expect(ambiente.usuario.destinos[0].path).toBe('/dashboard/temporada');
      // a jornada é a DELA: sem `colaborador=`, a tela abre a de quem está logado
      expect(ambiente.usuario.destinos[0].pessoa).toBeUndefined();
    }
  });

  it('🔴 toda linha começa pela DOR, em pergunta, não pela navegação', () => {
    // Régua do dono (18/09): "os textos ainda explicam a navegação". A pergunta
    // é o que o vídeo daquele papel vai repetir no título, então as duas pontas
    // contam a mesma história.
    for (const ambiente of Object.values(ORIENTACAO_POR_AMBIENTE)) {
      for (const papel of Object.values(ambiente)) {
        const primeiraFrase = papel.texto.split(/(?<=[?.])\s/)[0];
        expect(primeiraFrase, papel.texto).toMatch(/\?$/);
      }
    }
  });

  it('🔴 a linha do gestor não promete que alguém está parado', () => {
    // Medido na tela (18/09): o KPI logo abaixo da dica diz "PRECISAM DE APOIO:
    // 0 · ninguém parado". Perguntar "quem precisa de apoio?" ali seria
    // respondido com "ninguém" dois centímetros adiante.
    for (const ambiente of Object.values(ORIENTACAO_POR_AMBIENTE)) {
      expect(ambiente.gestor.texto).not.toMatch(/precisa[m]? de apoio/i);
      expect(ambiente.gestor.texto).not.toMatch(/\bparad[oa]s?\b/i);
    }
  });

  it('a rede de escolas não é chamada de empresa, e nada sai com travessão', () => {
    expect(escolas.gestor.texto).toMatch(/escola/);
    for (const ambiente of Object.values(ORIENTACAO_POR_AMBIENTE)) {
      for (const papel of Object.values(ambiente)) {
        expect(papel.texto).not.toMatch(/[—–]/);
        for (const destino of papel.destinos) expect(destino.rotulo).not.toMatch(/[—–]/);
      }
    }
  });
});

describe('montagem dos links', () => {
  const comPessoa = {
    casa: '/dashboard/gestor',
    texto: 'texto',
    destinos: [
      { rotulo: 'Engajamento', path: '/dashboard/gestor/engajamento' },
      { rotulo: 'Abrir a Bruna', path: '/dashboard/temporada', pessoa: 'bruna.demo@vertho.ai' },
      { rotulo: 'Com filtro', path: '/dashboard/relatorios?document=x', pessoa: 'bruna.demo@vertho.ai' },
    ],
  };

  it('com a persona resolvida, o link leva o id e a origem de liderança', () => {
    const links = linksDaOrientacao(comPessoa, { 'bruna.demo@vertho.ai': 'colab-1' });
    expect(links.map((l) => l.href)).toEqual([
      '/dashboard/gestor/engajamento',
      '/dashboard/temporada?colaborador=colab-1&origem=gestor',
      '/dashboard/relatorios?document=x&colaborador=colab-1&origem=gestor',
    ]);
  });

  it('🔴 persona que não existe mais DESCARTA o link, e não abre a jornada de quem está logado', () => {
    const links = linksDaOrientacao(comPessoa, {});
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('/dashboard/gestor/engajamento');
    // mapa com valor vazio conta como ausente (linha existe, id não veio)
    expect(linksDaOrientacao(comPessoa, { 'bruna.demo@vertho.ai': '' })).toHaveLength(1);
  });

  it('sem orientação não há link, e o id vai codificado', () => {
    expect(linksDaOrientacao(null)).toEqual([]);
    const links = linksDaOrientacao(comPessoa, { 'bruna.demo@vertho.ai': 'a b&c' });
    expect(links[1].href).toContain('colaborador=a%20b%26c');
  });
});

describe('onde a linha aparece', () => {
  it('🔴 só na casa exata: dentro de uma tela filha ela já é ruído', () => {
    expect(naCasaDoPapel('/dashboard/gestor', '/dashboard/gestor')).toBe(true);
    expect(naCasaDoPapel('/dashboard/gestor/', '/dashboard/gestor')).toBe(true);
    expect(naCasaDoPapel('/dashboard/gestor/engajamento', '/dashboard/gestor')).toBe(false);
    expect(naCasaDoPapel('/dashboard', '/dashboard/gestor')).toBe(false);
    expect(naCasaDoPapel('/dashboard/temporada', '/dashboard')).toBe(false);
  });

  it('caminho ausente ou de outro tipo não mostra nada', () => {
    expect(naCasaDoPapel('', '/dashboard')).toBe(false);
    expect(naCasaDoPapel(null, '/dashboard')).toBe(false);
    expect(naCasaDoPapel(undefined, '/dashboard')).toBe(false);
  });
});

describe('de onde vem o código de convidado', () => {
  const PADRAO = /^[A-Za-z0-9_-]{24}$/;
  const codigo = 'AbCdEfGhIjKlMnOpQrStUvWx';

  it('🔴 a URL vence a sessão: no primeiro carregamento a sessão ainda está vazia', () => {
    // quem grava a sessão é a barra da sala, e o efeito dela roda DEPOIS do
    // efeito desta dica (React executa os filhos primeiro).
    expect(primeiroCodigoDeConvidado([codigo, null], PADRAO)).toBe(codigo);
    expect(primeiroCodigoDeConvidado([null, codigo], PADRAO)).toBe(codigo);
    expect(primeiroCodigoDeConvidado([`  ${codigo}  `, null], PADRAO)).toBe(codigo);
  });

  it('código mal formado ou ausente não faz de ninguém convidado', () => {
    expect(primeiroCodigoDeConvidado([null, undefined], PADRAO)).toBeNull();
    expect(primeiroCodigoDeConvidado(['', '   '], PADRAO)).toBeNull();
    expect(primeiroCodigoDeConvidado(['curto', `${codigo}xx`], PADRAO)).toBeNull();
    expect(primeiroCodigoDeConvidado([42, { toString: () => codigo }], PADRAO)).toBeNull();
  });
});

describe('personas a resolver', () => {
  it('devolve cada e-mail uma vez, e nada quando ninguém é apontado', () => {
    expect(personasDaOrientacao(ORIENTACAO_POR_AMBIENTE['acme-demo'].gestor)).toEqual(['bruna.demo@vertho.ai']);
    expect(personasDaOrientacao(ORIENTACAO_POR_AMBIENTE['acme-demo'].rh)).toEqual([]);
    expect(personasDaOrientacao(null)).toEqual([]);
  });
});
