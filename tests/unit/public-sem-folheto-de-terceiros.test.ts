import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * R-135 (03/10/2026): `public/Teoria Comportamental/Plataforma.pdf` era o folheto
 * de OUTRO fornecedor de DISC ("o relatório de perfil comportamental mais
 * completo do Brasil", "índice de precisão está em 99%", aferido por um
 * departamento de estatística de uma universidade federal, "mais de um milhão
 * de relatórios"). Nunca citou a Vertho, nenhuma tela o referenciava, e ficava
 * publicado em `app.vertho.ai` em nome da Vertho, contra a regra de não chamar
 * instrumento de validado, científico ou preciso. Saiu do `public/`: tudo o que
 * está lá é servido sem login.
 *
 * O arquivo não pode voltar por engano (um `git checkout` de um branch velho, um
 * copiar e colar da pasta de origem).
 */
describe('public/ não publica folheto de terceiros', () => {
  it('o folheto "99% de precisão" não está em public/Teoria Comportamental', () => {
    const caminho = join(process.cwd(), 'public', 'Teoria Comportamental', 'Plataforma.pdf');
    expect(existsSync(caminho)).toBe(false);
  });
});
