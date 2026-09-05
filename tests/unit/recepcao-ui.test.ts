// Requer página de prévia local temporária. Nunca usa conta ou dados reais.
import { test, expect } from 'vitest';
import { chromium } from 'playwright';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { abrirSessao, fichaPublica, visaoPublica } from '@/lib/recepcao/core';
import { executarExemplo } from './recepcao-fixtures.mjs';
test.runIf(process.env.RECEPCAO_UI==='1')('UI: seleção, variante, revisão, editor e celular',async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let sessao:any=null,registros=catalogoInicial.map((conteudo,i)=>({id:`caso-${i}`,conteudo,estado:'publicado',empresa_id:null,versao:'1.0',revisao:0})),revisoes:any[]=[];
 const completo=visaoPublica(await executarExemplo());
 await page.route('**/api/recepcao**',async route=>{
  const req=route.request(),u=new URL(req.url());let d:any;
  if(u.pathname.endsWith('/gestao')) {
   if(req.method()==='POST') {
    const cmd=req.postDataJSON();
    if(cmd.acao==='revisar'){revisoes.push({id:cmd.requestId,revisor_nome:'Gestora',parecer:cmd.parecer,motivo:cmd.motivo,created_at:new Date().toISOString()});d={ok:true}}
    else{const r={id:cmd.id||'rascunho',conteudo:cmd.conteudo,estado:cmd.acao==='publicar'?'publicado':'rascunho',empresa_id:'empresa',versao:'2',revisao:(cmd.revisao||0)+1};registros=registros.filter(x=>x.id!==r.id).concat(r);d={cenario:r}}
   }else if(u.searchParams.get('visao')==='cenarios')d={cenarios:registros};
   else if(u.searchParams.has('sessaoId'))d={sessao:completo,revisoes,podeRevisar:true};
   else d={pessoas:[{id:'p',nome:'Pessoa da equipe',iniciadas:1,concluidas:1}],iniciadas:1,concluidas:1,pendentes:revisoes.length?0:1,grupos:[],sessoes:[{id:completo.id,nome:'Pessoa da equipe',titulo:completo.cenario.titulo,data:new Date().toISOString(),nota:100,revisao:revisoes[0]?.parecer}],operacao:null};
  }else if(req.method()==='POST') {
   const cmd=req.postDataJSON();sessao=abrirSessao(registros.find(r=>r.id===cmd.cenarioId)!.conteudo,0);d={sessao:visaoPublica(sessao)};
  }else d={empresaId:'empresa',empresaNome:'Clínica de teste',habilitado:true,podeEquipe:true,podeCenarios:true,cenarios:registros.filter(r=>r.estado==='publicado').map(r=>({id:r.id,versao:r.versao,ficha:fichaPublica(r.conteudo)})),ficha:fichaPublica(catalogoInicial[0]),sessao:sessao?visaoPublica(sessao):null,historico:[]};
  await route.fulfill({json:d});
 });
 try {
  await page.goto(process.env.RECEPCAO_UI_URL||'http://localhost:3107/preview-recepcao-local',{waitUntil:'domcontentloaded',timeout:120000});
  page.setDefaultTimeout(20000);
  await page.getByLabel('Caso para o próximo atendimento').selectOption('caso-1');
  await page.getByRole('button',{name:'Iniciar atendimento',exact:true}).click();
  await page.getByRole('heading',{name:'Paula',exact:true}).waitFor();
  expect(await page.getByLabel('Conversa com Paula').innerText()).toContain('Minha consulta foi cancelada?');
  await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-treino.png',fullPage:true});
  await page.getByRole('button',{name:'Equipe e revisões',exact:true}).click();
  await page.getByRole('button',{name:'Abrir atendimento'}).click();
  await page.getByLabel('Motivo e evidências').fill('A conversa confirma o combinado. Revisado pela gestora.');
  await page.getByRole('button',{name:'Salvar revisão',exact:true}).click();
  await page.getByText('Gestora · concordo').waitFor();
  await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-revisao.png',fullPage:true});
  await page.getByRole('button',{name:'Cenários',exact:true}).click();
  await page.getByRole('button',{name:'Criar nova versão',exact:true}).first().click();
  await page.getByLabel('Título',{exact:true}).fill('Remarcação revisada');
  await page.getByRole('button',{name:'Conferir ficha visível'}).click();
  await page.getByRole('button',{name:'Salvar rascunho'}).click();
  await page.getByRole('button',{name:'Publicar versão'}).waitFor();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Publicar versão'}).click();
  await page.getByRole('button',{name:'Voltar à biblioteca'}).click();
  await page.getByRole('heading',{name:'Remarcação revisada',exact:true}).waitFor();
  await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-catalogo.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  expect(errors).toEqual([]);
 } catch(e) {await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-erro.png',fullPage:true});console.log(await page.locator('body').innerText());throw e} finally {await browser.close()}
},180000);
