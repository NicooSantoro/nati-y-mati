// Recibe las confirmaciones de la invitación y las anota en la hoja "Confirmaciones" de esta planilla.
// Se publica como "Aplicación web" (ver LEEME.md) y su dirección va en BODA.planilla, en index.html.
//
// La invitación manda un JSON como este:
//   { boda, id, asiste: 'si' | 'no', nombre, bebidas: [], comida: [], comidaOtra, cancion, mensaje }
// "id" es un código que la invitación guarda en el celular del invitado: si la misma persona vuelve a confirmar,
// llega el mismo código y acá se reemplaza su fila en vez de duplicarla.

const HOJA = 'Confirmaciones';
const HOJA_LOG = 'Log';
const HOJA_RESUMEN = 'Resumen';
const BODA = 'nati-y-mati';
const COLUMNAS = ['Fecha', 'Código', 'Asiste', 'Nombre', 'Bebidas', 'Comida', 'Comida (otra)', 'Canción', 'Mensaje', 'Actualizado'];
// Lo que la invitación puede mandar: cualquier otra cosa se descarta o se recorta
const BEBIDAS = ['Fernet', 'Gin tonic', 'Cerveza', 'Champagne', 'Aperol', 'Whiskey', 'Sin alcohol'];
const COMIDAS = ['Ninguna', 'Vegetariano', 'Vegano', 'Sin TACC', 'Otra'];
const LARGO = { id: 40, nombre: 80, comidaOtra: 200, cancion: 200, mensaje: 1000 };

// El cerrojo es imprescindible: sin él, con muchos pedidos a la vez las filas se pisan (probado el 30/10/2026: de
// 79 pedidos que respondieron "ok" quedaron 17 filas). Cada pedido espera su turno hasta 60 s; Google además
// atiende unas 30 ejecuciones a la vez y rechaza el resto, pero la invitación reintenta hasta recibir "ok".
function doPost(e) {
  const cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(60000);
  try {
    const crudo = e.postData.contents;
    const datos = validar(JSON.parse(crudo));
    if (!datos) return respuesta({ ok: false, error: 'datos inválidos' });
    // Primero el Log, crudo y sin editar nunca: es el historial y el respaldo de la hoja principal
    anotarLog(crudo, datos.id);
    const hoja = obtenerHoja();
    const ahora = new Date();
    const fila = [
      ahora,
      datos.id,
      datos.asiste === 'no' ? 'No va' : 'Sí',
      datos.nombre,
      datos.bebidas.join(', '),
      datos.comida.join(', '),
      datos.comidaOtra,
      datos.cancion,
      datos.mensaje,
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
    avisarError(err, e && e.postData && e.postData.contents);
    return respuesta({ ok: false, error: String(err) });
  } finally {
    cerrojo.releaseLock();
  }
}

// Devuelve los datos limpios (recortados a los largos máximos, con solo las opciones conocidas) o null si no
// sirven: boda distinta, sin código, sin nombre o con una respuesta que no es "si"/"no"
function validar(d) {
  if (!d || d.boda !== BODA) return null;
  const texto = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); };
  const lista = function (v, permitidos) { return (Array.isArray(v) ? v : []).map(String).filter(function (x) { return permitidos.indexOf(x) !== -1; }); };
  const limpio = {
    id: texto(d.id, LARGO.id),
    asiste: d.asiste === 'no' ? 'no' : d.asiste === 'si' ? 'si' : '',
    nombre: texto(d.nombre, LARGO.nombre),
    bebidas: lista(d.bebidas, BEBIDAS),
    comida: lista(d.comida, COMIDAS),
    comidaOtra: texto(d.comidaOtra, LARGO.comidaOtra),
    cancion: texto(d.cancion, LARGO.cancion),
    mensaje: texto(d.mensaje, LARGO.mensaje)
  };
  if (!limpio.id || !limpio.asiste || limpio.nombre.length < 2) return null;
  return limpio;
}

function anotarLog(crudo, id) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let log = libro.getSheetByName(HOJA_LOG);
  if (!log) {
    log = libro.insertSheet(HOJA_LOG);
    log.appendRow(['Fecha', 'Código', 'Datos tal cual llegaron']);
    log.setFrozenRows(1);
    log.getRange(1, 1, 1, 3).setFontWeight('bold');
  }
  log.appendRow([new Date(), id, crudo.slice(0, 5000)]);
}

// Si algo falla, un mail al dueño de la planilla con el error y lo que había llegado (como mucho uno por minuto
// para no inundar la casilla si el problema se repite)
function avisarError(err, crudo) {
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('aviso-error')) return;
    cache.put('aviso-error', '1', 60);
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Invitación: falló una confirmación',
      'Error: ' + String(err) + (err && err.stack ? '\n\n' + err.stack : '') + '\n\nDatos recibidos:\n' + String(crudo || '(sin datos)'));
  } catch (e2) {}
}

// Pestaña "Resumen" con fórmulas sobre la hoja Confirmaciones: cuántos van, cuántos no, restricciones y bebidas.
// Ejecutar una vez desde el editor; si ya existe, se rehace.
function prepararResumen() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = libro.getSheetByName(HOJA_RESUMEN);
  if (hoja) hoja.clear(); else hoja = libro.insertSheet(HOJA_RESUMEN);
  const C = "'" + HOJA + "'!";
  const filas = [
    ['Respuestas', '=MAX(0,COUNTA(' + C + 'B:B)-1)'],
    ['Van', '=COUNTIF(' + C + 'C:C,"Sí")'],
    ['No van', '=COUNTIF(' + C + 'C:C,"No va")'],
    [],
    ['Comida (de los que van)', ''],
    ['Vegetarianos', '=COUNTIFS(' + C + 'C:C,"Sí",' + C + 'F:F,"*Vegetariano*")'],
    ['Veganos', '=COUNTIFS(' + C + 'C:C,"Sí",' + C + 'F:F,"*Vegano*")'],
    ['Sin TACC', '=COUNTIFS(' + C + 'C:C,"Sí",' + C + 'F:F,"*Sin TACC*")'],
    ['Otra restricción', '=COUNTIFS(' + C + 'C:C,"Sí",' + C + 'F:F,"*Otra*")'],
    ['Sin restricciones', '=COUNTIFS(' + C + 'C:C,"Sí",' + C + 'F:F,"Ninguna")'],
    [],
    ['Bebidas (de los que van)', '']
  ].concat(BEBIDAS.map(function (b) { return [b, '=COUNTIFS(' + C + 'C:C,"Sí",' + C + 'E:E,"*' + b + '*")']; }));
  filas.forEach(function (f, i) {
    if (!f.length) return;
    hoja.getRange(i + 1, 1).setValue(f[0]);
    if (f[1]) hoja.getRange(i + 1, 2).setFormula(f[1]);
    if (!f[1]) hoja.getRange(i + 1, 1).setFontWeight('bold');
  });
  hoja.getRange(1, 1, 3, 1).setFontWeight('bold');
  hoja.setColumnWidth(1, 220);
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
  // En el Log, las mismas pruebas (por código)
  const log = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_LOG);
  if (!log || log.getLastRow() < 2) return;
  const codigosLog = log.getRange(2, 2, log.getLastRow() - 1, 1).getValues();
  let borradasLog = 0;
  for (let j = codigosLog.length - 1; j >= 0; j--) {
    if (String(codigosLog[j][0]).indexOf('prueba-') === 0) { log.deleteRow(j + 2); borradasLog++; }
  }
  Logger.log('Filas de prueba borradas del Log: ' + borradasLog);
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
