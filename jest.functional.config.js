'use strict';
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/functional/**/*.functional.test.js',
    '**/__tests__/integration/**/*.integration.test.js',
  ],
  clearMocks: true,
  resetMocks: false,   // preserve mock state (in-memory DB) between tests within a file
  testTimeout: 30000,  // PGlite bootstrap can take a few seconds
  reporters: [
    'default',
    [
      'jest-html-reporter',
      {
        pageTitle:         'Koop API — Reporte de Pruebas Funcionales',
        outputPath:        'reports/functional-test-report.html',
        includeFailureMsg: true,
        includeConsoleLog: false,
        sort:              'titleAsc',
        dateFormat:        'yyyy-mm-dd HH:MM:ss',
      },
    ],
  ],
};
