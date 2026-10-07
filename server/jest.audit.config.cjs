// Deliberately independent from jest.config.js: never load the destructive DB setup.
module.exports = {
  rootDir: '.', testEnvironment: 'node', testMatch: ['<rootDir>/audit-tests/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', esModuleInterop: true }, diagnostics: true }] },
  maxWorkers: 1, cache: false,
  setupFiles: ['<rootDir>/audit-tests/safety.cjs']
}
