module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.spec.js'],
  moduleFileExtensions: ['js'],
  transform: {},
  verbose: true,
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/test/**',
    '!**/tests/**',
    '!**/*.config.js',
    '!**/background.js',
    '!**/content-script.js',
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
