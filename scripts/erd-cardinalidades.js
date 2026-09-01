// Genera un ERD con el mismo estilo visual que `npm run erd` (mismo motor
// graphviz/circo, mismas cajas celeste con columnas subrayadas), pero:
//   1. no fusiona relaciones distintas que comparten par de tablas
//      (sequelize-erd las colapsa si solo mira nombres de modelo, p. ej.
//      Potrero->TrasladoGanado origen/destino terminaban en una sola línea)
//   2. agrega "1"/"N" en cada punta de línea y el nombre de la FK en el medio
const { writeFileSync } = require('fs');
const { join } = require('path');
const Vis = require('sequelize-erd/graphvis');
const { Module, render } = require('sequelize-erd/visRenderer');
const db = require('../src/database/models');

const Sequelize = db.sequelize.constructor;

// Mismo mapeo de flechas que sequelize-erd (crow = "muchos", none = "uno").
const ARROW_SHAPES = {
  BelongsToMany: ['none', 'crow'],
  BelongsTo: ['crow', 'none'],
  HasMany: ['none', 'crow'],
  HasOne: ['none', 'none'],
};

const SHAPE_TO_CARDINALITY = { crow: 'N', none: '1' };

function typeName(columnType) {
  if (typeof columnType === 'string') return columnType;
  for (const name in Sequelize.DataTypes) {
    const type = Sequelize.DataTypes[name];
    if (columnType instanceof type && name !== 'ABSTRACT') return name;
  }
}

function customAttribute(attribute) {
  if (attribute.primaryKey) return `<u>${attribute.fieldName}</u>`;
  if (attribute.references) return `<u><i>${attribute.fieldName}</i></u>`;
  return attribute.fieldName;
}

function attributeTemplate(attribute, i) {
  return `<tr><td port="${i}" align="left">${customAttribute(attribute)}: ${typeName(attribute.type)}</td></tr>`;
}

function modelTemplate(model) {
  return `"${model.name}" [shape=none, margin=0, label=<<table border="0" cellborder="1" cellspacing="0" cellpadding="4">
    <tr><td bgcolor="lightblue"><b>${model.name}</b></td></tr>
    ${Object.values(model.rawAttributes).map(attributeTemplate).join('\n')}
  </table>>]`;
}

// Agrupa por (modelo A, modelo B, foreignKey) en vez de solo (modelo A,
// modelo B): así el hasMany y su belongsTo inverso -que comparten FK- se
// siguen dibujando como una única línea, pero dos relaciones distintas
// entre el mismo par de tablas (p. ej. origen/destino) quedan separadas.
function relationships(associations, arrowSize = 0.6) {
  const groups = new Map();

  for (const association of associations) {
    const sourceName = association.source.name;
    const targetName = association.through ? association.through.model.name : association.target.name;
    const fk = Array.isArray(association.foreignKey) ? association.foreignKey.join('+') : association.foreignKey;
    const key = [sourceName, targetName].sort().join('::') + '::' + fk;
    const shapes = ARROW_SHAPES[association.associationType];

    if (!groups.has(key)) groups.set(key, { fk, shapesByModel: {}, order: [] });
    const group = groups.get(key);
    if (!(sourceName in group.shapesByModel)) group.order.push(sourceName);
    if (!(targetName in group.shapesByModel)) group.order.push(targetName);
    group.shapesByModel[sourceName] = shapes[0];
    group.shapesByModel[targetName] = shapes[1];
  }

  return [...groups.values()].map(({ shapesByModel, order }) => {
    const sourceName = order[0];
    const targetName = order[1] || order[0];
    const sourceShape = shapesByModel[sourceName];
    const targetShape = shapesByModel[targetName];
    const tailLabel = SHAPE_TO_CARDINALITY[sourceShape] || '1';
    const headLabel = SHAPE_TO_CARDINALITY[targetShape] || '1';
    const selfLoop = sourceName === targetName;

    return `"${sourceName}" -> "${targetName}" [arrowtail=${sourceShape}, arrowhead=${selfLoop ? 'none' : targetShape}, dir=both, arrowsize=${arrowSize}, ` +
      `taillabel="${tailLabel}", headlabel="${selfLoop ? tailLabel : headLabel}", labeldistance=1.8, labelfontsize=9, labelfontcolor="#0b4f6c"]`;
  });
}

function generateDot(models) {
  const modelsArr = Object.values(models);
  const associationsArr = modelsArr.reduce(
    (result, model) => [
      ...result,
      ...Object.values(model.associations).filter(
        (association) => !!models[association.source.name] && !!models[association.target.name]
      ),
    ],
    []
  );

  return `
  digraph models_diagram {
    graph [pad="0.5", nodesep=".5", ranksep="2", overlap="false"];
    edge [concentrate=true, color=black, penwidth=0.75];
    node[fontsize=10];
    rankdir=LR;
    ${modelsArr.map(modelTemplate).join('\n')}
    ${relationships(associationsArr).join('\n')}
}`;
}

const dotSource = generateDot(db.sequelize.models);
const vis = new Vis({ Module, render });
const destination = join(__dirname, '..', 'erd-cardinalidades.svg');

vis
  .renderString(dotSource, { format: 'svg', engine: 'circo' })
  .then((svg) => {
    writeFileSync(destination, svg);
    console.log('ERD con cardinalidades generado en', destination);
    setTimeout(() => process.exit(0), 200);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
