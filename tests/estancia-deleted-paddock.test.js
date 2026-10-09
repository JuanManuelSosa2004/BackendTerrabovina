'use strict';
process.env.NODE_ENV='test';
jest.mock('../src/controllers/estimacion.controller',()=>({
 iniciarStock:()=>({estado:'PENDIENTE'}),
 crearEstimacionForrajera:jest.fn(),historicoForrajera:jest.fn(),crearEstimacionNutricional:jest.fn(),historicoNutricional:jest.fn(),
 crearEstimacionStock:jest.fn(),estadoTareaStock:jest.fn(),ultimaEstimacionStock:jest.fn(),historicoStock:jest.fn(),
}));
const request=require('supertest'),jwt=require('jsonwebtoken');
const {sequelize,Usuario}=require('../src/database/models');const app=require('../src/app');
const rect=(x,y,w)=>({type:'Polygon',coordinates:[[[x,y],[x+w,y],[x+w,y+w],[x,y+w],[x,y]]]});
afterAll(()=>sequelize.close());
test('active paddock constrains farm geometry; deleted historical paddock does not',async()=>{
 const [u]=await Usuario.findOrCreate({where:{email:'steaven3456@gmail.com'},defaults:{nombre:'Steven local geometry test',password_hash:'test-only'}});
 const token=jwt.sign({id_usuario:u.id_usuario},process.env.JWT_SECRET);
 const api=(method,url,body)=>request(app)[method]('/api/v2'+url).set('Authorization',`Bearer ${token}`).send(body);
 const f=await api('post','/estancia',{nombre:'AUDIT deleted geometry regression',geom:rect(-57.91,-28.91,.02)});expect(f.status).toBe(201);
 const p=await api('post',`/estancia/${f.body.id_estancia}/potrero`,{nombre:'AUDIT P',geom:rect(-57.909,-28.909,.002)});expect(p.status).toBe(201);
 const changed={geom:rect(-57.87,-28.87,.02)};
 expect((await api('patch',`/estancia/${f.body.id_estancia}`,changed)).status).toBe(400);
 expect((await api('delete',`/potrero/${p.body.id_potrero}`)).status).toBe(200);
 expect((await api('patch',`/estancia/${f.body.id_estancia}`,changed)).status).toBe(200);
 expect((await api('delete',`/estancia/${f.body.id_estancia}`)).status).toBe(200);
});
