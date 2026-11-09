import { expect, test } from '@playwright/test';
import { cerrarSesion, iniciarSesion } from './ayudas';

test.describe('Reglas avanzadas (atajo diario, vínculo de cuentas, disponibilidad y CORS)', () => {
  test('el asesor verifica el código una sola vez al día en el mismo navegador, pero la contraseña se pide siempre', async ({ page }) => {
    await iniciarSesion(page, 'asesor');
    await cerrarSesion(page);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    // Segundo ingreso: con la contraseña basta, no aparece «Revisa tu correo»
    await page.getByRole('button', { name: 'Asesor', exact: true }).click();
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toHaveCount(0);
    await cerrarSesion(page);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    // Con una contraseña incorrecta NO se entra aunque el código ya se haya verificado hoy
    await page.getByLabel('Correo electrónico').fill('asesor@showtech.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
  });

  test('el cliente siempre verifica el código (no tiene atajo diario)', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    await cerrarSesion(page);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    await page.getByRole('button', { name: 'Cliente', exact: true }).click();
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await expect(page.getByText('una vez al día')).toHaveCount(0);
  });

  test('el asesor puede abrir el panel de vínculo de cuentas de Google', async ({ page }) => {
    await iniciarSesion(page, 'asesor');
    await page.getByRole('button', { name: 'Cuentas de Google' }).click();
    await expect(page.getByRole('heading', { name: 'Cuentas de Google pendientes de vincular' })).toBeVisible();
    await expect(page.getByText('No hay cuentas de Google pendientes de vincular.')).toBeVisible();
  });

  test('el cliente no puede usar las rutas de vínculo (403)', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    for (const ruta of ['/api/clientes', '/api/usuarios/pendientes-de-vinculo']) {
      expect((await page.request.get(ruta)).status()).toBe(403);
    }
    const vincular = await page.request.post('/api/usuarios/vincular', { data: { correo: 'x@y.com', cliente_id: 'CLI-002' } });
    expect(vincular.status()).toBe(403);
  });

  test('una solicitud que choca con otra reserva se rechaza sin revelar datos ajenos', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    // El evento 2 (de otro cliente) ocupa el 20/11/2026 de 14:00 a 18:00
    const choque = await page.request.post('/api/solicitudes', {
      data: {
        evento_id: 1, motivo: 'Probar choque de horario',
        fecha_propuesta: '2026-11-20', hora_inicio_propuesta: '15:00', hora_fin_propuesta: '16:00',
      },
    });
    expect(choque.status()).toBe(409);
    const cuerpo = JSON.stringify(await choque.json());
    expect(cuerpo).toContain('ya cuenta con una reserva programada');
    for (const prohibido of ['Encuentro de docentes', 'Consejo', 'CLI-002', 'Duarte']) {
      expect(cuerpo).not.toContain(prohibido);
    }
  });

  test('CORS: un origen desconocido no recibe cabeceras de autorización', async ({ request }) => {
    const mal = await request.get('/api/health', { headers: { Origin: 'http://sitio-malicioso.test' } });
    expect(mal.status()).toBe(200);
    expect(mal.headers()['access-control-allow-origin']).toBeUndefined();

    const bien = await request.get('/api/health', { headers: { Origin: 'http://localhost:4200' } });
    expect(bien.headers()['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(bien.headers()['access-control-allow-origin']).not.toBe('*');
  });
});
