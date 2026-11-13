/* ==========================================================================
   EmpreHub - carrito.js
   Manejo del Carrito de Compras y Flujo de Pedido Transaccional.
   Integrado con PostgreSQL, RPC create_order_atomic y RLS.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {
  const pasoCarrito = document.getElementById('pasoCarrito');
  if (!pasoCarrito) return; // Si no es carrito.html, salir

  // Proteger la pantalla: requiere sesión de cliente
  const tieneAcceso = await EH.protegerPagina('customer', 'registro.html');
  if (!tieneAcceso) return;

  const sesion = EH.sesion.obtener();
  const userId = sesion.id || sesion.correo;

  const pasoCheckout = document.getElementById('pasoCheckout');
  const pasoResumen = document.getElementById('pasoResumen');
  const pasoExito = document.getElementById('pasoExito');

  let datosEntrega = null; // Almacena temporalmente los datos validados del checkout

  /* ------------------------------------------------------------------------
     PASO 1: PINTAR EL CARRITO
     ------------------------------------------------------------------------ */
  async function pintarCarrito() {
    const contenedor = document.getElementById('listaCarrito');
    const contTotales = document.getElementById('carritoTotales');

    contenedor.innerHTML = `
      <div class="estado-cargando">
        <div class="spinner"></div>
        <p>Cargando tu carrito...</p>
      </div>`;

    try {
      const items = await EH.client.cart.get(userId);

      if (!items || items.length === 0) {
        contenedor.innerHTML = `
          <div class="estado-vacio">
            <div class="estado-vacio__icono">🛒</div>
            <p>Tu carrito está actualmente vacío.</p>
            <a href="inicio.html" class="btn btn-primario" style="margin-top:16px;">Explorar productos</a>
          </div>`;
        contTotales.classList.add('oculto');
        return;
      }

      contTotales.classList.remove('oculto');

      const totalEstimado = items.reduce((s, p) => s + (Number(p.precio) * Number(p.cantidad)), 0);

      contenedor.innerHTML = items.map(p => `
        <div class="item-carrito">
          <div class="item-carrito__info">
            <h4>${EH.escapeHtml(p.nombre)}</h4>
            <span style="font-size:0.85rem; color:#666;">Emprendimiento: ${EH.escapeHtml(p.nombreEmprendimiento || 'General')}</span>
            <div style="font-weight:600; color:var(--color-azul); margin-top:4px;">S/ ${Number(p.precio).toFixed(2)} c/u</div>
          </div>
          <div class="item-carrito__cantidad">
            <button data-accion="restar" data-id="${EH.escapeHtml(p.id)}" aria-label="Disminuir cantidad">−</button>
            <span aria-label="Cantidad">${p.cantidad}</span>
            <button data-accion="sumar" data-id="${EH.escapeHtml(p.id)}" aria-label="Aumentar cantidad">+</button>
          </div>
          <div class="item-carrito__subtotal">S/ ${(Number(p.precio) * p.cantidad).toFixed(2)}</div>
          <button class="item-carrito__eliminar" data-accion="eliminar" data-id="${EH.escapeHtml(p.id)}" title="Eliminar producto" aria-label="Eliminar ${EH.escapeHtml(p.nombre)}">
            🗑️
          </button>
        </div>
      `).join('');

      document.getElementById('carritoTotal').textContent = 'S/ ' + totalEstimado.toFixed(2);

      // Eventos de botones (+, -, eliminar)
      contenedor.querySelectorAll('button[data-accion]').forEach(btn => {
        btn.addEventListener('click', async function () {
          const prodId = btn.dataset.id;
          const accion = btn.dataset.accion;
          const item = items.find(p => p.id === prodId);
          if (!item) return;

          btn.disabled = true;

          try {
            if (accion === 'sumar') {
              if (item.cantidad >= item.stock) {
                EH.toast(`Stock máximo disponible alcanzado (${item.stock} unidades).`);
                return;
              }
              await EH.client.cart.updateQuantity(userId, prodId, item.cantidad + 1);
            } else if (accion === 'restar') {
              if (item.cantidad <= 1) return;
              await EH.client.cart.updateQuantity(userId, prodId, item.cantidad - 1);
            } else if (accion === 'eliminar') {
              const confirmado = await EH.confirmar('¿Deseas eliminar este producto de tu carrito?');
              if (!confirmado) return;
              await EH.client.cart.removeItem(userId, prodId);
              EH.toast('Producto eliminado del carrito');
            }
            await pintarCarrito();
            await EH.actualizarBadgeCarrito();
          } catch (err) {
            console.error(err);
            EH.toast(err.message || 'Error al actualizar producto');
          } finally {
            btn.disabled = false;
          }
        });
      });

    } catch (err) {
      console.error('Error al pintar carrito:', err);
      contenedor.innerHTML = '<div class="estado-vacio"><p>No se pudo cargar el carrito.</p></div>';
    }
  }

  // Vaciar carrito
  document.getElementById('btnVaciarCarrito').addEventListener('click', async function () {
    const confirmado = await EH.confirmar('¿Estás seguro de vaciar todos los productos del carrito?');
    if (!confirmado) return;
    try {
      await EH.client.cart.clear(userId);
      await pintarCarrito();
      await EH.actualizarBadgeCarrito();
      EH.toast('Carrito vaciado.');
    } catch (e) {
      console.error(e);
      EH.toast('No se pudo vaciar el carrito.');
    }
  });

  // Ir al checkout
  document.getElementById('btnIrCheckout').addEventListener('click', async function () {
    const items = await EH.client.cart.get(userId);
    if (!items || items.length === 0) {
      EH.toast('Tu carrito está vacío.');
      return;
    }
    pasoCarrito.classList.add('oculto');
    pasoCheckout.classList.remove('oculto');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ------------------------------------------------------------------------
     PASO 2: FORMULARIO DE CHECKOUT
     ------------------------------------------------------------------------ */
  document.getElementById('btnVolverCarrito').addEventListener('click', function () {
    pasoCheckout.classList.add('oculto');
    pasoCarrito.classList.remove('oculto');
  });

  document.getElementById('formCheckout').addEventListener('submit', function (e) {
    e.preventDefault();

    const nombre = document.getElementById('checkoutNombre').value.trim();
    const telefono = document.getElementById('checkoutTelefono').value.trim();
    const direccion = document.getElementById('checkoutDireccion').value.trim();
    const metodoPago = document.getElementById('checkoutMetodoPago').value;

    const idsError = ['errorCheckoutNombre', 'errorCheckoutTelefono', 'errorCheckoutDireccion', 'errorCheckoutMetodoPago'];
    idsError.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    let esValido = true;

    if (nombre === '') {
      document.getElementById('errorCheckoutNombre').textContent = 'El nombre es obligatorio.';
      esValido = false;
    } else if (nombre.length < 3) {
      document.getElementById('errorCheckoutNombre').textContent = 'El nombre debe tener mínimo 3 caracteres.';
      esValido = false;
    }

    if (telefono === '') {
      document.getElementById('errorCheckoutTelefono').textContent = 'El teléfono es obligatorio.';
      esValido = false;
    } else if (!/^[0-9]{9}$/.test(telefono)) {
      document.getElementById('errorCheckoutTelefono').textContent = 'El teléfono debe tener exactamente 9 dígitos numéricos.';
      esValido = false;
    }

    if (direccion === '') {
      document.getElementById('errorCheckoutDireccion').textContent = 'La dirección de entrega es obligatoria.';
      esValido = false;
    } else if (direccion.length < 5) {
      document.getElementById('errorCheckoutDireccion').textContent = 'Ingresa una dirección completa y detallada.';
      esValido = false;
    }

    if (metodoPago === '') {
      document.getElementById('errorCheckoutMetodoPago').textContent = 'Selecciona un método de pago coordinado.';
      esValido = false;
    }

    if (!esValido) return;

    datosEntrega = { nombre, telefono, direccion, metodoPago };
    pintarResumen();
    pasoCheckout.classList.add('oculto');
    pasoResumen.classList.remove('oculto');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ------------------------------------------------------------------------
     PASO 3: RESUMEN Y CONFIRMACIÓN TRANSACCIONAL ATÓMICA
     ------------------------------------------------------------------------ */
  async function pintarResumen() {
    const items = await EH.client.cart.get(userId);
    const contProductos = document.getElementById('resumenProductos');
    const totalEstimado = items.reduce((s, p) => s + (p.precio * p.cantidad), 0);

    contProductos.innerHTML = items.map(p => `
      <div class="resumen-linea">
        <span>${p.cantidad} × ${EH.escapeHtml(p.nombre)} <small>(${EH.escapeHtml(p.nombreEmprendimiento || 'Negocio')})</small></span>
        <span>S/ ${(p.precio * p.cantidad).toFixed(2)}</span>
      </div>
    `).join('');

    document.getElementById('resumenTotal').textContent = 'S/ ' + totalEstimado.toFixed(2);
    document.getElementById('resumenNombre').textContent = datosEntrega.nombre;
    document.getElementById('resumenTelefono').textContent = datosEntrega.telefono;
    document.getElementById('resumenDireccion').textContent = datosEntrega.direccion;
    document.getElementById('resumenMetodoPago').textContent = datosEntrega.metodoPago;
  }

  document.getElementById('btnVolverCheckout').addEventListener('click', function () {
    pasoResumen.classList.add('oculto');
    pasoCheckout.classList.remove('oculto');
  });

  // BOTÓN CONFIRMAR PEDIDO -> Invoca la función RPC atómica de PostgreSQL
  document.getElementById('btnConfirmarPedido').addEventListener('click', async function () {
    const btn = document.getElementById('btnConfirmarPedido');
    btn.disabled = true;
    btn.textContent = 'Procesando pedido de forma segura...';

    try {
      const items = await EH.client.cart.get(userId);
      if (!items || items.length === 0) {
        EH.toast('Tu carrito está vacío.');
        btn.disabled = false;
        btn.textContent = 'Confirmar pedido';
        return;
      }

      // Agrupar productos por emprendimiento (un pedido atómico independiente por negocio)
      const grupos = {};
      items.forEach(p => {
        const empId = p.emprendimientoId;
        if (!grupos[empId]) grupos[empId] = [];
        grupos[empId].push(p);
      });

      const pedidosExitosos = [];

      for (const empId of Object.keys(grupos)) {
        const itemsGrupo = grupos[empId];
        const res = await EH.client.orders.createAtomic({
          businessId: empId,
          customerName: datosEntrega.nombre,
          customerPhone: datosEntrega.telefono,
          deliveryAddress: datosEntrega.direccion,
          paymentMethod: datosEntrega.metodoPago,
          items: itemsGrupo.map(p => ({ productId: p.id, cantidad: p.cantidad })),
          notes: 'Pedido realizado desde la web de EmpreHub'
        });

        pedidosExitosos.push(res.order_number || res.numero || ('EH-' + Date.now().toString().slice(-4)));
      }

      // Vaciado automático del carrito
      await EH.client.cart.clear(userId);
      await EH.actualizarBadgeCarrito();

      // Mostrar pantalla de éxito
      document.getElementById('numeroPedidoExito').textContent = pedidosExitosos.join(', ');
      pasoResumen.classList.add('oculto');
      pasoExito.classList.remove('oculto');
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('Error al confirmar pedido:', err);
      alert('No se pudo completar el pedido: ' + (err.message || 'Error de servidor. Revisa el stock disponible.'));
      btn.disabled = false;
      btn.textContent = 'Confirmar pedido';
    }
  });

  await pintarCarrito();
});
