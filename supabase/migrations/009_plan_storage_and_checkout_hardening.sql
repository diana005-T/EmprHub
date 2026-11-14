-- ============================================================================
-- MIGRACIÓN 009: LÍMITES CONCURRENTES, STORAGE Y CHECKOUT
-- Requiere 001-008. Conserva el historial y corrige reglas para instalaciones
-- nuevas y bases que ya aplicaron las migraciones anteriores.
-- ============================================================================

-- Serializa los cambios de un emprendimiento y sus recursos relacionados con
-- advisory locks transaccionales. Primero se bloquean las filas referenciadas
-- por UUID ordenado y luego se adquieren los advisory locks, evitando esperar
-- una fila mientras se retiene el advisory lock que su trigger necesita.
CREATE OR REPLACE FUNCTION public.validate_business_free_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_owner_ids UUID[];
    v_business_ids UUID[];
    v_owner_id UUID;
    v_business_id UUID;
    v_count BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(DISTINCT owner_id ORDER BY owner_id)
        INTO v_owner_ids
        FROM unnest(ARRAY[OLD.owner_id, NEW.owner_id]) AS owners(owner_id);
        SELECT array_agg(DISTINCT business_id ORDER BY business_id)
        INTO v_business_ids
        FROM unnest(ARRAY[OLD.id, NEW.id]) AS businesses(business_id);
    ELSE
        v_owner_ids := ARRAY[NEW.owner_id];
        v_business_ids := ARRAY[NEW.id];
    END IF;

    FOREACH v_owner_id IN ARRAY COALESCE(v_owner_ids, ARRAY[]::UUID[]) LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('emprehub:owner:' || v_owner_id::TEXT, 0)
        );
    END LOOP;

    FOREACH v_business_id IN ARRAY COALESCE(v_business_ids, ARRAY[]::UUID[]) LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('emprehub:business:' || v_business_id::TEXT, 0)
        );
    END LOOP;

    IF NEW.plan = 'free' THEN
        SELECT count(*)
        INTO v_count
        FROM public.businesses AS b
        WHERE b.owner_id = NEW.owner_id
          AND b.plan = 'free'
          AND b.id IS DISTINCT FROM NEW.id;

        IF v_count >= 1 THEN
            RAISE EXCEPTION 'Límite alcanzado: el plan gratuito permite un emprendimiento por propietario.';
        END IF;

        SELECT count(*)
        INTO v_count
        FROM public.products AS p
        WHERE p.business_id = NEW.id;

        IF v_count > 20 THEN
            RAISE EXCEPTION 'No se puede asignar el plan gratuito: el emprendimiento supera el límite de 20 productos.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public.product_images AS pi
            JOIN public.products AS p ON p.id = pi.product_id
            WHERE p.business_id = NEW.id
            GROUP BY pi.product_id
            HAVING count(*) > 3
        ) THEN
            RAISE EXCEPTION 'No se puede asignar el plan gratuito: algún producto supera el límite de 3 imágenes.';
        END IF;

        SELECT count(*)
        INTO v_count
        FROM public.promotions AS pr
        WHERE pr.business_id = NEW.id
          AND pr.is_active = true
          AND (pr.start_date IS NULL OR pr.start_date <= now())
          AND (pr.end_date IS NULL OR pr.end_date::DATE >= CURRENT_DATE);

        IF v_count > 2 THEN
            RAISE EXCEPTION 'No se puede asignar el plan gratuito: el emprendimiento supera el límite de 2 promociones activas.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_business_free_plan ON public.businesses;
CREATE TRIGGER trg_validate_business_free_plan
BEFORE INSERT OR UPDATE OF owner_id, plan ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.validate_business_free_plan();

