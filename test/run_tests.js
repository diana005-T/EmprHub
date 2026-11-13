/**
 * ============================================================================
 * EmpreHub - Suite de Pruebas Automatizadas de Calidad e Integridad
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

console.log('\n============================================================');
console.log('EJECUTANDO SUITE DE PRUEBAS TÉCNICAS: EMPREHUB');
console.log('============================================================\n');

// ----------------------------------------------------------------------------
// TEST 1: SINTAXIS JAVASCRIPT
// ----------------------------------------------------------------------------
console.log('1. Verificación de sintaxis de archivos JavaScript...');
const jsFiles = [
  'js/supabase-config.js',
  'js/supabase-client.js',
  'js/app.js',
  'js/auth.js',
  'js/productos.js',
  'js/favoritos.js',
  'js/carrito.js',
  'js/emprendedor.js',
  'js/admin.js',
  'js/promociones.js'
];

jsFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  assert(fs.existsSync(filePath), `El archivo ${file} existe`);
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    new vm.Script(code);
    assert(true, `Sintaxis de ${file} válida sin errores de compilación`);
  } catch (err) {
    assert(false, `Error de sintaxis en ${file}: ${err.message}`);
  }
});

// ----------------------------------------------------------------------------
// TEST 2: INTEGRIDAD DE MIGRACIONES SQL DE SUPABASE
// ----------------------------------------------------------------------------
console.log('\n2. Verificación de migraciones SQL y modelo relacional...');
const migrationFiles = [
  'supabase/migrations/001_initial_schema.sql',
  'supabase/migrations/002_triggers_and_rules.sql',
  'supabase/migrations/003_security_rls.sql',
  'supabase/migrations/004_functions_rpc.sql',
  'supabase/migrations/005_storage_setup.sql',
  'supabase/migrations/006_seed_data.sql'
];

migrationFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  assert(fs.existsSync(filePath), `Migración ${file} existe`);
});

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/001_initial_schema.sql'), 'utf8');
const rlsSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/003_security_rls.sql'), 'utf8');
const rpcSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/004_functions_rpc.sql'), 'utf8');
const triggersSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/002_triggers_and_rules.sql'), 'utf8');

const requiredTables = [
  'profiles',
  'businesses',
  'business_categories',
  'products',
  'product_images',
  'promotions',
  'favorites',
  'cart_items',
  'orders',
  'order_items',
  'business_members'
];

requiredTables.forEach(table => {
  assert(schemaSql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`), `Tabla ${table} definida en el esquema`);
  assert(rlsSql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), `RLS activado para tabla ${table}`);
});

assert(rpcSql.includes('CREATE OR REPLACE FUNCTION public.create_order_atomic'), 'Función RPC transaccional create_order_atomic definida');
assert(rpcSql.includes('FOR UPDATE'), 'Bloqueo pesimista de stock implementado en create_order_atomic');
assert(triggersSql.includes('trg_prevent_role_escalation'), 'Trigger de prevención de escalada de rol definido');
assert(triggersSql.includes('trg_validate_business_free_plan'), 'Trigger de validación de plan gratuito (1 negocio) definido');
assert(triggersSql.includes('trg_validate_products_free_plan'), 'Trigger de validación de plan gratuito (máx 20 productos) definido');
assert(triggersSql.includes('trg_validate_product_images_free_plan'), 'Trigger de validación de plan gratuito (máx 3 imágenes) definido');
assert(triggersSql.includes('trg_validate_promotions_free_plan'), 'Trigger de validación de plan gratuito (máx 2 promociones) definido');

// ----------------------------------------------------------------------------
// TEST 3: PRUEBAS DE SANITIZACIÓN XSS
// ----------------------------------------------------------------------------
console.log('\n3. Pruebas de sanitización XSS (escapeHtml)...');
const appJsCode = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
const winObj = { EH: {} };
const sandbox = {
  window: winObj,
  EH: winObj.EH,
  document: { addEventListener: () => {} },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
};
vm.createContext(sandbox);
vm.runInContext(appJsCode, sandbox);

const escapeHtml = sandbox.window.EH.escapeHtml;
assert(typeof escapeHtml === 'function', 'Función EH.escapeHtml existe en EH');
assert(escapeHtml('<script>alert("XSS")</script>') === '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;', 'Etiquetas script neutralizadas correctamente');
assert(escapeHtml('" onmouseover="alert(1)"') === '&quot; onmouseover=&quot;alert(1)&quot;', 'Comillas e inyecciones de atributos neutralizadas');
assert(escapeHtml("Tom's Diner & Co.") === 'Tom&#39;s Diner &amp; Co.', 'Ampersand y comillas simples neutralizadas');
assert(escapeHtml(null) === '', 'Manejo seguro de valores null');
assert(escapeHtml(undefined) === '', 'Manejo seguro de valores undefined');

// ----------------------------------------------------------------------------
// TEST 4: RUTAS E INTEGRACIÓN HTML
// ----------------------------------------------------------------------------
console.log('\n4. Verificación de páginas HTML, enlaces y recursos...');
const htmlPages = [
  'index.html',
  'pages/inicio.html',
  'pages/registro.html',
  'pages/recuperar-password.html',
  'pages/perfil.html',
  'pages/carrito.html',
  'pages/favoritos.html',
  'pages/emprendimiento.html',
  'pages/emprendedor/panel.html',
  'pages/emprendedor/mi-emprendimiento.html',
  'pages/emprendedor/productos.html',
  'pages/emprendedor/pedidos.html',
  'pages/emprendedor/promociones.html',
  'pages/admin/panel.html'
];

htmlPages.forEach(page => {
  const pagePath = path.join(__dirname, '..', page);
  assert(fs.existsSync(pagePath), `Página HTML ${page} existe`);
  const content = fs.readFileSync(pagePath, 'utf8');
  assert(content.includes('Inter'), `${page} carga la tipografía Inter`);
  assert(content.includes('supabase-config.js'), `${page} incluye supabase-config.js`);
  assert(content.includes('supabase-client.js'), `${page} incluye supabase-client.js`);
});

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`TOTAL DE PRUEBAS: ${totalTests}`);
console.log(`PASARON: ${passedTests}`);
console.log(`FALLARON: ${failedTests}`);
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
