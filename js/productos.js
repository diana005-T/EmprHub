/* ==========================================================================
   EmpreHub - productos.js
   Manejo de Catálogo Público:
     A) pages/inicio.html         -> Catálogo público de emprendimientos, filtros y buscador
     B) pages/emprendimiento.html -> Perfil público del emprendimiento y sus productos
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {

  /* ==========================================================================
     A) CATÁLOGO PRINCIPAL PÚBLICO (pages/inicio.html)
     ========================================================================== */
  const contenedorEmprendimientos = document.getElementById('listaEmprendimientos');

  if (contenedorEmprendimientos) {
    const sesion = EH.sesion.obtener();
    const inputBuscar = document.getElementById('inputBuscar');
    const contenedorCategorias = document.getElementById('listaCategorias');

    let categoriaActivaId = 'Todas';
    let categorias = [];

    // Cargar categorías dinámicas
    async function cargarCategorias() {
      try {
        if (EH.client && EH.client.categories) {
          categorias = await EH.client.categories.getAll();
        }
      } catch (e) {
        console.warn('Usando categorías por defecto:', e);
        categorias = [
          { id: 'Platos', name: 'Platos' },
          { id: 'Bebidas', name: 'Bebidas' },
          { id: 'Productos', name: 'Productos' },
          { id: 'Postres', name: 'Postres' }
        ];
      }
      pintarBotonesCategorias();
    }

    function pintarBotonesCategorias() {
      let html = `<button class="categoria ${categoriaActivaId === 'Todas' ? 'categoria--activa' : ''}" data-id="Todas" type="button">${EH.icon('layout-dashboard')} Todas</button>`;
      categorias.forEach(cat => {
        const catId = cat.id || cat.name;
        const activa = (categoriaActivaId === catId || categoriaActivaId === cat.name) ? 'categoria--activa' : '';
        html += `<button class="categoria ${activa}" data-id="${EH.escapeHtml(catId)}" type="button">${EH.categoryIcon(cat)} ${EH.escapeHtml(cat.name)}</button>`;
      });
      contenedorCategorias.innerHTML = html;

      contenedorCategorias.querySelectorAll('.categoria').forEach(btn => {
        btn.addEventListener('click', function () {
          categoriaActivaId = btn.dataset.id;
          pintarBotonesCategorias();
          cargarEmprendimientos();
        });
      });
    }

    async function cargarEmprendimientos() {
      contenedorEmprendimientos.innerHTML = `
        <div class="estado-cargando">
          <div class="spinner"></div>
          <p>Cargando emprendimientos...</p>
        </div>`;

      try {
        const textoBusqueda = inputBuscar ? inputBuscar.value.trim() : '';
        let lista = [];

        if (EH.client && EH.client.businesses) {
          lista = await EH.client.businesses.getAllPublished({
            categoryId: categoriaActivaId,
            search: textoBusqueda
          });
        }

        if (!lista || lista.length === 0) {
          contenedorEmprendimientos.innerHTML = `
            <div class="estado-vacio">
              <div class="estado-vacio__icono">${EH.icon('search')}</div>
              <p>No encontramos emprendimientos con los criterios seleccionados.</p>
            </div>`;
          return;
        }

        // Obtener favoritos del usuario si tiene sesión iniciada
        let favoritosUsuario = [];
        if (sesion && EH.client && EH.client.favorites) {
          try {
            const favs = await EH.client.favorites.listByUser(sesion.id || sesion.correo);
            favoritosUsuario = favs.map(f => f.id);
          } catch (e) {
            console.warn('Error cargando favoritos:', e);
          }
        }

        contenedorEmprendimientos.innerHTML = lista.map(emp => {
          const esFav = favoritosUsuario.includes(emp.id);
          const nombreCat = (emp.category && emp.category.name) ? emp.category.name : (emp.categoria || 'Emprendimiento');
          const imagenHtml = emp.logo_url
            ? `<img src="${EH.escapeHtml(emp.logo_url)}" alt="${EH.escapeHtml(emp.name)}" class="tarjeta-emprendimiento__foto" loading="lazy">`
            : `<div class="tarjeta-emprendimiento__imagen" aria-hidden="true">${EH.categoryIcon(emp.category || nombreCat)}</div>`;

          return `
            <article class="card tarjeta-emprendimiento">
              ${imagenHtml}
              <button class="tarjeta-emprendimiento__favorito ${esFav ? 'tarjeta-emprendimiento__favorito--activo' : ''}"
                      data-id="${EH.escapeHtml(emp.id)}" 
                      title="${esFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}"
                      aria-label="Favorito para ${EH.escapeHtml(emp.name)}">
                ${EH.icon('heart')}
              </button>
              <div class="tarjeta-emprendimiento__info">
                <span class="chip-categoria">${EH.escapeHtml(nombreCat)}</span>
                <h3>${EH.escapeHtml(emp.name)}</h3>
                <p>${EH.escapeHtml(emp.description)}</p>
                <a href="emprendimiento.html?id=${encodeURIComponent(emp.id)}" class="btn btn-primario btn-bloque">
                  Ver emprendimiento
                </a>
              </div>
            </article>
          `;
        }).join('');

        // Eventos en botones de favoritos
        contenedorEmprendimientos.querySelectorAll('.tarjeta-emprendimiento__favorito').forEach(btn => {
          btn.addEventListener('click', async function (e) {
            e.preventDefault();
            if (!sesion) {
              EH.toast('Inicia sesión para guardar en favoritos');
              return;
            }

            const id = btn.dataset.id;
            try {
              const ahoraEsFav = await EH.client.favorites.toggle(sesion.id || sesion.correo, id);
              btn.classList.toggle('tarjeta-emprendimiento__favorito--activo', ahoraEsFav);
              btn.innerHTML = EH.icon('heart');
              EH.toast(ahoraEsFav ? 'Agregado a tus favoritos' : 'Quitado de favoritos', ahoraEsFav ? 'favorito' : '');
            } catch (err) {
              console.error(err);
              EH.toast('No se pudo actualizar favoritos.');
            }
          });
        });

      } catch (err) {
        console.error('Error al cargar emprendimientos:', err);
        contenedorEmprendimientos.innerHTML = `
          <div class="estado-vacio">
            <p>Ocurrió un inconveniente al cargar el catálogo.</p>
          </div>`;
      }
    }

    // Buscador con debounce
    let temporizadorBusqueda;
    if (inputBuscar) {
      inputBuscar.addEventListener('input', () => {
        clearTimeout(temporizadorBusqueda);
        temporizadorBusqueda = setTimeout(cargarEmprendimientos, 300);
      });
    }

    await cargarCategorias();
    await cargarEmprendimientos();
  }

  /* ==========================================================================
     B) DETALLE PÚBLICO DEL EMPRENDIMIENTO (pages/emprendimiento.html)
     ========================================================================== */
  const contenedorDetalle = document.getElementById('detalleEmprendimiento');

  if (contenedorDetalle) {
    const sesion = EH.sesion.obtener();
    const parametros = new URLSearchParams(window.location.search);
    const id = parametros.get('id');

    if (!id) {
      contenedorDetalle.innerHTML = `
        <div class="estado-vacio">
          <p>Emprendimiento no especificado. <a href="inicio.html">Volver al catálogo</a></p>
        </div>`;
      return;
    }

    let emprendimiento = null;
    let productos = [];

    async function cargarDetalle() {
      try {
        emprendimiento = await EH.client.businesses.getById(id);
        if (!emprendimiento) throw new Error('No encontrado');

        productos = await EH.client.products.getByBusiness(id, { onlyActive: true });
        pintarEncabezado();
        pintarProductos();
      } catch (err) {
        console.error('Error cargando detalle:', err);
        contenedorDetalle.innerHTML = `
          <div class="estado-vacio">
            <p>Este emprendimiento no está disponible o no existe.</p>
            <a href="inicio.html" class="btn btn-primario" style="margin-top:16px;">Volver a emprendimientos</a>
          </div>`;
      }
    }

    async function pintarEncabezado() {
      const nombreCat = (emprendimiento.category && emprendimiento.category.name) ? emprendimiento.category.name : (emprendimiento.categoria || 'General');

      document.getElementById('empNombre').textContent = emprendimiento.name;
      document.getElementById('empDescripcion').textContent = emprendimiento.description;
      document.getElementById('empCategoria').textContent = nombreCat;
      document.getElementById('empHorario').textContent = emprendimiento.operating_hours || 'Lunes a Sábado, horario habitual';

      const medios = Array.isArray(emprendimiento.payment_methods)
        ? emprendimiento.payment_methods.join(', ')
        : (emprendimiento.mediosPago ? emprendimiento.mediosPago.join(', ') : 'Yape, Plin, Efectivo');
      document.getElementById('empMediosPago').textContent = medios;

      // Promociones
      const contPromos = document.getElementById('empPromociones');
      if (contPromos) {
        const promos = emprendimiento.promotions || [];
        if (promos.length > 0) {
          contPromos.innerHTML = promos.map(p => `<li>${EH.icon('tag')} ${EH.escapeHtml(p.title || p)}</li>`).join('');
        } else {
          contPromos.innerHTML = '<li style="color:#777;">No hay promociones activas por el momento.</li>';
        }
      }

      // Botón favorito de detalle
      const btnFav = document.getElementById('btnFavoritoDetalle');
      if (btnFav) {
        let esFav = false;
        if (sesion && EH.client && EH.client.favorites) {
          esFav = await EH.client.favorites.isFavorite(sesion.id || sesion.correo, emprendimiento.id);
        }

        btnFav.innerHTML = `${EH.icon('heart')} ${esFav ? 'En tus favoritos' : 'Agregar a favoritos'}`;
        btnFav.classList.toggle('btn-secundario', esFav);
        btnFav.classList.toggle('btn-primario', !esFav);

        btnFav.onclick = async () => {
          if (!sesion) {
            EH.toast('Inicia sesión para guardar este negocio en favoritos');
            return;
          }
          const ahoraEsFav = await EH.client.favorites.toggle(sesion.id || sesion.correo, emprendimiento.id);
          btnFav.innerHTML = `${EH.icon('heart')} ${ahoraEsFav ? 'En tus favoritos' : 'Agregar a favoritos'}`;
          btnFav.classList.toggle('btn-secundario', ahoraEsFav);
          btnFav.classList.toggle('btn-primario', !ahoraEsFav);
          EH.toast(ahoraEsFav ? 'Emprendimiento agregado a tus favoritos' : 'Quitado de favoritos', ahoraEsFav ? 'favorito' : '');
        };
      }
    }

    function pintarProductos() {
      const cont = document.getElementById('listaProductosEmprendimiento');
      if (!cont) return;

      if (productos.length === 0) {
        cont.innerHTML = '<div class="estado-vacio"><p>Este emprendimiento todavía no tiene productos disponibles en este momento.</p></div>';
        return;
      }

      cont.innerHTML = productos.map(p => {
        const tieneStock = Number(p.stock) > 0;
        const precio = Number(p.price || p.precio).toFixed(2);
        const imagenHtml = p.main_image_url || p.imagen
          ? `<img src="${EH.escapeHtml(p.main_image_url || p.imagen)}" alt="${EH.escapeHtml(p.name || p.nombre)}" class="tarjeta-producto__foto" loading="lazy">`
          : `<div class="tarjeta-producto__imagen" aria-hidden="true">${EH.icon('package')}</div>`;

        return `
          <article class="card tarjeta-producto ${!tieneStock ? 'tarjeta-producto--agotado' : ''}">
            ${imagenHtml}
            <div class="tarjeta-producto__info">
              <h4>${EH.escapeHtml(p.name || p.nombre)}</h4>
              <p>${EH.escapeHtml(p.description || p.descripcion || '')}</p>
              <div class="tarjeta-producto__precio">S/ ${precio}</div>
              <div class="tarjeta-producto__stock ${tieneStock ? '' : 'tarjeta-producto__stock--cero'}">
                ${tieneStock ? `Stock: ${p.stock}` : `${EH.icon('triangle-alert')} Agotado`}
              </div>
              <button class="btn btn-primario btn-bloque" data-id="${EH.escapeHtml(p.id)}" ${!tieneStock ? 'disabled' : ''}>
                ${tieneStock ? 'Agregar al carrito' : 'Sin stock'}
              </button>
            </div>
          </article>
        `;
      }).join('');

      // Evento de agregar al carrito
      cont.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', async function () {
          if (!sesion) {
            // Permitir guardar temporal o solicitar login
            EH.toast('Inicia sesión para completar tu pedido');
            setTimeout(() => {
              window.location.href = 'registro.html';
            }, 1000);
            return;
          }

          const prodId = btn.dataset.id;
          btn.disabled = true;
          try {
            await EH.client.cart.addItem(sesion.id || sesion.correo, prodId, 1);
            EH.toast('Producto agregado al carrito', 'carrito');
            EH.actualizarBadgeCarrito();
          } catch (err) {
            console.error(err);
            EH.toast(err.message || 'No se pudo agregar al carrito');
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    await cargarDetalle();
  }

});
