process.loadEnvFile('.env.local');
process.env.HCLOUD_TOKEN=process.env.HCLOUD_TOKEN||process.env['Hetzner Cloud api token'];
process.env.RENDER_SNAPSHOT_ID='401652957';
process.env.SUPABASE_URL=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.RENDER_SERVER_TYPE='cx43'; process.env.RENDER_FALLBACK_TYPE='ccx23';
process.env.RENDER_LOCATIONS='hel1,fsn1'; process.env.MAX_RENDER_BOXES='4'; process.env.RENDER_JOBS_PER_BOX='2';
const TOK=process.env.HCLOUD_TOKEN!, SUPA=process.env.NEXT_PUBLIC_SUPABASE_URL!, KEY=process.env.SUPABASE_SERVICE_ROLE_KEY!, EMP='0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const { ensureRenderWorker } = await import('../lib/video/ensure-render-worker.ts');
const jget=async(u:string,o?:any)=>{for(let k=0;k<3;k++){try{return await (await fetch(u,o)).json();}catch{await new Promise(r=>setTimeout(r,5000));}}return null;};
const vids=async()=>{const j=await jget(`${SUPA}/rest/v1/videos_gerados?empresa_id=eq.${EMP}&created_by=eq.refire-video-sem1&select=status`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}});if(!j)return null;const by:any={};for(const v of j)by[v.status]=(by[v.status]||0)+1;return by;};
const boxes=async()=>{const j=await jget('https://api.hetzner.cloud/v1/servers',{headers:{Authorization:`Bearer ${TOK}`}});return j?.servers||null;};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let settledAt=0;
for(let i=0;i<180;i++){
  const by=await vids(); const bx=await boxes();
  if(!by||!bx){console.log('rede instável');await sleep(60000);continue;}
  const queued=by.render_queued||0, rendering=by.rendering||0, proc=by.processing||0, done=by.done||0, err=by.error||0;
  console.log(`[${new Date().toISOString().slice(11,19)}] done=${done} err=${err} queued=${queued} rendering=${rendering} proc=${proc} | boxes=${bx.length}`);
  if(queued>0 && bx.length<4){ const r:any=await ensureRenderWorker().catch(e=>({provisioned:false})); if(r.provisioned)console.log('  +cx43',JSON.stringify(r.created)); }
  if(done+err>=7 && (queued+rendering+proc)===0){
    if(!settledAt)settledAt=Date.now();
    if(bx.length===0){console.log(`\n✅ done=${done} err=${err} · 0 boxes`);break;}
    if(Date.now()-settledAt>180000){for(const s of bx){await fetch('https://api.hetzner.cloud/v1/servers/'+s.id,{method:'DELETE',headers:{Authorization:`Bearer ${TOK}`}});console.log('  matei',s.name);}break;}
  } else settledAt=0;
  await sleep(60000);
}
console.log('BOXES FINAIS:',((await boxes())||[]).length);