CREATE OR REPLACE FUNCTION public.validate_products_free_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_business_ids UUID[];
    v_business_id UUID;
    v_business_plan TEXT;
    v_count BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(DISTINCT business_id ORDER BY business_id)
        INTO v_business_ids
        FROM unnest(ARRAY[OLD.business_id, NEW.business_id]) AS businesses(business_id);
    ELSE
        v_business_ids := ARRAY[NEW.business_id];
    END IF;

    PERFORM b.id
    FROM public.businesses AS b
    WHERE b.id = ANY(v_business_ids)
    ORDER BY b.id
    FOR UPDATE;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('emprehub:product:' || NEW.id::TEXT, 0)
    );

    FOREACH v_business_id IN ARRAY COALESCE(v_business_ids, ARRAY[]::UUID[]) LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('emprehub:business:' || v_business_id::TEXT, 0)
        );
    END LOOP;

    SELECT b.plan
    INTO v_business_plan
    FROM public.businesses AS b
    WHERE b.id = NEW.business_id;

    IF v_business_plan = 'free' THEN
        SELECT count(*)
        INTO v_count
        FROM public.products AS p
        WHERE p.business_id = NEW.business_id
          AND p.id IS DISTINCT FROM NEW.id;

        IF v_count >= 20 THEN
            RAISE EXCEPTION 'Límite alcanzado: el plan gratuito permite un máximo de 20 productos por emprendimiento.';
        END IF;

        IF (
            SELECT count(*)
            FROM public.product_images AS pi
            WHERE pi.product_id = NEW.id
        ) > 3 THEN
            RAISE EXCEPTION 'No se puede asociar el producto a un plan gratuito: supera el límite de 3 imágenes.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_products_free_plan ON public.products;
CREATE TRIGGER trg_validate_products_free_plan
BEFORE INSERT OR UPDATE OF business_id ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.validate_products_free_plan();

CREATE OR REPLACE FUNCTION public.validate_product_images_free_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_product_ids UUID[];
    v_product_id UUID;
    v_business_ids UUID[];
    v_business_id UUID;
    v_business_plan TEXT;
    v_count BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(DISTINCT product_id ORDER BY product_id)
        INTO v_product_ids
        FROM unnest(ARRAY[OLD.product_id, NEW.product_id]) AS products(product_id);
    ELSE
        v_product_ids := ARRAY[NEW.product_id];
    END IF;

    PERFORM p.id
    FROM public.products AS p
    WHERE p.id = ANY(v_product_ids)
    ORDER BY p.id
    FOR UPDATE;

    SELECT array_agg(DISTINCT p.business_id ORDER BY p.business_id)
    INTO v_business_ids
    FROM public.products AS p
    WHERE p.id = ANY(v_product_ids);

    PERFORM b.id
    FROM public.businesses AS b
    WHERE b.id = ANY(v_business_ids)
    ORDER BY b.id
    FOR UPDATE;

    FOREACH v_product_id IN ARRAY COALESCE(v_product_ids, ARRAY[]::UUID[]) LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('emprehub:product:' || v_product_id::TEXT, 0)
        );
    END LOOP;

    FOREACH v_business_id IN ARRAY COALESCE(v_business_ids, ARRAY[]::UUID[]) LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('emprehub:business:' || v_business_id::TEXT, 0)
        );
    END LOOP;

    SELECT b.plan
    INTO v_business_plan
    FROM public.products AS p
    JOIN public.businesses AS b ON b.id = p.business_id
    WHERE p.id = NEW.product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró el producto asociado a la imagen.';
    END IF;

    IF v_business_plan = 'free' THEN
        SELECT count(*)
        INTO v_count
        FROM public.product_images AS pi
        WHERE pi.product_id = NEW.product_id
          AND pi.id IS DISTINCT FROM NEW.id;

        IF v_count >= 3 THEN
            RAISE EXCEPTION 'Límite alcanzado: el plan gratuito permite un máximo de 3 imágenes por producto.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_product_images_free_plan ON public.product_images;
CREATE TRIGGER trg_validate_product_images_free_plan
BEFORE INSERT OR UPDATE OF product_id ON public.product_images
FOR EACH ROW
EXECUTE FUNCTION public.validate_product_images_free_plan();

