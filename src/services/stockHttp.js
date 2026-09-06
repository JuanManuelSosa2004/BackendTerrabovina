'use strict';
const http = require('node:http');
const https = require('node:https');

// Una única fecha límite cubre conexión, cabeceras y cuerpo completo.
// No usa fetch: su plazo interno de cabeceras puede cortar el cálculo a los 5 min.
function postStockJson(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const transport = target.protocol === 'https:' ? https : target.protocol === 'http:' ? http : null;
    if (!transport) return reject(new Error('Protocolo del modelo no soportado.'));
    const payload = JSON.stringify(body);
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const request = transport.request(target, {
      method: 'POST', agent: false,
      headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)},
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', error => finish(error));
      response.on('aborted', () => finish(Object.assign(new Error('Respuesta interrumpida'), {code:'ECONNRESET'})));
      response.on('end', () => finish(null, {status:response.statusCode, text:Buffer.concat(chunks).toString('utf8')}));
    });
    request.on('error', error => finish(error));
    timer = setTimeout(() => {
      const error = Object.assign(new Error('Tiempo de espera de Stock agotado'), {code:'STOCK_TIMEOUT'});
      finish(error);
      request.destroy(error);
    }, timeoutMs);
    request.end(payload);
  });
}
module.exports = {postStockJson};
