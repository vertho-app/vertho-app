import {describe,it,expect} from 'vitest';
import {alinharDescritoresDoCenario} from '@/lib/matriz-por-cargo';
import {congelarCenariosLideranca,linhasDosCenariosLideranca} from '@/lib/demo/simulador-lideranca-demo';
describe('identidade do descritor no cenário de liderança',()=>{
 it('D1 continua sendo o mesmo comportamento após o banco devolver outra ordem',()=>{
  const linhas=[{cod_desc:'FL05_D1',nome:'Abertura'},{cod_desc:'FL05_D4',nome:'Autorregulação'}];
  expect(alinharDescritoresDoCenario(linhas,['FL05_D4','FL05_D1']).map(d=>d.nome)).toEqual(['Autorregulação','Abertura']);
  expect(alinharDescritoresDoCenario(linhas,undefined)).toBe(linhas);
 });
 it('recusa uma matriz que perdeu, repetiu ou trocou um descritor do cenário',()=>{
  const linhas=[{cod_desc:'D1'},{cod_desc:'D2'}];
  for(const ordem of [null,[],['D1','D1'],['D1','D3'],['D1',2]])expect(()=>alinharDescritoresDoCenario(linhas,ordem)).toThrow();
 });
 it('a recomposição da demo preserva o vínculo e refaz somente as identidades do banco',()=>{
  const snapshot=congelarCenariosLideranca([{id:'velho',empresa_id:'demo',competencia_id:'c1',cargo:'Líder',alternativas:{descritores_ordem:['LD01_D4','LD01_D1'],perguntas:[{descritores_primarios:[1]}]}}],[{id:'c1',nome:'Análise',cargo:'Líder'}]);
  const result=linhasDosCenariosLideranca(snapshot,[{id:'c2',nome:'Análise',cargo:'Líder'}],'demo');
  expect(result.semCompetencia).toEqual([]);expect(result.linhas[0]).toMatchObject({competencia_id:'c2',alternativas:{descritores_ordem:['LD01_D4','LD01_D1'],perguntas:[{descritores_primarios:[1]}]}});
 });
});
