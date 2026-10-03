const test=require('node:test');
const assert=require('node:assert/strict');
const {validarDatosGanado}=require('../src/utils/ganadoInput');
const base={categoria:'TERNERO',sexo:'M',peso_kg:90};
test('invalid enums and impossible birthdays yield validation messages',()=>{
  for(const patch of [{sexo:'X'},{categoria:'CABALLO'},{estado_fisiologico:'INVALIDO'},
    {fecha_nacimiento:'2026-02-31'},{fecha_nacimiento:'2027-01-01'},
    {fecha_nacimiento:'2026-10-03T12:00:00Z'},{fecha_nacimiento:'0000-01-01'}]){
    assert.ok(validarDatosGanado({...base,...patch},'2026-10-03'));
  }
});
test('valid enums, nullable optional values and leap days are accepted',()=>{
  for(const patch of [{},{sexo:'F'},{estado_fisiologico:null,fecha_nacimiento:null},
    {fecha_nacimiento:'2024-02-29'},...['N','L','P','B','P/L','B/L','N/P','DESCONOCIDO'].map(estado_fisiologico=>({estado_fisiologico}))]){
    assert.equal(validarDatosGanado({...base,...patch},'2026-10-03'),null);
  }
});
