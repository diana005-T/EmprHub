/**
 * ============================================================================
 * EmpreHub - Test Funcional de Carrito, Stock y Checkout Atómico
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✅ [PASS] ${msg}`);
  } else {
    failed++;
    console.error(`  ❌ [FAIL] ${msg}`);
  }
}

console.log('\n--- PRUEBA FUNCIONAL: CARRITO, INVENTARIO Y CHECKOUT ATÓMICO ---');

// Mock DOM y LocalStorage
const localStorageStore = {};
const localStorageMock = {
  getItem: (k) => localStorageStore[k] || null,
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: (k) => { delete localStorageStore[k]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
};

const win = {
  EMPREHUB_CONFIG: { isConfigured: () => false },
  localStorage: localStorageMock
};

const sandbox = {
  window: win,
  localStorage: localStorageMock,
  document: { addEventListener: () => {} },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};

vm.createContext(sandbox);

// Cargar supabase-client.js
const clientCode = fs.readFileSync(path.join(__dirname, '..', 'js/supabase-client.js'), 'utf8');
vm.runInContext(clientCode, sandbox);

const client = sandbox.window.EH.client;

async function runFunctionalTests() {
  // 1. Sembrar productos y negocios iniciales en storage
  const empId = 'emp_test_1';
  const prodId = 'prod_test_1';

  localStorageMock.setItem('eh_emprendimientos', JSON.stringify([
    { id: empId, nombre: 'Restaurante Test', status: 'published', mediosPago: ['Yape'] }
  ]));

  localStorageMock.setItem('eh_productos', JSON.stringify([
    { id: prodId, emprendimientoId: empId, nombre: 'Lomo Saltado', precio: 25.00, stock: 10, is_active: true }
  ]));

  // 2. Agregar ítem al carrito
  const userId = 'usr_test_123';
  await client.cart.addItem(userId, prodId, 2);

  let cartItems = await client.cart.get(userId);
  assert(cartItems.length === 1, 'Producto agregado al carrito con éxito');
  assert(cartItems[0].cantidad === 2, 'Cantidad en carrito es 2');

  // 3. Modificar cantidad
  await client.cart.updateQuantity(userId, prodId, 4);
  cartItems = await client.cart.get(userId);
  assert(cartItems[0].cantidad === 4, 'Cantidad actualizada a 4');

  // 4. Intentar exceder stock disponible (stock = 10, solicitamos 15)
  let errorExceder = false;
  try {
    await client.cart.updateQuantity(userId, prodId, 15);
  } catch (e) {
    errorExceder = true;
  }
  assert(errorExceder, 'El carrito bloquea cantidades que exceden el inventario disponible');

  // 5. Checkout Atómico Transaccional
  const orderRes = await client.orders.createAtomic({
    businessId: empId,
    customerName: 'Juan Pérez',
    customerPhone: '987654321',
    deliveryAddress: 'Av. Las Flores 456',
    paymentMethod: 'Yape',
    items: [{ productId: prodId, cantidad: 3 }]
  });

  assert(orderRes.success === true, 'Checkout atómico completado con éxito');
  assert(orderRes.order_number.startsWith('EH-'), 'Número de orden correlativo generado correctamente (' + orderRes.order_number + ')');
  assert(orderRes.total_amount === 75.00, 'Total calculado en servidor de forma exacta (3 x S/ 25.00 = S/ 75.00)');

  // 6. Verificar deducción atómica de stock en productos
  const prodsActualizados = JSON.parse(localStorageMock.getItem('eh_productos'));
  const prodActualizado = prodsActualizados.find(p => p.id === prodId);
  assert(prodActualizado.stock === 7, 'Stock deducido atómicamente de 10 a 7');

  // 7. Vaciar carrito
  await client.cart.clear(userId);
  const cartVacio = await client.cart.get(userId);
  assert(cartVacio.length === 0, 'Carrito vaciado tras el pedido');

  console.log(`\nResultado pruebas funcionales: ${passed} pasaron, ${failed} fallaron.`);
  if (failed > 0) process.exit(1);
}

runFunctionalTests();

