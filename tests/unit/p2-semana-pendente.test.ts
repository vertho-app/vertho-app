import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contratoDoTemplate, caminhoDoBotao } from '@/lib/notifications/pilula-template';
import { emailSemanaPendente } from '@/lib/notifications/pilula-envio';
import { pushSemanaPendente, LIMITE_TITULO, LIMITE_CORPO } from '@/lib/notifications/push-copy';
import { TEMPLATES } from '@/lib/whatsapp/templates';

/**
 * A P2 de quem está travado numa semana anterior vira a mensagem de PENDÊNCIA
 * (`semana_pendente_v2`), nos três canais.
 *
 * 🔴 O QUE ESTE ARQUIVO EXISTE PARA PEGAR é uma INVERSÃO que não dá erro em
 * lugar nenhum. Em `trigger-diario-empresa.ts`, `semana` é a semana ACESSÍVEL e
 * `semanaCalendario` é o relógio. No contrato do template é o oposto: `{{2}}` é
 * onde a trilha ESTÁ (calendário) e `{{3}}` é a que continua PENDENTE — e o
 * botão aponta para `{{3}}`. Trocar as duas é typecheck-limpo (ambas são
 * `number`), a Meta aceita, a mensagem é entregue, e o que chega é "sua trilha
 * está na semana 1, e a semana 6 continua pendente" com um botão de volta para
 * a porta fechada: exatamente o defeito que a mensagem existe para corrigir.
 *
 * Cenário real de 25/08/2026 usado nos casos: Ibipeba, calendário na semana 6,
 * 18 pessoas pendentes na semana 1.
 */

const CALENDARIO = 6;   // onde a trilha está
const PENDENTE = 1;     // o que destrava — e o destino de TODO link
const NOME = 'Maria Aparecida Nunes Abreu';
const BASE_URL = 'https://ibipeba.vertho.ai';

describe('semana_pendente_v2 — contrato do template', () => {
  const montar = contratoDoTemplate('semana_pendente_v2');

  it('tem contrato mapeado (sem ele o envio é recusado por fail-closed)', () => {
    expect(montar).toBeTruthy();
  });

  it('{{2}} é o CALENDÁRIO e {{3}} é a PENDENTE — nesta ordem', () => {
    const { params } = montar!({
      nome: NOME, semana: CALENDARIO, semanaPendente: PENDENTE,
      slug: 'ibipeba', baseUrl: BASE_URL, telefone: '+5511999999999',
      tema: '', formato: null, pilula: null,
    } as any);

    expect(params).toEqual([NOME, '6', '1']);

    // A prova de que a ordem importa: renderizado, o corpo aprovado tem que
    // dizer que a 6 é onde ela está e a 1 é o que falta — nunca o contrário.
    const corpo = TEMPLATES.semana_pendente.body
      .replace('{{1}}', params[0]).replace('{{2}}', params[1]).replace('{{3}}', params[2]);
    expect(corpo).toContain('está na semana 6');
    expect(corpo).toContain('a semana 1 continua pendente');
  });

  it('o BOTÃO aponta para a semana PENDENTE, nunca para a do calendário', () => {
    const { botaoParam } = montar!({
      nome: NOME, semana: CALENDARIO, semanaPendente: PENDENTE,
      slug: 'ibipeba', baseUrl: BASE_URL, telefone: '+5511999999999',
      tema: '', formato: null, pilula: null,
    } as any);

    expect(botaoParam).toBe('ibipeba/1');
    expect(botaoParam).not.toBe(caminhoDoBotao({
      slug: 'ibipeba', semana: CALENDARIO, formato: null, pilula: null,
    }));
  });

  it('a chave do objeto DIVERGE do name na Meta — mandar a chave dá "template not found"', () => {
    expect(TEMPLATES.semana_pendente.name).toBe('semana_pendente_v2');
    // O contrato é indexado pelo NOME da Meta, não pela chave interna.
    expect(contratoDoTemplate('semana_pendente')).toBeNull();
  });
});

