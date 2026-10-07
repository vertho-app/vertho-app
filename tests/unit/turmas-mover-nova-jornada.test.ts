import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard de CONTRATO (07/10/2026) sobre o que não roda sem sessão de admin: mover
 * pessoa para outra turma abre jornada nova por padrão. A turma de origem fecha a
 * participação como `concluido` (guarda os números), a de destino recebe
 * `marco_jornada` (nasce zerada), e a tela oferece a opção para o desmembramento.
 *
 * Teste de TEXTO: prova que o código chama a coisa certa, não que a tela funciona
 * (isso é do portfólio, em `turmas-portfolio-janela.test.ts`, e da imagem).
 */

const ler = (...partes: string[]) => readFileSync(join(__dirname, '../..', ...partes), 'utf8');

describe('moverParaTurma: jornada nova por padrão', () => {
  const acao = ler('actions/turmas.ts');

  it('o padrão é jornada nova (um lote sem a opção não vira desmembramento sem aviso)', () => {
    expect(acao).toMatch(/novaJornada: z\.boolean\(\)\.default\(true\),/);
  });

  it('a participação antiga fecha como CONCLUIDO na jornada nova e REMOVIDO no desmembramento', () => {
    expect(acao).toMatch(/status: input\.novaJornada \? TURMA_MEMBRO\.CONCLUIDO : TURMA_MEMBRO\.REMOVIDO,/);
  });

  it('só quem JÁ tinha participação abre marco; a 1ª entrada não corta nada', () => {
    expect(acao).toMatch(/\.\.\.\(input\.novaJornada && jaTinhaParticipacao\.has\(id\) \? \{ marco_jornada: marcoAgora\(agora\) \} : \{\}\),/);
  });

  it('a auditoria registra qual dos dois modos foi usado', () => {
    expect(acao).toMatch(/novaJornada: input\.novaJornada,/);
  });
});

describe('tela de composição: a opção existe, vem ligada e chega na action', () => {
  const painel = ler('app/admin-v2/cliente/TurmasPanel.tsx');

  it('começa ligada', () => {
    expect(painel).toMatch(/const \[novaJornada, setNovaJornada\] = useState\(true\);/);
  });

  it('o valor escolhido é enviado ao mover', () => {
    expect(painel).toMatch(/moverParaTurma\(\{ empresaId, turmaId: destino, colaboradorIds: \[\.\.\.selecionados\], novaJornada \}\)/);
  });

  it('os números da turma usam participantes (ativos + encerrados) como denominador', () => {
    expect(painel).toMatch(/fracao\(t\.comResposta, t\.participantes\)/);
  });
});

describe('página de etapa da turma: respostas e PDI saem da janela da participação', () => {
  const ws = ler('app/admin-v2/actions.ts');

  it('conta respostas pela janela, não pela pessoa inteira', () => {
    expect(ws).toMatch(/respondeuNaJanela\(respostasPorPessoa\.get\(p\.colaborador_id\) \|\| \[\], janela\)/);
  });

  it('inclui as participações encerradas (dos membros da turma E das outras turmas da mesma pessoa)', () => {
    // Duas consultas: os membros desta turma e as participações das mesmas pessoas em
    // qualquer turma (o fim da janela é o marco da PRÓXIMA). Contar, e não só casar:
    // com uma só, o teste passaria mesmo com a outra trocada por `ativo`.
    const consultas = ws.match(/\.in\('status', \[TURMA_MEMBRO\.ATIVO, TURMA_MEMBRO\.CONCLUIDO\]\)/g) || [];
    expect(consultas).toHaveLength(2);
  });
});
