const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {postStockJson}=require('../src/services/stockHttp');
async function fixture(t, handler) {
 const server=http.createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 return `http://127.0.0.1:${server.address().port}/predict/stock`;
}
test('espera cabeceras demoradas y recibe el JSON completo',async t=>{
 const url=await fixture(t,(req,res)=>setTimeout(()=>res.end('{"ok":true}'),80));
 const result=await postStockJson(url,{test:true},1000);
 assert.equal(result.status,200);assert.deepEqual(JSON.parse(result.text),{ok:true});
});
test('plazo explícito también cubre un cuerpo incompleto',async t=>{
 const url=await fixture(t,(req,res)=>{res.writeHead(200);res.write('{');});
 await assert.rejects(postStockJson(url,{},60),{code:'STOCK_TIMEOUT'});
});
test('conserva errores HTTP del modelo',async t=>{
 const url=await fixture(t,(req,res)=>{res.writeHead(502);res.end('{"error":"fuente externa"}');});
 const result=await postStockJson(url,{},1000);
 assert.equal(result.status,502);assert.match(result.text,/fuente externa/);
});

test('varios potreros no ocupan simultáneamente los hilos necesarios para DMI',async t=>{
 let active=0,maximum=0,received=0,releaseFirst,firstStarted;
 const started=new Promise(resolve=>{firstStarted=resolve;});
 const url=await fixture(t,(req,res)=>{
  if(req.url==='/predict/dmi') {res.end('{"dmi":6}');return;}
  active++;received++;maximum=Math.max(maximum,active);
  const finish=()=>{active--;res.end('{"ok":true}');};
  if(received===1) {releaseFirst=finish;firstStarted();}
  else finish();
 });
 const first=postStockJson(url,{potrero:1},2000);
 await started;
 const second=postStockJson(url,{potrero:2},2000);
 const third=postStockJson(url,{potrero:3},2000);
 const dmi=await fetch(url.replace('/predict/stock','/predict/dmi'));
 assert.deepEqual(await dmi.json(),{dmi:6});
 assert.equal(received,1,'Los demás Stock deben seguir en cola mientras DMI responde.');
 releaseFirst();
 const results=await Promise.all([first,second,third]);
 assert.ok(results.every(r=>r.status===200));
 assert.equal(received,3);
 assert.equal(maximum,1);
});

test('un timeout libera la cola y la siguiente petición conserva su plazo completo',async t=>{
 let received=0;
 const url=await fixture(t,(req,res)=>{
  received++;
  if(received===1) {res.writeHead(200);res.write('{');}
  else res.end('{"ok":true}');
 });
 const first=assert.rejects(postStockJson(url,{potrero:1},150),{code:'STOCK_TIMEOUT'});
 const second=postStockJson(url,{potrero:2},100);
 await first;
 assert.deepEqual(JSON.parse((await second).text),{ok:true});
 assert.equal(received,2);
});
