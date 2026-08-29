process.loadEnvFile('.env.local');
const key = process.env.ANTHROPIC_API_KEY;
console.log('ANTHROPIC key prefix:', key ? key.slice(0,14)+'...' : 'AUSENTE');
for (const model of ['claude-sonnet-5','claude-sonnet-4-6']) {
  let ok=0, fail='';
  for (let i=1;i<=3;i++){
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({ model, max_tokens:20, messages:[{role:'user',content:'diga OK'}] }),
      });
      const j = await res.json();
      if (res.ok) ok++; else fail = `${res.status} ${(j.error?.message||'').slice(0,70)}`;
    } catch(e){ fail = e.message; }
  }
  console.log(`${model.padEnd(20)} ok=${ok}/3 ${fail?('FAIL: '+fail):''}`);
}
