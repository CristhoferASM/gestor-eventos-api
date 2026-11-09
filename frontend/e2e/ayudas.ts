import { Page, expect } from '@playwright/test';

/** Entra con una cuenta demo: correo y contraseña, y luego el código de prueba que muestra la pantalla. */
export async function iniciarSesion(page: Page, cuenta: 'cliente' | 'asesor'): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: cuenta === 'cliente' ? 'Cliente' : 'Asesor', exact: true }).click();
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
  await page.getByRole('button', { name: 'Autocompletar' }).click();
  await page.getByRole('button', { name: 'Verificar e ingresar' }).click();

  await expect(page.getByText('Cerrar sesión')).toBeVisible();
}

/** Cierra la sesión y espera a que la página termine de recargarse (App recarga para descartar datos del usuario). */
export async function cerrarSesion(page: Page): Promise<void> {
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Cerrar sesión' }).click()]);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
}

/** Estado del almacenamiento del navegador, para comprobar que no hay secretos en JavaScript. */
export async function almacenamiento(page: Page): Promise<{ cookieLegible: string; sesion: string }> {
  return page.evaluate(() => ({
    cookieLegible: document.cookie,
    sesion: sessionStorage.getItem('showtech_sesion') ?? '',
  }));
}
