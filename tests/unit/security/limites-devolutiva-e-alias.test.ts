/**
 * Reanálise de segurança de 05/10/2026, três lacunas de limite de tentativas:
 *
 *  1. `enviarDevolutivaWhatsApp()` e `enviarDevolutivaWhatsAppPorId()` mandam áudio pelo número da
 *     Vertho ao telefone da pessoa, sem limitador (as outras ações do arquivo foram limitadas em 05/10
 *     e estas ficaram de fora). O freio é por PESSOA DE DESTINO: o telefone é o que se protege.
 *  2. `loadBehavioralReport({ force: true })` refaz a chamada do modelo e só o `regenerar...` tinha
 *     freio: chamando a action direto, o limite era contornado. A porta de verdade ganhou o freio.
 *  3. O teto por destinatário do login/cadastro (5 por hora) contava `a+1@x.com` e `a+2@x.com` (e
 *     `a.b@gmail.com` e `ab@gmail.com`) como destinos diferentes, embora entreguem na mesma caixa.
 *
 * Validado por mutação (ver o commit): tirar o limitador das duas ações, ou a normalização do alias,
 * reprova um teste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  devolutivaWhatsAppLimiter, limitarAcao, limitarPorDestino, chaveDoDestino, emailParaLimite, LINKS_POR_DESTINO_HORA,
} from '@/lib/rate-limit';

const ARQUIVO = 'app/dashboard/perfil-comportamental/relatorio/relatorio-actions.ts';
const fonte = readFileSync(ARQUIVO, 'utf8');
const corpoDe = (assinatura: string) => {
  const i = fonte.indexOf(assinatura);
  expect(i, `${assinatura} não encontrada`).toBeGreaterThan(-1);
  const prox = fonte.indexOf('\nexport async function', i + assinatura.length);
  return fonte.slice(i, prox === -1 ? undefined : prox);
};
const req = () => new Request('http://teste.interno/');

describe('e-mail como chave de LIMITE', () => {
  it.each([
    ['Ana+vendas@Escola.br', 'ana@escola.br'],
    ['  ana+x+y@escola.br ', 'ana@escola.br'],
    ['a.b+c@gmail.com', 'ab@gmail.com'],
    ['A.B@googlemail.com', 'ab@gmail.com'],
    ['a.b@empresa.com', 'a.b@empresa.com'],
    ['+x@escola.br', '+x@escola.br'],
    ['sem-arroba', 'sem-arroba'],
    ['ana@escola.br', 'ana@escola.br'],
  ])('%s vira %s', (entrada, esperado) => {
    expect(emailParaLimite(entrada)).toBe(esperado);
  });

  it('pessoas diferentes continuam com chaves diferentes', async () => {
    expect(await chaveDoDestino('email', 'ana@escola.br')).not.toBe(await chaveDoDestino('email', 'bia@escola.br'));
    expect(await chaveDoDestino('email', 'a.b@empresa.com')).not.toBe(await chaveDoDestino('email', 'ab@empresa.com'));
  });

  it('🔴 os alias da MESMA caixa dividem o teto: trocar `+tag` não zera a conta', async () => {
    const base = `alvo${Date.now()}`;
    for (let i = 0; i < LINKS_POR_DESTINO_HORA; i++) {
      expect(await limitarPorDestino(req(), 'email', `${base}+${i}@escola.br`)).toBeNull();
    }
    expect((await limitarPorDestino(req(), 'email', `${base}+outro@escola.br`))?.status).toBe(429);
    expect((await limitarPorDestino(req(), 'email', `${base}@escola.br`))?.status).toBe(429);
  });

  it('🔴 no Gmail, os pontos também são a mesma caixa', async () => {
    const base = `nome${Date.now()}`;
    const variantes = [`${base}@gmail.com`, `${base.slice(0, 4)}.${base.slice(4)}@gmail.com`, `${base.slice(0, 5)}.${base.slice(5)}@googlemail.com`, `${base}+a@gmail.com`, `${base}+b@gmail.com`];
    for (const v of variantes) expect(await limitarPorDestino(req(), 'email', v)).toBeNull();
    expect((await limitarPorDestino(req(), 'email', `n.${base.slice(1)}@gmail.com`))?.status).toBe(429);
  });
});

describe('devolutiva por WhatsApp: freio por pessoa de destino', () => {
  it('3 por hora por destino; o 4º pedido é recusado; outro destino segue livre', async () => {
    const alvo = `devolutiva:alvo-${Date.now()}`;
    for (let i = 0; i < 3; i++) expect(await limitarAcao(devolutivaWhatsAppLimiter, alvo)).toBeNull();
    const espera = await limitarAcao(devolutivaWhatsAppLimiter, alvo);
    expect(espera).toBeGreaterThanOrEqual(1);
    expect(await limitarAcao(devolutivaWhatsAppLimiter, `devolutiva:outro-${Date.now()}`)).toBeNull();
  });

  it.each([
    ['export async function enviarDevolutivaWhatsApp()'],
    ['export async function enviarDevolutivaWhatsAppPorId('],
  ])('🔴 %s consulta o limitador DEPOIS de achar o telefone e ANTES de enviar o áudio', (assinatura) => {
    const c = corpoDe(assinatura);
    const limite = c.indexOf('limitarAcao(devolutivaWhatsAppLimiter');
    expect(limite, 'sem limitador').toBeGreaterThan(-1);
    expect(limite).toBeGreaterThan(c.indexOf('Telefone não cadastrado'));
    const envio = c.indexOf('sendWhatsapp(');
    expect(envio, 'sem envio de áudio').toBeGreaterThan(-1);
    expect(limite).toBeLessThan(envio);
  });
});

describe('relatório comportamental: o freio mora na porta que gasta', () => {
  it('🔴 loadBehavioralReport({ force }) consulta o limitador antes de ler o colaborador', () => {
    const c = corpoDe('export async function loadBehavioralReport(');
    const limite = c.indexOf('limitarAcao(heavyLimiter');
    expect(limite).toBeGreaterThan(-1);
    expect(c.slice(Math.max(0, limite - 120), limite)).toMatch(/opts\.force/);
    expect(limite).toBeLessThan(c.indexOf('findColabByEmail('));
  });

  it('regenerarRelatorioComportamental não gasta uma segunda ficha (o freio é só o de loadBehavioralReport)', () => {
    const c = corpoDe('export async function regenerarRelatorioComportamental(');
    expect(c).not.toContain('limitarAcao(');
    expect(c).toContain('loadBehavioralReport({ force: true })');
  });
});
