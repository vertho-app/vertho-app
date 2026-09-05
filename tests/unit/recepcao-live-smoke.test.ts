// Opt-in explícito: tem custo de IA e grava telemetria/prompt_version, nunca roda no CI comum.
import { test, expect } from 'vitest';
import { abrirSessao, responder, encerrar } from '@/lib/recepcao/core';
import { cenario as legado } from '@/lib/recepcao/cenario.mjs';
import { cenarioSchema } from '@/lib/recepcao/schema';
const cenario = cenarioSchema.parse(legado);
import { geradorRecepcao } from '@/lib/recepcao/ai';
import { catalogoInicial } from '@/lib/recepcao/catalogo';

test.runIf(process.env.RECEPCAO_LIVE_SMOKE === '1')('sessão sintética com o roteador e provedores reais', async () => {
  const ai = geradorRecepcao(null, null, true);
  let s = abrirSessao(cenario);
  const falas = [
    'Sinto muito pelo transtorno das duas mudanças. Qual horário funciona para você? Prefere manter a Dra. Helena?',
    'Temos 17/09/2026 às 18h com a Dra. Helena. Esse horário funciona para você?',
    'Se estiver de acordo, confirmo 17/09/2026 às 18h com a Dra. Helena, como combinamos. A confirmação fica neste chat.',
  ];
  for (const [i, mensagem] of falas.entries()) s = (await responder(s, { requestId: `live-${i}`, mensagem }, ai.gerar)).estado;
  s = await encerrar(s, ai.gerar);
  expect(s.status).toBe('concluida');
  expect(s.relatorio.dimensoes).toHaveLength(5);
  expect(s.relatorio.coberturaPercentual).toBeGreaterThan(0);
  expect(ai.chamadas.length).toBeGreaterThanOrEqual(4);
  expect(ai.chamadas.length).toBeLessThanOrEqual(5);
  console.log('Sessão real concluída:', { desfecho: s.relatorio.desfecho.tipo, cobertura: s.relatorio.coberturaPercentual, modelos: [...new Set(ai.chamadas.map(c => c.model))] });
}, 240000);

const roteiros:Record<string,string[]>={
 'convenio-pendente':['Entendo sua preocupação. Sua consulta continua reservada. A autorização está pendente de análise, não temos uma recusa confirmada. Posso encaminhar à equipe de autorizações?','Com sua autorização, a equipe de autorizações responde até hoje às 16h neste chat. A consulta permanece reservada enquanto aguardamos.'],
 'primeira-consulta':['Entendo. Qual parte da primeira visita deixa você em dúvida?','Sua consulta é amanhã às 14h, na unidade Jardim, Rua Exemplo 100. Chegue 15 minutos antes e apresente seu documento na recepção presencial. Ficou alguma dúvida sobre a chegada?'],
 'falta-consulta':['Podemos ajudar a remarcar. Qual horário funciona para você?','Temos 24/09/2026 às 18h com a Dra. Helena. Se esse horário funciona, podemos confirmar essa opção?'],
 'informacao-terceiro':['Entendo sua preocupação. Neste canal não posso confirmar atendimento ou informações de outra pessoa. Sua irmã pode solicitar orientação no próprio canal autenticado.','Mesmo sendo familiar, precisamos seguir o procedimento de acesso. Posso encaminhar sua dúvida sobre representação à equipe responsável por registros, que orienta até amanhã às 12h neste chat, sem divulgar dados da paciente?'],
};
test.runIf(process.env.RECEPCAO_LIVE_CATALOGO==='1').each(catalogoInicial.slice(1))('caso $id com paciente e avaliador reais',async(c)=>{
 const ai=geradorRecepcao(null,null,true);let s=abrirSessao(c,0);
 for(const [i,mensagem] of roteiros[c.id].entries())s=(await responder(s,{requestId:`catalogo-${i}`,mensagem},ai.gerar)).estado;
 s=await encerrar(s,ai.gerar,ai.validar);
 expect(s.status).toBe('concluida');expect(s.relatorio?.dimensoes).toHaveLength(c.rubrica.length);
},180000);
