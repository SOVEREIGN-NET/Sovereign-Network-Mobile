module.exports = {
  displayName: 'e2e',
  testMatch: ['**/e2e/tests/**/*.e2e.ts'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  testRunner: 'jest-circus/runner',
  testTimeout: 120000,
  reporters: ['detox/runners/jest/reporter'],
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  setupFilesAfterEnv: ['<rootDir>/e2e/init.ts'],
};
