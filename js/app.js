/* ==========================================================================
   EmpreHub - app.js
   Herramientas generales, seguridad XSS, control de sesiones Supabase,
   navegación y componentes transversales del sistema.
   ========================================================================== */

const EH = window.EH || {};

/* --------------------------------------------------------------------------
   1) SEGURIDAD XSS: Sanitización de texto para innerHTML
   Previene cualquier inyección de código arbitrario en el DOM.
   -------------------------------------------------------------------------- */
EH.escapeHtml = function (str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/* --------------------------------------------------------------------------
   2) HELPERS GENERALES DE LOCALSTORAGE (Compatibilidad y Modo Demo)
   -------------------------------------------------------------------------- */
EH.storage = {
  obtener(clave, valorPorDefecto) {
    const dato = localStorage.getItem(clave);
    if (dato === null) return valorPorDefecto;
    try {
      return JSON.parse(dato);
    } catch (e) {
      return valorPorDefecto;
    }
  },

  guardar(clave, valor) {
    localStorage.setItem(clave, JSON.stringify(valor));
  },

  eliminar(clave) {
    localStorage.removeItem(clave);
  }
};

// Generador de identificadores únicos
EH.generarId = function () {
  return 'eh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

/* --------------------------------------------------------------------------
   3) GESTIÓN DE SESIÓN (Unificada con Supabase Auth y fallback)
   -------------------------------------------------------------------------- */
EH.sesion = {
  // Obtener sesión activa (síncrona para UI rápida)
  obtener() {
    return EH.storage.obtener('eh_sesion', null);
  },

  // Obtener perfil completo asíncrono desde Supabase
  async obtenerPerfilActual() {
    if (EH.client && EH.client.auth) {
      const user = await EH.client.auth.getUser();
      if (!user) return null;
      return await EH.client.auth.getProfile(user.id);
    }
    return null;
  },

  iniciar(correo, tipo, id = null) {
    EH.storage.guardar('eh_sesion', { correo, tipo, id });
  },

  async cerrar() {
    if (EH.client && EH.client.auth) {
      try {
        await EH.client.auth.signOut();
      } catch (e) {
        console.warn('Error al cerrar sesión en Supabase:', e);
      }
    }
    EH.storage.eliminar('eh_sesion');
  },

  usuarioActual() {
    return EH.sesion.obtener();
  }
};

/* --------------------------------------------------------------------------
   4) PROTECCIÓN DE PÁGINAS Y ROLES (Guardas de acceso)
   tipoRequerido: 'customer' | 'entrepreneur' | 'admin' | null (cualquier sesión)
   -------------------------------------------------------------------------- */
EH.protegerPagina = async function (tipoRequerido, rutaLogin = 'registro.html') {
  let sesion = EH.sesion.obtener();

  // Si Supabase está conectado, verificar sesión real
  if (EH.client && EH.client.isLive) {
    try {
      const user = await EH.client.auth.getUser();
      if (!user) {
        window.location.href = rutaLogin;
        return false;
      }
      const profile = await EH.client.auth.getProfile(user.id);
      if (!profile) {
        window.location.href = rutaLogin;
        return false;
      }

      sesion = {
        id: profile.id,
        correo: profile.email,
        tipo: profile.role,
        nombre: profile.full_name
      };
      EH.storage.guardar('eh_sesion', sesion);
    } catch (e) {
      console.warn('Fallo verificando sesión Supabase:', e);
    }
  }

  // Si no hay sesión activa
  if (!sesion) {
    window.location.href = rutaLogin;
    return false;
  }

  // Normalizar nombres de roles
  const userRole = (sesion.tipo === 'cliente' ? 'customer' : (sesion.tipo === 'emprendedor' ? 'entrepreneur' : sesion.tipo));
  const reqRole = (tipoRequerido === 'cliente' ? 'customer' : (tipoRequerido === 'emprendedor' ? 'entrepreneur' : tipoRequerido));

  // Si exige un rol específico y no coincide (salvo que sea admin que tiene acceso de supervisión)
  if (reqRole && userRole !== reqRole && userRole !== 'admin') {
    alert('No tienes los permisos necesarios para acceder a esta sección.');
    window.location.href = rutaLogin;
    return false;
  }

  return true;
};

/* --------------------------------------------------------------------------
   5) TOAST ACCESIBLE (Mensajes flotantes temporales)
   -------------------------------------------------------------------------- */
EH.toast = function (mensaje) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = mensaje;
  toast.classList.add('toast--visible');

  clearTimeout(EH._toastTimeout);
  EH._toastTimeout = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2600);
};

/* --------------------------------------------------------------------------
   6) MODAL DE CONFIRMACIÓN ACCESIBLE
   -------------------------------------------------------------------------- */
