import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { iniciarSesion } from './ayudas';

/** Reglas WCAG 2.0/2.1 A y AA. Devuelve un resumen legible de las violaciones encontradas. */
async function auditar(page: Page): Promise<string[]> {
  const resultado = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return resultado.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} (${v.impact}) en ${n.target.join(' ')}: ${n.any[0]?.message ?? v.help}`),
  );
}

test.describe('Accesibilidad (axe-core, WCAG 2.1 A y AA)', () => {
  test('pantalla de login', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    expect(await auditar(page)).toEqual([]);
  });

  test('pantalla de verificación del código', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Cliente', exact: true }).click();
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    expect(await auditar(page)).toEqual([]);
  });

  test('portal del cliente: lista de eventos', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    await expect(page.getByText('Ceremonia de graduación')).toBeVisible();
    expect(await auditar(page)).toEqual([]);
  });

  test('portal del cliente: formulario de propuesta', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    await page.locator('.btn-solicitar').click();
    await expect(page.locator('#eventDate')).toBeVisible();
    expect(await auditar(page)).toEqual([]);
  });

  test('portal del asesor', async ({ page }) => {
    await iniciarSesion(page, 'asesor');
    await expect(page.getByText('Ceremonia de graduación').first()).toBeVisible();
    expect(await auditar(page)).toEqual([]);
  });
});

test.describe('Móvil (390 px de ancho)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function sinDesborde(page: Page): Promise<void> {
    const { ancho, visible } = await page.evaluate(() => ({
      ancho: document.documentElement.scrollWidth,
      visible: window.innerWidth,
    }));
    expect(ancho, `la página se desborda horizontalmente (${ancho}px > ${visible}px)`).toBeLessThanOrEqual(visible);
  }

  test('login y verificación sin desborde horizontal', async ({ page }) => {
    await page.goto('/');
    await sinDesborde(page);
    await page.getByRole('button', { name: 'Cliente', exact: true }).click();
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('heading', { name: 'Revisa tu correo' })).toBeVisible();
    await sinDesborde(page);
  });

  test('portal del cliente y formulario sin desborde horizontal', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    await sinDesborde(page);
    await page.locator('.btn-solicitar').click();
    await expect(page.locator('#eventDate')).toBeVisible();
    await sinDesborde(page);
  });

  test('portal del asesor sin desborde horizontal', async ({ page }) => {
    await iniciarSesion(page, 'asesor');
    await sinDesborde(page);
  });
});
