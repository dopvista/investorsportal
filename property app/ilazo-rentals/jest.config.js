/**
 * Tests cover the platform-agnostic layers (core/ + store/) and run in plain
 * Node — no React Native runtime required, so they're fast and deterministic.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/core', '<rootDir>/store'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: { jsx: 'react-jsx', module: 'commonjs', types: ['jest', 'node'] } },
    ],
  },
};
