import { describe, it, expect } from 'vitest';
import {
  chaveDaConta,
  extrairPerfisSociais,
  mesclarPerfisSociais,
  paginasCandidatas,
  perfilCanonico,
  precisaPedirRedes,
} from '@/lib/copiloto/social-discovery';

describe('perfilCanonico', () => {
  it('perfil de empresa vira URL canônica, sem subpágina nem query', () => {
    expect(perfilCanonico('https://www.linkedin.com/company/vertho/about/?trk=x')?.url)
      .toBe('https://linkedin.com/company/vertho');
    expect(perfilCanonico('https://br.linkedin.com/school/colegio-x/')?.url)
      .toBe('https://linkedin.com/school/colegio-x');
    expect(perfilCanonico('//instagram.com/vertho.ai/')?.url).toBe('https://instagram.com/vertho.ai');
    expect(perfilCanonico('https://www.youtube.com/@vertho/videos')?.url).toBe('https://youtube.com/@vertho');
    expect(perfilCanonico('https://www.tiktok.com/@vertho/video/7312')?.url).toBe('https://tiktok.com/@vertho');
  });

  it('twitter.com e x.com são o MESMO perfil', () => {
    expect(perfilCanonico('https://twitter.com/vertho')?.url).toBe('https://x.com/vertho');
    expect(perfilCanonico('https://x.com/vertho')?.url).toBe('https://x.com/vertho');
  });

  it('botão de compartilhar não é perfil', () => {
    expect(perfilCanonico('https://www.facebook.com/sharer/sharer.php?u=https://site.com')).toBeNull();
    expect(perfilCanonico('https://facebook.com/share.php?u=x')).toBeNull();
    expect(perfilCanonico('https://twitter.com/intent/tweet?text=oi')).toBeNull();
    expect(perfilCanonico('https://www.linkedin.com/shareArticle?mini=true')).toBeNull();
    expect(perfilCanonico('https://www.linkedin.com/sharing/share-offsite/?url=x')).toBeNull();
  });

  it('conteúdo avulso não é perfil', () => {
    expect(perfilCanonico('https://www.instagram.com/p/CabcDef/')).toBeNull();
    expect(perfilCanonico('https://www.instagram.com/reel/CabcDef/')).toBeNull();
    expect(perfilCanonico('https://www.youtube.com/watch?v=abc')).toBeNull();
    expect(perfilCanonico('https://www.facebook.com/plugins/page.php')).toBeNull();
  });

  it('perfil de PESSOA no LinkedIn fica de fora (o campo é da empresa)', () => {
    expect(perfilCanonico('https://www.linkedin.com/in/rodrigo-naves')).toBeNull();
  });

  it('domínio parecido não passa por rede social', () => {
    expect(perfilCanonico('https://www.foox.com/vertho')).toBeNull();
    expect(perfilCanonico('https://linkedin.com.br.fake.com/company/x')).toBeNull();
    expect(perfilCanonico('https://linkedin.com')).toBeNull();
  });
});

describe('extrairPerfisSociais', () => {
  const rodape = `
    <footer>
      <a href="https://www.facebook.com/sharer/sharer.php?u=https://empresa.com.br">Compartilhar</a>
      <a href="https://www.instagram.com/empresa/">Instagram</a>
      <a href="https://www.linkedin.com/company/empresa/">LinkedIn</a>
      <a href="https://www.facebook.com/empresa">Facebook</a>
      <a href="https://www.instagram.com/p/Cxyz/">Nosso último post</a>
    </footer>`;

  it('pega os perfis e descarta compartilhamento e post', () => {
    expect(extrairPerfisSociais(rodape)).toEqual([
      'https://linkedin.com/company/empresa',
      'https://instagram.com/empresa',
      'https://facebook.com/empresa',
    ]);
  });

  it('pega URL escapada dentro de JSON embutido (sameAs de CMS)', () => {
    const html = `<script type="application/ld+json">
      {"@type":"Organization","sameAs":["https:\\/\\/www.instagram.com\\/empresa","https:\\/\\/x.com\\/empresa"]}
    </script>`;
    expect(extrairPerfisSociais(html)).toEqual([
      'https://instagram.com/empresa',
      'https://x.com/empresa',
    ]);
  });

  it('mesmo perfil em grafias diferentes conta uma vez só', () => {
    const html = `
      <a href="https://twitter.com/empresa">X</a>
      <a href="https://x.com/empresa">X</a>
      <a href="https://www.instagram.com/empresa">IG</a>
      <a href="https://instagram.com/empresa/">IG rodapé</a>`;
    expect(extrairPerfisSociais(html)).toEqual([
      'https://instagram.com/empresa',
      'https://x.com/empresa',
    ]);
  });

  it('nada de rede social no HTML = lista vazia', () => {
    expect(extrairPerfisSociais('<p>Fale conosco pelo telefone</p>')).toEqual([]);
  });

  it('teto de 8 perfis', () => {
    const html = Array.from({ length: 14 }, (_, i) =>
      `<a href="https://instagram.com/empresa${i}">ig</a>`).join('');
    expect(extrairPerfisSociais(html)).toHaveLength(8);
  });
});

