import { defineConfig } from '@playwright/test';

/**
 * Pruebas de extremo a extremo: arrancan un backend Go NUEVO (puerto 8082, datos de prueba en memoria) y el
 * frontend Angular (puerto 4300, con proxy hacia ese backend). No tocan los servidores de desarrollo (8081 y 4200).
 *
 * Ejecutar:  npm run e2e
 * Usa el Chrome instalado en el equipo (no descarga navegadores).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // el backend guarda el estado en memoria y las pruebas lo comparten
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4300',
    channel: 'chrome',
    viewport: { width: 1280, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'go run .',
      cwd: '..',
      url: 'http://127.0.0.1:8082/health',
      // Con E2E_DATABASE_URL las pruebas corren sobre PostgreSQL (use un esquema vacío por corrida); sin ella, en memoria
      env: { API_ADDR: '127.0.0.1:8082', MODO_DEMO: 'true', DATABASE_URL: process.env['E2E_DATABASE_URL'] ?? '' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx ng serve --port 4300 --proxy-config proxy.e2e.conf.json',
      url: 'http://localhost:4300',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