CREATE OR REPLACE FUNCTION public.validate_promotions_free_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_business_ids UUID[];
    v_business_id UUID;
    v_business_plan TEXT;
    v_count BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        SELECT array_agg(DISTINCT business_id ORDER BY business_id)
        INTO v_business_ids
        FROM unnest(ARRAY[OLD.business_id, NEW.business_id]) AS businesses(business_id);
    ELSE
        v_business_ids := ARRAY[NEW.business_id];
    END IF;

    PERFORM b.id
    FROM public.businesses AS b
    WHERE b.id = ANY(v_business_ids)
    ORDER BY b.id
    FOR UPDATE;

    FOREACH v_business_id IN ARRAY COALESCE(v_business_ids, ARRAY[]::UUID[]) LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended('emprehub:business:' || v_business_id::TEXT, 0)
        );
    END LOOP;

    IF NOT NEW.is_active THEN
        RETURN NEW;
    END IF;

    SELECT b.plan
    INTO v_business_plan
    FROM public.businesses AS b
    WHERE b.id = NEW.business_id;

    IF v_business_plan = 'free' THEN
        SELECT count(*)
        INTO v_count
        FROM public.promotions AS pr
        WHERE pr.business_id = NEW.business_id
          AND pr.is_active = true
          AND (pr.start_date IS NULL OR pr.start_date <= now())
          AND (pr.end_date IS NULL OR pr.end_date::DATE >= CURRENT_DATE)
          AND pr.id IS DISTINCT FROM NEW.id;

        IF v_count >= 2 THEN
            RAISE EXCEPTION 'Límite alcanzado: el plan gratuito permite un máximo de 2 promociones activas.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_promotions_free_plan ON public.promotions;
CREATE TRIGGER trg_validate_promotions_free_plan
BEFORE INSERT OR UPDATE ON public.promotions
FOR EACH ROW
EXECUTE FUNCTION public.validate_promotions_free_plan();

REVOKE ALL ON FUNCTION public.validate_business_free_plan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_products_free_plan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_product_images_free_plan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_promotions_free_plan() FROM PUBLIC, anon, authenticated;

-- El primer administrador solo puede inicializarse con una sesión SQL de
-- confianza, sin JWT de usuario y mientras aún no exista un administrador.
CREATE OR REPLACE FUNCTION public.check_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
DECLARE
    v_current_user_role TEXT;
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF session_user IN ('postgres', 'supabase_admin')
           AND auth.uid() IS NULL
           AND current_setting('emprehub.bootstrap_first_admin', true) = 'on'
           AND NOT EXISTS (
               SELECT 1 FROM public.profiles WHERE role = 'admin'
           ) THEN
            RETURN NEW;
        END IF;

        SELECT p.role
        INTO v_current_user_role
        FROM public.profiles AS p
        WHERE p.id = auth.uid();

        IF v_current_user_role IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Operación denegada: solo los administradores pueden cambiar roles de usuario.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_user_to_admin(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
DECLARE
    v_user_id UUID;
BEGIN
    IF session_user NOT IN ('postgres', 'supabase_admin') OR auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Esta operación solo está disponible desde una sesión SQL administrativa de confianza.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('emprehub:first_admin_bootstrap', 0)
    );

    IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin') THEN
        RAISE EXCEPTION 'Ya existe un administrador; el bootstrap inicial no puede volver a utilizarse.';
    END IF;

    SELECT p.id
    INTO v_user_id
    FROM public.profiles AS p
    WHERE lower(p.email) = lower(trim(p_email))
    FOR UPDATE;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró un usuario registrado con el correo indicado.';
    END IF;

    PERFORM pg_catalog.set_config('emprehub.bootstrap_first_admin', 'on', true);

    UPDATE public.profiles
    SET role = 'admin',
        updated_at = timezone('utc'::text, now())
    WHERE id = v_user_id;

    RETURN 'El usuario seleccionado fue promovido al rol de administrador.';
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT)
    FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.check_role_escalation()
    SET search_path = pg_catalog, public, auth, pg_temp;
ALTER FUNCTION public.promote_user_to_admin(TEXT)
    SET search_path = pg_catalog, public, auth, pg_temp;

-- Al suspender/moderar un negocio se toma el mismo bloqueo de fila que usa el
-- checkout; así no se confirma un pedido frente a un negocio ya suspendido.
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_business_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_delivery_address TEXT,
    p_payment_method TEXT,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
