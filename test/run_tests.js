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

function getPolicySql(source, policyName) {
  const start = source.indexOf(`CREATE POLICY "${policyName}"`);
  if (start === -1) return '';
  const end = source.indexOf('\nCREATE POLICY "', start + 1);
  return source.slice(start, end === -1 ? source.length : end);
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
  'supabase/migrations/008_effective_privileges_and_order_transitions.sql',
  'supabase/migrations/009_plan_storage_and_checkout_hardening.sql'
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
const planStorageCheckoutSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/009_plan_storage_and_checkout_hardening.sql'), 'utf8');
const storageSql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/005_storage_setup.sql'), 'utf8');
const supabaseClientCode = fs.readFileSync(path.join(__dirname, '..', 'js/supabase-client.js'), 'utf8');
const promotionClientCode = fs.readFileSync(path.join(__dirname, '..', 'js/promociones.js'), 'utf8');

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
assert(planStorageCheckoutSql.includes('CREATE TRIGGER trg_validate_business_free_plan'), 'La migración 009 vuelve a aplicar el límite gratuito de emprendimientos');
assert(planStorageCheckoutSql.includes('BEFORE INSERT OR UPDATE OF owner_id, plan ON public.businesses'), 'El límite de negocios se valida también al cambiar owner o plan');
assert(planStorageCheckoutSql.includes('BEFORE INSERT OR UPDATE OF business_id ON public.products'), 'El límite de productos se valida en inserciones y reasignaciones');
assert(planStorageCheckoutSql.includes("'emprehub:product:' || NEW.id::TEXT"), 'La reasignación de productos se serializa con cargas de imágenes concurrentes');
assert(planStorageCheckoutSql.includes('BEFORE INSERT OR UPDATE OF product_id ON public.product_images'), 'El límite de imágenes se valida en inserciones y reasignaciones');
assert(planStorageCheckoutSql.includes('BEFORE INSERT OR UPDATE ON public.promotions'), 'El límite de promociones se valida al modificar cualquier campo');
assert((planStorageCheckoutSql.match(/pg_advisory_xact_lock/g) || []).length >= 5, 'Los límites de plan usan bloqueos transaccionales para serializar cambios concurrentes');
assert(planStorageCheckoutSql.includes("IF v_business_plan = 'free'"), 'Los límites de productos, imágenes y promociones eximen al plan premium');
assert(planStorageCheckoutSql.includes("jsonb_typeof(p_items) IS DISTINCT FROM 'array'"), 'El checkout valida que los ítems recibidos sean un arreglo JSON');
assert(planStorageCheckoutSql.includes('IF jsonb_array_length(p_items) = 0 THEN'), 'El checkout rechaza arreglos de productos vacíos después de validar el tipo');
assert(/WHERE b\.id = p_business_id\s+FOR UPDATE/.test(planStorageCheckoutSql), 'El checkout bloquea el emprendimiento para coordinarse con su moderación');
assert(planStorageCheckoutSql.includes("session_user IN ('postgres', 'supabase_admin')"), 'El bootstrap de administrador está limitado a sesiones SQL de confianza');
assert(planStorageCheckoutSql.includes("current_setting('emprehub.bootstrap_first_admin', true) = 'on'"), 'El trigger solo permite el bootstrap explícito del primer administrador');
assert(planStorageCheckoutSql.includes("REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT)"), 'El bootstrap no está disponible para roles de API');
assert(planStorageCheckoutSql.includes("array_length(string_to_array(name, '/'), 1) = 3"), 'Las políticas de Storage validan la estructura exacta de la ruta');
assert(!/auth\.uid\(\)\s*=\s*owner\b/.test(planStorageCheckoutSql), 'Las políticas de Storage no dependen de la columna obsoleta owner');
assert(planStorageCheckoutSql.includes('CREATE POLICY "Users can delete their own media or admin"'), 'Storage permite limpiar archivos de productos propios tras borrar sus filas');
assert(storageSql.includes('CREATE OR REPLACE FUNCTION public.can_manage_business_media'), 'La migración 005 define su helper de Storage antes de las políticas');
assert(!storageSql.includes('public.current_user_is_business_member'), 'La migración 005 no depende de la función creada después en 007');
assert(storageSql.includes('REVOKE ALL ON FUNCTION public.can_manage_business_media(TEXT, TEXT)'), 'El helper de Storage revoca ejecución pública y anónima');
assert(storageSql.includes('TO authenticated;'), 'El helper de Storage solo permite ejecución autenticada');
assert(planStorageCheckoutSql.includes("public.can_manage_business_media(split_part(name, '/', 1))"), 'Las políticas finales usan el helper para borrar imágenes aunque el producto ya no exista');
[
  ['migración 005', storageSql],
  ['migración 009', planStorageCheckoutSql]
].forEach(([migrationName, migrationSql]) => {
  const insertPolicy = getPolicySql(migrationSql, 'Authenticated users can upload to emprehub-media');
  const updatePolicy = getPolicySql(migrationSql, 'Users can update their own media or admin');
  const deletePolicy = getPolicySql(migrationSql, 'Users can delete their own media or admin');
  const updateUsingPolicy = updatePolicy.slice(
    updatePolicy.indexOf('USING ('),
    updatePolicy.indexOf('WITH CHECK (')
  );
  const updateWithCheckPolicy = updatePolicy.slice(updatePolicy.indexOf('WITH CHECK ('));
  const requiredSegments = [
    "array_length(string_to_array(name, '/'), 1) = 3",
    "split_part(name, '/', 1) <> ''",
    "split_part(name, '/', 2) <> ''",
    "split_part(name, '/', 3) <> ''"
  ];

  assert(requiredSegments.every(segment => insertPolicy.includes(segment)), `${migrationName}: INSERT exige exactamente tres segmentos no vacíos`);
  assert(requiredSegments.every(segment => updateUsingPolicy.includes(segment)), `${migrationName}: UPDATE valida la ruta de origen`);
  assert(requiredSegments.every(segment => updateWithCheckPolicy.includes(segment)), `${migrationName}: UPDATE valida la ruta de destino`);
  assert(insertPolicy.includes("split_part(name, '/', 2) = 'branding'"), `${migrationName}: INSERT reconoce rutas branding`);
  assert(updatePolicy.includes("split_part(name, '/', 2) = 'branding'"), `${migrationName}: UPDATE reconoce rutas branding`);
  assert(/can_manage_business_media\(\s*split_part\(name, '\/', 1\),\s*split_part\(name, '\/', 2\)\s*\)/.test(insertPolicy), `${migrationName}: INSERT verifica UUID y pertenencia del producto`);
  assert(/can_manage_business_media\(\s*split_part\(name, '\/', 1\),\s*split_part\(name, '\/', 2\)\s*\)/.test(updatePolicy), `${migrationName}: UPDATE verifica UUID y pertenencia del producto`);
  assert(requiredSegments.every(segment => deletePolicy.includes(segment)), `${migrationName}: DELETE exige tres segmentos no vacíos`);
  assert(deletePolicy.includes("public.can_manage_business_media(split_part(name, '/', 1))"), `${migrationName}: DELETE permite borrar imágenes huérfanas si el usuario gestiona el negocio`);
  assert(!/can_manage_business_media\(\s*split_part\(name, '\/', 1\),/.test(deletePolicy), `${migrationName}: DELETE no exige que el producto siga existiendo`);
  assert(deletePolicy.includes("split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'"), `${migrationName}: DELETE conserva la forma UUID de las rutas de producto`);

  const helperAuthorization = /b\.owner_id = v_user_id[\s\S]*bm\.business_id = b\.id[\s\S]*bm\.user_id = v_user_id[\s\S]*public\.is_admin\(\)/;
  assert(helperAuthorization.test(migrationSql), `${migrationName}: DELETE autoriza propietarios, colaboradores y administradores y rechaza otros usuarios`);
});
assert(storageSql.includes("p_product_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'"), 'El helper rechaza un product_id que no sea UUID');
assert(/p\.id = v_product_id\s+AND p\.business_id = b\.id/.test(storageSql), 'El helper comprueba que el producto pertenezca al negocio de la ruta');
assert(planStorageCheckoutSql.includes('REVOKE ALL ON FUNCTION public.validate_business_free_plan() FROM PUBLIC, anon, authenticated'), 'Los validadores SECURITY DEFINER no son ejecutables por roles de API');
assert(planStorageCheckoutSql.includes('public.validate_product_images_free_plan()\'::REGPROCEDURE'), 'La migración verifica el propietario efectivo de los validadores');
assert(/GRANT EXECUTE ON FUNCTION public\.create_order_atomic\(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT\)\s+TO authenticated;/.test(planStorageCheckoutSql), 'El checkout sigue disponible solo para authenticated');
assert(planStorageCheckoutSql.includes('has_function_privilege('), 'La migración valida permisos EXECUTE efectivos');
assert(planStorageCheckoutSql.includes('rolsuper OR r.rolbypassrls'), 'La migración comprueba el propietario efectivo BYPASSRLS sin reasignarlo');
assert(supabaseClientCode.includes("if (imgErr) throw imgErr"), 'El cliente propaga errores al registrar una imagen de producto');
assert(supabaseClientCode.includes("if (productUpdateError) throw productUpdateError"), 'El cliente propaga errores al actualizar la imagen principal');
assert(supabaseClientCode.includes(".remove([fileName])"), 'El cliente limpia archivos subidos cuando falla su registro');
assert(supabaseClientCode.includes("select('storage_path')"), 'La eliminación de producto recupera rutas para limpiar sus imágenes');
assert(promotionClientCode.includes("miEmprendimiento.plan !== 'premium'"), 'La interfaz no aplica el límite gratuito a emprendimientos premium');
assert(!/catch\s*\{\s*return\s+0;/.test(promotionClientCode), 'Los errores al consultar promociones no se convierten en un límite falso de cero');

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
