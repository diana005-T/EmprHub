/* ==========================================================================
   EmpreHub - auth.js
   Lógica de la pantalla de REGISTRO e INICIO DE SESIÓN.
   Usa EH.storage y EH.sesion definidos en app.js.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {

  /* ------------------------------------------------------------------------
     0) Si ya hay una sesión activa, no tiene sentido ver el login de nuevo:
     mandamos directo a la pantalla que le corresponde.
     ------------------------------------------------------------------------ */
  const sesionActiva = EH.sesion.obtener();
  if (sesionActiva) {
    window.location.href = sesionActiva.tipo === 'emprendedor'
      ? 'emprendedor/panel.html'
      : 'inicio.html';
    return;
  }

  /* ------------------------------------------------------------------------
     1) CAMBIO DE PESTAÑAS: Iniciar sesión <-> Crear cuenta
     ------------------------------------------------------------------------ */
  const pestanaLogin = document.getElementById('pestanaLogin');
  const pestanaRegistro = document.getElementById('pestanaRegistro');
  const formLogin = document.getElementById('formLogin');
  const formRegistro = document.getElementById('formRegistro');

  pestanaLogin.addEventListener('click', function () {
    pestanaLogin.classList.add('auth__pestana--activa');
    pestanaRegistro.classList.remove('auth__pestana--activa');
    formLogin.classList.remove('oculto');
    formRegistro.classList.add('oculto');
  });

  pestanaRegistro.addEventListener('click', function () {
    pestanaRegistro.classList.add('auth__pestana--activa');
    pestanaLogin.classList.remove('auth__pestana--activa');
    formRegistro.classList.remove('oculto');
    formLogin.classList.add('oculto');
  });

  /* ------------------------------------------------------------------------
     2) SELECCIÓN DE TIPO DE USUARIO (paso 1 del registro)
     ------------------------------------------------------------------------ */
  const tipoCliente = document.getElementById('tipoCliente');
  const tipoEmprendedor = document.getElementById('tipoEmprendedor');
  const registroTipo = document.getElementById('registroTipo');

  tipoCliente.addEventListener('click', function () {
    tipoCliente.classList.add('auth__tipo--activo');
    tipoEmprendedor.classList.remove('auth__tipo--activo');
    registroTipo.value = 'cliente';
  });

  tipoEmprendedor.addEventListener('click', function () {
    tipoEmprendedor.classList.add('auth__tipo--activo');
    tipoCliente.classList.remove('auth__tipo--activo');
    registroTipo.value = 'emprendedor';
  });

  /* ------------------------------------------------------------------------
     3) FUNCIONES DE VALIDACIÓN REUTILIZABLES
     ------------------------------------------------------------------------ */

  // Valida el formato general de un correo electrónico.
  function correoValido(correo) {
    const patron = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return patron.test(correo);
  }

  // La contraseña debe tener mínimo 8 caracteres, con al menos una letra y un número.
  function passwordValida(password) {
    const tieneLetra = /[A-Za-z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    return password.length >= 8 && tieneLetra && tieneNumero;
  }

  // Muestra un mensaje de error debajo de un campo específico.
  function mostrarError(idSpan, mensaje) {
    document.getElementById(idSpan).textContent = mensaje;
  }

  // Limpia todos los mensajes de error de un formulario.
  function limpiarErrores(ids) {
    ids.forEach(id => mostrarError(id, ''));
  }

  /* ------------------------------------------------------------------------
     4) ENVÍO DEL FORMULARIO DE REGISTRO
     ------------------------------------------------------------------------ */
  formRegistro.addEventListener('submit', function (e) {
    e.preventDefault();

    const nombre = document.getElementById('registroNombre').value.trim();
    const correo = document.getElementById('registroCorreo').value.trim().toLowerCase();
    const password = document.getElementById('registroPassword').value;
    const confirmar = document.getElementById('registroConfirmar').value;
    const tipo = registroTipo.value;

    const idsError = ['errorRegistroNombre', 'errorRegistroCorreo', 'errorRegistroPassword', 'errorRegistroConfirmar'];
    limpiarErrores(idsError);
    document.getElementById('mensajeRegistro').innerHTML = '';

    let esValido = true;

    // Validación: nombre obligatorio y con mínimo 3 caracteres.
    if (nombre === '') {
      mostrarError('errorRegistroNombre', 'El nombre es obligatorio.');
      esValido = false;
    } else if (nombre.length < 3) {
      mostrarError('errorRegistroNombre', 'El nombre debe tener mínimo 3 caracteres.');
      esValido = false;
    }

    // Validación: correo obligatorio y con formato válido.
    if (correo === '') {
      mostrarError('errorRegistroCorreo', 'El correo es obligatorio.');
      esValido = false;
    } else if (!correoValido(correo)) {
      mostrarError('errorRegistroCorreo', 'El correo electrónico no es válido.');
      esValido = false;
    }

    // Validación: contraseña obligatoria, mínimo 8 caracteres, letra + número.
    if (password === '') {
      mostrarError('errorRegistroPassword', 'La contraseña es obligatoria.');
      esValido = false;
    } else if (!passwordValida(password)) {
      mostrarError('errorRegistroPassword', 'La contraseña debe tener al menos 8 caracteres, con una letra y un número.');
      esValido = false;
    }

    // Validación: confirmación obligatoria y debe coincidir.
    if (confirmar === '') {
      mostrarError('errorRegistroConfirmar', 'Debes confirmar la contraseña.');
      esValido = false;
    } else if (confirmar !== password) {
      mostrarError('errorRegistroConfirmar', 'Las contraseñas no coinciden.');
      esValido = false;
    }

    if (!esValido) return;

    // Validación: el correo no debe existir ya en la base de usuarios.
    const usuarios = EH.storage.obtener('eh_usuarios', []);
    const yaRegistrado = usuarios.some(u => u.correo === correo);

    if (yaRegistrado) {
      mostrarError('errorRegistroCorreo', 'Este correo ya está registrado.');
      return;
    }

    // Todo correcto: guardamos el nuevo usuario.
    usuarios.push({ nombre, correo, password, tipo });
    EH.storage.guardar('eh_usuarios', usuarios);

    document.getElementById('mensajeRegistro').innerHTML =
      '<div class="mensaje mensaje-exito">✅ Registro exitoso. Ahora inicia sesión.</div>';

    formRegistro.reset();
    registroTipo.value = 'cliente';
    tipoCliente.classList.add('auth__tipo--activo');
    tipoEmprendedor.classList.remove('auth__tipo--activo');

    // Pasamos automáticamente a la pestaña de inicio de sesión
    // y dejamos el correo ya escrito para comodidad del usuario.
    setTimeout(() => {
      pestanaLogin.click();
      document.getElementById('loginCorreo').value = correo;
    }, 900);
  });

  /* ------------------------------------------------------------------------
     5) ENVÍO DEL FORMULARIO DE INICIO DE SESIÓN
     ------------------------------------------------------------------------ */
  formLogin.addEventListener('submit', function (e) {
    e.preventDefault();

    const correo = document.getElementById('loginCorreo').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    const idsError = ['errorLoginCorreo', 'errorLoginPassword'];
    limpiarErrores(idsError);
    document.getElementById('mensajeLogin').innerHTML = '';

    let esValido = true;

    if (correo === '') {
      mostrarError('errorLoginCorreo', 'El correo es obligatorio.');
      esValido = false;
    } else if (!correoValido(correo)) {
      mostrarError('errorLoginCorreo', 'El correo electrónico no es válido.');
      esValido = false;
    }

    if (password === '') {
      mostrarError('errorLoginPassword', 'La contraseña es obligatoria.');
      esValido = false;
    }

    if (!esValido) return;

    const usuarios = EH.storage.obtener('eh_usuarios', []);
    const usuario = usuarios.find(u => u.correo === correo);

    if (!usuario) {
      document.getElementById('mensajeLogin').innerHTML =
        '<div class="mensaje mensaje-error">❌ No existe una cuenta con ese correo.</div>';
      return;
    }

    if (usuario.password !== password) {
      document.getElementById('mensajeLogin').innerHTML =
        '<div class="mensaje mensaje-error">❌ La contraseña es incorrecta.</div>';
      return;
    }

    // Credenciales correctas: iniciamos sesión y redirigimos según el tipo.
    EH.sesion.iniciar(usuario.correo, usuario.tipo);

    if (usuario.tipo === 'emprendedor') {
      window.location.href = 'emprendedor/panel.html';
    } else {
      window.location.href = 'inicio.html';
    }
  });

});
