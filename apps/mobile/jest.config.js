/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // Only run pure TS tests that have no React Native dependencies
  testMatch: [
    '**/__tests__/calibrationService.test.ts',
    '**/__tests__/languageMapping.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['babel-jest', {
      presets: ['babel-preset-expo'],
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@crashguard/types$': '<rootDir>/../../packages/types/src/index.ts',
    '^@crashguard/constants$': '<rootDir>/../../packages/constants/src/index.ts',
  },
};
