const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const PasswordResetToken = sequelize.define(
  'PasswordResetToken',
  {
    id_token: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    id_usuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    token_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    expira_en: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usado_en: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'password_reset_token',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    underscored: true,
  }
);

module.exports = PasswordResetToken;
