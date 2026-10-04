/**
 * R-67 (04/10/2026): na tela da semana os chips de formato mostravam a CHAVE crua
 * ("video", "texto"), em minúsculas e igual em todos os idiomas, e dois avisos do
 * vídeo estavam escritos em português no código ("· com seu nome" e "Estamos
 * preparando seu vídeo personalizado ...").
 *
 * Guard de FONTE (a página é um componente de cliente com roteador e dezenas de
 * hooks; a suíte não a renderiza): a fonte usa as chaves, as chaves existem nos 4
 * idiomas, e os textos antigos não voltam.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pagina = readFileSync('app/dashboard/temporada/semana/[week]/page.tsx', 'utf8');
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const FORMATOS = ['video', 'audio', 'texto', 'case', 'pdf'];

describe('tela da semana: formatos e avisos do vídeo em 4 idiomas', () => {
  it('o chip passa pelo rótulo traduzido e só cai na chave crua para formato desconhecido', () => {
    expect(pagina).toMatch(/FORMATOS_COM_ROTULO\.includes\(f\) \? t\(`content\.formats\.\$\{f\}`\) : f/);
    expect(pagina).not.toMatch(/<Icon size=\{12\} \/> \{f\}\s*$/m);
    const lista = pagina.match(/const FORMATOS_COM_ROTULO = \[([^\]]*)\]/)![1].match(/'(\w+)'/g)!.map((s) => s.replace(/'/g, ''));
    expect(lista.sort()).toEqual([...FORMATOS].sort());
  });

  it('os dois avisos do vídeo saíram do código', () => {
    expect(pagina).toContain("t('content.withYourName')");
    expect(pagina).toContain("t('content.preparingVideo')");
    expect(pagina).not.toContain('com seu nome</p>');
    expect(pagina).not.toContain('Estamos preparando seu vídeo personalizado');
  });

  it.each(LOCALES)('%s: rótulos de todos os formatos e os dois avisos, sem travessão', (locale) => {
    const content = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).SeasonWeek.content;
    for (const formato of FORMATOS) {
      expect(typeof content.formats?.[formato], `${locale}: formats.${formato}`).toBe('string');
      expect(content.formats[formato].length).toBeGreaterThan(1);
    }
    for (const chave of ['withYourName', 'preparingVideo']) {
      expect(typeof content[chave], `${locale}: ${chave}`).toBe('string');
      expect(content[chave]).not.toMatch(/[–—―]/);
    }
    // o rótulo não é a chave crua (era o defeito)
    expect(content.formats.video).not.toBe('video');
    expect(content.formats.texto).not.toBe('texto');
  });
});
