/* ==========================================================================
   EmpreHub - app.js
   Este archivo es la "caja de herramientas" general del proyecto.
   Se carga en TODAS las páginas (antes que los demás archivos JS) y ofrece:

     - EH.storage      -> leer/escribir/eliminar en localStorage
     - EH.sesion       -> saber quién inició sesión
     - EH.protegerPagina -> proteger páginas según el tipo de usuario
     - EH.toast()      -> mostrar un mensaje flotante temporal
     - EH.confirmar()  -> mostrar un modal de confirmación (en vez de confirm())
     - EH.datosIniciales() -> crea emprendimientos/productos de ejemplo
                               la primera vez que se abre el proyecto

   Todo vive dentro del objeto global "EH" para no ensuciar el espacio
   global con muchas variables sueltas.
   ========================================================================== */

const EH = {};

/* --------------------------------------------------------------------------
   1) HELPERS GENERALES DE LOCALSTORAGE
   Todas las demás pantallas usan estas funciones en vez de llamar a
   localStorage directamente, así evitamos repetir JSON.parse/stringify.
   -------------------------------------------------------------------------- */
EH.storage = {
  // Obtiene un valor guardado como JSON. Si no existe, devuelve valorPorDefecto.
  obtener(clave, valorPorDefecto) {
    const dato = localStorage.getItem(clave);
    if (dato === null) return valorPorDefecto;
    try {
      return JSON.parse(dato);
    } catch (e) {
      return valorPorDefecto;
    }
  },

  // Guarda cualquier valor (array u objeto) como JSON.
  guardar(clave, valor) {
    localStorage.setItem(clave, JSON.stringify(valor));
  },

  // Elimina una clave completa de localStorage.
  eliminar(clave) {
    localStorage.removeItem(clave);
  }
};

// Genera un identificador único simple (fecha + número aleatorio).
EH.generarId = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

/* --------------------------------------------------------------------------
   2) SESIÓN ACTUAL
   Se guarda en localStorage la clave "eh_sesion" con { correo, tipo }.
   -------------------------------------------------------------------------- */
EH.sesion = {
  obtener() {
    return EH.storage.obtener('eh_sesion', null);
  },

  iniciar(correo, tipo) {
    EH.storage.guardar('eh_sesion', { correo, tipo });
  },

  // Al cerrar sesión SOLO borramos la sesión actual.
  // Los usuarios, emprendimientos, productos, etc. no se tocan.
  cerrar() {
    EH.storage.eliminar('eh_sesion');
  },

  // Devuelve el objeto completo del usuario que tiene la sesión activa.
  usuarioActual() {
    const sesion = EH.sesion.obtener();
    if (!sesion) return null;
    const usuarios = EH.storage.obtener('eh_usuarios', []);
    return usuarios.find(u => u.correo === sesion.correo) || null;
  }
};

/* --------------------------------------------------------------------------
   3) PROTECCIÓN DE PÁGINAS (guardas de acceso)
   Se llama al inicio de cada página que requiere sesión.
   tipoRequerido puede ser 'cliente', 'emprendedor' o null (cualquiera con sesión).
   -------------------------------------------------------------------------- */
EH.protegerPagina = function (tipoRequerido, rutaLogin) {
  const sesion = EH.sesion.obtener();

  // Si no hay sesión activa, redirigir al login.
  if (!sesion) {
    window.location.href = rutaLogin;
    return false;
  }

  // Si la página exige un tipo de usuario distinto al de la sesión, bloquear.
  if (tipoRequerido && sesion.tipo !== tipoRequerido) {
    alert('No tienes permiso para ver esta página con tu tipo de cuenta.');
    window.location.href = rutaLogin;
    return false;
  }

  return true;
};

/* --------------------------------------------------------------------------
   4) TOAST (mensaje flotante temporal, ej: "Producto agregado al carrito")
   Requiere que exista <div id="toast" class="toast"></div> en el HTML.
   -------------------------------------------------------------------------- */
EH.toast = function (mensaje) {
  let toast = document.getElementById('toast');

  // Si la página no tiene el div de toast, lo creamos dinámicamente.
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.classList.add('toast--visible');

  clearTimeout(EH._toastTimeout);
  EH._toastTimeout = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2200);
};

