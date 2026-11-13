-- ============================================================================
-- MIGRACIÓN 004: FUNCIONES TRANSACCIONALES RPC Y PROCEDIMIENTOS ALMACENADOS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FUNCIÓN RPC: create_order_atomic
-- Crea un pedido de manera atómica, validando stock y precios en servidor,
-- descontando inventario y guardando copia histórica de los productos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_business_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_delivery_address TEXT,
    p_payment_method TEXT,
    p_items JSONB, -- Array de objetos: [{"product_id": "...", "quantity": 2}]
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_customer_id UUID;
    v_order_id UUID;
    v_order_number TEXT;
    v_business_status TEXT;
    v_item RECORD;
    v_product RECORD;
    v_item_subtotal NUMERIC(10, 2);
    v_total_amount NUMERIC(10, 2) := 0;
    v_product_id UUID;
    v_quantity INT;
    v_result JSONB;
BEGIN
    -- 1. Validar que el usuario esté autenticado
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado. Inicia sesión para realizar pedidos.';
    END IF;

    -- 2. Validar que el negocio exista y esté publicado
    SELECT status INTO v_business_status
    FROM public.businesses
    WHERE id = p_business_id;

    IF v_business_status IS NULL THEN
        RAISE EXCEPTION 'El emprendimiento no existe.';
    END IF;

    IF v_business_status != 'published' THEN
        RAISE EXCEPTION 'El emprendimiento no está disponible para recibir pedidos actualmente.';
    END IF;

    -- 3. Validar datos del cliente
    IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
        RAISE EXCEPTION 'El nombre del cliente es obligatorio y debe tener al menos 2 caracteres.';
    END IF;

    IF p_customer_phone IS NULL OR NOT (p_customer_phone ~ '^[0-9]{9}$') THEN
        RAISE EXCEPTION 'El número de teléfono debe tener exactamente 9 dígitos numéricos.';
    END IF;

    IF p_delivery_address IS NULL OR length(trim(p_delivery_address)) < 4 THEN
        RAISE EXCEPTION 'La dirección de entrega es obligatoria.';
    END IF;

    IF p_payment_method NOT IN ('Yape', 'Plin', 'Efectivo') THEN
        RAISE EXCEPTION 'Método de pago no válido. Opciones: Yape, Plin o Efectivo.';
    END IF;

    -- 4. Validar que el array de productos no esté vacío
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
    END IF;

    -- 5. Generar número de pedido único con prefijo EH-
    v_order_number := 'EH-' || nextval('order_number_seq')::TEXT;

    -- 6. Crear la cabecera de la orden con total temporal en 0
    INSERT INTO public.orders (
        order_number,
        business_id,
        customer_id,
        customer_name,
        customer_phone,
        delivery_address,
        payment_method,
        status,
        total_amount,
        notes
    ) VALUES (
        v_order_number,
        p_business_id,
        v_customer_id,
        trim(p_customer_name),
        trim(p_customer_phone),
        trim(p_delivery_address),
        p_payment_method,
        'Pendiente',
        0,
        p_notes
    ) RETURNING id INTO v_order_id;

    -- 7. Procesar cada ítem del pedido con bloqueo pesimista (FOR UPDATE)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
    LOOP
        v_product_id := v_item.product_id;
        v_quantity := v_item.quantity;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad para cada producto debe ser mayor a 0.';
        END IF;

        -- Bloquear la fila del producto para lectura y actualización atómica
        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_product_id AND business_id = p_business_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto solicitado no existe o no pertenece a este emprendimiento.';
        END IF;

        IF NOT v_product.is_active THEN
            RAISE EXCEPTION 'El producto "%" no se encuentra activo.', v_product.name;
        END IF;

        -- Validar stock suficiente
        IF v_product.stock < v_quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%". Disponibles: %, solicitados: %.',
                v_product.name, v_product.stock, v_quantity;
        END IF;

        -- Descontar stock atómicamente
        UPDATE public.products
        SET stock = stock - v_quantity,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_product_id;

        -- Calcular subtotal usando el precio oficial de la base de datos
        v_item_subtotal := round((v_product.price * v_quantity)::numeric, 2);
        v_total_amount := v_total_amount + v_item_subtotal;

        -- Registrar detalle del pedido (copia histórica)
        INSERT INTO public.order_items (
            order_id,
            product_id,
            product_name,
            unit_price,
            quantity,
            subtotal
        ) VALUES (
            v_order_id,
            v_product_id,
            v_product.name,
            v_product.price,
            v_quantity,
            v_item_subtotal
        );

        -- Limpiar el producto comprado del carrito del usuario si existía
        DELETE FROM public.cart_items
        WHERE user_id = v_customer_id AND product_id = v_product_id;
    END LOOP;

    -- 8. Actualizar el monto total verificado en la cabecera
    UPDATE public.orders
    SET total_amount = v_total_amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_order_id;

    -- 9. Retornar información resumida del pedido
    v_result := jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total_amount', v_total_amount,
        'status', 'Pendiente'
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ----------------------------------------------------------------------------
-- FUNCIÓN RPC: update_business_status (Exclusivo Administradores)
-- Permite aprobar, rechazar o suspender negocios de forma auditada.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_business_status(
    p_business_id UUID,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo los administradores pueden cambiar el estado de un emprendimiento.';
    END IF;

    IF p_new_status NOT IN ('pending', 'published', 'rejected', 'suspended') THEN
        RAISE EXCEPTION 'Estado no válido: %', p_new_status;
    END IF;

    UPDATE public.businesses
    SET status = p_new_status,
        status_reason = p_reason,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_business_id;

    RETURN jsonb_build_object(
        'success', true,
        'business_id', p_business_id,
        'new_status', p_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ----------------------------------------------------------------------------
-- FUNCIÓN RPC: get_admin_dashboard_stats (Métricas administrativas)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB AS $$
DECLARE
    v_total_users INT;
    v_total_businesses INT;
    v_pending_businesses INT;
    v_published_businesses INT;
    v_rejected_businesses INT;
    v_suspended_businesses INT;
    v_total_orders INT;
    v_total_sales NUMERIC(12, 2);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acceso denegado: solo para administradores.';
    END IF;

    SELECT COUNT(*) INTO v_total_users FROM public.profiles;
    SELECT COUNT(*) INTO v_total_businesses FROM public.businesses;
    SELECT COUNT(*) INTO v_pending_businesses FROM public.businesses WHERE status = 'pending';
    SELECT COUNT(*) INTO v_published_businesses FROM public.businesses WHERE status = 'published';
    SELECT COUNT(*) INTO v_rejected_businesses FROM public.businesses WHERE status = 'rejected';
    SELECT COUNT(*) INTO v_suspended_businesses FROM public.businesses WHERE status = 'suspended';
    
    SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
    INTO v_total_orders, v_total_sales
    FROM public.orders
    WHERE status != 'Cancelado';

    RETURN jsonb_build_object(
        'total_users', v_total_users,
        'total_businesses', v_total_businesses,
        'pending_businesses', v_pending_businesses,
        'published_businesses', v_published_businesses,
        'rejected_businesses', v_rejected_businesses,
        'suspended_businesses', v_suspended_businesses,
        'total_orders', v_total_orders,
        'total_sales', v_total_sales
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

