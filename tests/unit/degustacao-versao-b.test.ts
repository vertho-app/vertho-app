import { describe, expect, it } from 'vitest';
import {
  COPIA_DEGUSTACAO_GUIADA,
  DEMO_PROSPECT_TENANTS,
  DESTINOS_DEGUSTACAO,
  buildDegustacaoConviteText,
  buildDegustacaoLembreteText,
  destinoDaDegustacao,
  passoPessoalDaDegustacao,
  pessoalVemPrimeiro,
} from '@/lib/demo/acme-prospect-config';

/**
 * Contratos puros da degustação versão B (convite guiado).
 *
 * `Medido 16/09/2026`: com o roteiro A (quatro etapas, quatro links, a primeira
 * sendo trabalho), 0 de 8 prospects reais abriram qualquer visão. A B manda um
 * link só e coloca o que não dá trabalho primeiro. Estes testes fixam o que sai
 * para fora (o texto) e o que decide para onde a pessoa vai (destino e passo).
 */

const URL_DO_CONVITE = 'https://acme-demo.vertho.ai/degustacao?passe=abc.def';
const acesso = { nome: 'Andrea de Paula', url: URL_DO_CONVITE, expiresAt: '2026-09-26T07:00:00.000Z' };

describe('texto do convite B', () => {
  it('um link só, o primeiro nome e o prazo em horário de Brasília', () => {
    const texto = buildDegustacaoConviteText(acesso, 'acme-demo');
    expect(texto.match(/https:\/\//g)).toHaveLength(1);
    expect(texto).toContain(URL_DO_CONVITE);
    expect(texto.startsWith('Olá, Andrea!')).toBe(true);
    expect(texto).toContain('26/09, 04:00 (horário de Brasília)');
    expect(texto).toContain('o RH e o gestor acompanham');
    expect(texto).toContain('perfil comportamental');
  });

  it('sai sem travessão, sem minuto prometido em número e sem a empresa numa frase com artigo', () => {
    for (const slug of Object.keys(DEMO_PROSPECT_TENANTS)) {
      const texto = buildDegustacaoConviteText(acesso, slug);
      expect(texto).not.toMatch(/[—–]/);
      expect(texto).not.toMatch(/\b\d+\s*(minuto|min\b|segundo)/i);
      // o nome da empresa não entra: "para a Evol Pro" / "na KPMG" não têm artigo previsível
      expect(texto).not.toMatch(/\b(para a|para o|na|no|da|do)\s+\{?empresa/i);
      // vocabulário do código não vaza para quem recebe (na PROSA; o caminho do
      // link é o que é)
      expect(texto.replace(URL_DO_CONVITE, '')).not.toMatch(/passaporte|etapa 0|degusta/i);
    }
  });

  it('escolas falam de coordenação e direção, não de gestor e RH', () => {
    const texto = buildDegustacaoConviteText(acesso, 'escolas-acme');
    expect(texto).toContain('a direção e a coordenação acompanham');
    expect(texto).not.toMatch(/\bRH\b|gestor/);
  });

  it('lembrete: o mesmo link, curto, sem travessão', () => {
    const texto = buildDegustacaoLembreteText({ nome: 'Pedro Santos', url: URL_DO_CONVITE });
    expect(texto.match(/https:\/\//g)).toHaveLength(1);
    expect(texto.startsWith('Oi, Pedro!')).toBe(true);
    expect(texto).not.toMatch(/[—–]/);
    expect(texto).not.toMatch(/\b\d+\s*(minuto|min\b)/i);
  });
});

describe('cópia da página por ambiente', () => {
  it('todo ambiente que oferece degustação tem cópia, com as três visões na ordem RH, gestor, colaborador', () => {
    for (const slug of Object.keys(DEMO_PROSPECT_TENANTS)) {
      const copia = (COPIA_DEGUSTACAO_GUIADA as Record<string, any>)[slug];
      expect(copia, `cópia ausente para ${slug}`).toBeTruthy();
      expect(copia.visoes.map((v: any) => v.roleKey)).toEqual(['rh', 'gestor', 'usuario']);
      for (const visao of copia.visoes) {
        expect(visao.titulo.length).toBeGreaterThan(5);
        expect(`${visao.titulo} ${visao.descricao}`).not.toMatch(/[—–]/);
      }
    }
  });
});

describe('destino do botão pessoal', () => {
  it('só aceita as chaves da allowlist e devolve caminho fixo', () => {
    expect(destinoDaDegustacao('mapeamento')).toBe('/dashboard/perfil-comportamental/mapeamento');
    expect(destinoDaDegustacao('perfil')).toBe('/dashboard/perfil-comportamental');
    expect(destinoDaDegustacao('assessment')).toBe('/dashboard/assessment');
  });

  it('🔴 recusa o que não é chave própria: protótipo, caminho, laço e tipo errado', () => {
    for (const chave of ['constructor', '__proto__', 'toString', '/dashboard', 'dashboard', 'https://evil.example', '', null, undefined, 1, ['perfil']]) {
      expect(destinoDaDegustacao(chave), String(chave)).toBeNull();
    }
  });

  it('nenhum destino é o /dashboard (que devolve o convidado B para a página: laço)', () => {
    expect(Object.values(DESTINOS_DEGUSTACAO)).not.toContain('/dashboard');
    for (const destino of Object.values(DESTINOS_DEGUSTACAO)) expect(destino.startsWith('/dashboard/')).toBe(true);
  });
});

describe('passo pessoal', () => {
  const base = { discFeito: false, respondeuSituacao: false, devolutivaPronta: false, situacaoDisponivel: true };

  it('perfil primeiro; a situação do cargo só depois do DISC; depois a devolutiva', () => {
    expect(passoPessoalDaDegustacao(base)).toBe('descobrir-perfil');
    expect(passoPessoalDaDegustacao({ ...base, discFeito: true })).toBe('responder-situacao');
    expect(passoPessoalDaDegustacao({ ...base, discFeito: true, respondeuSituacao: true })).toBe('aguardar-devolutiva');
    expect(passoPessoalDaDegustacao({ ...base, discFeito: true, respondeuSituacao: true, devolutivaPronta: true })).toBe('ler-devolutiva');
    // respondeu sem DISC (entrou pelo menu): a situação respondida vence
    expect(passoPessoalDaDegustacao({ ...base, respondeuSituacao: true })).toBe('aguardar-devolutiva');
  });

  it('🔴 cargo que só lidera: depois do DISC o caminho pessoal termina no perfil, sem convite a um beco', () => {
    const soLidera = { ...base, situacaoDisponivel: false };
    expect(passoPessoalDaDegustacao(soLidera)).toBe('descobrir-perfil');
    expect(passoPessoalDaDegustacao({ ...soLidera, discFeito: true })).toBe('perfil-pronto');
    // o que já foi respondido (antes de o cargo deixar de ter Top 5) continua visível
    expect(passoPessoalDaDegustacao({ ...soLidera, discFeito: true, respondeuSituacao: true })).toBe('aguardar-devolutiva');
  });

  it('a seção pessoal só sobe para o topo quando a pessoa já avançou nela', () => {
    expect(pessoalVemPrimeiro(base)).toBe(false);
    expect(pessoalVemPrimeiro({ ...base, discFeito: true })).toBe(true);
    expect(pessoalVemPrimeiro({ ...base, respondeuSituacao: true })).toBe(true);
  });
});
