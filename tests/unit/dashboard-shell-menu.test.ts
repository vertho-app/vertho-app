import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Menu lateral do dashboard (16/09/2026, pedido do dono).
 *
 * Duas coisas que só a imagem mostrava: os dois simuladores com o mesmo ícone e
 * a coluna só de ícones sem nome nenhum para quem entra pela primeira vez. O
 * visual em si se confere no navegador; aqui fica preso o que o faz funcionar.
 *
 * 17/09/2026: atendimento e vendas viram TREINO para quem atende e vende, e
 * ACOMPANHAMENTO (mesmo destino, outro nome) para gestor e RH; o gestor ganha o
 * simulador de liderança.
 */
const fonte = readFileSync(path.resolve(__dirname, '../../app/dashboard/dashboard-shell.tsx'), 'utf8');

function blocoDosItens(): string {
  const inicio = fonte.indexOf('const NAV_ITEMS: NavItem[] = [');
  const fim = fonte.indexOf('\n];', inicio);
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return fonte.slice(inicio, fim);
}

function itensDoMenu() {
  return [...blocoDosItens().matchAll(/\{ href: '([^']+)', labelKey: '(\w+)', icon: (\w+)([^}]*)\}/g)]
    .map(([, href, labelKey, icone, resto]) => ({ href, labelKey, icone, resto }));
}

function asideDoMenu(): string {
  const inicio = fonte.indexOf('<aside');
  const fim = fonte.indexOf('</aside>', inicio);
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return fonte.slice(inicio, fim);
}

describe('menu lateral do dashboard', () => {
  it('um ícone por destino', () => {
    const itens = itensDoMenu();
    // denominador: se a leitura do bloco quebrar, o teste não pode passar vazio
    expect(itens.length).toBeGreaterThanOrEqual(10);

    // O mesmo destino pode aparecer duas vezes (treino e acompanhamento), com o
    // mesmo ícone; destinos DIFERENTES nunca dividem ícone.
    const porIcone = new Map<string, Set<string>>();
    for (const { href, icone } of itens) porIcone.set(icone, new Set([...(porIcone.get(icone) ?? []), href]));
    const repetidos = [...porIcone.entries()]
      .filter(([, hrefs]) => hrefs.size > 1)
      .map(([icone, hrefs]) => `${icone}: ${[...hrefs].join(', ')}`);
    expect(repetidos).toEqual([]);
  });

  it('os dois simuladores têm ícones diferentes entre si', () => {
    const itens = itensDoMenu();
    const atendimento = itens.find((item) => item.href === '/dashboard/treino-atendimento');
    const vendas = itens.find((item) => item.href === '/dashboard/simulador-vendas');
    expect(atendimento?.icone).toBeTruthy();
    expect(vendas?.icone).toBeTruthy();
    expect(atendimento!.icone).not.toBe(vendas!.icone);
  });

  it('🔴 atendimento e vendas: um item para quem TREINA e outro para quem ACOMPANHA, mesmo destino, nomes diferentes', () => {
    const itens = itensDoMenu();
    for (const href of ['/dashboard/treino-atendimento', '/dashboard/simulador-vendas']) {
      const doDestino = itens.filter((item) => item.href === href);
      expect(doDestino).toHaveLength(2);
      const treino = doDestino.find((item) => /\btreina: true\b/.test(item.resto));
      const acompanhamento = doDestino.find((item) => /\bacompanha: true\b/.test(item.resto));
      expect(treino, `${href} sem item de treino`).toBeTruthy();
      expect(acompanhamento, `${href} sem item de acompanhamento`).toBeTruthy();
      expect(treino!.labelKey).not.toBe(acompanhamento!.labelKey);
    }
    // e o filtro usa as duas marcas, com a régua que vem do servidor
    expect(fonte).toMatch(/\(!it\.treina \|\| !soAcompanha\)/);
    expect(fonte).toMatch(/\(!it\.acompanha \|\| soAcompanha\)/);
    expect(fonte).toMatch(/const soAcompanha = colaborador\?\.soAcompanhaSimuladores === true;/);
  });

  it('o simulador de liderança leva ao trilho de liderança e só aparece com a flag do servidor', () => {
    const lideranca = itensDoMenu().find((item) => item.labelKey === 'leadershipSimulator');
    expect(lideranca?.href).toBe('/dashboard/assessment?trilho=lideranca');
    expect(lideranca?.resto).toMatch(/\bsimuladorLideranca: true\b/);
    expect(fonte).toMatch(/\(!it\.simuladorLideranca \|\| colaborador\?\.simuladorLideranca === true\)/);
  });

  it('todo item do menu tem nome nas quatro línguas', () => {
    const faltando: string[] = [];
    for (const locale of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const nav = JSON.parse(readFileSync(path.resolve(__dirname, `../../messages/${locale}.json`), 'utf8')).DashboardShell.nav;
      for (const { labelKey } of itensDoMenu()) if (!nav[labelKey]) faltando.push(`${locale}: ${labelKey}`);
    }
    expect(faltando).toEqual([]);
  });

  it('a coluna abre com o mouse e com o TECLADO, e mostra o nome de cada item', () => {
    const aside = asideDoMenu();
    expect(aside).toMatch(/className="group\/menu [^"]*\bw-20\b/);
    expect(aside).toMatch(/className="[^"]*\bhover:w-60\b/);
    expect(aside).toMatch(/className="[^"]*\bhas-focus-visible:w-60\b/);

    // todo rótulo escondido aparece nos DOIS gatilhos
    const rotulos = [...aside.matchAll(/<span className="([^"]*\bopacity-0\b[^"]*)"/g)].map(([, classes]) => classes);
    expect(rotulos.length).toBeGreaterThanOrEqual(3);
    for (const classes of rotulos) {
      expect(classes).toContain('group-hover/menu:opacity-100');
      expect(classes).toContain('group-has-focus-visible/menu:opacity-100');
    }
  });

  it('🔴 clique com o mouse não deixa a coluna presa aberta', () => {
    // O botão clicado guarda o foco e o shell não desmonta na navegação: com
    // `focus-within`, a coluna expandida ficava por cima da tela seguinte.
    expect(asideDoMenu()).not.toMatch(/focus-within/);
  });

  it('🔴 aberta, a coluna fica ABAIXO da barra da sala de apresentação e acima do conteúdo', () => {
    // Medido no navegador em 16/09/2026: em z-50 a coluna aberta cobria a barra
    // (z-[45], rente à coluna), e o ponto de "Voltar ao início" virava o botão
    // Sair. As duas grandezas são lidas do código, não copiadas aqui.
    const barra = readFileSync(path.resolve(__dirname, '../../components/dashboard/presentation-role-switcher.tsx'), 'utf8');
    const zDaBarra = Number(barra.match(/className="fixed [^"]*\bz-\[(\d+)\]/)?.[1]);
    expect(Number.isFinite(zDaBarra)).toBe(true);

    const classesDoMenu = asideDoMenu().match(/className="(group\/menu [^"]*)"/)?.[1] ?? '';
    // fim da classe por espaço ou fim do texto: `\b` não casa depois de `]`
    const zAberto = [...classesDoMenu.matchAll(/(?:hover|has-focus-visible):z-(?:\[(\d+)\]|(\d+))(?=\s|$)/g)]
      .map(([, colchete, simples]) => Number(colchete ?? simples));
    // os dois gatilhos declaram a camada
    expect(zAberto).toHaveLength(2);
    for (const z of zAberto) {
      expect(z).toBeLessThan(zDaBarra);
      expect(z).toBeGreaterThan(40);
    }
  });

  it('abrir a coluna não empurra o conteúdo', () => {
    expect(fonte).toMatch(/<main className=\{`[^`]*\bmd:ml-20\b/);
    expect(asideDoMenu()).toMatch(/className="[^"]*\bfixed\b/);
  });

  it('nenhuma classe arbitrária com vírgula no shell (o Tailwind não gera e a regra some calada)', () => {
    const classes = [...fonte.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
      .map(([, aspas, crase]) => aspas ?? crase);
    expect(classes.length).toBeGreaterThan(5);
    const comVirgula = classes.flatMap((valor) => valor.match(/\S*\[[^\]\s]*,[^\]\s]*\]\S*/g) ?? []);
    expect(comVirgula).toEqual([]);
  });
});
