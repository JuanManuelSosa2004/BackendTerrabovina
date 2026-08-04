'use strict';

/**
 * No está en el DER de docs/backend-gap-analysis.md, pero es necesaria
 * para RF016/RF017 y RNF006 (token de recuperación de un solo uso, con
 * vencimiento). Se guarda el hash del token, nunca el valor en texto
 * plano, igual que la contraseña (RNF004).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('password_reset_token', {
      id_token: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_usuario: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'usuario',
          key: 'id_usuario',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      expira_en: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      usado_en: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('password_reset_token');
  },
};
