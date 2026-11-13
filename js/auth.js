/* ==========================================================================
   EmpreHub - auth.js
   Lógica segura de REGISTRO, INICIO DE SESIÓN y RECUPERACIÓN DE CONTRASEÑA.
   Integrado con Supabase Auth y perfiles públicos.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {

  /* ------------------------------------------------------------------------
     0) Comprobar sesión activa y redirigir
     ------------------------------------------------------------------------ */
  const sesionActiva = EH.sesion.obtener();
  if (sesionActiva) {
    if (sesionActiva.tipo === 'admin') {
      window.location.href = 'admin/panel.html';
      return;
    } else if (sesionActiva.tipo === 'emprendedor' || sesionActiva.tipo === 'entrepreneur') {
      window.location.href = 'emprendedor/panel.html';
      return;
    } else {
      window.location.href = 'inicio.html';
      return;
    }
  }

  /* ------------------------------------------------------------------------
     1) Pestañas: Iniciar sesión <-> Crear cuenta
     ------------------------------------------------------------------------ */
  const pestanaLogin = document.getElementById('pestanaLogin');
  const pestanaRegistro = document.getElementById('pestanaRegistro');
  const formLogin = document.getElementById('formLogin');
  const formRegistro = document.getElementById('formRegistro');

  if (pestanaLogin && pestanaRegistro) {
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
  }

  /* ------------------------------------------------------------------------
     2) Tipo de usuario en el registro (Cliente o Emprendedor)
     ------------------------------------------------------------------------ */
  const tipoCliente = document.getElementById('tipoCliente');
  const tipoEmprendedor = document.getElementById('tipoEmprendedor');
  const registroTipo = document.getElementById('registroTipo');

  if (tipoCliente && tipoEmprendedor && registroTipo) {
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
  }

  /* ------------------------------------------------------------------------
     3) Funciones de validación
     ------------------------------------------------------------------------ */
  function correoValido(correo) {
    const patron = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return patron.test(correo);
  }

  function passwordValida(password) {
    const tieneLetra = /[A-Za-z]/.test(password);
    const tieneNumero = /[0-9]/.test(password);
    return password.length >= 8 && tieneLetra && tieneNumero;
  }

  function mostrarError(idSpan, mensaje) {
    const el = document.getElementById(idSpan);
    if (el) el.textContent = mensaje;
  }

  function limpiarErrores(ids) {
    ids.forEach(id => mostrarError(id, ''));
  }

  /* ------------------------------------------------------------------------
     4) Envío del formulario de Registro
     ------------------------------------------------------------------------ */
  if (formRegistro) {
    formRegistro.addEventListener('submit', async function (e) {
      e.preventDefault();

      const btnSubmit = formRegistro.querySelector('button[type="submit"]');
      const nombre = document.getElementById('registroNombre').value.trim();
      const correo = document.getElementById('registroCorreo').value.trim().toLowerCase();
      const password = document.getElementById('registroPassword').value;
      const confirmar = document.getElementById('registroConfirmar').value;
      const tipo = registroTipo ? registroTipo.value : 'cliente';

      const idsError = ['errorRegistroNombre', 'errorRegistroCorreo', 'errorRegistroPassword', 'errorRegistroConfirmar'];
      limpiarErrores(idsError);
      const contenedorMensaje = document.getElementById('mensajeRegistro');
      if (contenedorMensaje) contenedorMensaje.innerHTML = '';

      let esValido = true;

      if (nombre === '') {
        mostrarError('errorRegistroNombre', 'El nombre es obligatorio.');
        esValido = false;
      } else if (nombre.length < 3) {
        mostrarError('errorRegistroNombre', 'El nombre debe tener mínimo 3 caracteres.');
        esValido = false;
      }

      if (correo === '') {
        mostrarError('errorRegistroCorreo', 'El correo es obligatorio.');
        esValido = false;
      } else if (!correoValido(correo)) {
        mostrarError('errorRegistroCorreo', 'El correo electrónico no es válido.');
        esValido = false;
      }

      if (password === '') {
        mostrarError('errorRegistroPassword', 'La contraseña es obligatoria.');
        esValido = false;
      } else if (!passwordValida(password)) {
        mostrarError('errorRegistroPassword', 'La contraseña debe tener al menos 8 caracteres, con una letra y un número.');
        esValido = false;
      }

      if (confirmar === '') {
        mostrarError('errorRegistroConfirmar', 'Debes confirmar la contraseña.');
        esValido = false;
      } else if (confirmar !== password) {
        mostrarError('errorRegistroConfirmar', 'Las contraseñas no coinciden.');
        esValido = false;
      }

      if (!esValido) return;

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Creando cuenta...';

      try {
        await EH.client.auth.signUp({
          email: correo,
          password: password,
          fullName: nombre,
          role: tipo
        });

        if (contenedorMensaje) {
          contenedorMensaje.innerHTML = `
            <div class="mensaje mensaje-exito" role="alert">
              ✅ Cuenta creada exitosamente. ${EH.client.isLive ? 'Revisa tu correo si requiere confirmación o inicia sesión.' : 'Ya puedes iniciar sesión.'}
            </div>
          `;
        }

        formRegistro.reset();
        if (registroTipo) registroTipo.value = 'cliente';
        if (tipoCliente && tipoEmprendedor) {
          tipoCliente.classList.add('auth__tipo--activo');
          tipoEmprendedor.classList.remove('auth__tipo--activo');
        }

        setTimeout(() => {
          if (pestanaLogin) pestanaLogin.click();
          const campoLogin = document.getElementById('loginCorreo');
          if (campoLogin) campoLogin.value = correo;
        }, 1200);

      } catch (err) {
        console.error('Error al registrarse:', err);
        if (contenedorMensaje) {
          contenedorMensaje.innerHTML = `<div class="mensaje mensaje-error" role="alert">❌ ${EH.escapeHtml(err.message || 'No se pudo crear la cuenta.')}</div>`;
        }
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Registrarme';
      }
    });
  }

  /* ------------------------------------------------------------------------
     5) Envío del formulario de Inicio de Sesión
     ------------------------------------------------------------------------ */
  if (formLogin) {
    formLogin.addEventListener('submit', async function (e) {
      e.preventDefault();

      const btnSubmit = formLogin.querySelector('button[type="submit"]');
      const correo = document.getElementById('loginCorreo').value.trim().toLowerCase();
      const password = document.getElementById('loginPassword').value;

      const idsError = ['errorLoginCorreo', 'errorLoginPassword'];
      limpiarErrores(idsError);
      const contenedorMensaje = document.getElementById('mensajeLogin');
      if (contenedorMensaje) contenedorMensaje.innerHTML = '';

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

      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Ingresando...';

      try {
        const res = await EH.client.auth.signIn({
          email: correo,
          password: password
        });

        const profile = res.profile || {};
        const role = profile.role || (res.session && res.session.tipo) || 'customer';
        const userId = (res.user && res.user.id) || (res.session && res.session.id) || correo;

        // Guardar sesión normalizada
        EH.sesion.iniciar(correo, role, userId);

        if (contenedorMensaje) {
          contenedorMensaje.innerHTML = '<div class="mensaje mensaje-exito" role="alert">✅ Ingreso correcto. Redirigiendo...</div>';
        }

        setTimeout(() => {
          if (role === 'admin') {
            window.location.href = 'admin/panel.html';
          } else if (role === 'entrepreneur' || role === 'emprendedor') {
            window.location.href = 'emprendedor/panel.html';
          } else {
            window.location.href = 'inicio.html';
          }
        }, 600);

      } catch (err) {
        console.error('Error de login:', err);
        // Prevenir enumeración de correos mostrando mensaje genérico seguro
        if (contenedorMensaje) {
          contenedorMensaje.innerHTML = '<div class="mensaje mensaje-error" role="alert">❌ Correo o contraseña incorrectos.</div>';
        }
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'Iniciar sesión';
      }
    });
  }

});
