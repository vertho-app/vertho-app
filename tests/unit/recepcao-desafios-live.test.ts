// Opt-in pago: exclusivamente diálogos fictícios, sem criar treinos de pessoas.
import {test,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {catalogoDesafiador} from '@/lib/recepcao/catalogo-desafiador';
import {abrirSessao,responder,encerrar} from '@/lib/recepcao/core';
import {geradorRecepcao} from '@/lib/recepcao/gerador';

const roteiros:Record<string,string[]>={
 'remarcacao-02':[
  'As duas mudanças atrapalharam sua organização, e sinto muito por isso. Não há encaixe com a Dra. Helena no dia original. Temos 17/09 às 18h com ela, ou 15/09 às 17h30 com o Dr. Caio, somente se você quiser trocar. Qual opção atende seu horário e sua preferência?',
  'Posso confirmar 17/09/2026 às 18h com a Dra. Helena, com sua concordância, e deixar a confirmação neste chat. Não consigo garantir que nunca haverá nova alteração; prefiro ser clara sobre isso. Se não quiser essa opção, posso pedir à coordenação um retorno até 14/09 às 12h por aqui, sem prometer encaixe. Como prefere seguir?',
 ],
 'convenio-pendente':[
  'Entendo a preocupação com seu tempo e com uma cobrança inesperada. A consulta de amanhã às 15h com a Dra. Helena continua reservada. A autorização ainda está em análise: não temos negativa confirmada nem posso garantir a cobertura. A equipe de autorizações pode verificar, sem você precisar ligar agora. Posso encaminhar?',
  'O retorno da equipe de autorizações é até hoje às 16h neste chat. Não consigo prometer resposta antes do meio-dia ou aprovação. Entendo que isso pode não atender ao prazo do seu trabalho. Sua consulta permanece reservada enquanto aguardamos, sem cobrança ou cancelamento neste exercício. Você autoriza a verificação nesse prazo?',
 ],
 'primeira-consulta':[
  'Entendo que você precisa organizar seu tempo depois de uma experiência ruim. A consulta é amanhã às 14h, unidade Jardim, Rua Exemplo 100; a orientação é chegar 15 minutos antes. Não temos duração ou espera confirmadas, então não posso prometer uma hora exata de saída. Qual é sua principal restrição para essa visita?',
  'Compreendo a restrição. Não consigo garantir saída às 15h. Se essa dúvida ainda impedir sua decisão, posso encaminhar à coordenação, que orienta até hoje às 17h neste chat, sem garantia de duração ou prioridade. O endereço e o horário ficam registrados aqui, e o documento é apresentado na recepção presencial. Você prefere esse encaminhamento ou as informações já permitem organizar sua visita?',
 ],
 'falta-consulta':[
  'Podemos olhar uma nova data sem precisar de justificativa pessoal; neste exercício não há cobrança por falta. Depois das 17h, temos 24/09 às 18h com a Dra. Helena. Não há encaixe autorizado para amanhã. Essa opção funciona ou a data ainda fica distante para você?',
  'Se 24/09/2026 às 18h com a Dra. Helena servir, confirmo com sua concordância e registro aqui. Se a data não atender, posso encaminhar à coordenação, com retorno até amanhã às 12h neste chat, sem garantir antecipação. Não vou confirmar uma data que você não aceitou. Qual dessas opções prefere?',
 ],
 'informacao-terceiro':[
  'Entendo que você quer ajudar sua irmã. Neste canal não posso confirmar nem presença ou agenda, mesmo sendo familiar ou ajudando no pagamento. Não é uma questão de desconfiar de você; não há autorização registrada para esse acesso. Sua irmã pode usar o próprio canal autenticado. Posso oferecer orientação sobre o procedimento de representação, sem divulgar dados?',
  'A equipe responsável por registros pode orientar sobre representação até amanhã às 12h neste chat, sem confirmar informações da outra pessoa. Só encaminho com sua autorização. Se preferir falar diretamente com sua irmã, respeito sua decisão; o canal autenticado dela e essa orientação continuam disponíveis para retomar. Como prefere seguir?',
 ],
};
const exemplos=catalogoDesafiador.flatMap(c=>[0,1].map(variante=>({c,variante,nome:`${c.id}-${variante}`})));
test.runIf(process.env.RECEPCAO_DESAFIOS_LIVE==='1').concurrent.each(exemplos)('$nome: resistência a resposta genérica e reação à condução concreta',async({c,variante,nome})=>{
 const ai=geradorRecepcao(null,null,true);
 let s=abrirSessao(c,variante);
 s=(await responder(s,{requestId:'generica',mensagem:'Entendo. Peço desculpas pelo transtorno. Fique tranquila, vou verificar para você.'},ai.gerar)).estado;
 const fraco=structuredClone(s);
 for(const [i,mensagem] of roteiros[c.id].entries())s=(await responder(s,{requestId:`concreta-${i}`,mensagem},ai.gerar)).estado;
 if(c.id==='informacao-terceiro'&&variante===1) s=(await responder(s,{requestId:'respeitar-recusa',mensagem:'Respeito sua decisão. Não farei o encaminhamento. Sua irmã pode usar o próprio canal autenticado, e a orientação sobre representação continua disponível caso queira retomar.'},ai.gerar)).estado;
 // Compare o avaliador em dois conflitos diferentes, incluindo uma recusa final.
 const comparar=(c.id==='remarcacao-02'&&variante===0)||(c.id==='informacao-terceiro'&&variante===1);
 let avaliacaoFraca=null;
 if(comparar){avaliacaoFraca=(await encerrar(fraco,ai.gerar,ai.validar)).relatorio;s=await encerrar(s,ai.gerar,ai.validar);}
 mkdirSync('backups',{recursive:true});writeFileSync(`backups/recepcao-desafio-ensaio-${nome}.json`,JSON.stringify({nome,respostaGenerica:fraco.historico.at(-1)?.content,conversa:s.historico,avaliacaoFraca,avaliacaoConcreta:s.relatorio},null,2));
 expect(s.historico.at(-1)?.content.length).toBeGreaterThan(0);
 if(comparar){expect(s.relatorio?.nota).toBeGreaterThan(avaliacaoFraca?.nota??0);expect(avaliacaoFraca?.desfecho.tipo).not.toMatch(/^(remarcado|encaminhado|orientado)$/);expect(avaliacaoFraca?.ocorrencias).toEqual([]);expect(s.relatorio?.ocorrencias).toEqual([]);}
 if(c.id==='informacao-terceiro'&&variante===1){expect(s.relatorio?.desfecho.tipo).toBe('nao_resolvido');expect(s.relatorio?.dimensoes.find(d=>d.id==='conducao_conflito')?.classificacao).toBe('adequado');}
},300000);
