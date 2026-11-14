/**
 * ============================================================================
 * EmpreHub - Cliente de Integración con Supabase
 * ============================================================================
 * Maneja la capa de comunicación asíncrona, autenticación, almacenamiento,
 * consultas PostgreSQL con RLS y llamadas a procedimientos RPC.
 * ============================================================================
 */

(function () {
  'use strict';

  const EH_CLIENT = {};
  const ORDER_STATUS_TRANSITIONS = {
    'Pendiente': ['En preparación', 'Cancelado'],
    'En preparación': ['En camino', 'Cancelado'],
    'En camino': ['Entregado', 'Cancelado'],
    'Entregado': [],
    'Cancelado': []
  };

  // Referencia al cliente nativo de Supabase
  let sb = null;

  // Inicialización
  function init() {
    const config = window.EMPREHUB_CONFIG || {};

    if (window.supabase && typeof window.supabase.createClient === 'function') {
      if (config.isConfigured && config.isConfigured()) {
        try {
          sb = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });
          EH_CLIENT.isLive = true;
          console.info('✅ Conexión con Supabase inicializada correctamente.');
        } catch (e) {
          console.error('❌ Error al inicializar cliente de Supabase:', e);
          EH_CLIENT.isLive = false;
        }
      } else {
        EH_CLIENT.isLive = false;
        console.warn('⚠️ EmpreHub: Supabase no está configurado con credenciales activas. Operando en modo local/demo.');
      }
    } else {
      EH_CLIENT.isLive = false;
      console.warn('⚠️ EmpreHub: SDK @supabase/supabase-js no detectado.');
    }
  }

  // Inicializar al cargar
  init();

  EH_CLIENT.getNativeClient = function () {
    return sb;
  };

  /* --------------------------------------------------------------------------
     1. AUTENTICACIÓN Y PERFILES (Supabase Auth + profiles)
     -------------------------------------------------------------------------- */
  EH_CLIENT.auth = {
    // Registrar nuevo usuario
    async signUp({ email, password, fullName, phone, role }) {
      if (!EH_CLIENT.isLive) {
        return fallbackAuth.signUp({ email, password, fullName, phone, role });
      }

      // Validar que el rol sea cliente o emprendedor (nunca admin por frontend)
      const safeRole = role === 'emprendedor' ? 'entrepreneur' : 'customer';

      const { data, error } = await sb.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone ? phone.trim() : null,
            role: safeRole
          }
        }
      });

      if (error) throw error;
      return data;
    },

    // Iniciar sesión
    async signIn({ email, password }) {
      if (!EH_CLIENT.isLive) {
        return fallbackAuth.signIn({ email, password });
      }

      const { data, error } = await sb.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password
      });

      if (error) throw error;

      // Obtener el perfil asociado para conocer el rol
      const profile = await EH_CLIENT.auth.getProfile(data.user.id);
      return { user: data.user, session: data.session, profile };
    },

    // Cerrar sesión
    async signOut() {
      if (!EH_CLIENT.isLive) {
        return fallbackAuth.signOut();
      }
      const { error } = await sb.auth.signOut();
      if (error) console.error('Error al cerrar sesión:', error);
    },

    // Recuperar contraseña
    async resetPassword(email) {
      if (!EH_CLIENT.isLive) {
        return { ok: true, mensaje: 'Modo demo: Instrucciones simuladas enviadas a ' + email };
      }
      const { data, error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: window.location.origin + '/pages/recuperar-password.html'
      });
      if (error) throw error;
      return data;
    },

    // Obtener sesión activa
    async getSession() {
      if (!EH_CLIENT.isLive) {
        return fallbackAuth.getSession();
      }
      const { data: { session }, error } = await sb.auth.getSession();
      if (error || !session) return null;
      return session;
    },

    // Obtener usuario activo
    async getUser() {
      if (!EH_CLIENT.isLive) {
        return fallbackAuth.getUser();
      }
      const { data: { user }, error } = await sb.auth.getUser();
      if (error || !user) return null;
      return user;
    },

    // Obtener perfil completo desde public.profiles
    async getProfile(userId) {
      if (!userId) {
        const user = await EH_CLIENT.auth.getUser();
        if (!user) return null;
        userId = user.id;
      }

      if (!EH_CLIENT.isLive) {
        return fallbackAuth.getProfile(userId);
      }

      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error obteniendo perfil:', error);
        return null;
      }
      return data;
    },

    // Actualizar datos de perfil (nombre, teléfono, etc.)
    async updateProfile(userId, updates) {
      if (!EH_CLIENT.isLive) {
        return fallbackAuth.updateProfile(userId, updates);
      }

      // No permitir modificar el role directamente desde aquí
      const safeUpdates = { ...updates };
      delete safeUpdates.role;
      delete safeUpdates.id;
      delete safeUpdates.email;

      const { data, error } = await sb
        .from('profiles')
        .update(safeUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    // Escuchar cambios de estado de autenticación
    onAuthStateChange(callback) {
      if (!EH_CLIENT.isLive) {
        return { data: { subscription: { unsubscribe: () => {} } } };
      }
      return sb.auth.onAuthStateChange(callback);
    }
  };

  /* --------------------------------------------------------------------------
     2. CATEGORÍAS
     -------------------------------------------------------------------------- */
  EH_CLIENT.categories = {
    async getAll() {
      if (!EH_CLIENT.isLive) {
        return [
          { id: '1', name: 'Platos', slug: 'platos', icon: 'utensils' },
          { id: '2', name: 'Bebidas', slug: 'bebidas', icon: 'cup-soda' },
          { id: '3', name: 'Productos', slug: 'productos', icon: 'shopping-bag' },
          { id: '4', name: 'Postres', slug: 'postres', icon: 'cake-slice' }
        ];
      }

      const { data, error } = await sb
        .from('business_categories')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data;
    }
  };

  /* --------------------------------------------------------------------------
     3. EMPRENDIMIENTOS (businesses)
     -------------------------------------------------------------------------- */
  EH_CLIENT.businesses = {
    // Catálogo público: solo negocios con status = 'published'
    async getAllPublished({ categoryId = null, search = '' } = {}) {
      if (!EH_CLIENT.isLive) {
        return fallbackBusinesses.getAllPublished({ categoryId, search });
      }

      let query = sb
        .from('businesses')
        .select(`
          id,
          name,
          slug,
          description,
          status,
          logo_url,
          banner_url,
          operating_hours,
          payment_methods,
          phone,
          address,
          plan,
          category_id,
          category:business_categories(id, name, icon)
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (categoryId && categoryId !== 'Todas') {
        query = query.eq('category_id', categoryId);
      }

      if (search && search.trim() !== '') {
        const s = search.trim();
        query = query.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    // Detalle de un emprendimiento
    async getById(id) {
      if (!EH_CLIENT.isLive) {
        return fallbackBusinesses.getById(id);
      }

      const { data, error } = await sb
        .from('businesses')
        .select(`
          id,
          slug,
          name,
          description,
          status,
          logo_url,
          banner_url,
          operating_hours,
          payment_methods,
          phone,
          address,
          plan,
          category_id,
          created_at,
          category:business_categories(id, name, icon),
          promotions(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },

    // Obtener los negocios de un emprendedor específico
    async getByOwner(ownerId) {
      if (!EH_CLIENT.isLive) {
        return fallbackBusinesses.getByOwner(ownerId);
      }

      // El RPC vincula la consulta al usuario autenticado y evita exponer
      // columnas internas de otros negocios mediante SELECT directo.
      const { data, error } = await sb.rpc('get_businesses_for_management');

      if (error) throw error;
      return data;
    },

    // Crear un nuevo emprendimiento (nace como 'pending')
    async create(businessData) {
      if (!EH_CLIENT.isLive) {
        return fallbackBusinesses.create(businessData);
      }

      const user = await EH_CLIENT.auth.getUser();
      if (!user) throw new Error('Debes iniciar sesión para crear un emprendimiento.');

      const payload = {
        owner_id: user.id,
        name: businessData.name,
        description: businessData.description,
        category_id: businessData.category_id,
        operating_hours: businessData.operating_hours,
        payment_methods: businessData.payment_methods
      };

      const { data, error } = await sb
        .from('businesses')
        .insert([payload])
        .select('id, slug, name, description, status, logo_url, banner_url, operating_hours, payment_methods, phone, address, plan, category_id, created_at')
        .single();

      if (error) throw error;
      return data;
    },

    // Actualizar emprendimiento
    async update(id, businessData) {
      if (!EH_CLIENT.isLive) {
        return fallbackBusinesses.update(id, businessData);
      }

      const safeData = {
        name: businessData.name,
        description: businessData.description,
        category_id: businessData.category_id,
        operating_hours: businessData.operating_hours,
        payment_methods: businessData.payment_methods
      };

      const { data, error } = await sb
        .from('businesses')
        .update(safeData)
        .eq('id', id)
        .select('id, slug, name, description, status, logo_url, banner_url, operating_hours, payment_methods, phone, address, plan, category_id, created_at')
        .single();

      if (error) throw error;
      return data;
    },

    // Panel Administrador: listar todos los negocios
    async getAllForAdmin() {
      if (!EH_CLIENT.isLive) {
        return fallbackBusinesses.getAllForAdmin();
      }

      const { data, error } = await sb.rpc('get_businesses_for_management');

      if (error) throw error;
      return data;
    },

    // Administrador: cambiar estado (aprobar, rechazar, suspender)
    async updateStatus(id, newStatus, reason = '') {
      if (!EH_CLIENT.isLive) {
        return fallbackBusinesses.updateStatus(id, newStatus, reason);
      }

      const { data, error } = await sb.rpc('update_business_status', {
        p_business_id: id,
        p_new_status: newStatus,
        p_reason: reason || null
      });

      if (error) throw error;
      return data;
    }
  };

  /* --------------------------------------------------------------------------
     4. PRODUCTOS (products)
     -------------------------------------------------------------------------- */
  EH_CLIENT.products = {
    // Listar productos de un negocio
    async getByBusiness(businessId, { onlyActive = true } = {}) {
      if (!EH_CLIENT.isLive) {
        return fallbackProducts.getByBusiness(businessId);
      }

      let query = sb
        .from('products')
        .select(`
          *,
          category:business_categories(id, name, icon),
          images:product_images(*)
        `)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (onlyActive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    // Detalle de un producto
    async getById(id) {
      if (!EH_CLIENT.isLive) {
        return fallbackProducts.getById(id);
      }

      const { data, error } = await sb
        .from('products')
        .select(`
          *,
          business:businesses(id, name, status, payment_methods),
          images:product_images(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },

    // Crear producto (sujeto a límite de 20 por el trigger de plan free)
    async create(productData) {
      if (!EH_CLIENT.isLive) {
        return fallbackProducts.create(productData);
      }

      const { data, error } = await sb
        .from('products')
        .insert([productData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    // Actualizar producto
    async update(id, productData) {
      if (!EH_CLIENT.isLive) {
        return fallbackProducts.update(id, productData);
      }

      const { data, error } = await sb
        .from('products')
        .update(productData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    // Eliminar producto
    async delete(id) {
      if (!EH_CLIENT.isLive) {
        return fallbackProducts.delete(id);
      }

      const { error } = await sb
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    }
  };

  /* --------------------------------------------------------------------------
     5. IMÁGENES Y ALMACENAMIENTO (Supabase Storage)
     -------------------------------------------------------------------------- */
  EH_CLIENT.storage = {
    // Subir imagen de producto
    async uploadProductImage(file, businessId, productId) {
      if (!EH_CLIENT.isLive) {
        return fallbackStorage.upload(file);
      }

      // Validar tipo mime y tamaño (< 2MB)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Formato de imagen no permitido. Usa JPG, PNG o WebP.');
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('La imagen excede el límite de 2MB.');
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${businessId}/${productId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;

      const { data, error } = await sb.storage
        .from('emprehub-media')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (error) throw error;

      // Obtener URL pública
      const { data: publicData } = sb.storage
        .from('emprehub-media')
        .getPublicUrl(fileName);

      const publicUrl = publicData.publicUrl;

      // Registrar en la tabla product_images
      const { data: imgRecord, error: imgErr } = await sb
        .from('product_images')
        .insert([{
          product_id: productId,
          storage_path: fileName,
          public_url: publicUrl
        }])
        .select()
        .single();

      if (imgErr) {
        console.warn('Aviso al registrar product_image en DB:', imgErr);
      }

      // Actualizar main_image_url del producto si está vacío
      await sb
        .from('products')
        .update({ main_image_url: publicUrl })
        .eq('id', productId)
        .is('main_image_url', null);

      return { publicUrl, fileName };
    },

    // Subir logo o banner de emprendimiento
    async uploadBusinessLogo(file, businessId) {
      if (!EH_CLIENT.isLive) {
        return fallbackStorage.upload(file);
      }

      if (file.size > 2 * 1024 * 1024) {
        throw new Error('La imagen excede el límite de 2MB.');
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${businessId}/branding/logo_${Date.now()}.${ext}`;

      const { data, error } = await sb.storage
        .from('emprehub-media')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: publicData } = sb.storage
        .from('emprehub-media')
        .getPublicUrl(fileName);

      const publicUrl = publicData.publicUrl;

      await sb
        .from('businesses')
        .update({ logo_url: publicUrl })
        .eq('id', businessId);

      return { publicUrl };
    }
  };

  /* --------------------------------------------------------------------------
     6. FAVORITOS
     -------------------------------------------------------------------------- */
  EH_CLIENT.favorites = {
    async listByUser(userId) {
      if (!EH_CLIENT.isLive) {
        return fallbackFavorites.listByUser(userId);
      }

      const { data, error } = await sb
        .from('favorites')
        .select(`
          business_id,
          business:businesses(id, name, slug, description, status, logo_url, category:business_categories(name, icon))
        `)
        .eq('user_id', userId);

      if (error) throw error;
      return (data || []).map(f => f.business).filter(b => b && b.status === 'published');
    },

    async toggle(userId, businessId) {
      if (!EH_CLIENT.isLive) {
        return fallbackFavorites.toggle(userId, businessId);
      }

      // Comprobar si ya existe
      const { data: existing } = await sb
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('business_id', businessId)
        .maybeSingle();

      if (existing) {
        await sb.from('favorites').delete().eq('id', existing.id);
        return false; // Quitado
      } else {
        await sb.from('favorites').insert([{ user_id: userId, business_id: businessId }]);
        return true; // Agregado
      }
    },

    async isFavorite(userId, businessId) {
      if (!userId || !businessId) return false;
      if (!EH_CLIENT.isLive) {
        return fallbackFavorites.isFavorite(userId, businessId);
      }

      const { data } = await sb
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('business_id', businessId)
        .maybeSingle();

      return Boolean(data);
    }
  };

  /* --------------------------------------------------------------------------
     7. CARRITO PERSISTENTE (cart_items)
     -------------------------------------------------------------------------- */
  EH_CLIENT.cart = {
    async get(userId) {
      if (!EH_CLIENT.isLive) {
        return fallbackCart.get(userId);
      }

      const { data, error } = await sb
        .from('cart_items')
        .select(`
          id,
          quantity,
          product_id,
          product:products(
            id,
            name,
            price,
            stock,
            is_active,
            main_image_url,
            business_id,
            business:businesses(id, name, status)
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      // Filtrar productos válidos
      return (data || [])
        .filter(item => item.product && item.product.is_active && item.product.business.status === 'published')
        .map(item => ({
          cartItemId: item.id,
          id: item.product.id,
          nombre: item.product.name,
          precio: Number(item.product.price),
          stock: item.product.stock,
          cantidad: item.quantity,
          emprendimientoId: item.product.business_id,
          nombreEmprendimiento: item.product.business.name,
          imagen: item.product.main_image_url || ''
        }));
    },

    async addItem(userId, productId, quantity = 1) {
      if (!EH_CLIENT.isLive) {
        return fallbackCart.addItem(userId, productId, quantity);
      }

      // Validar producto y stock actual
      const { data: prod, error: prodErr } = await sb
        .from('products')
        .select('stock, is_active')
        .eq('id', productId)
        .single();

      if (prodErr || !prod || !prod.is_active) {
        throw new Error('El producto ya no está disponible.');
      }

      // Verificar si ya está en el carrito
      const { data: existing } = await sb
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .maybeSingle();

      const currentQty = existing ? existing.quantity : 0;
      const newQty = currentQty + quantity;

      if (newQty > prod.stock) {
        throw new Error(`Solo quedan ${prod.stock} unidades disponibles.`);
      }

      if (existing) {
        const { error } = await sb
          .from('cart_items')
          .update({ quantity: newQty })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from('cart_items')
          .insert([{ user_id: userId, product_id: productId, quantity: newQty }]);
        if (error) throw error;
      }
      return true;
    },

    async updateQuantity(userId, productId, newQuantity) {
      if (!EH_CLIENT.isLive) {
        return fallbackCart.updateQuantity(userId, productId, newQuantity);
      }

      if (newQuantity < 1) throw new Error('La cantidad mínima es 1.');

      const { data: prod } = await sb
        .from('products')
        .select('stock')
        .eq('id', productId)
        .single();

      if (prod && newQuantity > prod.stock) {
        throw new Error(`Solo quedan ${prod.stock} unidades disponibles.`);
      }

      const { error } = await sb
        .from('cart_items')
        .update({ quantity: newQuantity })
        .eq('user_id', userId)
        .eq('product_id', productId);

      if (error) throw error;
      return true;
    },

    async removeItem(userId, productId) {
      if (!EH_CLIENT.isLive) {
        return fallbackCart.removeItem(userId, productId);
      }

      const { error } = await sb
        .from('cart_items')
        .delete()
        .eq('user_id', userId)
        .eq('product_id', productId);

      if (error) throw error;
      return true;
    },

    async clear(userId) {
      if (!EH_CLIENT.isLive) {
        return fallbackCart.clear(userId);
      }

      const { error } = await sb
        .from('cart_items')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    }
  };

  /* --------------------------------------------------------------------------
     8. PEDIDOS TRANSACCIONALES (orders & RPC create_order_atomic)
     -------------------------------------------------------------------------- */
  EH_CLIENT.orders = {
    // Crear pedido atómico transaccional en el servidor
    async createAtomic({ businessId, customerName, customerPhone, deliveryAddress, paymentMethod, items, notes }) {
      if (!EH_CLIENT.isLive) {
        return fallbackOrders.createAtomic({ businessId, customerName, customerPhone, deliveryAddress, paymentMethod, items, notes });
      }

      const formattedItems = items.map(i => ({
        product_id: i.productId || i.id,
        quantity: i.cantidad || i.quantity
      }));

      const { data, error } = await sb.rpc('create_order_atomic', {
        p_business_id: businessId,
        p_customer_name: customerName,
        p_customer_phone: customerPhone,
        p_delivery_address: deliveryAddress,
        p_payment_method: paymentMethod,
        p_items: formattedItems,
        p_notes: notes || null
      });

      if (error) throw error;
      return data;
    },

    // Pedidos del cliente (historial)
    async getByCustomer(customerId) {
      if (!EH_CLIENT.isLive) {
        return fallbackOrders.getByCustomer(customerId);
      }

      const { data, error } = await sb
        .from('orders')
        .select(`
          *,
          business:businesses(id, name, logo_url, phone),
          items:order_items(*)
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },

    // Pedidos recibidos por un emprendimiento
    async getByBusiness(businessId) {
      if (!EH_CLIENT.isLive) {
        return fallbackOrders.getByBusiness(businessId);
      }

      const { data, error } = await sb
        .from('orders')
        .select(`
          *,
          items:order_items(*)
        `)
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },

    // Emprendedor o Admin actualiza estado del pedido
    async updateStatus(orderId, newStatus) {
      if (!EH_CLIENT.isLive) {
        return fallbackOrders.updateStatus(orderId, newStatus);
      }

      const { data, error } = await sb.rpc('update_order_status', {
        p_order_id: orderId,
        p_new_status: newStatus
      });

      if (error) throw error;
      return data;
    },

    // Admin: listar todos los pedidos
    async getAllForAdmin() {
      if (!EH_CLIENT.isLive) {
        return fallbackOrders.getAllForAdmin();
      }

      const { data, error } = await sb
        .from('orders')
        .select(`
          *,
          business:businesses(id, name),
          items:order_items(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  };

  /* --------------------------------------------------------------------------
     9. PROMOCIONES
     -------------------------------------------------------------------------- */
  EH_CLIENT.promotions = {
    async getByBusiness(businessId) {
      if (!EH_CLIENT.isLive) {
        return fallbackPromotions.getByBusiness(businessId);
      }

      const { data, error } = await sb
        .from('promotions')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },

    async create(promoData) {
      if (!EH_CLIENT.isLive) {
        return fallbackPromotions.create(promoData);
      }

      const { data, error } = await sb
        .from('promotions')
        .insert([promoData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async delete(promoId) {
      if (!EH_CLIENT.isLive) {
        return fallbackPromotions.delete(promoId);
      }

      const { error } = await sb
        .from('promotions')
        .delete()
        .eq('id', promoId);

      if (error) throw error;
      return true;
    }
  };

  /* --------------------------------------------------------------------------
     10. PANEL DE ADMINISTRACIÓN
     -------------------------------------------------------------------------- */
  EH_CLIENT.admin = {
    async getStats() {
      if (!EH_CLIENT.isLive) {
        return fallbackAdmin.getStats();
      }

      const { data, error } = await sb.rpc('get_admin_dashboard_stats');
      if (error) throw error;
      return data;
    },

    async getAllUsers() {
      if (!EH_CLIENT.isLive) {
        return fallbackAdmin.getAllUsers();
      }

      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  };


  /* ==========================================================================
     CAPA DE DEMO INDEPENDIENTE (LOCALSTORAGE)
     Se usa exclusivamente cuando Supabase no tiene credenciales configuradas
     o en modo de prueba local desconectado, respetando la regla:
     "Conserva la versión de demostración con localStorage de manera independiente"
     ========================================================================== */
  const fallbackAuth = {
    async signUp({ email, password, fullName, phone, role }) {
      const usuarios = JSON.parse(localStorage.getItem('eh_usuarios') || '[]');
      const existe = usuarios.some(u => u.correo === email.toLowerCase());
      if (existe) throw new Error('Este correo ya está registrado en la base demo.');

      const nuevo = {
        id: 'usr_' + Date.now(),
        nombre: fullName,
        correo: email.toLowerCase(),
        password: password,
        telefono: phone,
        tipo: role === 'emprendedor' ? 'emprendedor' : 'cliente'
      };
      usuarios.push(nuevo);
      localStorage.setItem('eh_usuarios', JSON.stringify(usuarios));
      return { user: { id: nuevo.id, email: nuevo.correo } };
    },

    async signIn({ email, password }) {
      const usuarios = JSON.parse(localStorage.getItem('eh_usuarios') || '[]');
      const usuario = usuarios.find(u => u.correo === email.toLowerCase());
      if (!usuario || usuario.password !== password) {
        throw new Error('Credenciales incorrectas.');
      }
      const profile = {
        id: usuario.id || usuario.correo,
        email: usuario.correo,
        full_name: usuario.nombre,
        role: usuario.tipo === 'emprendedor' ? 'entrepreneur' : (usuario.tipo === 'admin' ? 'admin' : 'customer')
      };
      const session = { user: { id: profile.id, email: profile.email } };
      localStorage.setItem('eh_sesion', JSON.stringify({ correo: usuario.correo, tipo: usuario.tipo, id: profile.id }));
      return { user: session.user, session, profile };
    },

    async signOut() {
      localStorage.removeItem('eh_sesion');
    },

    async getSession() {
      const s = localStorage.getItem('eh_sesion');
      return s ? JSON.parse(s) : null;
    },

    async getUser() {
      const s = this.getSession();
      return s ? { id: s.id || s.correo, email: s.correo } : null;
    },

    async getProfile(userId) {
      const usuarios = JSON.parse(localStorage.getItem('eh_usuarios') || '[]');
      const s = localStorage.getItem('eh_sesion');
      const sesion = s ? JSON.parse(s) : null;
      const target = usuarios.find(u => u.id === userId || u.correo === userId || (sesion && u.correo === sesion.correo));
      if (!target) return null;
      return {
        id: target.id || target.correo,
        email: target.correo,
        full_name: target.nombre,
        phone: target.telefono || '',
        role: target.tipo === 'emprendedor' ? 'entrepreneur' : (target.tipo === 'admin' ? 'admin' : 'customer')
      };
    },

    async updateProfile(userId, updates) {
      const usuarios = JSON.parse(localStorage.getItem('eh_usuarios') || '[]');
      const usuario = usuarios.find(u => u.id === userId || u.correo === userId);
      if (usuario) {
        if (updates.full_name) usuario.nombre = updates.full_name;
        if (updates.phone) usuario.telefono = updates.phone;
        localStorage.setItem('eh_usuarios', JSON.stringify(usuarios));
      }
      return updates;
    }
  };

  const fallbackBusinesses = {
    async getAllPublished({ categoryId, search }) {
      let list = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      list = list.filter(b => b.status === 'published' || !b.status); // En demo los iniciales se consideran published
      if (categoryId && categoryId !== 'Todas') {
        list = list.filter(b => b.categoria === categoryId);
      }
      if (search) {
        const s = search.toLowerCase();
        list = list.filter(b => b.nombre.toLowerCase().includes(s) || b.descripcion.toLowerCase().includes(s));
      }
      return list.map(b => ({
        id: b.id,
        name: b.nombre,
        description: b.descripcion,
        status: 'published',
        category: { name: b.categoria, icon: 'store' },
        payment_methods: b.mediosPago || ['Yape', 'Plin', 'Efectivo'],
        operating_hours: b.horario || ''
      }));
    },

    async getById(id) {
      const list = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      const b = list.find(x => x.id === id);
      if (!b) throw new Error('Emprendimiento no encontrado');
      return {
        id: b.id,
        name: b.nombre,
        description: b.descripcion,
        status: 'published',
        category: { name: b.categoria, icon: 'store' },
        payment_methods: b.mediosPago || ['Yape', 'Plin', 'Efectivo'],
        operating_hours: b.horario || '',
        promotions: (b.promociones || []).map((p, idx) => ({ id: String(idx), title: p }))
      };
    },

    async getByOwner(ownerId) {
      const list = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      const b = list.filter(x => x.propietario === ownerId || x.owner_id === ownerId);
      return b.map(x => ({
        id: x.id,
        name: x.nombre,
        description: x.descripcion,
        status: x.status || 'published',
        category: { name: x.categoria, icon: 'store' },
        operating_hours: x.horario || '',
        payment_methods: x.mediosPago || ['Yape', 'Plin', 'Efectivo'],
        logo_url: x.logo_url || ''
      }));
    },

    async create(data) {
      const list = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      const nuevo = {
        id: 'emp_' + Date.now(),
        owner_id: data.owner_id,
        nombre: data.name,
        descripcion: data.description,
        categoria: data.category_id || 'Platos',
        horario: data.operating_hours,
        mediosPago: data.payment_methods,
        propietario: data.owner_id,
        status: 'pending',
        promociones: []
      };
      list.push(nuevo);
      localStorage.setItem('eh_emprendimientos', JSON.stringify(list));
      return nuevo;
    },

    async update(id, data) {
      const list = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      const b = list.find(x => x.id === id);
      if (b) {
        if (data.name) b.nombre = data.name;
        if (data.description) b.descripcion = data.description;
        if (data.category_id) b.categoria = data.category_id;
        if (data.operating_hours) b.horario = data.operating_hours;
        if (data.payment_methods) b.mediosPago = data.payment_methods;
        localStorage.setItem('eh_emprendimientos', JSON.stringify(list));
      }
      return b;
    },

    async getAllForAdmin() {
      const list = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      return list.map(b => ({
        id: b.id,
        name: b.nombre,
        description: b.descripcion,
        status: b.status || 'published',
        category: { name: b.categoria },
        owner: { email: b.propietario || 'demo@emprehub.pe' }
      }));
    },

    async updateStatus(id, newStatus, reason) {
      const list = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      const b = list.find(x => x.id === id);
      if (b) {
        b.status = newStatus;
        b.status_reason = reason;
        localStorage.setItem('eh_emprendimientos', JSON.stringify(list));
      }
      return { success: true };
    }
  };

  const fallbackProducts = {
    async getByBusiness(businessId) {
      const list = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      return list.filter(p => p.emprendimientoId === businessId || p.business_id === businessId).map(p => ({
        id: p.id,
        name: p.nombre,
        description: p.descripcion,
        price: p.precio,
        stock: p.stock,
        is_active: true,
        main_image_url: p.imagen || '',
        category: { name: p.categoria }
      }));
    },

    async getById(id) {
      const list = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      const p = list.find(x => x.id === id);
      if (!p) throw new Error('Producto no encontrado');
      return {
        id: p.id,
        name: p.nombre,
        description: p.descripcion,
        price: p.precio,
        stock: p.stock,
        is_active: true,
        main_image_url: p.imagen || '',
        business: { id: p.emprendimientoId, name: 'Emprendimiento Demo' }
      };
    },

    async create(data) {
      const list = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      const p = {
        id: 'prod_' + Date.now(),
        emprendimientoId: data.business_id,
        nombre: data.name,
        descripcion: data.description,
        categoria: data.category_id || 'Platos',
        precio: data.price,
        stock: data.stock,
        imagen: data.main_image_url || ''
      };
      list.push(p);
      localStorage.setItem('eh_productos', JSON.stringify(list));
      return p;
    },

    async update(id, data) {
      const list = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      const p = list.find(x => x.id === id);
      if (p) {
        if (data.name) p.nombre = data.name;
        if (data.description) p.descripcion = data.description;
        if (data.price !== undefined) p.precio = data.price;
        if (data.stock !== undefined) p.stock = data.stock;
        localStorage.setItem('eh_productos', JSON.stringify(list));
      }
      return p;
    },

    async delete(id) {
      let list = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      list = list.filter(x => x.id !== id);
      localStorage.setItem('eh_productos', JSON.stringify(list));
      return true;
    }
  };

  const fallbackStorage = {
    async upload(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ publicUrl: e.target.result });
        reader.readAsDataURL(file);
      });
    }
  };

  const fallbackFavorites = {
    listByUser(userId) {
      const favs = JSON.parse(localStorage.getItem('eh_favoritos') || '[]');
      const myFavIds = favs.filter(f => f.correo === userId || f.userId === userId).map(f => f.emprendimientoId);
      const businesses = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      return businesses.filter(b => myFavIds.includes(b.id)).map(b => ({
        id: b.id,
        name: b.nombre,
        description: b.descripcion,
        status: 'published',
        category: { name: b.categoria, icon: 'store' }
      }));
    },

    toggle(userId, businessId) {
      let favs = JSON.parse(localStorage.getItem('eh_favoritos') || '[]');
      const idx = favs.findIndex(f => (f.correo === userId || f.userId === userId) && f.emprendimientoId === businessId);
      if (idx >= 0) {
        favs.splice(idx, 1);
        localStorage.setItem('eh_favoritos', JSON.stringify(favs));
        return false;
      } else {
        favs.push({ correo: userId, userId, emprendimientoId: businessId });
        localStorage.setItem('eh_favoritos', JSON.stringify(favs));
        return true;
      }
    },

    isFavorite(userId, businessId) {
      const favs = JSON.parse(localStorage.getItem('eh_favoritos') || '[]');
      return favs.some(f => (f.correo === userId || f.userId === userId) && f.emprendimientoId === businessId);
    }
  };

  const fallbackCart = {
    get(userId) {
      const items = JSON.parse(localStorage.getItem('eh_carrito') || '[]');
      const myItems = items.filter(i => i.correo === userId || i.userId === userId);
      const prods = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      const emps = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');

      return myItems.map(item => {
        const p = prods.find(x => x.id === item.productoId);
        if (!p) return null;
        const e = emps.find(x => x.id === p.emprendimientoId);
        return {
          cartItemId: item.productoId,
          id: p.id,
          nombre: p.nombre,
          precio: p.precio,
          stock: p.stock,
          cantidad: item.cantidad,
          emprendimientoId: p.emprendimientoId,
          nombreEmprendimiento: e ? e.nombre : 'Emprendimiento',
          imagen: p.imagen || ''
        };
      }).filter(Boolean);
    },

    addItem(userId, productId, qty) {
      let items = JSON.parse(localStorage.getItem('eh_carrito') || '[]');
      let item = items.find(i => (i.correo === userId || i.userId === userId) && i.productoId === productId);
      if (item) {
        item.cantidad += qty;
      } else {
        items.push({ correo: userId, userId, productoId: productId, cantidad: qty });
      }
      localStorage.setItem('eh_carrito', JSON.stringify(items));
      return true;
    },

    updateQuantity(userId, productId, qty) {
      if (qty < 1) throw new Error('La cantidad mínima es 1.');

      // Validar stock desde localStorage (modo demo)
      const prods = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      const prod = prods.find(p => String(p.id) === String(productId));
      if (prod && qty > prod.stock) {
        throw new Error(`Solo quedan ${prod.stock} unidades disponibles.`);
      }

      let items = JSON.parse(localStorage.getItem('eh_carrito') || '[]');
      let item = items.find(i => (i.correo === userId || i.userId === userId) && i.productoId === productId);
      if (item) {
        item.cantidad = qty;
        localStorage.setItem('eh_carrito', JSON.stringify(items));
      }
      return true;
    },

    removeItem(userId, productId) {
      let items = JSON.parse(localStorage.getItem('eh_carrito') || '[]');
      items = items.filter(i => !((i.correo === userId || i.userId === userId) && i.productoId === productId));
      localStorage.setItem('eh_carrito', JSON.stringify(items));
      return true;
    },

    clear(userId) {
      let items = JSON.parse(localStorage.getItem('eh_carrito') || '[]');
      items = items.filter(i => !(i.correo === userId || i.userId === userId));
      localStorage.setItem('eh_carrito', JSON.stringify(items));
      return true;
    }
  };

  const fallbackOrders = {
    createAtomic({ businessId, customerName, customerPhone, deliveryAddress, paymentMethod, items }) {
      const orders = JSON.parse(localStorage.getItem('eh_pedidos') || '[]');
      const prods = JSON.parse(localStorage.getItem('eh_productos') || '[]');
      let counter = Number(localStorage.getItem('eh_contador_pedido') || '1000') + 1;
      localStorage.setItem('eh_contador_pedido', counter);

      const orderNumber = 'EH-' + counter;
      let total = 0;
      const orderItems = [];

      for (const item of items) {
        const p = prods.find(x => x.id === (item.productId || item.id));
        if (!p || p.stock < (item.cantidad || item.quantity)) {
          throw new Error('Stock insuficiente para producto en el pedido.');
        }
        p.stock -= (item.cantidad || item.quantity);
        const subtotal = p.precio * (item.cantidad || item.quantity);
        total += subtotal;
        orderItems.push({
          product_name: p.nombre,
          unit_price: p.precio,
          quantity: item.cantidad || item.quantity,
          subtotal: subtotal
        });
      }

      localStorage.setItem('eh_productos', JSON.stringify(prods));

      const newOrder = {
        id: 'ord_' + Date.now(),
        order_number: orderNumber,
        business_id: businessId,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
        payment_method: paymentMethod,
        status: 'Pendiente',
        total_amount: total,
        created_at: new Date().toISOString(),
        items: orderItems
      };

      orders.push(newOrder);
      localStorage.setItem('eh_pedidos', JSON.stringify(orders));
      return { success: true, order_id: newOrder.id, order_number: orderNumber, total_amount: total };
    },

    getByCustomer(customerId) {
      const orders = JSON.parse(localStorage.getItem('eh_pedidos') || '[]');
      return orders;
    },

    getByBusiness(businessId) {
      const orders = JSON.parse(localStorage.getItem('eh_pedidos') || '[]');
      return orders.filter(o => o.business_id === businessId || o.emprendimientoId === businessId);
    },

    updateStatus(orderId, newStatus) {
      const orders = JSON.parse(localStorage.getItem('eh_pedidos') || '[]');
      const ord = orders.find(o => o.id === orderId || o.order_number === orderId || o.numero === orderId);
      if (ord) {
        const currentStatus = ord.status || ord.estado || 'Pendiente';
        const permittedTransitions = ORDER_STATUS_TRANSITIONS[currentStatus] || [];
        if (newStatus !== currentStatus && !permittedTransitions.includes(newStatus)) {
          throw new Error(`Transición de estado no permitida: ${currentStatus} -> ${newStatus}.`);
        }
        ord.status = newStatus;
        localStorage.setItem('eh_pedidos', JSON.stringify(orders));
      }
      return ord;
    },

    getAllForAdmin() {
      return JSON.parse(localStorage.getItem('eh_pedidos') || '[]');
    }
  };

  const fallbackPromotions = {
    getByBusiness(businessId) {
      const emps = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      const e = emps.find(x => x.id === businessId);
      return (e && e.promociones ? e.promociones : []).map((p, i) => ({ id: String(i), title: p }));
    },
    create(data) {
      return data;
    },
    delete(id) {
      return true;
    }
  };

  const fallbackAdmin = {
    getStats() {
      const users = JSON.parse(localStorage.getItem('eh_usuarios') || '[]');
      const businesses = JSON.parse(localStorage.getItem('eh_emprendimientos') || '[]');
      const orders = JSON.parse(localStorage.getItem('eh_pedidos') || '[]');
      const totalSales = orders.reduce((sum, o) => sum + (Number(o.total_amount || o.total) || 0), 0);

      return {
        total_users: users.length,
        total_businesses: businesses.length,
        pending_businesses: businesses.filter(b => b.status === 'pending').length,
        published_businesses: businesses.filter(b => b.status === 'published' || !b.status).length,
        rejected_businesses: businesses.filter(b => b.status === 'rejected').length,
        suspended_businesses: businesses.filter(b => b.status === 'suspended').length,
        total_orders: orders.length,
        total_sales: totalSales
      };
    },

    getAllUsers() {
      const users = JSON.parse(localStorage.getItem('eh_usuarios') || '[]');
      return users.map(u => ({
        id: u.id || u.correo,
        email: u.correo,
        full_name: u.nombre,
        phone: u.telefono || '',
        role: u.tipo === 'emprendedor' ? 'entrepreneur' : (u.tipo === 'admin' ? 'admin' : 'customer')
      }));
    }
  };

  // Exponer cliente en el objeto global EH
  window.EH = window.EH || {};
  window.EH.client = EH_CLIENT;
})();
