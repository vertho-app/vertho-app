import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contratoDoTemplate, caminhoDoBotao } from '@/lib/notifications/pilula-template';
import { emailPilulaPendente } from '@/lib/notifications/pilula-envio';
import { pushPilulaPendente, LIMITE_TITULO, LIMITE_CORPO } from '@/lib/notifications/push-copy';
import { TEMPLATES } from '@/lib/whatsapp/templates';

/**
 * A P1 de quem está travado carrega a PENDÊNCIA junto com o conteúdo
 * (`conteudo_semana_pendente`), nos três canais — e a terça devolve a 2ª pílula.
 *
 * 🔴 O QUE ESTE ARQUIVO EXISTE PARA PEGAR é a inversão SIMÉTRICA à do
 * `p2-semana-pendente`, e por isso mais fácil de cometer: lá o template quer o
 * CALENDÁRIO em `{{2}}`; aqui ele quer a semana ACESSÍVEL, porque quem está
 * travado tem conteúdo e pendência na MESMA semana. Mandar `semanaCalendario`
 * aqui é typecheck-limpo, a Meta aceita, a mensagem é entregue — e o que chega
 * é "o conteúdo da semana 7 está disponível", com tema de outra semana e um
 * botão para a porta fechada, no lugar da mensagem que deveria destravar.
 *
 * Cenário real de 30/08/2026: Ibipeba com o calendário na semana 7 e 14 pessoas
 * paradas na semana 1.
 */

const CALENDARIO = 7;   // onde a trilha está
const ACESSIVEL = 1;    // o que ela consegue abrir, e o que continua pendente
const NOME = 'Maria Aparecida Nunes Abreu';
const TEMA = 'Escuta ativa na sala de aula';
const BASE_URL = 'https://ibipeba.vertho.ai';

/** Só o CÓDIGO do trecho: sem comentário de bloco nem de linha. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ARGS = {
  nome: NOME, semana: ACESSIVEL, slug: 'ibipeba', baseUrl: BASE_URL,
  telefone: '+5511999999999', tema: TEMA, formato: 'video', pilula: 1,
} as any;

describe('conteudo_semana_pendente — contrato do template', () => {
  const montar = contratoDoTemplate('conteudo_semana_pendente');

  it('tem contrato mapeado (sem ele o envio é recusado por fail-closed)', () => {
    expect(montar).toBeTruthy();
  });

  it('a semana dos params é a ACESSÍVEL, não a do calendário', () => {
    const { params } = montar!(ARGS);
    expect(params).toEqual([NOME, '1', TEMA]);
    expect(params).not.toContain(String(CALENDARIO));
  });

  it('o corpo aprovado afirma as DUAS coisas: conteúdo disponível E pendência', () => {
    const { params } = montar!(ARGS);
    const corpo = TEMPLATES.conteudo_semana_pendente.body
      .replace('{{1}}', params[0]).replace('{{2}}', params[1]).replace('{{3}}', params[2]);

    expect(corpo).toContain('conteúdo da semana 1');
    expect(corpo).toContain(TEMA);
    // O miolo: sem esta frase a mensagem vira a pílula de sempre.
    expect(corpo).toContain('continua pendente');
    expect(corpo).toContain('conversa de evidências');
  });

  it('não repete variável — formato não testado numa submissão irreversível', () => {
    const body = TEMPLATES.conteudo_semana_pendente.body;
    for (const v of ['{{1}}', '{{2}}', '{{3}}']) {
      expect(body.split(v).length - 1).toBe(1);
    }
  });

  it('o BOTÃO leva à semana acessível COM formato e pílula', () => {
    const { botaoParam } = montar!(ARGS);
    expect(botaoParam).toBe('ibipeba/1/video/1');
    // O destino errado que a inversão produziria: a semana trancada.
    expect(botaoParam).not.toBe(caminhoDoBotao({
      slug: 'ibipeba', semana: CALENDARIO, formato: 'video', pilula: 1,
    }));
  });

  it('o rótulo do botão não promete CONTEÚDO — a crença a desfazer é justo essa', () => {
    // "Ver conteúdo" reforçaria que abrir o conteúdo conclui a semana.
    expect(TEMPLATES.conteudo_semana_pendente.botao?.texto).toBe('Abrir a semana');
  });

  it('a chave do objeto é igual ao name na Meta (não é um caso de renomeado)', () => {
    expect(TEMPLATES.conteudo_semana_pendente.name).toBe('conteudo_semana_pendente');
    expect(contratoDoTemplate(TEMPLATES.conteudo_semana_pendente.name)).toBeTruthy();
  });
});

describe('e-mail da pílula pendente', () => {
  const item = { conteudo: { titulo: TEMA } };
  const opts = { semana: ACESSIVEL, baseUrl: BASE_URL, formato: 'video', pilula: 1 } as any;

  it('afirma as duas coisas e aponta para a semana acessível', () => {
    const { subject, html } = emailPilulaPendente(NOME, item, opts);
    expect(subject).toContain('Semana 1');
    expect(html).toContain('semana 1');
    expect(html).toContain('continua');
    expect(html).toContain('conversa de evidências');
    expect(html).toContain(`${BASE_URL}/dashboard/temporada/semana/1`);
  });

  it('diz que abrir o conteúdo NÃO conclui — o e-mail não passa por revisão da Meta', () => {
    const { html } = emailPilulaPendente(NOME, item, opts);
    expect(html).toContain('abrir o conteúdo não conclui a semana');
  });

  it('não fala em "Mentora" — não é vocabulário do produto', () => {
    const { subject, html } = emailPilulaPendente(NOME, item, opts);
    expect(`${subject} ${html}`.toLowerCase()).not.toContain('mentora');
  });
});

describe('push da pílula pendente', () => {
  it('o corpo carrega a pendência, não o tema', () => {
    expect(pushPilulaPendente(ACESSIVEL, TEMA).corpo).toContain('conversa de evidências');
  });

  it('cabe nos limites do meio, inclusive com tema longo e semana de 2 dígitos', () => {
    const t = pushPilulaPendente(13, 'Um tema deliberadamente muito longo para estourar o título do push');
    expect(t.titulo.length).toBeLessThanOrEqual(LIMITE_TITULO);
    expect(t.corpo.length).toBeLessThanOrEqual(LIMITE_CORPO);
  });
});

/**
 * Guard do CALL-SITE. Os blocos acima provam o contrato; este prova que o motor
 * o aciona no dia certo, para a pessoa certa — e que a terça foi devolvida.
 *
 * Estático de propósito (mesmo padrão de `p2-semana-pendente`): montar o cron
 * inteiro custaria mais do que o defeito que ele pega. Validado por mutação.
 */
