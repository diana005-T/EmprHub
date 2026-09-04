/* ==========================================================================
   EmpreHub - emprendedor.js
   Lógica de las 4 pantallas del EMPRENDEDOR:
     A) panel.html            -> resumen general
     B) mi-emprendimiento.html -> crear/editar los datos del emprendimiento
     C) productos.html        -> agregar, editar y eliminar productos
     D) pedidos.html          -> ver y actualizar el estado de los pedidos
   ========================================================================== */

// Devuelve el emprendimiento del usuario en sesión (o null si aún no creó uno).
function obtenerMiEmprendimiento(correo) {
  const emprendimientos = EH.storage.obtener('eh_emprendimientos', []);
  return emprendimientos.find(e => e.propietario === correo) || null;
}

document.addEventListener('DOMContentLoaded', function () {

  // Todas las pantallas de este archivo son exclusivas del emprendedor.
  const enPanelEmprendedor = document.body.dataset.paginaEmprendedor;
  if (!enPanelEmprendedor) return;

  if (!EH.protegerPagina('emprendedor', '../registro.html')) return;

  const sesion = EH.sesion.obtener();

  /* ==========================================================================
     A) PANEL PRINCIPAL (panel.html)
     ========================================================================== */
  const resumenProductos = document.getElementById('resumenTotalProductos');
  if (resumenProductos) {
    const miEmp = obtenerMiEmprendimiento(sesion.correo);
    const productos = miEmp ? EH.storage.obtener('eh_productos', []).filter(p => p.emprendimientoId === miEmp.id) : [];
    const pedidos = miEmp ? EH.storage.obtener('eh_pedidos', []).filter(p => p.emprendimientoId === miEmp.id) : [];
    const pendientes = pedidos.filter(p => p.estado === 'Pendiente');

    document.getElementById('resumenNombreEmp').textContent = miEmp ? miEmp.nombre : 'Aún no creaste tu emprendimiento';
    resumenProductos.textContent = productos.length;
    document.getElementById('resumenTotalPedidos').textContent = pedidos.length;
    document.getElementById('resumenPendientes').textContent = pendientes.length;

    if (!miEmp) {
      document.getElementById('avisoSinEmprendimiento').classList.remove('oculto');
    }
  }

  /* ==========================================================================
     B) MI EMPRENDIMIENTO (mi-emprendimiento.html)
     ========================================================================== */
  const formEmprendimiento = document.getElementById('formEmprendimiento');
  if (formEmprendimiento) {
    const miEmp = obtenerMiEmprendimiento(sesion.correo);

    // Si ya existe, precargamos el formulario con sus datos (modo edición).
    if (miEmp) {
      document.getElementById('empNombreInput').value = miEmp.nombre;
      document.getElementById('empDescripcionInput').value = miEmp.descripcion;
      document.getElementById('empCategoriaInput').value = miEmp.categoria;
      document.getElementById('empHorarioInput').value = miEmp.horario || '';
      document.querySelectorAll('input[name="medioPago"]').forEach(chk => {
        chk.checked = miEmp.mediosPago.includes(chk.value);
      });
      document.getElementById('tituloFormEmprendimiento').textContent = 'Editar mi emprendimiento';
      document.getElementById('btnGuardarEmprendimiento').textContent = 'Guardar cambios';
    }

    formEmprendimiento.addEventListener('submit', function (e) {
      e.preventDefault();

      const nombre = document.getElementById('empNombreInput').value.trim();
      const descripcion = document.getElementById('empDescripcionInput').value.trim();
      const categoria = document.getElementById('empCategoriaInput').value;
      const horario = document.getElementById('empHorarioInput').value.trim();
      const mediosPago = Array.from(document.querySelectorAll('input[name="medioPago"]:checked')).map(c => c.value);

      const idsError = ['errorEmpNombre', 'errorEmpDescripcion', 'errorEmpCategoria', 'errorEmpMediosPago'];
      idsError.forEach(id => document.getElementById(id).textContent = '');

      let esValido = true;

      if (nombre === '') {
        document.getElementById('errorEmpNombre').textContent = 'El nombre es obligatorio.';
        esValido = false;
      } else if (nombre.length < 3) {
        document.getElementById('errorEmpNombre').textContent = 'El nombre debe tener mínimo 3 caracteres.';
        esValido = false;
      }

      if (descripcion === '') {
        document.getElementById('errorEmpDescripcion').textContent = 'La descripción es obligatoria.';
        esValido = false;
      } else if (descripcion.length < 10) {
        document.getElementById('errorEmpDescripcion').textContent = 'La descripción debe tener mínimo 10 caracteres.';
        esValido = false;
      }

      if (categoria === '') {
        document.getElementById('errorEmpCategoria').textContent = 'Selecciona una categoría.';
        esValido = false;
      }

      if (mediosPago.length === 0) {
        document.getElementById('errorEmpMediosPago').textContent = 'Selecciona al menos un medio de pago.';
        esValido = false;
      }

      if (!esValido) return;

      const emprendimientos = EH.storage.obtener('eh_emprendimientos', []);
      const existente = emprendimientos.find(em => em.propietario === sesion.correo);

      if (existente) {
        // Editar: actualizamos los datos conservando el mismo id.
        existente.nombre = nombre;
        existente.descripcion = descripcion;
        existente.categoria = categoria;
        existente.horario = horario;
        existente.mediosPago = mediosPago;
      } else {
        // Crear nuevo emprendimiento asociado al emprendedor en sesión.
        emprendimientos.push({
          id: EH.generarId(),
          propietario: sesion.correo,
          nombre, descripcion, categoria, horario, mediosPago,
          imagen: '',
          promociones: []
        });
      }

      EH.storage.guardar('eh_emprendimientos', emprendimientos);
      document.getElementById('mensajeEmprendimiento').innerHTML =
        '<div class="mensaje mensaje-exito">✅ Datos guardados correctamente.</div>';
    });
  }

  /* ==========================================================================
     C) MIS PRODUCTOS (productos.html)
     ========================================================================== */
  const listaProductosAdmin = document.getElementById('listaProductosAdmin');
  if (listaProductosAdmin) {
    const miEmp = obtenerMiEmprendimiento(sesion.correo);

    if (!miEmp) {
      document.getElementById('avisoCrearEmprendimiento').classList.remove('oculto');
      document.getElementById('seccionProductos').classList.add('oculto');
      return;
    }

    const formProducto = document.getElementById('formProducto');
    let editandoId = null; // si no es null, el formulario está EDITANDO ese producto

    function pintarProductos() {
      const productos = EH.storage.obtener('eh_productos', []).filter(p => p.emprendimientoId === miEmp.id);

      if (productos.length === 0) {
        listaProductosAdmin.innerHTML = '<div class="estado-vacio"><p>Todavía no agregaste productos.</p></div>';
        return;
      }

      listaProductosAdmin.innerHTML = productos.map(p => `
        <div class="producto-admin">
          <div class="producto-admin__nombre">
            <strong>${p.nombre}</strong>
            <span>${p.categoria} · Stock: ${p.stock}</span>
          </div>
          <div>S/ ${p.precio.toFixed(2)}</div>
          <button class="btn btn-secundario" data-accion="editar" data-id="${p.id}">Editar</button>
          <button class="btn btn-alerta" data-accion="eliminar" data-id="${p.id}">Eliminar</button>
        </div>
      `).join('');

      listaProductosAdmin.querySelectorAll('[data-accion="editar"]').forEach(btn => {
        btn.addEventListener('click', function () {
          const producto = productos.find(p => p.id === btn.dataset.id);
          editandoId = producto.id;
          document.getElementById('prodNombreInput').value = producto.nombre;
          document.getElementById('prodDescripcionInput').value = producto.descripcion;
          document.getElementById('prodCategoriaInput').value = producto.categoria;
          document.getElementById('prodPrecioInput').value = producto.precio;
          document.getElementById('prodStockInput').value = producto.stock;
          document.getElementById('tituloFormProducto').textContent = 'Editar producto';
          document.getElementById('btnGuardarProducto').textContent = 'Guardar cambios';
          formProducto.scrollIntoView({ behavior: 'smooth' });
        });
      });

      listaProductosAdmin.querySelectorAll('[data-accion="eliminar"]').forEach(btn => {
        btn.addEventListener('click', async function () {
          const confirmado = await EH.confirmar('¿Estás seguro de que deseas eliminar este producto?');
          if (!confirmado) return;
          let todos = EH.storage.obtener('eh_productos', []);
          todos = todos.filter(p => p.id !== btn.dataset.id);
          EH.storage.guardar('eh_productos', todos);
          EH.toast('Producto eliminado.');
          pintarProductos();
        });
      });
    }

    function limpiarFormularioProducto() {
      formProducto.reset();
      editandoId = null;
      document.getElementById('tituloFormProducto').textContent = 'Agregar producto';
      document.getElementById('btnGuardarProducto').textContent = 'Agregar producto';
    }

    document.getElementById('btnCancelarEdicionProducto').addEventListener('click', limpiarFormularioProducto);

    formProducto.addEventListener('submit', function (e) {
      e.preventDefault();

      const nombre = document.getElementById('prodNombreInput').value.trim();
      const descripcion = document.getElementById('prodDescripcionInput').value.trim();
      const categoria = document.getElementById('prodCategoriaInput').value;
      const precio = parseFloat(document.getElementById('prodPrecioInput').value);
      const stock = parseInt(document.getElementById('prodStockInput').value, 10);

      const idsError = ['errorProdNombre', 'errorProdDescripcion', 'errorProdCategoria', 'errorProdPrecio', 'errorProdStock'];
      idsError.forEach(id => document.getElementById(id).textContent = '');

      let esValido = true;

      if (nombre === '') {
        document.getElementById('errorProdNombre').textContent = 'El nombre es obligatorio.';
        esValido = false;
      } else if (nombre.length < 3) {
        document.getElementById('errorProdNombre').textContent = 'El nombre debe tener mínimo 3 caracteres.';
        esValido = false;
      }

      if (descripcion === '') {
        document.getElementById('errorProdDescripcion').textContent = 'La descripción es obligatoria.';
        esValido = false;
      }

      if (categoria === '') {
        document.getElementById('errorProdCategoria').textContent = 'Selecciona una categoría.';
        esValido = false;
      }

      if (isNaN(precio) || precio <= 0) {
        document.getElementById('errorProdPrecio').textContent = 'El precio debe ser mayor que 0.';
        esValido = false;
      }

      if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        document.getElementById('errorProdStock').textContent = 'El stock debe ser un número entero mayor o igual a 0.';
        esValido = false;
      }

      if (!esValido) return;

      let productos = EH.storage.obtener('eh_productos', []);

      if (editandoId) {
        const producto = productos.find(p => p.id === editandoId);
        producto.nombre = nombre;
        producto.descripcion = descripcion;
        producto.categoria = categoria;
        producto.precio = precio;
        producto.stock = stock;
        EH.toast('Producto actualizado correctamente.');
      } else {
        productos.push({
          id: EH.generarId(),
          emprendimientoId: miEmp.id,
          nombre, descripcion, categoria, precio, stock, imagen: ''
        });
        EH.toast('Producto agregado correctamente.');
      }

      EH.storage.guardar('eh_productos', productos);
      limpiarFormularioProducto();
      pintarProductos();
    });

    pintarProductos();
  }

  /* ==========================================================================
     D) PEDIDOS DEL EMPRENDEDOR (pedidos.html)
     ========================================================================== */
  const listaPedidosAdmin = document.getElementById('listaPedidosAdmin');
  if (listaPedidosAdmin) {
    const miEmp = obtenerMiEmprendimiento(sesion.correo);

    if (!miEmp) {
      document.getElementById('avisoCrearEmprendimientoPedidos').classList.remove('oculto');
      return;
    }

    const ESTADOS = ['Pendiente', 'En preparación', 'En camino', 'Entregado', 'Cancelado'];

    function pintarPedidos() {
      const pedidos = EH.storage.obtener('eh_pedidos', []).filter(p => p.emprendimientoId === miEmp.id);

      if (pedidos.length === 0) {
        listaPedidosAdmin.innerHTML = '<div class="estado-vacio"><p>Todavía no recibiste pedidos.</p></div>';
        return;
      }

      // Mostramos los más recientes primero.
      listaPedidosAdmin.innerHTML = pedidos.slice().reverse().map(p => `
        <div class="pedido-admin">
          <div class="pedido-admin__top">
            <span class="pedido-admin__numero">Pedido ${p.numero}</span>
            <select class="estado-select" data-numero="${p.numero}">
              ${ESTADOS.map(e => `<option value="${e}" ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>
          <ul class="pedido-admin__lista">
            ${p.productos.map(pr => `<li>${pr.cantidad} × ${pr.nombre} — S/ ${(pr.precio * pr.cantidad).toFixed(2)}</li>`).join('')}
          </ul>
          <div class="pedido-admin__datos">
            <div><strong>Cliente:</strong> ${p.clienteNombre} (${p.clienteCorreo})</div>
            <div><strong>Dirección:</strong> ${p.direccion} · <strong>Pago:</strong> ${p.metodoPago}</div>
            <div><strong>Total:</strong> S/ ${p.total.toFixed(2)} · ${p.fecha}</div>
          </div>
        </div>
      `).join('');

      listaPedidosAdmin.querySelectorAll('.estado-select').forEach(select => {
        select.addEventListener('change', function () {
          const todos = EH.storage.obtener('eh_pedidos', []);
          const pedido = todos.find(p => p.numero === select.dataset.numero);
          pedido.estado = select.value;
          EH.storage.guardar('eh_pedidos', todos);
          EH.toast('Estado del pedido actualizado.');
        });
      });
    }

    pintarPedidos();
  }

});
