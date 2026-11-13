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
  'supabase/migrations/006_seed_data.sql',
  'supabase/migrations/007_security_rls_and_categories.sql',
  'supabase/migrations/008_effective_privileges_and_order_transitions.sql'
];

migrationFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  assert(fs.existsSync(filePath), `Migración ${file} existe`);
});

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/001_initial_schema.sql'), 'utf8');
const rlsSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/003_security_rls.sql'), 'utf8');
const rpcSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/004_functions_rpc.sql'), 'utf8');
const triggersSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/002_triggers_and_rules.sql'), 'utf8');
const securityFixSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/007_security_rls_and_categories.sql'), 'utf8');
const securityHardeningSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/008_effective_privileges_and_order_transitions.sql'), 'utf8');
const supabaseClientCode = fs.readFileSync(path.join(__dirname, '..', 'js/supabase-client.js'), 'utf8');

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
assert(securityFixSql.includes('DROP POLICY IF EXISTS "orders_insert_customer"'), 'Se elimina la política que permitía insertar pedidos directamente');
assert(securityFixSql.includes('GRANT UPDATE (status) ON TABLE public.orders TO authenticated'), 'Solo se concede actualización directa de estado a usuarios autenticados');
assert(securityFixSql.includes('REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_items'), 'Se bloquean escrituras directas de detalles de pedidos');
assert(securityFixSql.includes('SET search_path = pg_catalog'), 'La función auxiliar SECURITY DEFINER usa un search_path seguro');
assert(securityFixSql.includes('TO anon, authenticated'), 'El catálogo público puede evaluar la función auxiliar de membresía');
assert(securityFixSql.includes('public.current_user_is_business_member(id)'), 'La lectura de negocios comprueba membresía sin recursión RLS');
assert(securityFixSql.includes('GRANT INSERT (owner_id, category_id, name, description, operating_hours, payment_methods)'), 'La creación de negocios solo permite columnas controladas');
assert(securityHardeningSql.includes('REVOKE ALL PRIVILEGES ON TABLE public.businesses, public.orders, public.order_items'), 'La migración 008 revoca los permisos amplios de tabla');
assert(!securityHardeningSql.includes('GRANT UPDATE (status) ON TABLE public.orders'), 'La migración 008 no permite eludir la RPC con UPDATE directo de estado');
assert(securityHardeningSql.includes('TRUNCATE'), 'La migración 008 comprueba y bloquea TRUNCATE efectivo');
assert(securityHardeningSql.includes('has_column_privilege'), 'La migración 008 comprueba permisos efectivos por columna');
assert(securityHardeningSql.includes('rolsuper OR r.rolbypassrls'), 'La migración 008 valida propietarios SECURITY DEFINER con capacidad BYPASSRLS confiable');
assert(securityHardeningSql.includes('GRANT SELECT (id, slug, name, description, status, logo_url, banner_url,'), 'El catálogo anónimo solo recibe columnas seleccionadas de businesses');
assert(securityHardeningSql.includes('ON TABLE public.businesses TO authenticated;'), 'authenticated recibe SELECT de businesses por columnas');
assert(!securityHardeningSql.includes('GRANT SELECT ON TABLE public.businesses'), 'authenticated no recibe SELECT de tabla completa sobre businesses');
const authenticatedBusinessSelectGrant = securityHardeningSql.match(
  /GRANT SELECT \(([^)]*)\)\s+ON TABLE public\.businesses TO authenticated;/
);
assert(Boolean(authenticatedBusinessSelectGrant), 'El SELECT de authenticated sobre businesses tiene una lista explícita de columnas');
assert(
  authenticatedBusinessSelectGrant && !authenticatedBusinessSelectGrant[1].includes('status_reason') &&
    !authenticatedBusinessSelectGrant[1].includes('owner_id'),
  'El SELECT directo de authenticated excluye status_reason y owner_id'
);
assert(securityHardeningSql.includes("has_column_privilege('authenticated', 'public.businesses'"), 'La migración detecta SELECT efectivo heredado de columnas internas para authenticated');
assert(securityHardeningSql.includes('CREATE OR REPLACE FUNCTION public.get_businesses_for_management()'), 'Existe RPC para datos privados de negocios de propietario/admin');
assert(securityHardeningSql.includes('WHERE v_is_admin OR b.owner_id = v_user_id'), 'El RPC limita filas privadas al propietario autenticado o al administrador');
assert(securityHardeningSql.includes('v_user_id UUID := auth.uid()'), 'El RPC deriva la identidad desde la sesión autenticada');
assert(securityHardeningSql.includes('to_jsonb(b)'), 'El RPC devuelve la fila completa solo después de comprobar el ámbito propietario/admin');
assert(securityHardeningSql.includes('GRANT EXECUTE ON FUNCTION public.get_businesses_for_management() TO authenticated'), 'El RPC de gestión solo se concede al rol autenticado');
const businessesClientCode = supabaseClientCode.slice(
  supabaseClientCode.indexOf('EH_CLIENT.businesses = {'),
  supabaseClientCode.indexOf('EH_CLIENT.products = {')
);
assert(businessesClientCode.includes("rpc('get_businesses_for_management')"), 'Los paneles obtienen datos privados de negocios mediante RPC');
assert(!businessesClientCode.includes(".select(`\n          *,\n          category:"), 'Las consultas de gestión no hacen SELECT * directo sobre businesses');
assert((businessesClientCode.match(/\.select\('id, slug, name, description, status, logo_url, banner_url, operating_hours, payment_methods, phone, address, plan, category_id, created_at'\)/g) || []).length === 2, 'Crear y editar negocios solo devuelven columnas públicas autorizadas');
assert(securityHardeningSql.includes('public.update_order_status'), 'La migración 008 define la RPC de transición de estado');
assert(securityHardeningSql.includes("p_new_status IN ('En camino', 'Cancelado')"), 'La RPC solo permite avanzar desde En preparación o cancelar');
assert(securityHardeningSql.includes("p_new_status IN ('Entregado', 'Cancelado')"), 'La RPC solo permite entregar desde En camino o cancelar');
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
