/** Jest 설정: 순수 TS 로직(DB 쿼리·계산·백업) 테스트용, Node 환경 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          isolatedModules: true,
          rootDir: '.',
          module: 'commonjs',
          moduleResolution: 'node10',
          target: 'ES2022',
          esModuleInterop: true,
          resolveJsonModule: true,
          strict: true,
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
};
