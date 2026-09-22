// Requer página de prévia local temporária. Nunca usa conta ou dados reais.
import { test, expect } from 'vitest';
import { chromium } from 'playwright';
import { catalogoInicial } from '@/lib/recepcao/catalogo';
import { abrirSessao, fichaPublica, visaoPublica } from '@/lib/recepcao/core';
import { executarExemplo } from './recepcao-fixtures.mjs';
test.runIf(process.env.RECEPCAO_UI==='1')('UI: seleção, variante, equipe, editor e celular',async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let sessao:any=null,registros=catalogoInicial.map((conteudo,i)=>({id:`caso-${i}`,conteudo,estado:'publicado',empresa_id:null,versao:'1.0',revisao:0}));
 let liberarAudio:(()=>void)|undefined,avisarAudio:()=>void;
 const audioSolicitado=new Promise<void>(resolve=>{avisarAudio=resolve});
 const completo=visaoPublica(await executarExemplo());
 await page.route('**/api/recepcao**',async route=>{
  const req=route.request(),u=new URL(req.url());let d:any;
  if(u.pathname.endsWith('/voz')) {
   await new Promise<void>(resolve=>{liberarAudio=resolve;avisarAudio()});await route.fulfill({body:Buffer.from('audio-ficticio'),contentType:'audio/mpeg'});return;
  }
  if(u.pathname.endsWith('/gestao')) {
   if(req.method()==='POST') {
    const cmd=req.postDataJSON();
    {const r={id:cmd.id||'rascunho',conteudo:cmd.conteudo,estado:cmd.acao==='publicar'?'publicado':'rascunho',empresa_id:'empresa',versao:'2',revisao:(cmd.revisao||0)+1};registros=registros.filter(x=>x.id!==r.id).concat(r);d={cenario:r}}
   }else if(u.searchParams.get('visao')==='cenarios')d={cenarios:registros};
   else if(u.searchParams.has('sessaoId'))d={sessao:completo};
   else d={pessoas:[{id:'p',nome:'Pessoa da equipe',iniciadas:1,concluidas:1}],iniciadas:1,concluidas:1,grupos:[],sessoes:[{id:completo.id,nome:'Pessoa da equipe',titulo:completo.cenario.titulo,data:new Date().toISOString(),nota:100}],operacao:null};
  }else if(req.method()==='POST') {
   const cmd=req.postDataJSON();
   if(cmd.acao==='responder'){sessao.historico.push({id:'m1',role:'user',content:cmd.mensagem},{id:'m2',role:'assistant',content:'Quero saber quando terei uma resposta.'});sessao.respostas++;sessao.revisao++;}
   else sessao=abrirSessao(registros.find(r=>r.id===cmd.cenarioId)!.conteudo,0);
   d={sessao:visaoPublica(sessao)};
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
  await page.getByRole('button',{name:'Ouvir paciente',exact:true}).click();await audioSolicitado;
  await page.getByLabel('Sua resposta para Paula',{exact:true}).fill('Posso verificar a pendência e combinar o prazo de retorno.');
  expect(await page.getByRole('button',{name:'Enviar resposta',exact:true}).isEnabled()).toBe(true);
  await page.getByRole('button',{name:'Enviar resposta',exact:true}).click();await page.getByText('Quero saber quando terei uma resposta.',{exact:true}).waitFor();
  liberarAudio!();await page.getByText('Preparando áudio…',{exact:true}).waitFor({state:'hidden'});
  expect(await page.getByLabel('Fala da paciente',{exact:true}).count()).toBe(0);
  await page.getByRole('button',{name:'Equipe',exact:true}).click();
  await page.getByRole('button',{name:'Abrir atendimento'}).click();
  // Sem revisão humana desde 22/09/2026: quem acompanha vê o resultado, não registra parecer.
  await page.getByRole('heading',{name:'Avaliação da IA',exact:true}).waitFor();
  expect(await page.getByLabel('Motivo e evidências').count()).toBe(0);
  await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-equipe.png',fullPage:true});
  await page.getByRole('button',{name:'Cenários',exact:true}).click();
  await page.getByRole('button',{name:'Criar nova versão',exact:true}).first().click();
  await page.getByLabel('Reação aos limites',{exact:true}).first().selectOption('resistencia_persistente');
  await page.getByLabel('Título',{exact:true}).fill('Remarcação revisada');
  await page.getByRole('button',{name:'Conferir ficha visível'}).click();
  await page.getByRole('button',{name:'Salvar rascunho'}).click();
  await page.getByRole('button',{name:'Publicar versão'}).waitFor();
  expect(registros.find(r=>r.id==='rascunho')?.conteudo.paciente.postura).toBe('resistencia_persistente');
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Publicar versão'}).click();
  await page.getByRole('button',{name:'Voltar à biblioteca'}).click();
  await page.getByRole('heading',{name:'Remarcação revisada',exact:true}).waitFor();
  await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-catalogo.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  expect(errors).toEqual([]);
 } catch(e) {await page.screenshot({path:'C:/Users/rdnav/recepcao-medica-piloto/evolucao-erro.png',fullPage:true});console.log(await page.locator('body').innerText());throw e} finally {liberarAudio?.();await browser.close()}
},180000);
