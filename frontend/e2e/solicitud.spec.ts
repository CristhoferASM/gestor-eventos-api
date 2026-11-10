import { expect, test } from '@playwright/test';
import { iniciarSesion } from './ayudas';

test.describe('Solicitud de modificación (flujo completo del cliente)', () => {
  test('selectores de fecha y hora: un solo ícono, calendario en español y panel con «Listo»', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    await page.locator('.btn-solicitar').click();
    await expect(page.locator('#eventDate')).toBeVisible();

    // Antes había dos íconos por campo (el nativo y el dibujado)
    await expect(page.locator('#wrap_eventDate svg')).toHaveCount(1);
    await expect(page.locator('#wrap_eventStartTime svg')).toHaveCount(1);
    await expect(page.locator('#eventDate')).toHaveValue('15/11/2026');

    await page.locator('#eventDate').click();
    const calendario = page.locator('.flatpickr-calendar.open');
    await expect(calendario).toBeVisible();
    await expect(calendario.locator('.flatpickr-weekday').first()).toHaveText(/Lun/);
    await expect(calendario.locator('.flatpickr-monthDropdown-months')).toContainText('Noviembre');
    await page.keyboard.press('Escape');

    await page.locator('#eventStartTime').click();
    const panel = page.locator('.flatpickr-calendar.open');
    await expect(panel).toContainText('Hora');
    await expect(panel).toContainText('Minutos');
    await panel.getByRole('button', { name: 'Listo' }).click();
    await expect(page.locator('.flatpickr-calendar.open')).toHaveCount(0);
  });

  test('proponer un cambio, revisarlo, enviarlo, consultarlo y retirarlo', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    await page.locator('.btn-solicitar').click();

    // Se adelanta la hora de inicio de 09:00 a 10:00 (el montaje 08:00-09:00 sigue siendo previo al evento)
    await page.locator('#eventStartTime').fill('10:00');
    await page.locator('#eventStartTime').press('Tab');
    await page.locator('#requestReason').fill('Ajuste de agenda por llegada tardía de la mesa de honor');
    await page.getByRole('button', { name: /Continuar a revisión/ }).click();

    // Paso 3: comparativo + bloque informativo de costos referenciales
    await expect(page.locator('.comparativo-tabla')).toContainText('09:00 - 13:00');
    await expect(page.locator('.comparativo-tabla')).toContainText('10:00 - 13:00');
    const costos = page.locator('.bloque-costos-cliente');
    await expect(costos).toContainText('S/ 100');
    await expect(costos).toContainText('S/ 500 / hora');
    await expect(costos).toContainText('Importe final pendiente de revisión por el asesor');

    await page.getByRole('button', { name: /Enviar solicitud de modificación/ }).click();

    // Paso 4: código legible y estado
    await expect(page.getByText(/SOL-\d{4}-001/).first()).toBeVisible();
    await expect(page.getByText('Pendiente de revisión').first()).toBeVisible();

    // Una segunda solicitud pendiente sobre el mismo evento no está permitida
    await page.getByRole('button', { name: /Volver a mis eventos/ }).click();
    await expect(page.locator('.btn-solicitar')).toBeDisabled();

    // Detalle y retiro
    await page.getByRole('button', { name: 'Ver solicitud en trámite' }).click();
    await page.locator('#btn-retirar-solicitud').click();
    await expect(page.getByText('¿Deseas retirar esta solicitud? Tu reserva actual se mantendrá sin cambios.')).toBeVisible();
    await page.locator('#btn-confirmar-retiro').click();

    await expect(page.locator('.toast.ok')).toContainText('Solicitud retirada. Tu reserva se mantiene sin cambios');
    await expect(page.locator('.modal-nota')).toContainText('retirada por el cliente');
    await page.locator('#btn-cerrar-modal-detalle').click();

    // El evento queda libre y la solicitud se conserva en el historial con su insignia
    await expect(page.locator('.btn-solicitar')).toBeEnabled();
    await expect(page.locator('.badge-solicitud-retirada').first()).toContainText('Retirada por el cliente');

    // La reserva original no cambió
    const evento = await (await page.request.get('/api/eventos/1')).json();
    expect(evento.hora_inicio).toBe('09:00');
    expect(evento.hora_fin).toBe('13:00');
  });

  test('el asesor no puede retirar solicitudes del cliente', async ({ page }) => {
    await iniciarSesion(page, 'asesor');
    const respuesta = await page.request.post('/api/solicitudes/1/retirar');
    expect(respuesta.status()).toBe(403);
  });
});

test.describe('Consulta previa de disponibilidad en el formulario', () => {
  test('avisa si el horario choca o está libre antes de enviar la solicitud, sin revelar datos ajenos', async ({ page }) => {
    await iniciarSesion(page, 'cliente');
    await page.locator('.btn-solicitar').click();
    await expect(page.locator('#eventDate')).toHaveValue('15/11/2026');

    // Sin cambios no hay aviso. Se apagan montaje y desmontaje para proponer solo el evento principal.
    await expect(page.locator('#avisoDisponibilidad')).toHaveCount(0);
    await page.locator('#chkMontaje').uncheck();
    await page.locator('#chkDesmontaje').uncheck();

    // El evento 2 (de otro cliente) ocupa el 20/11/2026 de 14:00 a 18:00
    await page.locator('#eventDate').fill('20/11/2026');
    await page.locator('#eventDate').press('Tab');
    await page.locator('#eventStartTime').fill('14:30');
    await page.locator('#eventStartTime').press('Tab');
    await page.locator('#eventEndTime').fill('16:00');
    await page.locator('#eventEndTime').press('Tab');

    const aviso = page.locator('#avisoDisponibilidad');
    await expect(aviso).toContainText('Horario no disponible');
    await expect(aviso).toContainText('ya cuenta con una reserva programada');
    for (const prohibido of ['Encuentro de docentes', 'Consejo', 'CLI-002', 'Duarte']) {
      await expect(aviso).not.toContainText(prohibido);
    }

    // Un horario que solo toca el borde (termina justo cuando empieza el otro evento) está libre
    await page.locator('#eventStartTime').fill('12:00');
    await page.locator('#eventStartTime').press('Tab');
    await page.locator('#eventEndTime').fill('14:00');
    await page.locator('#eventEndTime').press('Tab');
    await expect(aviso).toContainText('Horario disponible');

    // Volver al horario original del evento quita el aviso
    await page.locator('#eventDate').fill('15/11/2026');
    await page.locator('#eventDate').press('Tab');
    await page.locator('#eventStartTime').fill('09:00');
    await page.locator('#eventStartTime').press('Tab');
    await page.locator('#eventEndTime').fill('13:00');
    await page.locator('#eventEndTime').press('Tab');
    await page.locator('#chkMontaje').check();
    await page.locator('#chkDesmontaje').check();
    await expect(page.locator('#avisoDisponibilidad')).toHaveCount(0);
  });
});
