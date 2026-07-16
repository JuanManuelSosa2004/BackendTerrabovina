'use strict';

function isDuplicateEntryError(error) {
  return (
    error.name === 'SequelizeUniqueConstraintError' ||
    error?.parent?.code === 'ER_DUP_ENTRY' ||
    error?.original?.code === 'ER_DUP_ENTRY'
  );
}

module.exports = { isDuplicateEntryError };
