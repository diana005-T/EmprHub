# EmpreHub 🚀

**Plataforma digital que conecta clientes con emprendedores y pequeños negocios.**

EmpreHub permite a clientes explorar, comprar y contactar negocios locales, mientras que los emprendedores gestionan sus productos, pedidos y promociones desde un panel propio. Los administradores supervisan la plataforma completa.

---

## Índice

1. [Arquitectura](#arquitectura)
2. [Configurar Supabase](#configurar-supabase)
3. [Aplicar las migraciones SQL](#aplicar-las-migraciones-sql)
4. [Crear el primer administrador](#crear-el-primer-administrador)
5. [Despliegue en GitHub Pages](#despliegue-en-github-pages)
6. [Estructura del proyecto](#estructura-del-proyecto)
7. [Seguridad](#seguridad)
8. [Plan de límites del plan gratuito](#plan-de-límites-del-plan-gratuito)
9. [Pagos y comunicación](#pagos-y-comunicación)

---

## Arquitectura

- **Frontend:** HTML5 + CSS3 + JavaScript ES6+ puro (sin frameworks).
- **Backend:** [Supabase](https://supabase.com) — PostgreSQL, Auth, Storage y Row Level Security.
- **Hosting:** GitHub Pages (archivos estáticos).
- **SDK Supabase:** Cargado desde CDN (`@supabase/supabase-js@2`).
- **Modo demo:** Si las credenciales no están configuradas, la app funciona con `localStorage` como demo independiente.

---

## Configurar Supabase

> ⚠️ **Solo la `anon public key` va en el frontend. NUNCA pongas la `service_role` ni claves que empiecen con `sb_secret_` en ningún archivo público o del repositorio.**

### Paso 1 — Obtener tus credenciales

1. Ingresa a [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Selecciona tu proyecto **EmpreHub**.
3. Ve a **Project Settings** → **API**.
4. Copia:
   - **Project URL** (ej. `https://xyzcompany.supabase.co`)
   - **Project API Keys → `anon` `public`** (empieza con `eyJ…`)

### Paso 2 — Colocar las credenciales en el proyecto

Abre el archivo [`js/supabase-config.js`](js/supabase-config.js) y reemplaza los marcadores:

```javascript
// Línea 25: reemplaza el valor de SUPABASE_URL
SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',   // ← aquí va tu Project URL

// Línea 28: reemplaza el valor de SUPABASE_PUBLISHABLE_KEY
SUPABASE_PUBLISHABLE_KEY: 'TU_SUPABASE_ANON_KEY'   // ← aquí va tu anon public key
```

Después de guardar el archivo, la app usará Supabase en lugar del modo demo.

---

## Aplicar las migraciones SQL

Las migraciones deben aplicarse **en orden numérico** usando el **SQL Editor** de Supabase.

1. Ve a tu proyecto en [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Abre **SQL Editor** en el menú lateral.
3. Haz clic en **New query**.
4. Copia y pega el contenido de cada archivo y ejecútalo:

| Orden | Archivo | Contenido |
|-------|---------|-----------|
| 1 | [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) | Tablas, índices, restricciones |
| 2 | [`supabase/migrations/002_triggers_and_rules.sql`](supabase/migrations/002_triggers_and_rules.sql) | Triggers de seguridad y límites del plan gratuito |
| 3 | [`supabase/migrations/003_security_rls.sql`](supabase/migrations/003_security_rls.sql) | Row Level Security y políticas de acceso |
| 4 | [`supabase/migrations/004_functions_rpc.sql`](supabase/migrations/004_functions_rpc.sql) | Funciones RPC: checkout atómico, panel admin |
| 5 | [`supabase/migrations/005_storage_setup.sql`](supabase/migrations/005_storage_setup.sql) | Bucket de Storage, tipos de archivo y límites |
| 6 | [`supabase/migrations/006_seed_data.sql`](supabase/migrations/006_seed_data.sql) | Categorías iniciales y función para promover admin |
| 7 | [`supabase/migrations/007_security_rls_and_categories.sql`](supabase/migrations/007_security_rls_and_categories.sql) | Evita recursión en políticas de membresía y restringe escrituras directas |
| 8 | [`supabase/migrations/008_effective_privileges_and_order_transitions.sql`](supabase/migrations/008_effective_privileges_and_order_transitions.sql) | Endurece privilegios efectivos y valida las transiciones de pedidos mediante RPC |

> **Nota:** Ejecuta los archivos uno por uno, no todos juntos. Verifica que cada uno muestre **"Success"** antes de pasar al siguiente. Prueba primero 001–008 en un proyecto Supabase de staging con roles y datos de prueba. La suite local no valida permisos efectivos, RLS ni funciones contra PostgreSQL/Supabase real; no apliques 007–008 en producción sin esa comprobación.

---

## Crear el primer administrador

Después de aplicar todas las migraciones:

1. Regístrate en la app como cualquier usuario (cliente o emprendedor).
2. En el **SQL Editor** de Supabase ejecuta:

```sql
SELECT public.promote_user_to_admin('tu-correo@ejemplo.com');
```

Reemplaza `tu-correo@ejemplo.com` con el correo con el que te registraste.

> ⚠️ Esta es la **única forma** de crear un administrador. No existe ningún formulario en la app que permita asignarse el rol de admin — el sistema lo bloquea activamente.

Una vez ejecutado, cierra sesión y vuelve a iniciar sesión. Serás redirigido al panel de administración.

---

## Despliegue en GitHub Pages

1. Asegúrate de que tus credenciales Supabase están en `js/supabase-config.js`.
2. Haz commit y push de tus cambios a la rama `main` (u otra rama que uses para Pages).
3. En tu repositorio de GitHub ve a **Settings → Pages**.
4. En **Source** selecciona la rama que contiene la versión revisada y la carpeta raíz (`/ root`). No es necesario añadir un workflow de Actions para este sitio estático.
5. Espera unos segundos y tu sitio estará en `https://tu-usuario.github.io/EmpreHub/`.

> **Nota sobre `.env`:** GitHub Pages no procesa archivos `.env`. Las credenciales van directamente en `js/supabase-config.js`. La `anon public key` es de naturaleza pública y es segura para el frontend — las políticas RLS de Supabase protegen los datos.

---

## Estructura del proyecto

```
EmpreHub/
├── index.html                          # Página de bienvenida
├── css/
│   ├── style.css                       # Estilos globales (sistema de diseño)
│   ├── login.css                       # Formularios de autenticación
│   ├── inicio.css                      # Catálogo público
│   ├── carrito.css                     # Carrito y checkout
│   ├── emprendedor.css                 # Panel del emprendedor
│   └── emprendimiento.css              # Página de detalle de negocio
├── js/
│   ├── supabase-config.js              # ← COLOCAR CREDENCIALES AQUÍ
│   ├── supabase-client.js              # Cliente dual-mode (Supabase / localStorage)
│   ├── app.js                          # Sesión, header, toast, modal, XSS utils
│   ├── auth.js                         # Registro, login, recuperación de contraseña
│   ├── productos.js                    # Catálogo público
│   ├── carrito.js                      # Carrito y checkout atómico
│   ├── favoritos.js                    # Favoritos del cliente
│   ├── emprendedor.js                  # Panel del emprendedor
│   ├── promociones.js                  # Gestión de promociones
│   └── admin.js                        # Panel de administración
├── pages/
│   ├── inicio.html                     # Catálogo público
│   ├── registro.html                   # Login / Registro
│   ├── recuperar-password.html         # Recuperación de contraseña
│   ├── perfil.html                     # Perfil e historial de pedidos
│   ├── carrito.html                    # Carrito y checkout
│   ├── favoritos.html                  # Favoritos (requiere sesión)
│   ├── emprendimiento.html             # Detalle de negocio
│   ├── emprendedor/
│   │   ├── panel.html                  # Resumen del panel
│   │   ├── mi-emprendimiento.html      # Crear/editar negocio
│   │   ├── productos.html              # Gestión de productos
│   │   ├── pedidos.html                # Administración de pedidos
│   │   └── promociones.html            # Gestión de promociones
│   └── admin/
│       └── panel.html                  # Panel de administración
├── img/
│   └── logo.png
├── supabase/
│   └── migrations/                     # 8 archivos SQL versionados
├── test/
│   ├── run_tests.js                    # Suite técnica local
│   └── test_functional_cart_checkout.js # Suite funcional del carrito y checkout demo
└── .gitignore
```

---

## Seguridad

| Medida | Implementación |
|--------|----------------|
| Contraseñas | Gestionadas 100% por Supabase Auth — nunca almacenadas en texto plano |
| Roles | Asignados solo por triggers en la DB — no se pueden modificar desde el formulario |
| Admin | Solo creado via SQL `promote_user_to_admin()` — no existe formulario de admin |
| XSS | `EH.escapeHtml()` aplicado en todos los renderizados dinámicos con `innerHTML` |
| RLS | Habilitado en las 11 tablas — cada fila tiene políticas por rol |
| Storage | Bucket privado; solo JPG/PNG/WebP; máx 2MB por imagen |
| Precios | Calculados en servidor (función RPC) — no se confía en los precios del frontend |
| Email enumeration | Mensajes de error genéricos en login — no revela si un correo existe |
| Sesiones | Manejadas por Supabase Auth con JWT — no se guarda la contraseña en ningún lado |

---

## Plan de límites del plan gratuito

| Recurso | Límite |
|---------|--------|
| Emprendimientos por usuario | 1 |
| Productos por emprendimiento | 20 |
| Imágenes por producto | 3 |
| Promociones activas | 2 |

La arquitectura está preparada para un futuro **plan Premium** sin pagos implementados actualmente.

---

## Pagos y comunicación

- **Métodos de pago aceptados:** Yape, Plin y efectivo — coordinados externamente entre cliente y emprendedor.
- **Canal de comunicación:** WhatsApp (coordinación directa).
- **No se integra:** ninguna pasarela de pago ni API de WhatsApp en esta versión.

---

*EmpreHub — Hecho con ❤️ para los emprendedores del Perú.*