describe('paginasCandidatas', () => {
  it('só links internos de contato/sobre, no máximo 2', () => {
    const html = `
      <a href="/institucional">Institucional</a>
      <a href="/contato">Contato</a>
      <a href="/blog/post-1">Blog</a>
      <a href="https://outrosite.com/contato">Parceiro</a>
      <a href="/quem-somos">Quem somos</a>`;
    expect(paginasCandidatas(html, 'https://empresa.com.br/')).toEqual([
      'https://empresa.com.br/institucional',
      'https://empresa.com.br/contato',
    ]);
  });

  it('ignora a própria home e âncoras repetidas', () => {
    const html = '<a href="/contato#form">Contato</a><a href="/contato">Contato</a>';
    expect(paginasCandidatas(html, 'https://empresa.com.br/')).toEqual(['https://empresa.com.br/contato']);
  });
});

describe('mesclarPerfisSociais', () => {
  it('acrescenta sem apagar o que o vendedor digitou', () => {
    const { texto, adicionados } = mesclarPerfisSociais(
      'https://instagram.com/empresa',
      ['https://linkedin.com/company/empresa', 'https://instagram.com/empresa'],
    );
    expect(adicionados).toEqual(['https://linkedin.com/company/empresa']);
    expect(texto).toBe('https://instagram.com/empresa\nhttps://linkedin.com/company/empresa');
  });

  it('www, barra final e twitter/x não viram entrada duplicada', () => {
    const { texto, adicionados } = mesclarPerfisSociais(
      'https://www.instagram.com/empresa/\nhttps://twitter.com/empresa',
      ['https://instagram.com/empresa', 'https://x.com/empresa'],
    );
    expect(adicionados).toEqual([]);
    expect(texto).toBe('https://www.instagram.com/empresa/\nhttps://twitter.com/empresa');
  });

  it('campo vazio recebe a lista inteira', () => {
    const { texto } = mesclarPerfisSociais('', ['https://linkedin.com/company/a', 'https://x.com/a']);
    expect(texto).toBe('https://linkedin.com/company/a\nhttps://x.com/a');
  });
});

describe('precisaPedirRedes', () => {
  const base = { company: 'Boehringer', site: 'boehringer-ingelheim.com/br', perfisInformados: 0, confirmadoPara: '' };

  it('pede os perfis quando a pesquisa vai rodar e o campo está vazio', () => {
    expect(precisaPedirRedes(base)).toBe(true);
  });

  it('não pede quando já há perfil informado', () => {
    expect(precisaPedirRedes({ ...base, perfisInformados: 2 })).toBe(false);
  });

  it('não pede quando não há pesquisa pública para rodar', () => {
    expect(precisaPedirRedes({ ...base, company: '', site: '' })).toBe(false);
    // Nome curto demais e site curto demais não disparam pesquisa no servidor.
    expect(precisaPedirRedes({ ...base, company: 'B', site: 'br' })).toBe(false);
  });

  it('para de pedir depois que o vendedor decidiu seguir sem redes NESTA conta', () => {
    const confirmadoPara = chaveDaConta(base.company, base.site);
    expect(precisaPedirRedes({ ...base, confirmadoPara })).toBe(false);
  });

  it('volta a pedir quando a conta muda', () => {
    const confirmadoPara = chaveDaConta('Boehringer', 'boehringer-ingelheim.com/br');
    expect(precisaPedirRedes({ ...base, company: 'Grupo Sinal', site: 'gruposinal.com.br', confirmadoPara })).toBe(true);
  });

  it('a chave ignora caixa e espaço em volta', () => {
    expect(chaveDaConta('  Grupo Sinal ', 'GrupoSinal.com.br')).toBe(chaveDaConta('grupo sinal', 'gruposinal.com.br'));
  });
});