describe('call-site da cadência', () => {
  const fonte = readFileSync(
    join(process.cwd(), 'lib/fase4/trigger-diario-empresa.ts'),
    'utf-8',
  );

  it('a chave existe e é lida do ambiente (interruptor único dos 3 canais)', () => {
    expect(fonte).toContain("const conteudoPendenteLigado = !!templateAtivo('conteudo_pendente')");
  });

  it('a SEGUNDA manda a variante pendente só para quem está travado', () => {
    expect(fonte).toContain(
      "await enviarPilulaDia(conteudosDia[0], 'ultima_pilula1_em', conteudoPendenteLigado && bloqueadaNaAnterior);",
    );
  });

  it('a TERÇA volta a entregar a 2ª pílula quando a chave nova está ligada', () => {
    // Sem o `!conteudoPendenteLigado` a pendência continuaria ocupando o slot
    // da P2, e quem está travado seguiria sem ver o segundo conteúdo da semana.
    expect(fonte).toContain('hoje === diaP2 && pendenciaLigada && !conteudoPendenteLigado && bloqueadaNaAnterior');
  });

  it('a variante pendente NÃO cai no texto livre legado', () => {
    const corpo = fonte.slice(fonte.indexOf('const enviarPilulaDia'), fonte.indexOf('const enviarSemanaPendente'));
    const ramoPendente = corpo.slice(corpo.indexOf('} else if (pendente) {'), corpo.indexOf('} else {'));
    // Comentário fora: o ramo EXPLICA por que não usa o legado, citando os dois
    // nomes. Asserção que lê prosa reprova a explicação e aprovaria a chamada
    // escondida numa linha sem comentário — o oposto do que o guard quer.
    const codigo = semComentarios(ramoPendente);
    expect(codigo).not.toContain('agendarWhatsapp');
    expect(codigo).not.toContain('templateWhatsAppPilula');
    // E o guard sabe falhar: a mesma limpeza aplicada a uma chamada real acusa.
    expect(semComentarios('/* agendarWhatsapp */\nawait agendarWhatsapp(x, 1);')).toContain('agendarWhatsapp');
  });

  it('a semana ANUNCIADA é a acessível — a inversão simétrica à da P2', () => {
    const corpo = fonte.slice(fonte.indexOf('const enviarPilulaDia'), fonte.indexOf('const enviarSemanaPendente'));
    expect(corpo).toContain('const opts = { formato: formatoAnunciado, semana, baseUrl, pilula };');
    expect(corpo).not.toContain('semana: semanaCalendario');
  });
});
