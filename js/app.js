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

const LUCIDE_PATHS = {
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'cake-slice': '<path d="M16 10a4 4 0 0 0-8 0"/><path d="M2 10h20"/><path d="M4 10v10h16V10"/><path d="M8 14v.01"/><path d="M16 14v.01"/><path d="M12 14v.01"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'circle-help': '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  'clock-3': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6h4.5"/>',
  'cup-soda': '<path d="m8 2 1 4"/><path d="m16 2-1 4"/><path d="M5 6h14l-1.5 15h-11L5 6Z"/><path d="M8 10h8"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/>',
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m12 12 8-4.5"/><path d="M12 12v9"/><path d="m4 7.5 8 4.5"/><path d="m8 5.25 8 4.5"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  'shield-check': '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
  'shopping-bag': '<path d="M6 7h12l1 14H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  'shopping-cart': '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2h2l2.66 12.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 1.97-1.61L22 7H5"/>',
  'store': '<path d="m2 7 4-4h12l4 4"/><path d="M4 7v14h16V7"/><path d="M4 11h16"/><path d="M9 21v-6h6v6"/>',
  'tag': '<path d="M20.59 13.41 13.4 20.6a2 2 0 0 1-2.82 0L3.4 13.4a2 2 0 0 1 0-2.82l7.18-7.18A2 2 0 0 1 12 2.8H20a1 1 0 0 1 1 1V12a2 2 0 0 1-.41 1.41Z"/><circle cx="16.5" cy="7.5" r=".5"/>',
  'target': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  'triangle-alert': '<path d="m10.3 3.86-8.1 14A2 2 0 0 0 3.93 21h16.14a2 2 0 0 0 1.73-3.14l-8.1-14a2 2 0 0 0-3.46 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'user-round': '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  utensils: '<path d="M3 2v7a4 4 0 0 0 4 4h1v9"/><path d="M7 2v7"/><path d="M11 2v7"/><path d="M18 22V2c2 2 3 5 3 9h-3"/>',
  house: '<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-6h6v6"/>'
};

EH.icon = function (name, { size = 20, className = '' } = {}) {
  const paths = LUCIDE_PATHS[name] || LUCIDE_PATHS.store;
  const safeClass = EH.escapeHtml(className);
  return `<svg class="icon ${safeClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
};

EH.categoryIcon = function (category) {
  const value = typeof category === 'string'
    ? category
    : (category && (category.slug || category.name)) || '';
  const normalized = value.toLocaleLowerCase();
  const icon = normalized.includes('plato') ? 'utensils'
    : normalized.includes('bebida') ? 'cup-soda'
      : normalized.includes('producto') ? 'shopping-bag'
        : normalized.includes('postre') ? 'cake-slice'
          : 'store';
  return EH.icon(icon);
};

EH.renderIcons = function (root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-lucide]').forEach((placeholder) => {
    placeholder.outerHTML = EH.icon(placeholder.dataset.lucide, {
      className: placeholder.className
    });
  });
};

EH.renderIcons(document);

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

EH.normalizarRol = function (rol) {
  const valor = String(rol || '').trim().toLowerCase();
  if (valor === 'cliente' || valor === 'customer') return 'customer';
  if (valor === 'emprendedor' || valor === 'entrepreneur') return 'entrepreneur';
  if (valor === 'administrador' || valor === 'admin') return 'admin';
  return valor;
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
  const userRole = EH.normalizarRol(sesion.tipo);
  const reqRole = EH.normalizarRol(tipoRequerido);

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
EH.toast = function (mensaje, tipo = '') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  const iconos = {
    exito: 'circle-check',
    success: 'circle-check',
    error: 'circle-x',
    advertencia: 'triangle-alert',
    warning: 'triangle-alert',
    favorito: 'heart',
    carrito: 'shopping-cart',
    info: 'circle-help'
  };
  const icono = iconos[tipo];
  toast.innerHTML = `${icono ? EH.icon(icono) : ''}<span>${EH.escapeHtml(mensaje)}</span>`;
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
  const tipoUsuario = EH.normalizarRol(sesion && sesion.tipo);

  // Ocultar Favoritos y Carrito únicamente a emprendedores
  const esEmprendedor = tipoUsuario === 'entrepreneur';

  nav.querySelectorAll('a[href*="favoritos.html"], a[href*="carrito.html"]')
    .forEach(enlace => {
      enlace.hidden = esEmprendedor;
    });

  const enCarpetaEmprendedor = window.location.pathname.includes('/pages/emprendedor/');
  const enSubcarpeta = enCarpetaEmprendedor || window.location.pathname.includes('/pages/admin/');
  const prefijoPages = enSubcarpeta ? '../' : '';

  // Si hay sesión y es admin, agregar enlace al panel de administración
  if (sesion && tipoUsuario === 'admin') {
    let enlaceAdmin = nav.querySelector('#navEnlaceAdmin');
    if (!enlaceAdmin) {
      enlaceAdmin = document.createElement('a');
      enlaceAdmin.id = 'navEnlaceAdmin';
      enlaceAdmin.href = enSubcarpeta ? '../admin/panel.html' : 'admin/panel.html';
      enlaceAdmin.className = 'nav-badge-admin';
      enlaceAdmin.innerHTML = `${EH.icon('shield-check')}<span>Panel Admin</span>`;
      nav.prepend(enlaceAdmin);
    }
  } else {
    const enlaceAdmin = nav.querySelector('#navEnlaceAdmin');
    if (enlaceAdmin) enlaceAdmin.remove();
  }

  // Si hay sesión y es emprendedor, permitir acceso directo a su panel
  if (sesion && esEmprendedor) {
    let enlaceEmp = nav.querySelector('#navEnlaceEmprendedor');
    if (!enlaceEmp) {
      enlaceEmp = document.createElement('a');
      enlaceEmp.id = 'navEnlaceEmprendedor';
      enlaceEmp.href = enCarpetaEmprendedor ? 'panel.html' : prefijoPages + 'emprendedor/panel.html';
      enlaceEmp.innerHTML = `${EH.icon('store')}<span>Mi Negocio</span>`;
      nav.insertBefore(enlaceEmp, nav.firstChild);
    }
  } else {
    const enlaceEmp = nav.querySelector('#navEnlaceEmprendedor');
    if (enlaceEmp) enlaceEmp.remove();
  }

  const enlacePerfil = nav.querySelector('#enlacePerfilNav, a[href*="perfil.html"], a[href*="registro.html"]');
  if (enlacePerfil) {
    if (!sesion) {
      enlacePerfil.textContent = 'Ingresar';
      enlacePerfil.href = prefijoPages + 'registro.html';
    } else {
      enlacePerfil.textContent = 'Perfil';
      enlacePerfil.href = prefijoPages + 'perfil.html';
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