DECLARE
    v_customer_id UUID;
    v_order_id UUID;
    v_order_number TEXT;
    v_business_status TEXT;
    v_item RECORD;
    v_product RECORD;
    v_item_subtotal NUMERIC(10, 2);
    v_total_amount NUMERIC(10, 2) := 0;
    v_quantity INT;
BEGIN
    v_customer_id := auth.uid();
    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado. Inicia sesión para realizar pedidos.';
    END IF;

    SELECT b.status
    INTO v_business_status
    FROM public.businesses AS b
    WHERE b.id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El emprendimiento no existe.';
    END IF;
    IF v_business_status <> 'published' THEN
        RAISE EXCEPTION 'El emprendimiento no está disponible para recibir pedidos actualmente.';
    END IF;

    IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
        RAISE EXCEPTION 'El nombre del cliente es obligatorio y debe tener al menos 2 caracteres.';
    END IF;
    IF p_customer_phone IS NULL OR p_customer_phone !~ '^[0-9]{9}$' THEN
        RAISE EXCEPTION 'El número de teléfono debe tener exactamente 9 dígitos numéricos.';
    END IF;
    IF p_delivery_address IS NULL OR length(trim(p_delivery_address)) < 4 THEN
        RAISE EXCEPTION 'La dirección de entrega es obligatoria.';
    END IF;
    IF p_payment_method IS NULL OR p_payment_method NOT IN ('Yape', 'Plin', 'Efectivo') THEN
        RAISE EXCEPTION 'Método de pago no válido. Opciones: Yape, Plin o Efectivo.';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Los ítems del pedido deben recibirse como un arreglo JSON.';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El pedido debe contener al menos un producto.';
    END IF;

    v_order_number := 'EH-' || nextval('public.order_number_seq')::TEXT;

    INSERT INTO public.orders (
        order_number, business_id, customer_id, customer_name, customer_phone,
        delivery_address, payment_method, status, total_amount, notes
    ) VALUES (
        v_order_number, p_business_id, v_customer_id, trim(p_customer_name),
        trim(p_customer_phone), trim(p_delivery_address), p_payment_method,
        'Pendiente', 0, p_notes
    )
    RETURNING id INTO v_order_id;

    FOR v_item IN
        SELECT x.product_id, x.quantity
        FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
    LOOP
        v_quantity := v_item.quantity;
        IF v_quantity IS NULL OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'La cantidad para cada producto debe ser un entero mayor a 0.';
        END IF;
        IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION 'Cada producto del pedido debe incluir un UUID válido.';
        END IF;

        SELECT p.*
        INTO v_product
        FROM public.products AS p
        WHERE p.id = v_item.product_id
          AND p.business_id = p_business_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto solicitado no existe o no pertenece a este emprendimiento.';
        END IF;
        IF NOT v_product.is_active THEN
            RAISE EXCEPTION 'El producto "%" no se encuentra activo.', v_product.name;
        END IF;
        IF v_product.stock < v_quantity THEN
            RAISE EXCEPTION 'Stock insuficiente para "%". Disponibles: %, solicitados: %.',
                v_product.name, v_product.stock, v_quantity;
        END IF;

        UPDATE public.products
        SET stock = stock - v_quantity,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_item.product_id;

        v_item_subtotal := round((v_product.price * v_quantity)::NUMERIC, 2);
        v_total_amount := v_total_amount + v_item_subtotal;

        INSERT INTO public.order_items (
            order_id, product_id, product_name, unit_price, quantity, subtotal
        ) VALUES (
            v_order_id, v_item.product_id, v_product.name, v_product.price,
            v_quantity, v_item_subtotal
        );

        DELETE FROM public.cart_items
        WHERE user_id = v_customer_id
          AND product_id = v_item.product_id;
    END LOOP;

    UPDATE public.orders
    SET total_amount = v_total_amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'total_amount', v_total_amount,
        'status', 'Pendiente'
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    TO authenticated;
ALTER FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    SET search_path = pg_catalog, public, auth, pg_temp;

