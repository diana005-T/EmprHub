/* ==========================================================================
   EmpreHub - carrito.js
   Maneja el carrito de compras de cada cliente.
   Se guarda en localStorage bajo la clave "eh_carrito" como un array de:
     { correo: 'cliente@correo.com', productoId: 'abc123', cantidad: 2 }
   ========================================================================== */

EH.carrito = {

  // Devuelve TODOS los ítems de carrito guardados (de todos los clientes).
  _todos() {
    return EH.storage.obtener('eh_carrito', []);
  },

  // Devuelve los ítems del carrito de UN cliente, ya combinados con los
  // datos del producto (nombre, precio, stock, etc.) para poder mostrarlos.
  obtener(correo) {
    const items = EH.carrito._todos().filter(i => i.correo === correo);
    const productos = EH.storage.obtener('eh_productos', []);

    return items.map(item => {
      const producto = productos.find(p => p.id === item.productoId);
      return producto ? { ...producto, cantidad: item.cantidad } : null;
    }).filter(Boolean); // quita productos que ya no existan
  },

  // Agrega una cantidad de un producto al carrito.
  // Si el producto ya estaba, suma la cantidad (sin superar el stock).
  agregar(correo, productoId, cantidad) {
    const productos = EH.storage.obtener('eh_productos', []);
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return { ok: false, mensaje: 'El producto ya no existe.' };

    let items = EH.carrito._todos();
    const item = items.find(i => i.correo === correo && i.productoId === productoId);
    const cantidadActual = item ? item.cantidad : 0;
    const nuevaCantidad = cantidadActual + cantidad;

    // Validación: no superar el stock disponible.
    if (nuevaCantidad > producto.stock) {
      return { ok: false, mensaje: `Solo quedan ${producto.stock} unidades disponibles.` };
    }

    if (item) {
      item.cantidad = nuevaCantidad;
    } else {
      items.push({ correo, productoId, cantidad });
    }

    EH.storage.guardar('eh_carrito', items);
    return { ok: true };
  },

  // Cambia la cantidad exacta de un producto en el carrito (usado por + / -).
  actualizarCantidad(correo, productoId, nuevaCantidad) {
    const productos = EH.storage.obtener('eh_productos', []);
    const producto = productos.find(p => p.id === productoId);
    if (!producto) return { ok: false };

    // Validación: no permitir menos de 1 (para eso existe "eliminar").
    if (nuevaCantidad < 1) {
      return { ok: false, mensaje: 'La cantidad mínima es 1.' };
    }
    // Validación: no superar el stock disponible.
    if (nuevaCantidad > producto.stock) {
      return { ok: false, mensaje: `Solo quedan ${producto.stock} unidades disponibles.` };
    }

    let items = EH.carrito._todos();
    const item = items.find(i => i.correo === correo && i.productoId === productoId);
    if (item) {
      item.cantidad = nuevaCantidad;
      EH.storage.guardar('eh_carrito', items);
    }
    return { ok: true };
  },

  // Elimina un producto del carrito de un cliente.
  eliminar(correo, productoId) {
    let items = EH.carrito._todos();
    items = items.filter(i => !(i.correo === correo && i.productoId === productoId));
    EH.storage.guardar('eh_carrito', items);
  },

  // Vacía por completo el carrito de un cliente (ej: después de un pedido).
  vaciar(correo) {
    let items = EH.carrito._todos();
    items = items.filter(i => i.correo !== correo);
    EH.storage.guardar('eh_carrito', items);
  },

  // Calcula el total en soles del carrito de un cliente.
  total(correo) {
    return EH.carrito.obtener(correo)
      .reduce((suma, p) => suma + (p.precio * p.cantidad), 0);
  },

  // Cuenta cuántas unidades hay en total (para el número del badge del carrito).
  contarItems(correo) {
    return EH.carrito.obtener(correo)
      .reduce((suma, p) => suma + p.cantidad, 0);
  }
};

