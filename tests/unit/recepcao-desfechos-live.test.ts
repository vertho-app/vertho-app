// Opt-in pago, apenas diálogos sintéticos com vocabulário não comercial.
import {test,expect} from 'vitest';
import {catalogoInicial} from '@/lib/recepcao/catalogo';
import {abrirSessao,responder,encerrar} from '@/lib/recepcao/core';
import {geradorRecepcao} from '@/lib/recepcao/gerador';
test.runIf(process.env.RECEPCAO_DESFECHOS_LIVE==='1').each(['orientado','instrucoes_compreendidas'])('%s: avaliador usa o vocabulário e evidencia compreensão',async tipo=>{
 const c=structuredClone(catalogoInicial[2]);c.desfechos=[tipo,'nao_resolvido','inconclusivo'];
 const ai=geradorRecepcao(null,null,true);let s=abrirSessao(c,0);
 for(const [i,mensagem] of ['Entendo a insegurança da primeira visita. Qual informação falta para você se organizar?','Sua consulta é amanhã às 14h na unidade Jardim, Rua Exemplo 100. Chegue 15 minutos antes e apresente seu documento na recepção presencial. Não precisa enviar documentos aqui, e não há preparo informado. Ficou claro onde chegar e com quanto tempo de antecedência?'].entries())s=(await responder(s,{requestId:`orientacao-${i}`,mensagem},ai.gerar)).estado;
 s=await encerrar(s,ai.gerar,ai.validar);
 expect(s.relatorio?.desfecho.tipo).toBe(tipo);
 const papeis=new Set(s.relatorio?.desfecho.evidencias.map(e=>s.historico.find(m=>m.id===e.mensagemId)?.role));expect(papeis).toEqual(new Set(['user','assistant']));
},240000);