EH.confirmar = function (mensaje, { textoAceptar = 'Eliminar', claseAceptar = 'btn-alerta' } = {}) {
  return new Promise((resolve) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.setAttribute('role', 'dialog');
    fondo.setAttribute('aria-modal', 'true');
    fondo.innerHTML = `
      <div class="modal">
        <p>${EH.escapeHtml(mensaje)}</p>
        <div class="modal__acciones">
          <button class="btn btn-secundario" data-accion="cancelar">Cancelar</button>
          <button class="btn ${claseAceptar}" data-accion="aceptar">${EH.escapeHtml(textoAceptar)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(fondo);

    // Focus en cancelar por seguridad
    const btnCancelar = fondo.querySelector('[data-accion="cancelar"]');
    if (btnCancelar) btnCancelar.focus();

    fondo.addEventListener('click', (e) => {
      const accion = e.target.getAttribute('data-accion');
      if (accion) {
        document.body.removeChild(fondo);
        resolve(accion === 'aceptar');
      }
    });

    // Tecla Escape para cancelar
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', handleKeyDown);
        if (fondo.parentNode) document.body.removeChild(fondo);
        resolve(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
  });
};

/* --------------------------------------------------------------------------
   7) MENÚ HAMBURGUESA Y BARRA DE NAVEGACIÓN DINÁMICA
   -------------------------------------------------------------------------- */
EH.iniciarMenuHamburguesa = function () {
  const boton = document.querySelector('.header__hamburguesa');
  const nav = document.querySelector('.header__nav');
  if (boton && nav) {
    boton.addEventListener('click', () => {
      const abierto = nav.classList.toggle('header__nav--abierto');
      boton.setAttribute('aria-expanded', abierto);
    });
  }
};

/* --------------------------------------------------------------------------
   8) ACTUALIZACIÓN DE NAVEGACIÓN SEGÚN SESIÓN Y ROL
   -------------------------------------------------------------------------- */
EH.actualizarNavegacion = function () {
  const nav = document.querySelector('.header__nav');
  if (!nav) return;

  const sesion = EH.sesion.obtener();
  const enSubcarpeta = window.location.pathname.includes('/pages/emprendedor/') || window.location.pathname.includes('/pages/admin/');
  const prefijoPages = enSubcarpeta ? '../' : '';

  // Si hay sesión y es admin, agregar enlace al panel de administración
  if (sesion && (sesion.tipo === 'admin' || sesion.tipo === 'administrador')) {
    let enlaceAdmin = nav.querySelector('#navEnlaceAdmin');
    if (!enlaceAdmin) {
      enlaceAdmin = document.createElement('a');
      enlaceAdmin.id = 'navEnlaceAdmin';
      enlaceAdmin.href = enSubcarpeta ? '../admin/panel.html' : 'admin/panel.html';
      enlaceAdmin.className = 'nav-badge-admin';
      enlaceAdmin.textContent = '🛡️ Panel Admin';
      nav.prepend(enlaceAdmin);
    }
  }

  // Si hay sesión y es emprendedor, permitir acceso directo a su panel
  if (sesion && (sesion.tipo === 'emprendedor' || sesion.tipo === 'entrepreneur')) {
    let enlaceEmp = nav.querySelector('#navEnlaceEmprendedor');
    if (!enlaceEmp && !enSubcarpeta) {
      enlaceEmp = document.createElement('a');
      enlaceEmp.id = 'navEnlaceEmprendedor';
      enlaceEmp.href = 'emprendedor/panel.html';
      enlaceEmp.textContent = '🏪 Mi Negocio';
      nav.insertBefore(enlaceEmp, nav.firstChild);
    }
  }

  // Si es un visitante no autenticado en páginas públicas (inicio, emprendimiento)
  if (!sesion) {
    const enlacePerfil = nav.querySelector('a[href*="perfil.html"]');
    if (enlacePerfil) {
      enlacePerfil.textContent = 'Ingresar';
      enlacePerfil.href = prefijoPages + 'registro.html';
    }
  }
};

/* --------------------------------------------------------------------------
   9) BADGE DEL CARRITO
   -------------------------------------------------------------------------- */
EH.actualizarBadgeCarrito = async function () {
  const badge = document.getElementById('badgeCarrito');
  if (!badge) return;

  const sesion = EH.sesion.obtener();
  if (!sesion) {
    badge.classList.add('oculto');
    return;
  }

  try {
    let cantidad = 0;
    if (EH.client && EH.client.cart) {
      const items = await EH.client.cart.get(sesion.id || sesion.correo);
      cantidad = items.reduce((s, p) => s + (p.cantidad || 1), 0);
    }
    badge.textContent = cantidad;
    badge.classList.toggle('oculto', cantidad === 0);
  } catch (e) {
    console.warn('Error actualizando badge del carrito:', e);
  }
};

/* --------------------------------------------------------------------------
   10) DATOS INICIALES DEMO (LOCALSTORAGE SEED)
   -------------------------------------------------------------------------- */
EH.datosIniciales = function () {
  const yaExiste = localStorage.getItem('eh_emprendimientos');
  if (yaExiste) return;

  const emprendimientos = [
    {
      id: 'demo-lupe',
      owner_id: 'demo@emprehub.pe',
      propietario: 'demo@emprehub.pe',
      nombre: 'Doña Lupe',
      descripcion: 'Comida casera hecha con amor y sazón tradicional.',
      categoria: 'Platos',
      status: 'published',
      imagen: '',
      mediosPago: ['Yape', 'Plin', 'Efectivo'],
      horario: 'Lunes a sábado, 11:00 am - 3:00 pm',
      promociones: ['Menú criollo completo con descuento del 10%', 'En compras mayores a S/30 chicha morada de cortesía']
    },
    {
      id: 'demo-dulce',
      owner_id: 'demo@emprehub.pe',
      propietario: 'demo@emprehub.pe',
      nombre: 'Dulce Encanto',
      descripcion: 'Postres, pasteles y tortas artesanales de alta repostería.',
      categoria: 'Postres',
      status: 'published',
      imagen: '',
      mediosPago: ['Yape', 'Efectivo'],
      horario: 'Todos los días, 2:00 pm - 8:00 pm',
      promociones: ['2x1 en porciones de alfajores los días viernes']
    },
    {
      id: 'demo-lola',
      owner_id: 'demo@emprehub.pe',
      propietario: 'demo@emprehub.pe',
      nombre: 'Lola Accesorios',
      descripcion: 'Accesorios y joyería tejida artesanalmente a mano.',
      categoria: 'Productos',
      status: 'published',
      imagen: '',
      mediosPago: ['Plin', 'Efectivo'],
      horario: 'Lunes a viernes, 10:00 am - 6:00 pm',
      promociones: []
    }
  ];

  const productos = [
    { id: 'p1', emprendimientoId: 'demo-lupe', nombre: 'Arroz con pollo criollo', descripcion: 'El clásico sabor peruano servido con papa a la huancaína.', categoria: 'Platos', precio: 14.50, stock: 15, imagen: '' },
    { id: 'p2', emprendimientoId: 'demo-lupe', nombre: 'Tallarines verdes con bistec', descripcion: 'Pasta en salsa de albahaca y espinaca fresca con bistec apanado.', categoria: 'Platos', precio: 16.00, stock: 12, imagen: '' },
    { id: 'p3', emprendimientoId: 'demo-lupe', nombre: 'Sopa Criolla de la casa', descripcion: 'Sopa sustanciosa con carne picada, fideos y huevo pochado.', categoria: 'Platos', precio: 9.50, stock: 10, imagen: '' },

    { id: 'p4', emprendimientoId: 'demo-dulce', nombre: 'Torta de chocolate artesanal (porción)', descripcion: 'Bizcocho húmedo de cacao cusqueño con fudge casero.', categoria: 'Postres', precio: 8.50, stock: 20, imagen: '' },
    { id: 'p5', emprendimientoId: 'demo-dulce', nombre: 'Caja de alfajores x6', descripcion: 'Masa suave de maicena rellenos de abundante manjar blanco.', categoria: 'Postres', precio: 12.00, stock: 30, imagen: '' },
    { id: 'p6', emprendimientoId: 'demo-dulce', nombre: 'Pie de limón casero', descripcion: 'Base crocante con crema de limón natural y merengue tostado.', categoria: 'Postres', precio: 7.50, stock: 14, imagen: '' },

    { id: 'p7', emprendimientoId: 'demo-lola', nombre: 'Aretes tejidos estilo bohemio', descripcion: 'Hechos a mano con hilo encerado y piedras naturales.', categoria: 'Productos', precio: 15.00, stock: 8, imagen: '' },
    { id: 'p8', emprendimientoId: 'demo-lola', nombre: 'Pulsera ajustable de mostacillas', descripcion: 'Diseño geométrico exclusivo en colores tierra.', categoria: 'Productos', precio: 10.00, stock: 14, imagen: '' }
  ];

  EH.storage.guardar('eh_emprendimientos', emprendimientos);
  EH.storage.guardar('eh_productos', productos);
  EH.storage.guardar('eh_usuarios', EH.storage.obtener('eh_usuarios', []));
  EH.storage.guardar('eh_favoritos', EH.storage.obtener('eh_favoritos', []));
  EH.storage.guardar('eh_carrito', EH.storage.obtener('eh_carrito', []));
  EH.storage.guardar('eh_pedidos', EH.storage.obtener('eh_pedidos', []));
};

/* --------------------------------------------------------------------------
   11) INICIALIZACIÓN GLOBAL AL CARGAR EL DOCUMENTO
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async function () {
  // Inicializar seed demo si aplica
  EH.datosIniciales();

  // Activar menú hamburguesa
  EH.iniciarMenuHamburguesa();

  // Actualizar menú dinámico según rol
  EH.actualizarNavegacion();

  // Actualizar badge del carrito
  EH.actualizarBadgeCarrito();

  // Pantalla de bienvenida: botón continuar
  const btnContinuar = document.getElementById('btnContinuar');
  if (btnContinuar) {
    btnContinuar.addEventListener('click', function () {
      // Redirigir a inicio para catálogo público, o registro si lo prefiere
      window.location.href = 'pages/inicio.html';
    });
  }

  // Configuración de botones de cierre de sesión
  document.querySelectorAll('[data-accion="cerrar-sesion"]').forEach(btn => {
    btn.addEventListener('click', async function () {
      await EH.sesion.cerrar();
      const destino = btn.dataset.destino || '../index.html';
      window.location.href = destino;
    });
  });
});