/* ==========================================================================
   PANTALLA DEL CARRITO Y FLUJO DE PEDIDO (pages/carrito.html)
   Tiene 3 pasos, cada uno es un <section> que se muestra/oculta:
     1. #pasoCarrito   -> lista de productos, cantidades y total
     2. #pasoCheckout  -> formulario de datos de entrega
     3. #pasoResumen   -> resumen final + botón "Confirmar pedido"
     4. #pasoExito     -> mensaje de pedido realizado
   ========================================================================== */
document.addEventListener('DOMContentLoaded', function () {
  const pasoCarrito = document.getElementById('pasoCarrito');
  if (!pasoCarrito) return; // esta página no es carrito.html

  if (!EH.protegerPagina('cliente', 'registro.html')) return;

  const sesion = EH.sesion.obtener();
  const pasoCheckout = document.getElementById('pasoCheckout');
  const pasoResumen = document.getElementById('pasoResumen');
  const pasoExito = document.getElementById('pasoExito');

  let datosEntrega = null; // guarda temporalmente nombre/telefono/dirección/pago

  /* ------------------------------ PASO 1: CARRITO ------------------------------ */
  function pintarCarrito() {
    const items = EH.carrito.obtener(sesion.correo);
    const contenedor = document.getElementById('listaCarrito');
    const contTotales = document.getElementById('carritoTotales');

    if (items.length === 0) {
      contenedor.innerHTML = `
        <div class="estado-vacio">
          <div class="estado-vacio__icono">🛒</div>
          <p>Tu carrito está vacío.</p>
        </div>`;
      contTotales.classList.add('oculto');
      return;
    }

    contTotales.classList.remove('oculto');

    contenedor.innerHTML = items.map(p => `
      <div class="item-carrito">
        <div class="item-carrito__info">
          <h4>${p.nombre}</h4>
          <span>S/ ${p.precio.toFixed(2)} c/u</span>
        </div>
        <div class="item-carrito__cantidad">
          <button data-accion="restar" data-id="${p.id}">−</button>
          <span>${p.cantidad}</span>
          <button data-accion="sumar" data-id="${p.id}">+</button>
        </div>
        <div class="item-carrito__subtotal">S/ ${(p.precio * p.cantidad).toFixed(2)}</div>
        <button class="item-carrito__eliminar" data-accion="eliminar" data-id="${p.id}" title="Eliminar">🗑️</button>
      </div>
    `).join('');

    document.getElementById('carritoTotal').textContent = 'S/ ' + EH.carrito.total(sesion.correo).toFixed(2);

    // Botones + / − / eliminar de cada línea
    contenedor.querySelectorAll('button[data-accion]').forEach(btn => {
      btn.addEventListener('click', async function () {
        const id = btn.dataset.id;
        const accion = btn.dataset.accion;
        const item = items.find(p => p.id === id);

        if (accion === 'sumar') {
          const r = EH.carrito.actualizarCantidad(sesion.correo, id, item.cantidad + 1);
          if (!r.ok) EH.toast(r.mensaje);
        } else if (accion === 'restar') {
          if (item.cantidad <= 1) return; // para bajar de 1 se usa "eliminar"
          EH.carrito.actualizarCantidad(sesion.correo, id, item.cantidad - 1);
        } else if (accion === 'eliminar') {
          const confirmado = await EH.confirmar('¿Eliminar este producto del carrito?');
          if (!confirmado) return;
          EH.carrito.eliminar(sesion.correo, id);
        }

        pintarCarrito();
        EH.actualizarBadgeCarrito();
      });
    });
  }

  document.getElementById('btnVaciarCarrito').addEventListener('click', async function () {
    const confirmado = await EH.confirmar('¿Vaciar todo el carrito?');
    if (!confirmado) return;
    EH.carrito.vaciar(sesion.correo);
    pintarCarrito();
    EH.actualizarBadgeCarrito();
  });

  document.getElementById('btnIrCheckout').addEventListener('click', function () {
    if (EH.carrito.obtener(sesion.correo).length === 0) {
      EH.toast('Tu carrito está vacío.');
      return;
    }
    pasoCarrito.classList.add('oculto');
    pasoCheckout.classList.remove('oculto');
  });

  /* ------------------------------ PASO 2: CHECKOUT ------------------------------ */
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
    idsError.forEach(id => document.getElementById(id).textContent = '');

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
      document.getElementById('errorCheckoutTelefono').textContent = 'El teléfono debe tener solo números y 9 dígitos.';
      esValido = false;
    }

    if (direccion === '') {
      document.getElementById('errorCheckoutDireccion').textContent = 'La dirección es obligatoria.';
      esValido = false;
    }

    if (metodoPago === '') {
      document.getElementById('errorCheckoutMetodoPago').textContent = 'Selecciona un método de pago.';
      esValido = false;
    }

    if (!esValido) return;

    datosEntrega = { nombre, telefono, direccion, metodoPago };
    pintarResumen();
    pasoCheckout.classList.add('oculto');
    pasoResumen.classList.remove('oculto');
  });

  /* ------------------------------ PASO 3: RESUMEN ------------------------------ */
  function pintarResumen() {
    const items = EH.carrito.obtener(sesion.correo);

    document.getElementById('resumenProductos').innerHTML = items.map(p => `
      <div class="resumen-linea">
        <span>${p.cantidad} × ${p.nombre}</span>
        <span>S/ ${(p.precio * p.cantidad).toFixed(2)}</span>
      </div>
    `).join('');

    document.getElementById('resumenTotal').textContent = 'S/ ' + EH.carrito.total(sesion.correo).toFixed(2);
    document.getElementById('resumenNombre').textContent = datosEntrega.nombre;
    document.getElementById('resumenTelefono').textContent = datosEntrega.telefono;
    document.getElementById('resumenDireccion').textContent = datosEntrega.direccion;
    document.getElementById('resumenMetodoPago').textContent = datosEntrega.metodoPago;
  }

  document.getElementById('btnVolverCheckout').addEventListener('click', function () {
    pasoResumen.classList.add('oculto');
    pasoCheckout.classList.remove('oculto');
  });

  document.getElementById('btnConfirmarPedido').addEventListener('click', function () {
    const items = EH.carrito.obtener(sesion.correo);
    if (items.length === 0) return;

    // Agrupamos los productos del carrito por emprendimiento: si el
    // cliente compró de varios emprendimientos a la vez, se genera un
    // pedido independiente para cada uno (cada emprendedor ve solo lo suyo).
    const grupos = {};
    items.forEach(p => {
      if (!grupos[p.emprendimientoId]) grupos[p.emprendimientoId] = [];
      grupos[p.emprendimientoId].push(p);
    });

    const pedidos = EH.storage.obtener('eh_pedidos', []);
    let contador = EH.storage.obtener('eh_contador_pedido', 1000);
    const numerosGenerados = [];

    Object.keys(grupos).forEach(empId => {
      contador += 1;
      const numero = 'EH-' + contador;
      numerosGenerados.push(numero);

      const productosGrupo = grupos[empId];
      const totalGrupo = productosGrupo.reduce((s, p) => s + p.precio * p.cantidad, 0);

      pedidos.push({
        numero,
        emprendimientoId: empId,
        clienteCorreo: sesion.correo,
        clienteNombre: datosEntrega.nombre,
        telefono: datosEntrega.telefono,
        direccion: datosEntrega.direccion,
        metodoPago: datosEntrega.metodoPago,
        productos: productosGrupo.map(p => ({
          productoId: p.id, nombre: p.nombre, cantidad: p.cantidad, precio: p.precio
        })),
        total: totalGrupo,
        estado: 'Pendiente',
        fecha: new Date().toLocaleString('es-PE')
      });
    });

    EH.storage.guardar('eh_pedidos', pedidos);
    EH.storage.guardar('eh_contador_pedido', contador);

    // Vaciamos el carrito y mostramos el mensaje de éxito.
    EH.carrito.vaciar(sesion.correo);
    EH.actualizarBadgeCarrito();

    document.getElementById('numeroPedidoExito').textContent = numerosGenerados.join(', ');
    pasoResumen.classList.add('oculto');
    pasoExito.classList.remove('oculto');
  });

  pintarCarrito();
});
