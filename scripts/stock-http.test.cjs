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