/* --------------------------------------------------------------------------
   5) MODAL DE CONFIRMACIÓN (reemplaza confirm() del navegador)
   Uso: EH.confirmar('¿Seguro que deseas eliminar?').then(si => { ... })
   -------------------------------------------------------------------------- */
EH.confirmar = function (mensaje) {
  return new Promise((resolve) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `
      <div class="modal">
        <p>${mensaje}</p>
        <div class="modal__acciones">
          <button class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button class="btn btn-alerta" data-accion="aceptar">Eliminar</button>
        </div>
      </div>
    `;
    document.body.appendChild(fondo);

    fondo.addEventListener('click', (e) => {
      const accion = e.target.getAttribute('data-accion');
      if (accion) {
        document.body.removeChild(fondo);
        resolve(accion === 'aceptar');
      }
    });
  });
};

/* --------------------------------------------------------------------------
   6) MENÚ HAMBURGUESA (header compartido de las páginas internas)
   -------------------------------------------------------------------------- */
EH.iniciarMenuHamburguesa = function () {
  const boton = document.querySelector('.header__hamburguesa');
  const nav = document.querySelector('.header__nav');
  if (boton && nav) {
    boton.addEventListener('click', () => {
      nav.classList.toggle('header__nav--abierto');
    });
  }
};

/* --------------------------------------------------------------------------
   7) DATOS INICIALES DE EJEMPLO (SEED)
   La primera vez que se abre el proyecto no hay emprendimientos ni
   productos. Para que la exposición se pueda demostrar de inmediato,
   creamos 3 emprendimientos de ejemplo con sus productos.
   Esto SOLO ocurre si "eh_emprendimientos" todavía no existe.
   -------------------------------------------------------------------------- */
EH.datosIniciales = function () {
  const yaExiste = localStorage.getItem('eh_emprendimientos');
  if (yaExiste) return; // ya se sembraron datos antes, no repetir

  const emprendimientos = [
    {
      id: 'demo-lupe',
      propietario: 'demo@emprehub.pe',
      nombre: 'Doña Lupe',
      descripcion: 'Comida casera hecha con amor.',
      categoria: 'Platos',
      imagen: '',
      mediosPago: ['Yape', 'Plin', 'Efectivo'],
      horario: 'Lunes a sábado, 11:00 am - 3:00 pm',
      promociones: ['Menú del día -10%', 'Compra mayor a S/30 y recibe una promoción.']
    },
    {
      id: 'demo-dulce',
      propietario: 'demo@emprehub.pe',
      nombre: 'Dulce Encanto',
      descripcion: 'Postres y tortas artesanales.',
      categoria: 'Postres',
      imagen: '',
      mediosPago: ['Yape', 'Efectivo'],
      horario: 'Todos los días, 2:00 pm - 8:00 pm',
      promociones: ['2x1 en alfajores los viernes']
    },
    {
      id: 'demo-lola',
      propietario: 'demo@emprehub.pe',
      nombre: 'Lola Accesorios',
      descripcion: 'Accesorios hechos a mano.',
      categoria: 'Productos',
      imagen: '',
      mediosPago: ['Plin', 'Efectivo'],
      horario: 'Lunes a viernes, 10:00 am - 6:00 pm',
      promociones: []
    }
  ];

  const productos = [
    { id: EH.generarId(), emprendimientoId: 'demo-lupe', nombre: 'Arroz con pollo', descripcion: 'Plato criollo casero.', categoria: 'Platos', precio: 12.00, stock: 15, imagen: '' },
    { id: EH.generarId(), emprendimientoId: 'demo-lupe', nombre: 'Tallarines rojos', descripcion: 'Con carne y verduras.', categoria: 'Platos', precio: 10.00, stock: 12, imagen: '' },
    { id: EH.generarId(), emprendimientoId: 'demo-lupe', nombre: 'Sopa de casa', descripcion: 'Sopa criolla del día.', categoria: 'Platos', precio: 8.00, stock: 10, imagen: '' },

    { id: EH.generarId(), emprendimientoId: 'demo-dulce', nombre: 'Torta de chocolate (porción)', descripcion: 'Bizcocho húmedo con ganache.', categoria: 'Postres', precio: 7.50, stock: 20, imagen: '' },
    { id: EH.generarId(), emprendimientoId: 'demo-dulce', nombre: 'Alfajores (x3)', descripcion: 'Rellenos de manjar blanco.', categoria: 'Postres', precio: 6.00, stock: 30, imagen: '' },
    { id: EH.generarId(), emprendimientoId: 'demo-dulce', nombre: 'Mazamorra morada', descripcion: 'Postre tradicional peruano.', categoria: 'Postres', precio: 5.00, stock: 18, imagen: '' },

    { id: EH.generarId(), emprendimientoId: 'demo-lola', nombre: 'Aretes tejidos', descripcion: 'Hechos a mano con hilo encerado.', categoria: 'Productos', precio: 15.00, stock: 8, imagen: '' },
    { id: EH.generarId(), emprendimientoId: 'demo-lola', nombre: 'Pulsera de mostacillas', descripcion: 'Diseño personalizado.', categoria: 'Productos', precio: 9.00, stock: 14, imagen: '' }
  ];

  EH.storage.guardar('eh_emprendimientos', emprendimientos);
  EH.storage.guardar('eh_productos', productos);
  EH.storage.guardar('eh_usuarios', EH.storage.obtener('eh_usuarios', []));
  EH.storage.guardar('eh_favoritos', EH.storage.obtener('eh_favoritos', []));
  EH.storage.guardar('eh_carrito', EH.storage.obtener('eh_carrito', []));
  EH.storage.guardar('eh_pedidos', EH.storage.obtener('eh_pedidos', []));
};

