/* ==========================================================================
   EmpreHub - favoritos.js
   Manejo de Favoritos del Cliente.
   Integrado con Supabase PostgreSQL y RLS.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {
  const contenedor = document.getElementById('listaFavoritos');
  if (!contenedor) return;

  // Proteger página: exige sesión activa de cliente
  const tieneAcceso = await EH.protegerPagina('customer', 'registro.html');
  if (!tieneAcceso) return;

  const sesion = EH.sesion.obtener();

  async function pintarFavoritos() {
    contenedor.innerHTML = `
      <div class="estado-cargando">
        <div class="spinner"></div>
        <p>Cargando tus favoritos...</p>
      </div>`;

    try {
      let emprendimientos = [];
      if (EH.client && EH.client.favorites) {
        emprendimientos = await EH.client.favorites.listByUser(sesion.id || sesion.correo);
      }

      if (!emprendimientos || emprendimientos.length === 0) {
        contenedor.innerHTML = `
          <div class="estado-vacio">
            <div class="estado-vacio__icono">${EH.icon('heart')}</div>
            <p>Todavía no tienes emprendimientos guardados en tus favoritos.</p>
            <a href="inicio.html" class="btn btn-primario" style="margin-top: 16px;">Explorar emprendimientos</a>
          </div>`;
        return;
      }

      contenedor.innerHTML = emprendimientos.map(emp => {
        const nombreCat = (emp.category && emp.category.name) ? emp.category.name : (emp.categoria || 'Emprendimiento');
        const imagenHtml = emp.logo_url
          ? `<img src="${EH.escapeHtml(emp.logo_url)}" alt="${EH.escapeHtml(emp.name)}" class="tarjeta-emprendimiento__foto" loading="lazy">`
          : `<div class="tarjeta-emprendimiento__imagen" aria-hidden="true">${EH.categoryIcon(emp.category || nombreCat)}</div>`;

        return `
          <article class="card tarjeta-emprendimiento">
            ${imagenHtml}
            <button class="tarjeta-emprendimiento__favorito tarjeta-emprendimiento__favorito--activo"
                    data-id="${EH.escapeHtml(emp.id)}" 
                    title="Quitar de favoritos"
                    aria-label="Quitar de favoritos a ${EH.escapeHtml(emp.name)}">
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

      // Eventos para quitar de favoritos
      contenedor.querySelectorAll('.tarjeta-emprendimiento__favorito').forEach(btn => {
        btn.addEventListener('click', async function () {
          const empId = btn.dataset.id;
          btn.disabled = true;
          try {
            await EH.client.favorites.toggle(sesion.id || sesion.correo, empId);
            EH.toast('Quitado de tus favoritos');
            await pintarFavoritos();
          } catch (e) {
            console.error(e);
            EH.toast('No se pudo quitar de favoritos.');
            btn.disabled = false;
          }
        });
      });

    } catch (err) {
      console.error('Error cargando favoritos:', err);
      contenedor.innerHTML = `
        <div class="estado-vacio">
          <p>Ocurrió un error al cargar tus favoritos.</p>
        </div>`;
    }
  }

  await pintarFavoritos();
});
