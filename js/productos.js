/* ==========================================================================
   EmpreHub - productos.js
   Este archivo maneja DOS pantallas relacionadas con emprendimientos y
   productos:

     A) pages/inicio.html         -> buscador, categorías, listado de tarjetas
     B) pages/emprendimiento.html -> detalle de un emprendimiento y sus productos

   Cada bloque revisa si sus elementos existen en la página antes de
   ejecutarse, así un mismo archivo puede servir a las dos pantallas.
   ========================================================================== */

// Categorías fijas del proyecto, con su ícono (emoji) para las tarjetas.
const EH_CATEGORIAS = [
  { nombre: 'Platos', icono: '🍽️' },
  { nombre: 'Bebidas', icono: '🥤' },
  { nombre: 'Productos', icono: '🛍️' },
  { nombre: 'Postres', icono: '🧁' }
];

document.addEventListener('DOMContentLoaded', function () {

  /* ==========================================================================
     A) PANTALLA PRINCIPAL DEL CLIENTE (pages/inicio.html)
     ========================================================================== */
  const contenedorEmprendimientos = document.getElementById('listaEmprendimientos');

  if (contenedorEmprendimientos) {
    // Protege la página: solo clientes con sesión activa pueden verla.
    if (!EH.protegerPagina('cliente', 'registro.html')) return;

    const sesion = EH.sesion.obtener();
    const inputBuscar = document.getElementById('inputBuscar');
    const contenedorCategorias = document.getElementById('listaCategorias');

    let categoriaActiva = 'Todas';

    // --- Pintar los botones de categoría ---
    function pintarCategorias() {
      let html = `<button class="categoria ${categoriaActiva === 'Todas' ? 'categoria--activa' : ''}" data-categoria="Todas">✨ Todas</button>`;
      EH_CATEGORIAS.forEach(cat => {
        html += `<button class="categoria ${categoriaActiva === cat.nombre ? 'categoria--activa' : ''}" data-categoria="${cat.nombre}">${cat.icono} ${cat.nombre}</button>`;
      });
      contenedorCategorias.innerHTML = html;

      // Cada botón de categoría filtra el listado al hacer clic.
      contenedorCategorias.querySelectorAll('.categoria').forEach(btn => {
        btn.addEventListener('click', function () {
          categoriaActiva = btn.dataset.categoria;
          pintarCategorias();
          pintarEmprendimientos();
        });
      });
    }

    // --- Pintar las tarjetas de emprendimientos según búsqueda + categoría ---
    function pintarEmprendimientos() {
      const emprendimientos = EH.storage.obtener('eh_emprendimientos', []);
      const productos = EH.storage.obtener('eh_productos', []);
      const textoBusqueda = inputBuscar.value.trim().toLowerCase();

      const resultado = emprendimientos.filter(emp => {
        // Filtro de categoría
        const coincideCategoria = categoriaActiva === 'Todas' || emp.categoria === categoriaActiva;
        if (!coincideCategoria) return false;

        // Filtro de búsqueda: por nombre de emprendimiento, categoría o producto
        if (textoBusqueda === '') return true;

        const coincideNombreEmp = emp.nombre.toLowerCase().includes(textoBusqueda);
        const coincideCategoriaEmp = emp.categoria.toLowerCase().includes(textoBusqueda);
        const productosDelEmp = productos.filter(p => p.emprendimientoId === emp.id);
        const coincideProducto = productosDelEmp.some(p => p.nombre.toLowerCase().includes(textoBusqueda));

        return coincideNombreEmp || coincideCategoriaEmp || coincideProducto;
      });

      if (resultado.length === 0) {
        contenedorEmprendimientos.innerHTML = `
          <div class="estado-vacio">
            <div class="estado-vacio__icono">🔍</div>
            <p>No encontramos resultados para tu búsqueda.</p>
          </div>`;
        return;
      }

      contenedorEmprendimientos.innerHTML = resultado.map(emp => {
        const esFav = EH.favoritos.esFavorito(sesion.correo, emp.id);
        return `
          <article class="card tarjeta-emprendimiento">
            <div class="tarjeta-emprendimiento__imagen">🏪</div>
            <button class="tarjeta-emprendimiento__favorito ${esFav ? 'tarjeta-emprendimiento__favorito--activo' : ''}"
                    data-id="${emp.id}" title="Favorito">${esFav ? '❤️' : '🤍'}</button>
            <div class="tarjeta-emprendimiento__info">
              <span class="chip-categoria">${emp.categoria}</span>
              <h3>${emp.nombre}</h3>
              <p>${emp.descripcion}</p>
              <a href="emprendimiento.html?id=${emp.id}" class="btn btn-primario btn-bloque">Ver emprendimiento</a>
            </div>
          </article>
        `;
      }).join('');

      // Botones de favorito de cada tarjeta
      contenedorEmprendimientos.querySelectorAll('.tarjeta-emprendimiento__favorito').forEach(btn => {
        btn.addEventListener('click', function () {
          const id = btn.dataset.id;
          const esFavAhora = EH.favoritos.alternar(sesion.correo, id);
          EH.toast(esFavAhora ? '❤️ Agregado a favoritos' : 'Quitado de favoritos');
          pintarEmprendimientos();
        });
      });
    }

    inputBuscar.addEventListener('input', pintarEmprendimientos);

    pintarCategorias();
    pintarEmprendimientos();
  }

  /* ==========================================================================
     B) DETALLE DE UN EMPRENDIMIENTO (pages/emprendimiento.html)
     ========================================================================== */
  const contenedorDetalle = document.getElementById('detalleEmprendimiento');

  if (contenedorDetalle) {
    if (!EH.protegerPagina('cliente', 'registro.html')) return;

    const sesion = EH.sesion.obtener();

    // Leemos el "id" del emprendimiento desde la URL: emprendimiento.html?id=xxx
    const parametros = new URLSearchParams(window.location.search);
    const id = parametros.get('id');

    const emprendimientos = EH.storage.obtener('eh_emprendimientos', []);
    const emprendimiento = emprendimientos.find(e => e.id === id);

    if (!emprendimiento) {
      contenedorDetalle.innerHTML = '<p>Este emprendimiento ya no está disponible.</p>';
      return;
    }

    const productos = EH.storage.obtener('eh_productos', [])
      .filter(p => p.emprendimientoId === id);

    // --- Encabezado del emprendimiento ---
    function pintarEncabezado() {
      const esFav = EH.favoritos.esFavorito(sesion.correo, emprendimiento.id);
      document.getElementById('empNombre').textContent = emprendimiento.nombre;
      document.getElementById('empDescripcion').textContent = emprendimiento.descripcion;
      document.getElementById('empCategoria').textContent = emprendimiento.categoria;
      document.getElementById('empHorario').textContent = emprendimiento.horario || 'No especificado';
      document.getElementById('empMediosPago').textContent = emprendimiento.mediosPago.join(', ');

      const contPromos = document.getElementById('empPromociones');
      if (emprendimiento.promociones && emprendimiento.promociones.length > 0) {
        contPromos.innerHTML = emprendimiento.promociones.map(p => `<li>🏷️ ${p}</li>`).join('');
      } else {
        contPromos.innerHTML = '<li>Este emprendimiento no tiene promociones activas.</li>';
      }

      const btnFav = document.getElementById('btnFavoritoDetalle');
      btnFav.textContent = esFav ? '❤️ En tus favoritos' : '🤍 Agregar a favoritos';
      btnFav.classList.toggle('btn-secundario', esFav);
      btnFav.classList.toggle('btn-primario', !esFav);
    }

    document.getElementById('btnFavoritoDetalle').addEventListener('click', function () {
      const esFavAhora = EH.favoritos.alternar(sesion.correo, emprendimiento.id);
      EH.toast(esFavAhora ? '❤️ Agregado a favoritos' : 'Quitado de favoritos');
      pintarEncabezado();
    });

    // --- Listado de productos del emprendimiento ---
    function pintarProductos() {
      const cont = document.getElementById('listaProductosEmprendimiento');

      if (productos.length === 0) {
        cont.innerHTML = '<div class="estado-vacio"><p>Este emprendimiento todavía no publicó productos.</p></div>';
        return;
      }

      cont.innerHTML = productos.map(p => `
        <article class="card tarjeta-producto">
          <div class="tarjeta-producto__imagen">${categoriaAIcono(p.categoria)}</div>
          <div class="tarjeta-producto__info">
            <h4>${p.nombre}</h4>
            <p>${p.descripcion}</p>
            <div class="tarjeta-producto__precio">S/ ${p.precio.toFixed(2)}</div>
            <div class="tarjeta-producto__stock">${p.stock > 0 ? `Stock: ${p.stock}` : 'Agotado'}</div>
            <button class="btn btn-primario btn-bloque" data-id="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>
              Agregar al carrito
            </button>
          </div>
        </article>
      `).join('');

      cont.querySelectorAll('button[data-id]').forEach(btn => {
        btn.addEventListener('click', function () {
          const resultado = EH.carrito.agregar(sesion.correo, btn.dataset.id, 1);
          if (resultado.ok) {
            EH.toast('🛒 Producto agregado al carrito');
            EH.actualizarBadgeCarrito();
          } else {
            EH.toast(resultado.mensaje);
          }
        });
      });
    }

    function categoriaAIcono(nombreCategoria) {
      const cat = EH_CATEGORIAS.find(c => c.nombre === nombreCategoria);
      return cat ? cat.icono : '📦';
    }

    pintarEncabezado();
    pintarProductos();
  }

});
