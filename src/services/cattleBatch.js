'use strict';
async function createBatch({animals,potrero}, d) {
  if (!Array.isArray(animals) || !animals.length || animals.length>1000) throw Object.assign(Error('El lote debe contener entre 1 y 1000 animales.'),{status:400});
  const prepared=animals.map(body=>{
    const error=d.validate(body,{requiereNumeroIdentificacion:false});
    if(error) throw Object.assign(Error(error),{status:400});
    let date;
    try {date=d.entryDate(body.dias_previos_potrero);} catch(e){throw Object.assign(e,{status:400});}
    if(body.fecha_nacimiento && date<body.fecha_nacimiento) throw Object.assign(Error('Entrada anterior al nacimiento.'),{status:400});
    return {body,date};
  });
  const prediction=await d.predict({animales:prepared.map(({body},i)=>d.mapAnimal({...body,id_ganado:String(i)}))});
  const rates=new Map((prediction.predicciones??[]).map(p=>[String(p.animal_id),p.dmi_kg_dia]));
  prepared.forEach((p,i)=>{const raw=rates.get(String(i)); if(raw==null||!Number.isFinite(Number(raw))||Number(raw)<0) throw Object.assign(Error('DMI del lote incompleto. No se registraron animales.'),{status:502}); p.rate=Number(raw);});
  const created=await d.transaction(async t=>{
    await d.lock(potrero.id_potrero,t);
    const first=await d.count(potrero.id_potrero,t), result=[];
    for(const [i,{body,date,rate}] of prepared.entries()) {
      const {fecha_nacimiento,sexo,categoria,peso_kg,condicion_corporal,estado_fisiologico,observaciones}=body;
      const animal=await d.create({id_estancia:potrero.id_estancia,numero_identificacion:`${potrero.id_estancia}-${potrero.id_potrero}-${first+i+1}`,fecha_nacimiento,sexo,categoria,peso_kg,condicion_corporal,estado_fisiologico,observaciones},t);
      await d.assign({id_ganado:animal.id_ganado,id_potrero:potrero.id_potrero,fecha_desde:date,estado:'ACTIVA',dmi_ingreso_kg_dia:rate},t);
      result.push(animal);
    }
    return result;
  });
  return {animales:created,actualizacion_stock:d.refresh(potrero.id_potrero,undefined,true)};
}
module.exports={createBatch};
