process.loadEnvFile('.env.local');
const key = process.env.OPENAI_API_KEY;
console.log('OPENAI_API_KEY prefix:', key ? key.slice(0,12)+'...' : 'AUSENTE', '| len', key?.length);
console.log('OPENAI_PROJECT?', process.env.OPENAI_PROJECT || process.env.OPENAI_PROJECT_ID || '(nenhum)');
console.log('OPENAI_ORG?', process.env.OPENAI_ORG || process.env.OPENAI_ORG_ID || '(nenhum)');
for (let i=1;i<=6;i++){
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${key}` },
      body: JSON.stringify({ model:'gpt-5.6-luna', messages:[{role:'user',content:'diga OK'}], max_completion_tokens:20 }),
    });
    const j = await res.json();
    console.log(`#${i} status=${res.status} ${res.ok ? 'OK: '+(j.choices?.[0]?.message?.content||'').slice(0,20) : 'ERR: '+(j.error?.message||'').slice(0,60)}`);
  } catch(e){ console.log(`#${i} EXC ${e.message}`); }
}
