'use strict';

function isDuplicateEntryError(error) {
  return (
    error.name === 'SequelizeUniqueConstraintError' ||
    error?.parent?.code === 'ER_DUP_ENTRY' ||
    error?.original?.code === 'ER_DUP_ENTRY'
  );
}

function isForeignKeyConstraintError(error) {
  return (
    error.name === 'SequelizeForeignKeyConstraintError' ||
    error?.parent?.code === 'ER_ROW_IS_REFERENCED_2' ||
    error?.original?.code === 'ER_ROW_IS_REFERENCED_2'
  );
}

module.exports = { isDuplicateEntryError, isForeignKeyConstraintError };
