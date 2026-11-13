/* ==========================================================================
   EmpreHub - promociones.js
   Gestión de promociones del emprendedor.
   Límite del plan gratuito: 2 promociones activas simultáneas.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {
  // Solo ejecutar en la página de promociones
  const formPromo = document.getElementById('formPromocion');
  if (!formPromo) return;

  /* ---- Referencias DOM ---- */
  const listaEl       = document.getElementById('listaPromociones');
  const contadorEl    = document.getElementById('contadorPromos');
  const tituloInput   = document.getElementById('promoTituloInput');
  const descInput     = document.getElementById('promoDescInput');
  const descuentoInput= document.getElementById('promoDescuentoInput');
  const fechaFinInput = document.getElementById('promoFechaFinInput');
  const btnCancelar   = document.getElementById('btnCancelarPromo');
  const errorTitulo   = document.getElementById('errorPromoTitulo');
  const errorDescuento= document.getElementById('errorPromoDescuento');
  const avisoCrear    = document.getElementById('avisoCrearEmprendimiento');
  const seccionPromos = document.getElementById('seccionPromociones');

  const LIMITE_GRATUITO = 2;
  let miEmprendimiento  = null;

  /* ---- Obtener emprendimiento del usuario actual ---- */
  async function cargarEmprendimiento() {
    const sesion = EH.sesion.obtener();
    const userId = sesion.id || sesion.correo;
    try {
      const negocios = await EH.client.businesses.getByOwner(userId);
      return negocios && negocios.length > 0 ? negocios[0] : null;
    } catch (e) {
      console.warn('Error cargando emprendimiento:', e);
      return null;
    }
  }

  /* ---- Renderizar lista de promociones ---- */
  function renderizarPromociones(promos) {
    const activas = (promos || []).filter(p => !p.is_expired);
    contadorEl.textContent = `${activas.length} / ${LIMITE_GRATUITO}`;

    if (!promos || promos.length === 0) {
      listaEl.innerHTML = `
        <div class="estado-vacio">
          <div class="estado-vacio__icono">🎯</div>
          <p>Todavía no tienes promociones activas.<br>¡Crea una para atraer más clientes!</p>
        </div>`;
      return;
    }

    const hoy = new Date().toISOString().split('T')[0];

    listaEl.innerHTML = promos.map(p => {
      const vencida    = p.end_date && p.end_date < hoy;
      const descuento  = p.discount_percent ? `<span class="chip-categoria" style="background:#DCFCE7; color:#15803D;">${EH.escapeHtml(String(p.discount_percent))}% dto.</span>` : '';
      const fechaFin   = p.end_date ? `<small style="color:var(--color-gris-medio);">Vence: ${EH.escapeHtml(p.end_date)}</small>` : '';
      const estadoBadge= vencida
        ? `<span style="font-size:0.75rem; background:#FEE2E2; color:#991B1B; padding:2px 8px; border-radius:6px; font-weight:600;">VENCIDA</span>`
        : `<span style="font-size:0.75rem; background:#DCFCE7; color:#15803D; padding:2px 8px; border-radius:6px; font-weight:600;">ACTIVA</span>`;

      return `
        <div class="tarjeta-formulario" style="margin-bottom:var(--espacio-md); padding:var(--espacio-md);"
             role="article" aria-label="${EH.escapeHtml(p.title)}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:var(--espacio-md); flex-wrap:wrap;">
            <div style="flex:1;">
              <div style="display:flex; align-items:center; gap:var(--espacio-sm); flex-wrap:wrap; margin-bottom:4px;">
                ${estadoBadge}
                ${descuento}
              </div>
              <strong style="display:block; margin:4px 0;">${EH.escapeHtml(p.title)}</strong>
              ${p.description ? `<p style="font-size:0.9rem; color:var(--color-gris-medio); margin:2px 0;">${EH.escapeHtml(p.description)}</p>` : ''}
              ${fechaFin}
            </div>
            <button
              class="btn btn-alerta"
              style="padding:6px 14px; font-size:0.85rem; white-space:nowrap;"
              data-promo-id="${EH.escapeHtml(String(p.id))}"
              aria-label="Eliminar promoción ${EH.escapeHtml(p.title)}">
              🗑 Eliminar
            </button>
          </div>
        </div>`;
    }).join('');

    // Adjuntar listeners de eliminación
    listaEl.querySelectorAll('[data-promo-id]').forEach(btn => {
      btn.addEventListener('click', () => eliminarPromocion(btn.dataset.promoId));
    });
  }

  /* ---- Cargar y mostrar promociones ---- */
  async function cargarPromociones() {
    if (!miEmprendimiento) return;
    listaEl.innerHTML = '<div class="estado-cargando" aria-label="Cargando…">⏳ Cargando promociones…</div>';
    try {
      const promos = await EH.client.promotions.getByBusiness(miEmprendimiento.id);
      renderizarPromociones(promos);
    } catch (e) {
      listaEl.innerHTML = `<p class="mensaje mensaje-error">Error al cargar las promociones: ${EH.escapeHtml(e.message)}</p>`;
    }
  }

  /* ---- Validar formulario ---- */
  function validarFormulario() {
    let ok = true;
    errorTitulo.textContent   = '';
    errorDescuento.textContent = '';

    const titulo = tituloInput.value.trim();
    if (!titulo) {
      errorTitulo.textContent = 'El título de la promoción es obligatorio.';
      tituloInput.focus();
      ok = false;
    }

    const descuento = descuentoInput.value.trim();
    if (descuento !== '') {
      const num = Number(descuento);
      if (isNaN(num) || num < 1 || num > 99) {
        errorDescuento.textContent = 'El descuento debe estar entre 1% y 99%.';
        ok = false;
      }
    }

    return ok;
  }

  /* ---- Verificar límite del plan gratuito ---- */
  async function verificarLimite() {
    try {
      const promos = await EH.client.promotions.getByBusiness(miEmprendimiento.id);
      const hoy = new Date().toISOString().split('T')[0];
      const activas = (promos || []).filter(p => !p.end_date || p.end_date >= hoy);
      return activas.length;
    } catch {
      return 0;
    }
  }

  /* ---- Crear promoción ---- */
  formPromo.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!validarFormulario()) return;

    const btnGuardar = document.getElementById('btnGuardarPromo');
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Publicando…';

    try {
      // Verificar límite plan gratuito
      const totalActivas = await verificarLimite();
      if (totalActivas >= LIMITE_GRATUITO) {
        EH.toast(`⚠️ Límite del plan gratuito: solo puedes tener ${LIMITE_GRATUITO} promociones activas a la vez.`, 'advertencia');
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Publicar promoción';
        return;
      }

      const datos = {
        business_id: miEmprendimiento.id,
        title:       tituloInput.value.trim(),
        description: descInput.value.trim() || null,
        discount_percent: descuentoInput.value.trim() ? Number(descuentoInput.value.trim()) : null,
        end_date:    fechaFinInput.value || null,
        is_active:   true
      };

      await EH.client.promotions.create(datos);

      EH.toast('✅ Promoción publicada exitosamente.', 'exito');
      formPromo.reset();
      await cargarPromociones();
    } catch (err) {
      EH.toast(`❌ Error al publicar: ${EH.escapeHtml(err.message)}`, 'error');
    } finally {
      btnGuardar.disabled = false;
      btnGuardar.textContent = 'Publicar promoción';
    }
  });

  /* ---- Eliminar promoción ---- */
  async function eliminarPromocion(promoId) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta promoción?')) return;
    try {
      await EH.client.promotions.delete(promoId);
      EH.toast('Promoción eliminada.', 'info');
      await cargarPromociones();
    } catch (err) {
      EH.toast(`❌ Error al eliminar: ${EH.escapeHtml(err.message)}`, 'error');
    }
  }

  /* ---- Cancelar / limpiar formulario ---- */
  btnCancelar.addEventListener('click', function () {
    formPromo.reset();
    errorTitulo.textContent   = '';
    errorDescuento.textContent = '';
  });

  /* ---- Inicialización ---- */
  miEmprendimiento = await cargarEmprendimiento();

  if (!miEmprendimiento) {
    if (avisoCrear)   avisoCrear.classList.remove('oculto');
    if (seccionPromos) seccionPromos.style.display = 'none';
    return;
  }

  await cargarPromociones();
});

