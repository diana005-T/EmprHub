/* ==========================================================================
   EmpreHub - emprendedor.js
   Lógica Integral del Panel del Emprendedor:
     A) panel.html             -> Resumen métrico, estado de aprobación y alertas
     B) mi-emprendimiento.html -> Creación/edición y subida de logotipo a Storage
     C) productos.html         -> Gestión de productos, stock, fotos e inventario
     D) pedidos.html           -> Gestión en tiempo real del estado de pedidos
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {
  const enPanelEmprendedor = document.body.dataset.paginaEmprendedor;
  if (!enPanelEmprendedor) return;

  // Proteger la sección: exige rol emprendedor (o admin con privilegios)
  const tieneAcceso = await EH.protegerPagina('entrepreneur', '../registro.html');
  if (!tieneAcceso) return;

  const sesion = EH.sesion.obtener();
  const userId = sesion.id || sesion.correo;

  // Función auxiliar para obtener el emprendimiento del usuario autenticado
  async function obtenerMiEmprendimiento() {
    try {
      const negocios = await EH.client.businesses.getByOwner(userId);
      return negocios && negocios.length > 0 ? negocios[0] : null;
    } catch (e) {
      console.warn('Error obteniendo emprendimiento:', e);
      return null;
    }
  }

  /* ==========================================================================
     A) RESUMEN GENERAL (panel.html)
     ========================================================================== */
  const resumenProductos = document.getElementById('resumenTotalProductos');
  if (resumenProductos) {
    const miEmp = await obtenerMiEmprendimiento();
    const nombreEmpEl = document.getElementById('resumenNombreEmp');
    const avisoSinEmp = document.getElementById('avisoSinEmprendimiento');

    if (!miEmp) {
      nombreEmpEl.textContent = 'Aún no has registrado tu emprendimiento';
      if (avisoSinEmp) avisoSinEmp.classList.remove('oculto');
      return;
    }

    nombreEmpEl.textContent = miEmp.name || miEmp.nombre;

    // Banner de estado de aprobación
    let bannerEstado = document.getElementById('bannerEstadoAprobacion');
    if (!bannerEstado) {
      bannerEstado = document.createElement('div');
      bannerEstado.id = 'bannerEstadoAprobacion';
      bannerEstado.style.marginBottom = 'var(--espacio-lg)';
      const seccion = document.querySelector('.panel__contenido');
      if (seccion) seccion.insertBefore(bannerEstado, seccion.querySelector('.panel__resumen'));
    }

    const estado = miEmp.status || 'pending';
    if (estado === 'pending') {
      bannerEstado.className = 'mensaje';
      bannerEstado.style.background = '#FFF3CD';
      bannerEstado.style.color = '#856404';
      bannerEstado.style.border = '1px solid #FFEEBA';
      bannerEstado.innerHTML = '⏳ <strong>Emprendimiento en revisión:</strong> Tu negocio está pendiente de aprobación por el equipo de administración. Una vez aprobado, aparecerá automáticamente en el catálogo público.';
    } else if (estado === 'published') {
      bannerEstado.className = 'mensaje mensaje-exito';
      bannerEstado.innerHTML = '✅ <strong>Emprendimiento Publicado:</strong> Tu negocio se encuentra activo y visible para todos los clientes en el catálogo.';
    } else if (estado === 'rejected') {
      bannerEstado.className = 'mensaje mensaje-error';
      bannerEstado.innerHTML = `❌ <strong>Emprendimiento Rechazado:</strong> ${EH.escapeHtml(miEmp.status_reason || 'Por favor revisa la información de tu negocio.')}`;
    } else if (estado === 'suspended') {
      bannerEstado.className = 'mensaje mensaje-error';
      bannerEstado.innerHTML = `⚠️ <strong>Emprendimiento Suspendido:</strong> Tu negocio ha sido pausado temporalmente. Contacta a soporte para más detalles.`;
    }

    try {
      const productos = await EH.client.products.getByBusiness(miEmp.id, { onlyActive: false });
      const pedidos = await EH.client.orders.getByBusiness(miEmp.id);
      const pendientes = pedidos.filter(p => (p.status || p.estado) === 'Pendiente');
      const ventasTotales = pedidos
        .filter(p => (p.status || p.estado) !== 'Cancelado')
        .reduce((sum, p) => sum + Number(p.total_amount || p.total || 0), 0);

      resumenProductos.textContent = productos.length;
      document.getElementById('resumenTotalPedidos').textContent = pedidos.length;
      document.getElementById('resumenPendientes').textContent = pendientes.length;

      let elVentas = document.getElementById('resumenVentasTotales');
      if (!elVentas) {
        const contResumen = document.querySelector('.panel__resumen');
        if (contResumen) {
          const cardVentas = document.createElement('div');
          cardVentas.className = 'panel__resumen-tarjeta';
          cardVentas.innerHTML = `<strong id="resumenVentasTotales">S/ 0.00</strong> Ingresos generados`;
          contResumen.appendChild(cardVentas);
          elVentas = document.getElementById('resumenVentasTotales');
        }
      }
      if (elVentas) elVentas.textContent = 'S/ ' + ventasTotales.toFixed(2);

    } catch (e) {
      console.warn('Error cargando métricas:', e);
    }
  }

  /* ==========================================================================
     B) MI EMPRENDIMIENTO (mi-emprendimiento.html)
     ========================================================================== */
  const formEmprendimiento = document.getElementById('formEmprendimiento');
  if (formEmprendimiento) {
    const miEmp = await obtenerMiEmprendimiento();
    let logoFileSeleccionado = null;
    const categoriaSelect = document.getElementById('empCategoriaInput');
    const categoriaError = document.getElementById('errorEmpCategoria');

    let categorias;
    try {
      categorias = await EH.client.categories.getAll();
      if (!Array.isArray(categorias) || categorias.length === 0) {
        throw new Error('No hay categorías disponibles.');
      }
    } catch (err) {
      console.error('Error cargando categorías:', err);
      categoriaError.textContent = 'No se pudieron cargar las categorías. Actualiza la página e inténtalo nuevamente.';
      document.getElementById('btnGuardarEmprendimiento').disabled = true;
      return;
    }

    categoriaSelect.innerHTML = '<option value="">Selecciona una categoría</option>';
    categorias.forEach(categoria => {
      const option = document.createElement('option');
      option.value = EH.client.isLive ? categoria.id : categoria.name;
      option.textContent = `${categoria.icon || ''} ${categoria.name}`.trim();
      categoriaSelect.appendChild(option);
    });

    const categoriaActual = (miEmp && miEmp.category && miEmp.category.name) ||
      (miEmp && miEmp.categoria) || '';
    const categoriaActualId = miEmp && miEmp.category_id;
    const categoriaPorNombre = categorias.find(categoria => categoria.name === categoriaActual);
    categoriaSelect.value = EH.client.isLive
      ? (categoriaActualId || (categoriaPorNombre && categoriaPorNombre.id) || '')
      : categoriaActual;

    // Agregar campo de carga de Logo si no existe en el HTML
    let contenedorLogo = document.getElementById('campoLogoEmprendimiento');
    if (!contenedorLogo) {
      contenedorLogo = document.createElement('div');
      contenedorLogo.id = 'campoLogoEmprendimiento';
      contenedorLogo.className = 'campo';
      contenedorLogo.innerHTML = `
        <label for="empLogoInput">Logotipo o Fotografía del negocio (Máx 2MB, JPG/PNG/WebP)</label>
        <input type="file" id="empLogoInput" accept="image/jpeg,image/png,image/webp">
        <div id="vistaPreviaLogo" style="margin-top:8px;"></div>
      `;
      formEmprendimiento.insertBefore(contenedorLogo, formEmprendimiento.querySelector('.campo'));

      const inputLogo = document.getElementById('empLogoInput');
      const vistaLogo = document.getElementById('vistaPreviaLogo');
      inputLogo.addEventListener('change', () => {
        if (inputLogo.files && inputLogo.files[0]) {
          logoFileSeleccionado = inputLogo.files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
            vistaLogo.innerHTML = `<img src="${e.target.result}" alt="Vista previa logo" style="max-height:80px; border-radius:8px; border:1px solid #ddd;">`;
          };
          reader.readAsDataURL(logoFileSeleccionado);
        }
      });
    }

    // Precargar datos si ya existe
    if (miEmp) {
      document.getElementById('empNombreInput').value = miEmp.name || miEmp.nombre || '';
      document.getElementById('empDescripcionInput').value = miEmp.description || miEmp.descripcion || '';
      document.getElementById('empHorarioInput').value = miEmp.operating_hours || miEmp.horario || '';

      const medios = miEmp.payment_methods || miEmp.mediosPago || [];
      document.querySelectorAll('input[name="medioPago"]').forEach(chk => {
        chk.checked = medios.includes(chk.value);
      });

      if (miEmp.logo_url) {
        document.getElementById('vistaPreviaLogo').innerHTML = `
          <img src="${EH.escapeHtml(miEmp.logo_url)}" alt="Logo actual" style="max-height:80px; border-radius:8px; border:1px solid #ddd;">
        `;
      }

      document.getElementById('tituloFormEmprendimiento').textContent = 'Editar mi emprendimiento';
      document.getElementById('btnGuardarEmprendimiento').textContent = 'Guardar cambios';
    }

    formEmprendimiento.addEventListener('submit', async function (e) {
      e.preventDefault();

      const btnSubmit = document.getElementById('btnGuardarEmprendimiento');
      const nombre = document.getElementById('empNombreInput').value.trim();
      const descripcion = document.getElementById('empDescripcionInput').value.trim();
      const categoria = document.getElementById('empCategoriaInput').value;
      const horario = document.getElementById('empHorarioInput').value.trim();
      const mediosPago = Array.from(document.querySelectorAll('input[name="medioPago"]:checked')).map(c => c.value);

      const idsError = ['errorEmpNombre', 'errorEmpDescripcion', 'errorEmpCategoria', 'errorEmpMediosPago'];
      idsError.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });

      let esValido = true;

      if (nombre.length < 3) {
        document.getElementById('errorEmpNombre').textContent = 'El nombre debe tener mínimo 3 caracteres.';
        esValido = false;
      }

      if (descripcion.length < 10) {
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

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Guardando datos...';

      try {
        let empGuardado = null;

        if (miEmp) {
          empGuardado = await EH.client.businesses.update(miEmp.id, {
            name: nombre,
            description: descripcion,
            category_id: categoria,
            operating_hours: horario,
            payment_methods: mediosPago
          });
        } else {
          empGuardado = await EH.client.businesses.create({
            owner_id: userId,
            name: nombre,
            description: descripcion,
            category_id: categoria,
            operating_hours: horario,
            payment_methods: mediosPago
          });
        }

        // Subir logo si se seleccionó archivo
        if (logoFileSeleccionado && empGuardado) {
          btnSubmit.textContent = 'Subiendo fotografía del logo...';
          await EH.client.storage.uploadBusinessLogo(logoFileSeleccionado, empGuardado.id || miEmp.id);
        }

        document.getElementById('mensajeEmprendimiento').innerHTML =
          '<div class="mensaje mensaje-exito" role="alert">✅ Datos guardados correctamente. Tu emprendimiento está listo para revisión.</div>';
        EH.toast('Emprendimiento guardado exitosamente.');

      } catch (err) {
        console.error(err);
        document.getElementById('mensajeEmprendimiento').innerHTML =
          `<div class="mensaje mensaje-error" role="alert">❌ ${EH.escapeHtml(err.message || 'Error al guardar emprendimiento')}</div>`;
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = miEmp ? 'Guardar cambios' : 'Crear emprendimiento';
      }
    });
  }

  /* ==========================================================================
     C) GESTIÓN DE PRODUCTOS E IMÁGENES (productos.html)
     ========================================================================== */
  const listaProductosAdmin = document.getElementById('listaProductosAdmin');
  if (listaProductosAdmin) {
    const miEmp = await obtenerMiEmprendimiento();

    if (!miEmp) {
      document.getElementById('avisoCrearEmprendimiento').classList.remove('oculto');
      document.getElementById('seccionProductos').classList.add('oculto');
      return;
    }

    const formProducto = document.getElementById('formProducto');
    let editandoId = null;
    let fotoProductoSeleccionada = null;

    // Agregar campo de carga de fotografía de producto
    let campoFoto = document.getElementById('campoFotoProducto');
    if (!campoFoto) {
      campoFoto = document.createElement('div');
      campoFoto.id = 'campoFotoProducto';
      campoFoto.className = 'campo';
      campoFoto.innerHTML = `
        <label for="prodFotoInput">Fotografía real del producto (Máx 2MB, JPG/PNG/WebP, máx 3 por producto)</label>
        <input type="file" id="prodFotoInput" accept="image/jpeg,image/png,image/webp">
        <div id="vistaPreviaFotoProd" style="margin-top:6px;"></div>
      `;
      formProducto.insertBefore(campoFoto, formProducto.querySelector('.carrito__acciones'));

      const inputFoto = document.getElementById('prodFotoInput');
      const vistaFoto = document.getElementById('vistaPreviaFotoProd');
      inputFoto.addEventListener('change', () => {
        if (inputFoto.files && inputFoto.files[0]) {
          fotoProductoSeleccionada = inputFoto.files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
            vistaFoto.innerHTML = `<img src="${e.target.result}" alt="Vista previa producto" style="max-height:80px; border-radius:8px; border:1px solid #ddd;">`;
          };
          reader.readAsDataURL(fotoProductoSeleccionada);
        }
      });
    }

    async function pintarProductos() {
      listaProductosAdmin.innerHTML = '<div class="estado-cargando"><div class="spinner"></div><p>Cargando productos...</p></div>';

      try {
        const productos = await EH.client.products.getByBusiness(miEmp.id, { onlyActive: false });

        if (!productos || productos.length === 0) {
          listaProductosAdmin.innerHTML = '<div class="estado-vacio"><p>Todavía no has agregado ningún producto a tu catálogo.</p></div>';
          return;
        }

        listaProductosAdmin.innerHTML = productos.map(p => {
          const imagenHtml = p.main_image_url || p.imagen
            ? `<img src="${EH.escapeHtml(p.main_image_url || p.imagen)}" alt="${EH.escapeHtml(p.name || p.nombre)}" style="width:48px; height:48px; object-fit:cover; border-radius:6px;">`
            : `<div style="width:48px; height:48px; display:flex; align-items:center; justify-content:center; background:#eee; border-radius:6px;">📦</div>`;

          return `
            <div class="producto-admin" style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
              ${imagenHtml}
              <div class="producto-admin__nombre" style="flex:1;">
                <strong>${EH.escapeHtml(p.name || p.nombre)}</strong>
                <div><span style="font-size:0.85rem; color:#666;">${EH.escapeHtml((p.category && p.category.name) || p.categoria || '')}</span> · <strong>Stock: ${p.stock}</strong></div>
              </div>
              <div style="font-weight:700; color:var(--color-azul);">S/ ${Number(p.price || p.precio).toFixed(2)}</div>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secundario" data-accion="editar" data-id="${EH.escapeHtml(p.id)}" type="button">Editar</button>
                <button class="btn btn-alerta" data-accion="eliminar" data-id="${EH.escapeHtml(p.id)}" type="button">Eliminar</button>
              </div>
            </div>
          `;
        }).join('');

        // Manejar edición
        listaProductosAdmin.querySelectorAll('[data-accion="editar"]').forEach(btn => {
          btn.addEventListener('click', function () {
            const prod = productos.find(p => p.id === btn.dataset.id);
            if (!prod) return;
            editandoId = prod.id;
            document.getElementById('prodNombreInput').value = prod.name || prod.nombre;
            document.getElementById('prodDescripcionInput').value = prod.description || prod.descripcion || '';
            document.getElementById('prodCategoriaInput').value = (prod.category && prod.category.name) || prod.categoria || '';
            document.getElementById('prodPrecioInput').value = prod.price || prod.precio;
            document.getElementById('prodStockInput').value = prod.stock;

            document.getElementById('tituloFormProducto').textContent = 'Editar producto';
            document.getElementById('btnGuardarProducto').textContent = 'Guardar cambios';
            formProducto.scrollIntoView({ behavior: 'smooth' });
          });
        });

        // Manejar eliminación
        listaProductosAdmin.querySelectorAll('[data-accion="eliminar"]').forEach(btn => {
          btn.addEventListener('click', async function () {
            const confirmado = await EH.confirmar('¿Estás seguro de que deseas eliminar este producto?');
            if (!confirmado) return;

            try {
              await EH.client.products.delete(btn.dataset.id);
              EH.toast('Producto eliminado correctamente.');
              await pintarProductos();
            } catch (err) {
              console.error(err);
              EH.toast('No se pudo eliminar el producto.');
            }
          });
        });

      } catch (err) {
        console.error(err);
        listaProductosAdmin.innerHTML = '<div class="estado-vacio"><p>Error al cargar productos.</p></div>';
      }
    }

    function limpiarFormularioProducto() {
      formProducto.reset();
      editandoId = null;
      fotoProductoSeleccionada = null;
      document.getElementById('vistaPreviaFotoProd').innerHTML = '';
      document.getElementById('tituloFormProducto').textContent = 'Agregar producto';
      document.getElementById('btnGuardarProducto').textContent = 'Agregar producto';
    }

    document.getElementById('btnCancelarEdicionProducto').addEventListener('click', limpiarFormularioProducto);

    formProducto.addEventListener('submit', async function (e) {
      e.preventDefault();

      const btnSubmit = document.getElementById('btnGuardarProducto');
      const nombre = document.getElementById('prodNombreInput').value.trim();
      const descripcion = document.getElementById('prodDescripcionInput').value.trim();
      const categoria = document.getElementById('prodCategoriaInput').value;
      const precio = parseFloat(document.getElementById('prodPrecioInput').value);
      const stock = parseInt(document.getElementById('prodStockInput').value, 10);

      const idsError = ['errorProdNombre', 'errorProdDescripcion', 'errorProdCategoria', 'errorProdPrecio', 'errorProdStock'];
      idsError.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });

      let esValido = true;

      if (nombre.length < 3) {
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

      if (isNaN(precio) || precio < 0.10) {
        document.getElementById('errorProdPrecio').textContent = 'El precio debe ser de al menos S/ 0.10.';
        esValido = false;
      }

      if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        document.getElementById('errorProdStock').textContent = 'El stock debe ser un entero mayor o igual a 0.';
        esValido = false;
      }

      if (!esValido) return;

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Guardando producto...';

      try {
        let productoResultado = null;

        if (editandoId) {
          productoResultado = await EH.client.products.update(editandoId, {
            name: nombre,
            description: descripcion,
            price: precio,
            stock: stock
          });
          EH.toast('Producto actualizado correctamente.');
        } else {
          // Crear nuevo producto (sujeto a límite de 20 por el trigger de plan free)
          productoResultado = await EH.client.products.create({
            business_id: miEmp.id,
            name: nombre,
            description: descripcion,
            price: precio,
            stock: stock,
            is_active: true
          });
          EH.toast('Producto agregado correctamente.');
        }

        // Subir foto si se seleccionó archivo
        if (fotoProductoSeleccionada && productoResultado) {
          btnSubmit.textContent = 'Subiendo imagen a Storage...';
          await EH.client.storage.uploadProductImage(
            fotoProductoSeleccionada,
            miEmp.id,
            productoResultado.id || editandoId
          );
        }

        limpiarFormularioProducto();
        await pintarProductos();

      } catch (err) {
        console.error(err);
        alert('Error: ' + (err.message || 'No se pudo guardar el producto.'));
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = editandoId ? 'Guardar cambios' : 'Agregar producto';
      }
    });

    await pintarProductos();
  }

  /* ==========================================================================
     D) GESTIÓN DE PEDIDOS RECIBIDOS (pedidos.html)
     ========================================================================== */
  const listaPedidosAdmin = document.getElementById('listaPedidosAdmin');
  if (listaPedidosAdmin) {
    const miEmp = await obtenerMiEmprendimiento();

    if (!miEmp) {
      document.getElementById('avisoCrearEmprendimientoPedidos').classList.remove('oculto');
      return;
    }

    const TRANSICIONES_ESTADO = {
      'Pendiente': ['En preparación', 'Cancelado'],
      'En preparación': ['En camino', 'Cancelado'],
      'En camino': ['Entregado', 'Cancelado'],
      'Entregado': [],
      'Cancelado': []
    };

    async function pintarPedidos() {
      listaPedidosAdmin.innerHTML = '<div class="estado-cargando"><div class="spinner"></div><p>Cargando pedidos recibidos...</p></div>';

      try {
        const pedidos = await EH.client.orders.getByBusiness(miEmp.id);

        if (!pedidos || pedidos.length === 0) {
          listaPedidosAdmin.innerHTML = '<div class="estado-vacio"><div class="estado-vacio__icono">🧾</div><p>Todavía no has recibido ningún pedido.</p></div>';
          return;
        }

        listaPedidosAdmin.innerHTML = pedidos.map(p => {
          const numero = p.order_number || p.numero || 'EH-0000';
          const fecha = p.created_at ? new Date(p.created_at).toLocaleString('es-PE') : (p.fecha || 'Reciente');
          const estadoActual = p.status || p.estado || 'Pendiente';
          const estadosDisponibles = [estadoActual, ...(TRANSICIONES_ESTADO[estadoActual] || [])];
          const total = Number(p.total_amount || p.total || 0).toFixed(2);
          const items = p.items || p.productos || [];

          return `
            <div class="pedido-admin">
              <div class="pedido-admin__top" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <span class="pedido-admin__numero">Pedido ${EH.escapeHtml(numero)} · <small>${EH.escapeHtml(fecha)}</small></span>
                <div>
                  <label style="font-size:0.85rem; font-weight:600; margin-right:6px;">Estado:</label>
                  <select class="estado-select" data-id="${EH.escapeHtml(p.id || numero)}" data-estado-actual="${EH.escapeHtml(estadoActual)}" aria-label="Cambiar estado del pedido">
                    ${estadosDisponibles.map(e => `<option value="${e}" ${e === estadoActual ? 'selected' : ''}>${e}</option>`).join('')}
                  </select>
                </div>
              </div>
              <ul class="pedido-admin__lista" style="margin:12px 0;">
                ${items.map(pr => `
                  <li>
                    <strong>${pr.quantity || pr.cantidad} × ${EH.escapeHtml(pr.product_name || pr.nombre)}</strong>
                    — S/ ${Number(pr.subtotal || (pr.unit_price * pr.quantity) || 0).toFixed(2)}
                  </li>
                `).join('')}
              </ul>
              <div class="pedido-admin__datos" style="background:#f9fafb; padding:10px; border-radius:6px; font-size:0.9rem;">
                <div><strong>Cliente:</strong> ${EH.escapeHtml(p.customer_name || p.clienteNombre || 'Cliente')} (${EH.escapeHtml(p.customer_phone || p.telefono || 'Sin teléfono')})</div>
                <div><strong>Entrega:</strong> ${EH.escapeHtml(p.delivery_address || p.direccion || '')}</div>
                <div><strong>Método de pago:</strong> ${EH.escapeHtml(p.payment_method || p.metodoPago || 'Coordinado')} | <strong style="color:var(--color-azul);">Total: S/ ${total}</strong></div>
              </div>
            </div>
          `;
        }).join('');

        // Evento de cambio de estado de pedido
        listaPedidosAdmin.querySelectorAll('.estado-select').forEach(select => {
          select.addEventListener('change', async function () {
            const pedidoId = select.dataset.id;
            const estadoAnterior = select.dataset.estadoActual || select.value;
            const nuevoEstado = select.value;
            select.disabled = true;

            try {
              await EH.client.orders.updateStatus(pedidoId, nuevoEstado);
              select.dataset.estadoActual = nuevoEstado;
              const estadosDisponibles = [nuevoEstado, ...(TRANSICIONES_ESTADO[nuevoEstado] || [])];
              select.innerHTML = estadosDisponibles
                .map(estado => `<option value="${estado}" ${estado === nuevoEstado ? 'selected' : ''}>${estado}</option>`)
                .join('');
              EH.toast(`Estado del pedido cambiado a "${nuevoEstado}".`);
            } catch (err) {
              console.error(err);
              select.value = estadoAnterior;
              EH.toast('Error al actualizar el estado del pedido.');
            } finally {
              select.disabled = false;
            }
          });
        });

      } catch (err) {
        console.error(err);
        listaPedidosAdmin.innerHTML = '<div class="estado-vacio"><p>Error al cargar pedidos.</p></div>';
      }
    }

    await pintarPedidos();
  }

});
