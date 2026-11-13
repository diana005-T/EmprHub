/* ==========================================================================
   EmpreHub - admin.js
   Lógica Integral del Panel Administrativo de EmpreHub.
   Control de Emprendimientos, Usuarios, Métricas y Políticas de Supervisión.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async function () {
  const enPanelAdmin = document.body.dataset.paginaAdmin;
  if (!enPanelAdmin) return;

  // Proteger la página: verificación estricta de rol 'admin'
  const tieneAcceso = await EH.protegerPagina('admin', '../registro.html');
  if (!tieneAcceso) return;

  /* ------------------------------------------------------------------------
     1. MANEJO DE PESTAÑAS (TABS)
     ------------------------------------------------------------------------ */
  const tabs = document.querySelectorAll('.admin-btn-tab');
  const bloques = document.querySelectorAll('.admin-bloque');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('activo'));
      bloques.forEach(b => b.classList.add('oculto'));

      tab.classList.add('activo');
      const seccionId = tab.dataset.seccion;
      const seccion = document.getElementById(seccionId);
      if (seccion) seccion.classList.remove('oculto');
    });
  });

  /* ------------------------------------------------------------------------
     2. CARGA DE MÉTRICAS RESUMEN
     ------------------------------------------------------------------------ */
  async function cargarMetricas() {
    try {
      let stats = null;
      if (EH.client && EH.client.admin) {
        stats = await EH.client.admin.getStats();
      }

      if (stats) {
        document.getElementById('metricUsers').textContent = stats.total_users || 0;
        document.getElementById('metricPending').textContent = stats.pending_businesses || 0;
        document.getElementById('metricPublished').textContent = stats.published_businesses || 0;
        document.getElementById('metricOrders').textContent = stats.total_orders || 0;
        document.getElementById('metricSales').textContent = 'S/ ' + Number(stats.total_sales || 0).toFixed(2);
      }
    } catch (err) {
      console.warn('Error cargando métricas:', err);
    }
  }

  /* ------------------------------------------------------------------------
     3. CARGA Y GESTIÓN DE EMPRENDIMIENTOS
     ------------------------------------------------------------------------ */
  async function cargarEmprendimientos() {
    const cont = document.getElementById('tablaEmprendimientosContenedor');
    cont.innerHTML = '<div class="estado-cargando"><div class="spinner"></div><p>Cargando emprendimientos...</p></div>';

    try {
      const lista = await EH.client.businesses.getAllForAdmin();

      if (!lista || lista.length === 0) {
        cont.innerHTML = '<div class="estado-vacio"><p>No hay emprendimientos registrados en el sistema.</p></div>';
        return;
      }

      cont.innerHTML = `
        <table class="admin-tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Propietario</th>
              <th>Categoría</th>
              <th>Estado</th>
              <th>Acciones de Moderación</th>
            </tr>
          </thead>
          <tbody>
            ${lista.map(emp => {
              const status = emp.status || 'pending';
              let badgeClass = 'badge-status--pending';
              let statusLabel = 'Pendiente';
              if (status === 'published') { badgeClass = 'badge-status--published'; statusLabel = 'Publicado'; }
              else if (status === 'rejected') { badgeClass = 'badge-status--rejected'; statusLabel = 'Rechazado'; }
              else if (status === 'suspended') { badgeClass = 'badge-status--suspended'; statusLabel = 'Suspendido'; }

              const ownerEmail = (emp.owner && emp.owner.email) ? emp.owner.email : (emp.propietario || '-');
              const catName = (emp.category && emp.category.name) ? emp.category.name : (emp.categoria || 'General');

              return `
                <tr>
                  <td>
                    <strong>${EH.escapeHtml(emp.name || emp.nombre)}</strong>
                    <div style="font-size:0.8rem; color:#64748b;">${EH.escapeHtml(emp.description || emp.descripcion || '')}</div>
                  </td>
                  <td>${EH.escapeHtml(ownerEmail)}</td>
                  <td>${EH.escapeHtml(catName)}</td>
                  <td><span class="badge-status ${badgeClass}">${statusLabel}</span></td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      ${status !== 'published' ? `<button class="btn btn-secundario" style="padding:4px 8px; font-size:0.8rem;" data-accion="aprobar" data-id="${EH.escapeHtml(emp.id)}">Aprobar</button>` : ''}
                      ${status !== 'rejected' ? `<button class="btn btn-alerta" style="padding:4px 8px; font-size:0.8rem; background:#dc2626;" data-accion="rechazar" data-id="${EH.escapeHtml(emp.id)}">Rechazar</button>` : ''}
                      ${status !== 'suspended' ? `<button class="btn btn-secundario" style="padding:4px 8px; font-size:0.8rem; background:#475569;" data-accion="suspender" data-id="${EH.escapeHtml(emp.id)}">Suspender</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;

      // Eventos de botones de acción
      cont.querySelectorAll('button[data-accion]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const empId = btn.dataset.id;
          const accion = btn.dataset.accion;
          btn.disabled = true;

          try {
            if (accion === 'aprobar') {
              await EH.client.businesses.updateStatus(empId, 'published', 'Aprobado por el administrador.');
              EH.toast('Emprendimiento aprobado y publicado.');
            } else if (accion === 'rechazar') {
              const motivo = prompt('Ingresa el motivo del rechazo para notificar al emprendedor:');
              if (motivo === null) { btn.disabled = false; return; }
              await EH.client.businesses.updateStatus(empId, 'rejected', motivo);
              EH.toast('Emprendimiento rechazado.');
            } else if (accion === 'suspender') {
              const motivo = prompt('Ingresa el motivo de la suspensión:');
              if (motivo === null) { btn.disabled = false; return; }
              await EH.client.businesses.updateStatus(empId, 'suspended', motivo);
              EH.toast('Emprendimiento suspendido.');
            }
            await cargarEmprendimientos();
            await cargarMetricas();
          } catch (e) {
            console.error(e);
            alert('Error al actualizar estado: ' + e.message);
            btn.disabled = false;
          }
        });
      });

    } catch (err) {
      console.error(err);
      cont.innerHTML = '<div class="estado-vacio"><p>Error al cargar emprendimientos para administración.</p></div>';
    }
  }

  /* ------------------------------------------------------------------------
     4. CARGA DE USUARIOS
     ------------------------------------------------------------------------ */
  async function cargarUsuarios() {
    const cont = document.getElementById('tablaUsuariosContenedor');
    cont.innerHTML = '<div class="estado-cargando"><div class="spinner"></div><p>Cargando directorio de usuarios...</p></div>';

    try {
      const usuarios = await EH.client.admin.getAllUsers();

      if (!usuarios || usuarios.length === 0) {
        cont.innerHTML = '<div class="estado-vacio"><p>No hay usuarios registrados.</p></div>';
        return;
      }

      cont.innerHTML = `
        <table class="admin-tabla">
          <thead>
            <tr>
              <th>Nombre Completo</th>
              <th>Correo Electrónico</th>
              <th>Teléfono</th>
              <th>Rol en el Sistema</th>
            </tr>
          </thead>
          <tbody>
            ${usuarios.map(u => `
              <tr>
                <td><strong>${EH.escapeHtml(u.full_name || u.nombre || '-')}</strong></td>
                <td>${EH.escapeHtml(u.email || u.correo || '-')}</td>
                <td>${EH.escapeHtml(u.phone || u.telefono || '-')}</td>
                <td><span class="chip-categoria">${EH.escapeHtml(u.role || u.tipo || 'customer')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error(err);
      cont.innerHTML = '<div class="estado-vacio"><p>Error al cargar usuarios.</p></div>';
    }
  }

  /* ------------------------------------------------------------------------
     5. CARGA DE PEDIDOS GLOBALES
     ------------------------------------------------------------------------ */
  async function cargarPedidos() {
    const cont = document.getElementById('tablaPedidosContenedor');
    cont.innerHTML = '<div class="estado-cargando"><div class="spinner"></div><p>Cargando pedidos de la plataforma...</p></div>';

    try {
      const pedidos = await EH.client.orders.getAllForAdmin();

      if (!pedidos || pedidos.length === 0) {
        cont.innerHTML = '<div class="estado-vacio"><p>Aún no se registran pedidos.</p></div>';
        return;
      }

      cont.innerHTML = `
        <table class="admin-tabla">
          <thead>
            <tr>
              <th>N° Pedido</th>
              <th>Emprendimiento</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Método</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${pedidos.map(p => `
              <tr>
                <td><strong>${EH.escapeHtml(p.order_number || p.numero || '-')}</strong></td>
                <td>${EH.escapeHtml((p.business && p.business.name) || 'Negocio')}</td>
                <td>${EH.escapeHtml(p.customer_name || p.clienteNombre || 'Cliente')} (${EH.escapeHtml(p.customer_phone || p.telefono || '')})</td>
                <td><strong style="color:var(--color-azul);">S/ ${Number(p.total_amount || p.total || 0).toFixed(2)}</strong></td>
                <td>${EH.escapeHtml(p.payment_method || p.metodoPago || '-')}</td>
                <td><span class="badge-status badge-status--published">${EH.escapeHtml(p.status || p.estado || 'Pendiente')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error(err);
      cont.innerHTML = '<div class="estado-vacio"><p>Error al cargar pedidos globales.</p></div>';
    }
  }

  // Inicializar todas las secciones
  await cargarMetricas();
  await cargarEmprendimientos();
  await cargarUsuarios();
  await cargarPedidos();
});

