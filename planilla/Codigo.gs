// Recibe las confirmaciones de la invitación y las anota en la hoja "Confirmaciones" de esta planilla.
// Se publica como "Aplicación web" (ver LEEME.md) y su dirección va en BODA.planilla, en index.html.
//
// La invitación manda un JSON como este:
//   { boda, id, asiste: 'si' | 'no', nombre, bebidas: [], comida: [], comidaOtra, cancion, mensaje }
// "id" es un código que la invitación guarda en el celular del invitado: si la misma persona vuelve a confirmar,
// llega el mismo código y acá se reemplaza su fila en vez de duplicarla.

const HOJA = 'Confirmaciones';
const BODA = 'nati-y-mati';
const COLUMNAS = ['Fecha', 'Código', 'Asiste', 'Nombre', 'Bebidas', 'Comida', 'Comida (otra)', 'Canción', 'Mensaje', 'Actualizado'];

// El cerrojo es imprescindible: sin él, con muchos pedidos a la vez las filas se pisan (probado el 30/10/2026: de
// 79 pedidos que respondieron "ok" quedaron 17 filas). Cada pedido espera su turno hasta 60 s; Google además
// atiende unas 30 ejecuciones a la vez y rechaza el resto, pero la invitación reintenta hasta recibir "ok".
function doPost(e) {
  const cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(60000);
  try {
    const datos = JSON.parse(e.postData.contents);
    if (datos.boda !== BODA) return respuesta({ ok: false, error: 'boda desconocida' });
    const hoja = obtenerHoja();
    const ahora = new Date();
    const fila = [
      ahora,
      String(datos.id || ''),
      datos.asiste === 'no' ? 'No va' : 'Sí',
      String(datos.nombre || '').trim(),
      (datos.bebidas || []).join(', '),
      (datos.comida || []).join(', '),
      String(datos.comidaOtra || '').trim(),
      String(datos.cancion || '').trim(),
      String(datos.mensaje || '').trim(),
      ahora
    ];
    const existente = buscarFila(hoja, fila[1]);
    if (existente) {
      // Conserva la fecha de la primera confirmación y actualiza el resto
      fila[0] = hoja.getRange(existente, 1).getValue() || ahora;
      hoja.getRange(existente, 1, 1, COLUMNAS.length).setValues([fila]);
    } else {
      hoja.appendRow(fila);
    }
    return respuesta({ ok: true, fila: existente || hoja.getLastRow() });
  } catch (err) {
    return respuesta({ ok: false, error: String(err) });
  } finally {
    cerrojo.releaseLock();
  }
}

// Abrir la dirección de la aplicación web en el navegador muestra esto: sirve para ver que está viva
function doGet() {
  const hoja = obtenerHoja();
  return respuesta({ ok: true, hoja: HOJA, confirmaciones: Math.max(0, hoja.getLastRow() - 1) });
}

function obtenerHoja() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA);
  if (!hoja) hoja = libro.insertSheet(HOJA);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(COLUMNAS);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, COLUMNAS.length).setFontWeight('bold');
    prepararColores(hoja);
  }
  return hoja;
}

// Cada fila se pinta según la columna "Asiste": verde si va, rojo si no va. Es formato condicional de la hoja,
// así que vale para las filas que ya están y para las que lleguen, y sigue a la celda si alguien la edita a mano.
// Se puede ejecutar desde el editor (Ejecutar ▶ con esta función elegida) para aplicarlo a una hoja ya creada.
const VERDE = '#D9EAD3', ROJO = '#F4CCCC';
function prepararColores(hoja) {
  hoja = hoja || obtenerHoja();
  const filas = hoja.getRange('A2:' + columnaLetra(COLUMNAS.length) + hoja.getMaxRows());
  const reglas = [
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="Sí"').setBackground(VERDE).setRanges([filas]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$C2="No va"').setBackground(ROJO).setRanges([filas]).build()
  ];
  // Reemplaza las reglas anteriores de esta hoja para no acumularlas
  hoja.setConditionalFormatRules(reglas);
}

function columnaLetra(n) {
  let letra = '';
  while (n > 0) { const resto = (n - 1) % 26; letra = String.fromCharCode(65 + resto) + letra; n = Math.floor((n - 1) / 26); }
  return letra;
}

function buscarFila(hoja, id) {
  if (!id) return 0;
  const ultima = hoja.getLastRow();
  if (ultima < 2) return 0;
  const codigos = hoja.getRange(2, 2, ultima - 1, 1).getValues();
  for (let i = 0; i < codigos.length; i++) {
    if (String(codigos[i][0]) === id) return i + 2;
  }
  return 0;
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Borra las filas de prueba (código que empieza con "prueba-" o nombre que empieza con "Prueba") y las filas
// que quedaron vacías en el medio (por ejemplo si se borró el contenido en vez de la fila), de abajo hacia arriba
function borrarPruebas() {
  const hoja = obtenerHoja();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return;
  const filas = hoja.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues();
  let borradas = 0;
  for (let i = filas.length - 1; i >= 0; i--) {
    const codigo = String(filas[i][1]), nombre = String(filas[i][3]);
    const vacia = filas[i].every(function (celda) { return celda === '' || celda === null; });
    if (vacia || codigo.indexOf('prueba-') === 0 || /^prueba\b/i.test(nombre.trim())) { hoja.deleteRow(i + 2); borradas++; }
  }
  Logger.log('Filas borradas (de prueba o vacías): ' + borradas);
}

// Para probar desde el editor (Ejecutar ▶ con esta función elegida): anota una confirmación de ejemplo.
// La primera vez Google pide autorizar el acceso a la planilla; es normal.
function probar() {
  const ejemplo = {
    boda: BODA, id: 'prueba-' + Date.now().toString(36), asiste: 'si', nombre: 'Invitado de prueba',
    bebidas: ['Gin tonic', 'Champagne'], comida: ['Vegetariano'], comidaOtra: '', cancion: 'Marry You', mensaje: '¡Felicitaciones!'
  };
  const salida = doPost({ postData: { contents: JSON.stringify(ejemplo) } });
  Logger.log(salida.getContent());
}
