'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`CREATE TABLE IF NOT EXISTS analisis_intrapotrero (
      id_potrero INT NOT NULL PRIMARY KEY,
      geometry_hash CHAR(64) NOT NULL,
      detalle_json JSON NOT NULL,
      updated_at DATETIME NOT NULL,
      CONSTRAINT fk_intrapotrero_potrero FOREIGN KEY (id_potrero) REFERENCES potrero(id_potrero)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('analisis_intrapotrero');
  },
};
