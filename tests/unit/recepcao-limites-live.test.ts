// Opt-in pago: diálogos sintéticos; não cria sessões ou altera dados de usuários.
import {test,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {catalogoLimites} from '@/lib/recepcao/catalogo-limites';
import {abrirSessao,responder,encerrar} from '@/lib/recepcao/core';
import {geradorRecepcao} from '@/lib/recepcao/gerador';
import {exemplar} from './recepcao-gabarito';

test.runIf(process.env.RECEPCAO_LIMITES_LIVE==='1').concurrent.each(catalogoLimites.flatMap(c=>[0,1].map(variante=>({c,variante,nome:`${c.id}-${variante}`}))))('$nome: continua contestando após duas respostas corretas',async({c,variante,nome})=>{
 const ai=geradorRecepcao(null,null,true);let s=abrirSessao(c,variante);
 // Falas exemplares compartilhadas com o ensaio de calibração (recepcao-gabarito.ts).
 const falas=exemplar(c.id,variante);
 for(const [i,mensagem] of falas.entries())s=(await responder(s,{requestId:`limite-${i}`,mensagem},ai.gerar)).estado;
 if(variante===1&&['remarcacao-02','informacao-terceiro'].includes(c.id))s=await encerrar(s,ai.gerar,ai.validar);
 mkdirSync('backups',{recursive:true});writeFileSync(`backups/recepcao-limites-ensaio-${nome}.json`,JSON.stringify({conversa:s.historico,relatorio:s.relatorio},null,2));
 for(const m of s.historico.filter(m=>m.role==='assistant'))expect(m.content).not.toMatch(/\b(?:perfeito|agradeço|pode confirmar|obrigad[oa] pela)\b/i);
 if(s.relatorio){expect(s.relatorio.desfecho.tipo).toBe('nao_resolvido');expect(s.relatorio.ocorrencias).toEqual([]);expect(s.relatorio.dimensoes.find(d=>d.id==='conducao_conflito')?.classificacao).toBe('adequado');expect(s.relatorio.dimensoes.find(d=>d.id==='resolucao')?.classificacao).toBe('adequado');}
},300000);
