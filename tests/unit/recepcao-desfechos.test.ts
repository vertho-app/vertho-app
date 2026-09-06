import {test,expect} from 'vitest';
import {catalogoInicial} from '@/lib/recepcao/catalogo';
import {abrirSessao,consolidar,promptAvaliador} from '@/lib/recepcao/core';
import type {Insumos} from '@/lib/recepcao/model';

function exemplo(tipo='orientado') {
 const c=structuredClone(catalogoInicial[2]);if(!c.desfechos.includes(tipo))c.desfechos.push(tipo);
 const s=abrirSessao(c,0);s.historico.push({id:'m1',role:'user',content:'Sua consulta é amanhã às 14h na unidade Jardim, Rua Exemplo 100. Chegue 15 minutos antes e apresente seu documento na recepção presencial. Ficou claro como chegar?'},{id:'m2',role:'assistant',content:'Entendi. Vou chegar às 13h45 na unidade Jardim com meu documento.'});
 const secretaria={mensagemId:'m1',trecho:s.historico[1].content},paciente={mensagemId:'m2',trecho:s.historico[2].content};
 const a:Insumos={dimensoes:c.rubrica.map(d=>({id:d.id,classificacao:'adequado',justificativa:'Orientação administrativa observada.',evidencias:[secretaria],oportunidades:[{mensagemId:'m0',trecho:s.historico[0].content}]})),ocorrencias:[],desfecho:{tipo,justificativa:'A pessoa confirmou compreender a orientação.',evidencias:[secretaria,paciente]},feedback:{acerto:'Informou os dados da visita.',melhoria:'Manter clareza.',novaTentativa:'Praticar outra dúvida administrativa.'}};
 return {s,a,secretaria,paciente};
}
test.each(['orientado','confirmado_personalizado'])('%s exige evidências das duas partes, inclusive vocabulário novo',tipo=>{
 const {s,a,secretaria,paciente}=exemplo(tipo);
 for(const evidencias of [[],[secretaria],[paciente]]) expect(()=>consolidar(s,{...a,desfecho:{...a.desfecho,evidencias}})).toThrow('combinado e aceitação');
 expect(consolidar(s,a)?.desfecho.tipo).toBe(tipo);
});
test.each(['nao_resolvido','inconclusivo'])('%s não exige acordo para consolidar',tipo=>{
 const {s,a}=exemplo(tipo);a.desfecho.evidencias=[];expect(consolidar(s,a)?.desfecho.tipo).toBe(tipo);
});
test.each(catalogoInicial)('$id: template usa somente o vocabulário do cenário',c=>{
 const p=promptAvaliador(c);expect(p).toContain(`"tipo":"${c.desfechos.join('|')}"`);
 if(!c.desfechos.includes('remarcado'))expect(p).not.toContain('remarcado');
});
test('desfecho fora do catálogo e citação inventada continuam recusados',()=>{
 const {s,a}=exemplo();expect(()=>consolidar(s,{...a,desfecho:{...a.desfecho,tipo:'fora_do_catalogo'}})).toThrow('Desfecho inválido');
 a.desfecho.evidencias[1].trecho='Aceitei uma coisa que nunca disse';expect(()=>consolidar(s,a)).toThrow('Citação inexistente');
});