-- Las rutas válidas del bucket son <business-uuid>/branding/<archivo> y
-- <business-uuid>/<product-uuid>/<archivo>. La política delega la verificación
-- de propiedad a la función segura creada en la migración 005.
CREATE OR REPLACE FUNCTION public.can_manage_business_media(
    p_business_path TEXT,
    p_product_path TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_business_id UUID;
    v_product_id UUID;
BEGIN
    IF v_user_id IS NULL
       OR p_business_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;

    v_business_id := p_business_path::UUID;
    IF p_product_path IS NOT NULL THEN
        IF p_product_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            RETURN false;
        END IF;
        v_product_id := p_product_path::UUID;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.businesses AS b
        WHERE b.id = v_business_id
          AND (
              b.owner_id = v_user_id
              OR EXISTS (
                  SELECT 1
                  FROM public.business_members AS bm
                  WHERE bm.business_id = b.id
                    AND bm.user_id = v_user_id
              )
              OR public.is_admin()
          )
          AND (
              v_product_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM public.products AS p
                  WHERE p.id = v_product_id
                    AND p.business_id = b.id
              )
          )
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.can_manage_business_media(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_business_media(TEXT, TEXT)
    TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can upload to emprehub-media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own media or admin" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own media or admin" ON storage.objects;

CREATE POLICY "Authenticated users can upload to emprehub-media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'emprehub-media'
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND (
        (
            split_part(name, '/', 2) = 'branding'
            AND public.can_manage_business_media(split_part(name, '/', 1))
        )
        OR (
            split_part(name, '/', 2) <> 'branding'
            AND public.can_manage_business_media(
                split_part(name, '/', 1),
                split_part(name, '/', 2)
            )
        )
    )
);

CREATE POLICY "Users can update their own media or admin"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'emprehub-media'
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND (
        (
            split_part(name, '/', 2) = 'branding'
            AND public.can_manage_business_media(split_part(name, '/', 1))
        )
        OR (
            split_part(name, '/', 2) <> 'branding'
            AND public.can_manage_business_media(
                split_part(name, '/', 1),
                split_part(name, '/', 2)
            )
        )
    )
)
WITH CHECK (
    bucket_id = 'emprehub-media'
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND (
        (
            split_part(name, '/', 2) = 'branding'
            AND public.can_manage_business_media(split_part(name, '/', 1))
        )
        OR (
            split_part(name, '/', 2) <> 'branding'
            AND public.can_manage_business_media(
                split_part(name, '/', 1),
                split_part(name, '/', 2)
            )
        )
    )
);

CREATE POLICY "Users can delete their own media or admin"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'emprehub-media'
    AND array_length(string_to_array(name, '/'), 1) = 3
    AND split_part(name, '/', 1) <> ''
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) <> ''
    AND public.can_manage_business_media(split_part(name, '/', 1))
    AND (
        split_part(name, '/', 2) = 'branding'
        OR split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
);

-- Refuse the migration if earlier concurrent writes already left free-plan
-- resources above their limits; no existing data is removed automatically.
DO $existing_plan_state$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.businesses AS b
        WHERE b.plan = 'free'
        GROUP BY b.owner_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Hay propietarios con más de un emprendimiento gratuito; corrija el estado antes de aplicar la migración 009.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.products AS p
        JOIN public.businesses AS b ON b.id = p.business_id
        WHERE b.plan = 'free'
        GROUP BY p.business_id
        HAVING count(*) > 20
    ) THEN
        RAISE EXCEPTION 'Hay emprendimientos gratuitos con más de 20 productos; corrija el estado antes de aplicar la migración 009.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.product_images AS pi
        JOIN public.products AS p ON p.id = pi.product_id
        JOIN public.businesses AS b ON b.id = p.business_id
        WHERE b.plan = 'free'
        GROUP BY pi.product_id
        HAVING count(*) > 3
    ) THEN
        RAISE EXCEPTION 'Hay productos gratuitos con más de 3 imágenes; corrija el estado antes de aplicar la migración 009.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.promotions AS pr
        JOIN public.businesses AS b ON b.id = pr.business_id
        WHERE b.plan = 'free'
          AND pr.is_active = true
          AND (pr.start_date IS NULL OR pr.start_date <= now())
          AND (pr.end_date IS NULL OR pr.end_date::DATE >= CURRENT_DATE)
        GROUP BY pr.business_id
        HAVING count(*) > 2
    ) THEN
        RAISE EXCEPTION 'Hay emprendimientos gratuitos con más de 2 promociones activas; corrija el estado antes de aplicar la migración 009.';
    END IF;
