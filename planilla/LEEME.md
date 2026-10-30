# Planilla de confirmaciones

La invitación manda cada confirmación a una "Aplicación web" de Google Apps Script que vive dentro de una planilla
de Google Sheets de los novios. El código está en `Codigo.gs`.

**Ya está andando (29/10/2026):** la planilla es "Confirmaciones casamiento", en el Drive de nicosan089@gmail.com
(https://docs.google.com/spreadsheets/d/1FNYH5NTOvM-gDEJbslA3YYK5z9GrxtHMkVDs6k4Xx0Y/edit), con la hoja
**Confirmaciones**. La aplicación web está implementada (versión 1) y su dirección ya está en `BODA.planilla`.
Las primeras filas son pruebas ("Invitado de prueba", "Prueba desde la terminal", "Prueba de la invitación") y se
pueden borrar. Los pasos de abajo quedan por si hay que rehacerla en otra cuenta:

1. Entrá a Google Drive con la cuenta de los novios y creá una planilla nueva (Nuevo → Hojas de cálculo de Google).
   Ponele un nombre, por ejemplo "Confirmaciones casamiento".
2. En la planilla: menú **Extensiones → Apps Script**. Se abre el editor con un archivo `Código.gs`.
3. Borrá lo que tiene ese archivo y pegá el contenido completo de `Codigo.gs`. Guardá (Ctrl+S).
4. Arriba, donde dice "Seleccionar función", elegí **probar** y tocá **Ejecutar ▶**. La primera vez Google pide
   permiso para que el script use la planilla: "Revisar permisos" → elegir la cuenta → "Avanzado" →
   "Ir a … (no seguro)" → "Permitir". (Es el aviso estándar para scripts propios.) Al terminar, en la planilla
   tiene que aparecer la hoja **Confirmaciones** con una fila de prueba.
5. Botón azul **Implementar → Nueva implementación**. Tipo: **Aplicación web**.
   - Descripción: lo que quieras.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario** (sin esto los invitados no pueden anotarse).
   Tocá **Implementar** y copiá la **URL de la aplicación web** (termina en `/exec`).
6. Pegá esa dirección en `index.html`, en `BODA.planilla` (hoy está vacía), y publicá.
7. Prueba final: abrí la invitación, confirmá con un nombre de prueba y mirá la planilla: la fila aparece sola.
   La fila de "Invitado de prueba" se puede borrar.

Detalles que conviene saber:

- Las filas se pintan solas según "Asiste": verde si va, rojo si no va (formato condicional de la hoja, puesto por
  `prepararColores`; si alguna vez se borra, volver a ejecutar esa función desde el editor).
- Si después cambiás el código, hay que volver a **Implementar → Administrar implementaciones → editar (lápiz) →
  Versión: Nueva → Implementar**. Así la dirección sigue siendo la misma. Una "Nueva implementación" genera otra
  dirección distinta y habría que cambiarla en `index.html`.
- La invitación guarda en el celular del invitado un código; si vuelve a confirmar, la planilla reemplaza su fila
  en vez de agregar otra. Si confirma desde otro celular, aparece como fila nueva.
- Abrir la dirección `/exec` en un navegador muestra un texto con la cantidad de confirmaciones: sirve para ver
  que la aplicación está viva.
- Google atiende de a pocas confirmaciones a la vez: en una prueba de carga (29/10/2026), de 40 mandadas en el
  mismo segundo entraron 18 y el resto volvió con error. Por eso la invitación reintenta sola con esperas
  crecientes (2, 5, 10, 20 y 40 s) hasta que la planilla contesta `ok`, y si el invitado cierra la página antes,
  lo vuelve a intentar la próxima vez que la abre. Con eso, en la misma prueba entraron las 40. Repetir es
  seguro: el código del invitado hace que se reemplace su fila en vez de duplicarse. El invitado nunca ve un
  error, y su respuesta igual llega por WhatsApp.
- `borrarPruebas` (desde el editor) borra las filas cuyo código empieza con `prueba-` (las de `probar` y las de
  las pruebas de carga).
