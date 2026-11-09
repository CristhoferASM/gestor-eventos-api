import { expect, test } from '@playwright/test';
import { almacenamiento, cerrarSesion, iniciarSesion } from './ayudas';

test.describe('Acceso y sesión', () => {
  test('el cliente entra en dos pasos y la sesión vive en una cookie HttpOnly', async ({ page, context }) => {
    await iniciarSesion(page, 'cliente');
    await expect(page.getByText('Usuario: Promoción Horizonte 2026')).toBeVisible();

    // El token está en una cookie HttpOnly + SameSite=Strict, que JavaScript no puede leer
    const cookies = await context.cookies();
    const sesion = cookies.find((c) => c.name === 'showtech_sesion');
    expect(sesion?.httpOnly).toBe(true);
    expect(sesion?.sameSite).toBe('Strict');

    const { cookieLegible, sesion: guardada } = await almacenamiento(page);
    expect(cookieLegible).not.toContain('showtech_sesion');
    expect(guardada).not.toContain(sesion!.value); // el token no está en sessionStorage
    expect(guardada).toContain('CLI-001');
  });

  test('la sesión sobrevive a recargar la página y se cierra con «Cerrar sesión»', async ({ page, context }) => {
    await iniciarSesion(page, 'cliente');
    await page.reload();
    await expect(page.getByText('Cerrar sesión')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toHaveCount(0);

    await cerrarSesion(page);
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'showtech_sesion')).toBeUndefined();

    // Con la cookie borrada, la API ya no responde datos
    const respuesta = await page.request.get('/api/eventos');
    expect(respuesta.status()).toBe(401);
  });

  test('credenciales incorrectas muestran un error y no avanzan', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Correo electrónico').fill('cliente@horizonte.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toHaveCount(0);
  });

  test('un código incorrecto se rechaza y se puede corregir', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Cliente', exact: true }).click();
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();

    for (let i = 0; i < 6; i++) {
      await page.locator('.casilla-codigo').nth(i).fill('0');
    }
    await page.getByRole('button', { name: 'Verificar e ingresar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'incorrecto' })).toBeVisible();

    await page.getByRole('button', { name: 'Autocompletar' }).click();
    await page.getByRole('button', { name: 'Verificar e ingresar' }).click();
    await expect(page.getByText('Cerrar sesión')).toBeVisible();
  });

  test('tras demasiados intentos fallidos el correo se bloquea temporalmente', async ({ page }) => {
    await page.goto('/');
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('Correo electrónico').fill('intruso@ejemplo.com');
      await page.getByLabel('Contraseña', { exact: true }).fill('mala' + i);
      await page.getByRole('button', { name: 'Ingresar' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Demasiados intentos fallidos' })).toBeVisible();
  });

  test('el cliente solo ve su evento y el asesor ve todos', async ({ page, request }) => {
    await iniciarSesion(page, 'cliente');
    await expect(page.getByText('Ceremonia de graduación')).toBeVisible();
    await expect(page.getByText('Encuentro de docentes')).toHaveCount(0);

    const ajeno = await page.request.get('/api/eventos/2');
    expect(ajeno.status()).toBe(404);
    await cerrarSesion(page);
    // Al cerrar sesión la página se recarga: se espera a que vuelva el login antes de seguir
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();

    await iniciarSesion(page, 'asesor');
    await expect(page.getByText('Ceremonia de graduación').first()).toBeVisible();
    await expect(page.getByText('Encuentro de docentes').first()).toBeVisible();
    void request;
  });
});
