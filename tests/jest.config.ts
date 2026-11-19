import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testMatch: ['<rootDir>/tests/e2e/**/*.spec.ts', '<rootDir>/tests/sit/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tests/tsconfig.json',
      },
    ],
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  maxWorkers: 1,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  verbose: true,
};

export default config;