/* --------------------------------------------------------------------------
   8) BADGE DEL CARRITO (número flotante sobre el ícono del carrito)
   Se llama desde varias pantallas para mantenerlo siempre actualizado.
   Revisa que EH.carrito exista por si la página no cargó carrito.js.
   -------------------------------------------------------------------------- */
EH.actualizarBadgeCarrito = function () {
  const badge = document.getElementById('badgeCarrito');
  if (!badge || !EH.carrito) return;
  const sesion = EH.sesion.obtener();
  if (!sesion) return;
  const cantidad = EH.carrito.contarItems(sesion.correo);
  badge.textContent = cantidad;
  badge.classList.toggle('oculto', cantidad === 0);
};

/* --------------------------------------------------------------------------
   9) INICIALIZACIÓN GENERAL
   Se ejecuta en TODAS las páginas apenas carga el HTML.
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  // Sembrar datos de ejemplo si es la primera vez que se usa el proyecto.
  EH.datosIniciales();

  // Activar el menú hamburguesa si la página tiene header compartido.
  EH.iniciarMenuHamburguesa();

  // Actualizar el número del badge del carrito (si el header lo incluye).
  EH.actualizarBadgeCarrito();

  // Lógica específica de la pantalla de BIENVENIDA (index.html).
  const btnContinuar = document.getElementById('btnContinuar');
  if (btnContinuar) {
    btnContinuar.addEventListener('click', function () {
      window.location.href = 'pages/registro.html';
    });
  }

  // Pantalla de PERFIL (pages/perfil.html y pages/emprendedor/*): si existe
  // el contenedor de datos de perfil, lo llenamos con el usuario en sesión.
  const perfilNombre = document.getElementById('perfilNombre');
  if (perfilNombre) {
    const rutaLogin = window.location.pathname.includes('/emprendedor/') ? '../registro.html' : 'registro.html';
    if (EH.protegerPagina(null, rutaLogin)) {
      const usuario = EH.sesion.usuarioActual();
      if (usuario) {
        perfilNombre.textContent = usuario.nombre;
        document.getElementById('perfilCorreo').textContent = usuario.correo;
        document.getElementById('perfilTipo').textContent = usuario.tipo === 'cliente' ? 'Cliente' : 'Emprendedor';

        // El enlace "Volver" debe llevar a la pantalla principal según el tipo de cuenta.
        const enlaceVolver = document.getElementById('perfilVolver');
        if (enlaceVolver) {
          enlaceVolver.href = usuario.tipo === 'emprendedor' ? 'emprendedor/panel.html' : 'inicio.html';
        }
      }
    }
  }

  // Botón de cerrar sesión (puede estar en cualquier página con header).
  const btnCerrarSesion = document.querySelectorAll('[data-accion="cerrar-sesion"]');
  btnCerrarSesion.forEach(btn => {
    btn.addEventListener('click', function () {
      EH.sesion.cerrar();
      // Todas las páginas internas están dentro de /pages/, por eso ../index.html
      window.location.href = btn.dataset.destino || '../index.html';
    });
  });
});
