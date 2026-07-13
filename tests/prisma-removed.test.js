'use strict';

const fs = require('fs');
const path = require('path');

describe('Retiro de Prisma', () => {
  test('package.json no lista dependencias de Prisma', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps.prisma).toBeUndefined();
    expect(deps['@prisma/client']).toBeUndefined();
  });

  test('no existen carpetas de Prisma en el repo', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'prisma'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '..', 'src', 'generated'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, '..', 'prisma.config.ts'))).toBe(false);
  });
});
