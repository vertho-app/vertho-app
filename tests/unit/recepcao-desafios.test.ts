import {describe,it,expect} from 'vitest';
import {catalogoDesafiador} from '@/lib/recepcao/catalogo-desafiador';
import {catalogoInicial} from '@/lib/recepcao/catalogo';
import {abrirSessao,visaoPublica,consolidar} from '@/lib/recepcao/core';
import {cenarioSchema} from '@/lib/recepcao/schema';

describe('catálogo sob pressão',()=>{
 it.each(catalogoDesafiador)('$id: versão nova, alternativas públicas e variantes privadas',c=>{
  expect(cenarioSchema.safeParse(c).success).toBe(true);
  expect(c.versao).not.toBe(catalogoInicial.find(x=>x.id===c.id)!.versao);
  expect(c.rubrica.reduce((s,d)=>s+d.peso,0)).toBe(100);
  expect(c.rubrica.find(d=>d.id==='conducao_conflito')?.peso).toBe(15);
  for(let v=0;v<=c.variantes.length;v++) {
   const s=abrirSessao(c,v),publico=visaoPublica(s);
   expect(s.cenario.paciente.nome).toBe([c.paciente,...c.variantes][v].nome);
   expect(JSON.stringify(publico)).not.toContain(s.cenario.paciente.comportamento);
   expect(publico.cenario.competencias).toHaveLength(6);
  }
 });
 it('não altera sementes introdutórias nem sessões antigas ao criar a nova versão',()=>{
  const antiga=abrirSessao(catalogoInicial[0],0),antes=structuredClone(antiga);
  abrirSessao(catalogoDesafiador[0],0);
  expect(antiga).toEqual(antes);expect(antiga.cenario.versao).toBe('1.0');
  expect(antiga.cenario.rubrica).toHaveLength(5);
 });
 it('preserva boa condução e recusa como resultados independentes',()=>{
  const s=abrirSessao(catalogoDesafiador[4],1);
  s.historico.push({id:'m1',role:'user',content:'Entendo o pedido. Não posso confirmar presença neste canal. Posso oferecer orientação sobre representação?'},{id:'m2',role:'assistant',content:'Não autorizo. Prefiro falar com minha irmã.'},{id:'m3',role:'user',content:'Respeito sua decisão. Sua irmã pode usar o próprio canal autenticado. A orientação sobre representação continua disponível se você quiser retomá-la.'});
  const r=consolidar(s,{dimensoes:s.cenario.rubrica.map(d=>({id:d.id,classificacao:'adequado' as const,justificativa:'Responde ao pedido sem divulgar informação e respeita a recusa.',evidencias:[{mensagemId:'m1',trecho:'Não posso confirmar presença neste canal.'}],oportunidades:[{mensagemId:'m0',trecho:s.historico[0].content}]})),ocorrencias:[],desfecho:{tipo:'nao_resolvido',justificativa:'A pessoa recusou o encaminhamento, sem falha automática da recepção.',evidencias:[{mensagemId:'m2',trecho:'Não autorizo.'}]},feedback:{acerto:'Preservou o limite do canal.',melhoria:'Manter a oferta de orientação disponível.',novaTentativa:'Praticar outro pedido de exceção.'}});
  expect(r?.nota).toBe(100);expect(r?.desfecho.tipo).toBe('nao_resolvido');
 });
});