describe('e-mail da semana pendente', () => {
  it('o link e o assunto levam a PENDENTE, não a do calendário', () => {
    const { subject, html } = emailSemanaPendente(NOME, {
      semana: CALENDARIO, semanaPendente: PENDENTE, baseUrl: BASE_URL,
    });

    expect(subject).toContain('Semana 1');
    expect(html).toContain(`${BASE_URL}/dashboard/temporada/semana/1`);
    expect(html).not.toContain('/dashboard/temporada/semana/6');
  });

  it('diz as duas semanas nos papéis certos', () => {
    const { html } = emailSemanaPendente(NOME, {
      semana: CALENDARIO, semanaPendente: PENDENTE, baseUrl: BASE_URL,
    });
    expect(html).toContain('<strong>semana 6</strong>, e a <strong>semana 1</strong> continua pendente');
  });

  it('nomeia a conversa de evidências, e NÃO "Mentora"', () => {
    // "Mentora" não é vocabulário do produto (o card da tela é "Evidências") e
    // apontaria para o Beto, que não conclui semana nenhuma — decisão de 23/08.
    const { subject, html } = emailSemanaPendente(NOME, {
      semana: CALENDARIO, semanaPendente: PENDENTE, baseUrl: BASE_URL,
    });
    expect(html).toContain('conversa de evidências');
    expect(`${subject} ${html}`.toLowerCase()).not.toContain('mentora');
  });
});

describe('push da semana pendente', () => {
  it('o título nomeia a semana PENDENTE', () => {
    expect(pushSemanaPendente(PENDENTE).titulo).toBe('Semana 1 pendente');
  });

  it('cabe nos limites do meio', () => {
    // Semana de dois dígitos é o pior caso do título.
    const t = pushSemanaPendente(13);
    expect(t.titulo.length).toBeLessThanOrEqual(LIMITE_TITULO);
    expect(t.corpo.length).toBeLessThanOrEqual(LIMITE_CORPO);
  });

  it('diz ONDE se conclui — sem isso o push repete o convite e não desfaz a crença', () => {
    expect(pushSemanaPendente(PENDENTE).corpo).toContain('conversa de evidências');
  });
});

/**
 * Guard do CALL-SITE. Os testes acima provam o contrato; este prova que o motor
 * o alimenta na ordem certa — que é onde a inversão de fato caberia, e nenhum
 * dos outros a alcança sem montar o cron inteiro.
 *
 * Estático de propósito (mesmo padrão de `ppp-rede-guard`): lê o arquivo
 * versionado e confere o par. Validado por mutação — trocar os dois valores no
 * `trigger-diario-empresa.ts` deixa este bloco vermelho.
 */
describe('call-site da cadência', () => {
  const fonte = readFileSync(
    join(process.cwd(), 'lib/fase4/trigger-diario-empresa.ts'),
    'utf-8',
  );
  const corpoDaFuncao = fonte.slice(
    fonte.indexOf('const enviarSemanaPendente'),
    fonte.indexOf('// Há canal PENDENTE hoje?'),
  );

  it('encontrou a função (o guard falha alto se ela for renomeada)', () => {
    expect(corpoDaFuncao.length).toBeGreaterThan(200);
  });

  it('manda o CALENDÁRIO em `semana` e a ACESSÍVEL em `semanaPendente`', () => {
    expect(corpoDaFuncao).toContain('semana: semanaCalendario, semanaPendente: semana');
    // A inversão exata que o arquivo inteiro existe para impedir.
    expect(corpoDaFuncao).not.toContain('semana: semana, semanaPendente: semanaCalendario');
  });

  it('o push e o e-mail apontam para a semana ACESSÍVEL (a pendente)', () => {
    expect(corpoDaFuncao).toContain('pushSemanaPendente(semana)');
    expect(corpoDaFuncao).toContain('deepLinkSemana(baseUrl, semana)');
    expect(corpoDaFuncao).not.toContain('deepLinkSemana(baseUrl, semanaCalendario)');
  });

  it('não tem caminho legado de texto livre (o canal morreu em 13/08)', () => {
    expect(corpoDaFuncao).not.toContain('agendarWhatsapp');
  });
});