END;
$existing_plan_state$;

-- Gate estructural de privilegios. El proyecto debe ejecutar esta migración
-- con un rol confiable de migración, igual que los controles de 008.
DO $migration_009_gate$
DECLARE
    v_owner_name TEXT;
    v_can_bypass_rls BOOLEAN;
    v_function RECORD;
BEGIN
    FOR v_function IN
        SELECT p.oid::REGPROCEDURE AS function_name,
               r.rolname AS owner_name,
               (r.rolsuper OR r.rolbypassrls) AS can_bypass_rls
        FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
        WHERE p.oid IN (
            'public.validate_business_free_plan()'::REGPROCEDURE,
            'public.validate_products_free_plan()'::REGPROCEDURE,
            'public.validate_product_images_free_plan()'::REGPROCEDURE,
            'public.validate_promotions_free_plan()'::REGPROCEDURE,
            'public.can_manage_business_media(text,text)'::REGPROCEDURE
        )
    LOOP
        IF NOT v_function.can_bypass_rls
           OR v_function.owner_name IN ('anon', 'authenticated') THEN
            RAISE EXCEPTION 'Propietario no confiable para SECURITY DEFINER %: %',
                v_function.function_name, v_function.owner_name;
        END IF;
    END LOOP;

    IF has_function_privilege('anon', 'public.validate_business_free_plan()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_business_free_plan()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.validate_products_free_plan()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_products_free_plan()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.validate_product_images_free_plan()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_product_images_free_plan()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.validate_promotions_free_plan()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.validate_promotions_free_plan()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Las funciones de trigger de límites no deben ser ejecutables por roles de API.';
    END IF;

    IF has_function_privilege(
        'anon',
        'public.can_manage_business_media(text,text)',
        'EXECUTE'
    ) OR NOT has_function_privilege(
        'authenticated',
        'public.can_manage_business_media(text,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Permisos EXECUTE efectivos inesperados en can_manage_business_media.';
    END IF;

    IF has_function_privilege(
        'anon',
        'public.promote_user_to_admin(text)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'public.promote_user_to_admin(text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'La función de bootstrap administrativo no debe ser ejecutable por roles de API.';
    END IF;

    IF NOT has_function_privilege(
        'authenticated',
        'public.create_order_atomic(uuid,text,text,text,text,jsonb,text)',
        'EXECUTE'
    ) OR has_function_privilege(
        'anon',
        'public.create_order_atomic(uuid,text,text,text,text,jsonb,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Permisos EXECUTE efectivos inesperados en create_order_atomic.';
    END IF;

    SELECT r.rolname, (r.rolsuper OR r.rolbypassrls)
    INTO v_owner_name, v_can_bypass_rls
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
    WHERE p.oid = 'public.create_order_atomic(uuid,text,text,text,text,jsonb,text)'::REGPROCEDURE;

    IF NOT COALESCE(v_can_bypass_rls, false)
       OR v_owner_name IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Propietario no confiable para SECURITY DEFINER create_order_atomic: %', v_owner_name;
    END IF;

    SELECT r.rolname, (r.rolsuper OR r.rolbypassrls)
    INTO v_owner_name, v_can_bypass_rls
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
    WHERE p.oid = 'public.promote_user_to_admin(text)'::REGPROCEDURE;

    IF NOT COALESCE(v_can_bypass_rls, false)
       OR v_owner_name IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Propietario no confiable para SECURITY DEFINER promote_user_to_admin: %', v_owner_name;
    END IF;

    SELECT r.rolname, (r.rolsuper OR r.rolbypassrls)
    INTO v_owner_name, v_can_bypass_rls
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
    WHERE p.oid = 'public.can_manage_business_media(text,text)'::REGPROCEDURE;

    IF NOT COALESCE(v_can_bypass_rls, false)
       OR v_owner_name IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Propietario no confiable para SECURITY DEFINER can_manage_business_media: %', v_owner_name;
    END IF;
END;
$migration_009_gate$;
