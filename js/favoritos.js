/* ==========================================================================
   EmpreHub - favoritos.js
   Maneja los emprendimientos marcados como favoritos por cada cliente.
   Se guardan en localStorage bajo la clave "eh_favoritos" como un array de:
     { correo: 'cliente@correo.com', emprendimientoId: 'demo-lupe' }
   ========================================================================== */

EH.favoritos = {

  // Devuelve TODOS los favoritos guardados (de todos los clientes).
  _todos() {
    return EH.storage.obtener('eh_favoritos', []);
  },

  // Devuelve solo los IDs de emprendimientos favoritos de un cliente.
  deCliente(correo) {
    return EH.favoritos._todos()
      .filter(f => f.correo === correo)
      .map(f => f.emprendimientoId);
  },

  // ¿Este emprendimiento ya es favorito de este cliente?
  esFavorito(correo, emprendimientoId) {
    return EH.favoritos._todos().some(
      f => f.correo === correo && f.emprendimientoId === emprendimientoId
    );
  },

  // Agrega o quita de favoritos (según el estado actual) y devuelve el nuevo estado.
  alternar(correo, emprendimientoId) {
    let favoritos = EH.favoritos._todos();
    const yaEsFavorito = favoritos.some(
      f => f.correo === correo && f.emprendimientoId === emprendimientoId
    );

    if (yaEsFavorito) {
      favoritos = favoritos.filter(
        f => !(f.correo === correo && f.emprendimientoId === emprendimientoId)
      );
    } else {
      favoritos.push({ correo, emprendimientoId });
    }

    EH.storage.guardar('eh_favoritos', favoritos);
    return !yaEsFavorito;
  }
};

/* --------------------------------------------------------------------------
   PANTALLA "MIS FAVORITOS" (pages/favoritos.html)
   Solo se ejecuta si la página tiene el contenedor #listaFavoritos.
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  const contenedor = document.getElementById('listaFavoritos');
  if (!contenedor) return;

  if (!EH.protegerPagina('cliente', 'registro.html')) return;

  const sesion = EH.sesion.obtener();

  function pintarFavoritos() {
    const idsFavoritos = EH.favoritos.deCliente(sesion.correo);
    const emprendimientos = EH.storage.obtener('eh_emprendimientos', [])
      .filter(emp => idsFavoritos.includes(emp.id));

    if (emprendimientos.length === 0) {
      contenedor.innerHTML = `
        <div class="estado-vacio">
          <div class="estado-vacio__icono">🤍</div>
          <p>Todavía no tienes emprendimientos favoritos.</p>
        </div>`;
      return;
    }

    contenedor.innerHTML = emprendimientos.map(emp => `
      <article class="card tarjeta-emprendimiento">
        <div class="tarjeta-emprendimiento__imagen">🏪</div>
        <button class="tarjeta-emprendimiento__favorito tarjeta-emprendimiento__favorito--activo"
                data-id="${emp.id}" title="Quitar de favoritos">❤️</button>
        <div class="tarjeta-emprendimiento__info">
          <span class="chip-categoria">${emp.categoria}</span>
          <h3>${emp.nombre}</h3>
          <p>${emp.descripcion}</p>
          <a href="emprendimiento.html?id=${emp.id}" class="btn btn-primario btn-bloque">Ver emprendimiento</a>
        </div>
      </article>
    `).join('');

    contenedor.querySelectorAll('.tarjeta-emprendimiento__favorito').forEach(btn => {
      btn.addEventListener('click', function () {
        EH.favoritos.alternar(sesion.correo, btn.dataset.id);
        EH.toast('Quitado de favoritos');
        pintarFavoritos();
      });
    });
  }

  pintarFavoritos();
});
