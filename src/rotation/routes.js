const router=require('express').Router({mergeParams:true});
const S=require('./paddockService');
router.use(require('../middlewares/auth.middleware').requireAuth);
router.use(require('../middlewares/ownership.middleware').requireEstanciaOwnership());
router.use((req,res,next)=>process.env.ROTATION_ENABLED!=='false'?next():res.status(404).json({error:'Rotación no habilitada.'}));
router.use((req,res,next)=>require('./startup').isReady()?next():res.status(503).json({error:'El módulo de rotación no está disponible. Revisá las migraciones del módulo.'}));
const handle=fn=>async(req,res)=>{try{res.json(await fn(Number(req.params.estanciaId),req));}catch(e){if(e.status)return res.status(e.status).json({error:e.message});throw e;}};
router.get('/',handle(id=>S.getState(id)));
router.put('/availability',handle((id,r)=>S.saveAvailability(id,r.body)));
router.post('/refresh',handle(id=>S.refresh(id)));
// Saved detailed plans remain in the database for recovery, but cannot execute
// through a stale browser after switching to recommendations by quantity.
router.use((req,res)=>res.status(410).json({error:'Rotación ahora recomienda cantidades por potrero. Recargá la pantalla.'}));
module.exports=router;
