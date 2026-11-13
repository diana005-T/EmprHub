-- ============================================================================
-- MIGRACIÓN 008: PRIVILEGIOS EFECTIVOS Y TRANSICIONES DE PEDIDOS
-- Requiere que 001-007 estén aplicadas. No reasigna propietarios de funciones.
-- ============================================================================

-- Quitar permisos de tabla y de columna evita que grants anteriores sobrevivan
-- a un REVOKE de tabla. Cualquier permiso heredado restante se detecta abajo.
REVOKE ALL PRIVILEGES ON TABLE public.businesses, public.orders, public.order_items
    FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES (id, owner_id, category_id, name, slug, description, status,
    status_reason, logo_url, banner_url, operating_hours, payment_methods, phone,
    address, plan, created_at, updated_at)
    ON TABLE public.businesses FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (id, order_number, business_id, customer_id, customer_name,
    customer_phone, delivery_address, payment_method, status, total_amount, notes,
    created_at, updated_at)
    ON TABLE public.orders FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES (id, order_id, product_id, product_name, unit_price,
    quantity, subtotal, created_at)
    ON TABLE public.order_items FROM PUBLIC, anon, authenticated;

-- Los visitantes solo leen los campos que consume el catálogo público.
GRANT SELECT (id, slug, name, description, status, logo_url, banner_url,
    operating_hours, payment_methods, phone, address, plan, category_id, created_at)
    ON TABLE public.businesses TO anon;
GRANT SELECT (id, slug, name, description, status, logo_url, banner_url,
    operating_hours, payment_methods, phone, address, plan, category_id, created_at)
    ON TABLE public.businesses TO authenticated;
GRANT SELECT ON TABLE public.orders, public.order_items TO authenticated;

-- Mantiene el flujo actual: emprendedores crean/actualizan sus datos y pueden
-- eliminar su propio negocio bajo la política RLS ya existente.
GRANT INSERT (owner_id, category_id, name, description, operating_hours, payment_methods)
    ON TABLE public.businesses TO authenticated;
GRANT UPDATE (name, description, category_id, operating_hours, payment_methods, logo_url)
    ON TABLE public.businesses TO authenticated;
GRANT DELETE ON TABLE public.businesses TO authenticated;

-- Solo la RPC crea o modifica datos financieros de pedidos. El estado se cambia
-- mediante update_order_status, que valida identidad, propiedad y transición.

-- Las categorías son datos públicos usados por los formularios y el catálogo.
GRANT SELECT ON TABLE public.business_categories TO anon, authenticated;

-- No se necesita CREATE en estos esquemas desde los roles de API; se evita que
-- puedan introducir objetos que afecten funciones SECURITY DEFINER.
REVOKE CREATE ON SCHEMA public, auth FROM PUBLIC, anon, authenticated;

-- No se cambia el propietario de funciones. En Supabase, el ejecutor confiable
-- de migraciones (normalmente postgres) debe conservar BYPASSRLS/superusuario;
-- si el entorno no cumple, la migración falla y requiere revisión manual.
DO $migration$
DECLARE
    v_function RECORD;
    v_column RECORD;
    v_business_public_columns TEXT[] := ARRAY[
        'id', 'slug', 'name', 'description', 'status', 'logo_url', 'banner_url',
        'operating_hours', 'payment_methods', 'phone', 'address', 'plan',
        'category_id', 'created_at'
    ];
    v_business_insert_columns TEXT[] := ARRAY[
        'owner_id', 'category_id', 'name', 'description', 'operating_hours',
        'payment_methods'
    ];
    v_business_update_columns TEXT[] := ARRAY[
        'name', 'description', 'category_id', 'operating_hours',
        'payment_methods', 'logo_url'
    ];
BEGIN
    IF has_schema_privilege('anon', 'public', 'CREATE')
       OR has_schema_privilege('authenticated', 'public', 'CREATE')
       OR has_schema_privilege('anon', 'auth', 'CREATE')
       OR has_schema_privilege('authenticated', 'auth', 'CREATE') THEN
        RAISE EXCEPTION 'anon/authenticated conserva CREATE heredado en public o auth; revise las membresías de roles antes de continuar';
    END IF;

    FOR v_function IN
        SELECT p.oid::regprocedure AS function_name,
               r.rolname AS owner_name,
               (r.rolsuper OR r.rolbypassrls) AS can_bypass_rls
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        JOIN pg_roles AS r ON r.oid = p.proowner
        WHERE n.nspname = 'public'
          AND p.prosecdef
    LOOP
        IF NOT v_function.can_bypass_rls
           OR v_function.owner_name IN ('anon', 'authenticated') THEN
            RAISE EXCEPTION 'Propietario no confiable para SECURITY DEFINER %: %; use el rol administrador de migraciones de Supabase y revise BYPASSRLS', v_function.function_name, v_function.owner_name;
        END IF;
    END LOOP;

    -- Detecta permisos efectivos heredados o por columna que un REVOKE directo
    -- no haya retirado. Publicar solo tras resolver cualquier error de este gate.
    FOR v_column IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'businesses'
    LOOP
        IF has_column_privilege('anon', 'public.businesses', v_column.column_name, 'SELECT')
           AND NOT (v_column.column_name = ANY(v_business_public_columns)) THEN
            RAISE EXCEPTION 'anon conserva SELECT no público sobre businesses.% por un grant heredado', v_column.column_name;
        END IF;
        IF has_column_privilege('authenticated', 'public.businesses', v_column.column_name, 'SELECT')
           AND NOT (v_column.column_name = ANY(v_business_public_columns)) THEN
            RAISE EXCEPTION 'authenticated conserva SELECT no público sobre businesses.% por un grant heredado', v_column.column_name;
        END IF;
        IF has_column_privilege('anon', 'public.businesses', v_column.column_name, 'INSERT')
           OR has_column_privilege('anon', 'public.businesses', v_column.column_name, 'UPDATE') THEN
            RAISE EXCEPTION 'anon conserva permisos de escritura sobre businesses.%', v_column.column_name;
        END IF;
        IF has_column_privilege('authenticated', 'public.businesses', v_column.column_name, 'INSERT')
           AND NOT (v_column.column_name = ANY(v_business_insert_columns)) THEN
            RAISE EXCEPTION 'authenticated conserva INSERT no autorizado sobre businesses.%', v_column.column_name;
        END IF;
        IF has_column_privilege('authenticated', 'public.businesses', v_column.column_name, 'UPDATE')
           AND NOT (v_column.column_name = ANY(v_business_update_columns)) THEN
            RAISE EXCEPTION 'authenticated conserva UPDATE no autorizado sobre businesses.%', v_column.column_name;
        END IF;
    END LOOP;

    IF has_table_privilege('anon', 'public.businesses', 'DELETE')
       OR has_table_privilege('anon', 'public.businesses', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.businesses', 'TRUNCATE')
       OR has_table_privilege('anon', 'public.businesses', 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.businesses', 'REFERENCES')
       OR has_table_privilege('anon', 'public.businesses', 'TRIGGER')
       OR has_table_privilege('authenticated', 'public.businesses', 'TRIGGER')
       OR has_table_privilege('anon', 'public.orders', 'INSERT')
       OR has_table_privilege('anon', 'public.orders', 'UPDATE')
       OR has_table_privilege('anon', 'public.orders', 'DELETE')
       OR has_table_privilege('anon', 'public.orders', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.orders', 'INSERT')
       OR has_table_privilege('authenticated', 'public.orders', 'DELETE')
       OR has_table_privilege('authenticated', 'public.orders', 'TRUNCATE')
       OR has_table_privilege('anon', 'public.orders', 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.orders', 'REFERENCES')
       OR has_table_privilege('anon', 'public.orders', 'TRIGGER')
       OR has_table_privilege('authenticated', 'public.orders', 'TRIGGER')
       OR has_table_privilege('anon', 'public.order_items', 'INSERT')
       OR has_table_privilege('anon', 'public.order_items', 'UPDATE')
       OR has_table_privilege('anon', 'public.order_items', 'DELETE')
       OR has_table_privilege('anon', 'public.order_items', 'TRUNCATE')
       OR has_table_privilege('authenticated', 'public.order_items', 'INSERT')
       OR has_table_privilege('authenticated', 'public.order_items', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.order_items', 'DELETE')
       OR has_table_privilege('authenticated', 'public.order_items', 'TRUNCATE') THEN
        RAISE EXCEPTION 'Quedan privilegios efectivos de escritura/TRUNCATE no permitidos en businesses, orders u order_items';
    END IF;

    IF has_table_privilege('anon', 'public.order_items', 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.order_items', 'REFERENCES')
       OR has_table_privilege('anon', 'public.order_items', 'TRIGGER')
       OR has_table_privilege('authenticated', 'public.order_items', 'TRIGGER') THEN
        RAISE EXCEPTION 'Quedan privilegios efectivos REFERENCES/TRIGGER no permitidos en order_items';
    END IF;

    IF has_table_privilege('anon', 'public.orders', 'SELECT')
       OR has_table_privilege('anon', 'public.order_items', 'SELECT') THEN
        RAISE EXCEPTION 'anon conserva SELECT efectivo en tablas privadas de pedidos';
    END IF;

    FOR v_column IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
    LOOP
        IF has_column_privilege('anon', 'public.orders', v_column.column_name, 'SELECT')
           OR has_column_privilege('anon', 'public.orders', v_column.column_name, 'INSERT')
           OR has_column_privilege('anon', 'public.orders', v_column.column_name, 'UPDATE')
           OR has_column_privilege('authenticated', 'public.orders', v_column.column_name, 'INSERT') THEN
            RAISE EXCEPTION 'Quedan permisos efectivos no autorizados sobre orders.%', v_column.column_name;
        END IF;
        IF has_column_privilege('authenticated', 'public.orders', v_column.column_name, 'UPDATE') THEN
            RAISE EXCEPTION 'authenticated conserva UPDATE directo sobre orders.%; utilice update_order_status', v_column.column_name;
        END IF;
    END LOOP;

    FOR v_column IN
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'order_items'
    LOOP
        IF has_column_privilege('anon', 'public.order_items', v_column.column_name, 'SELECT')
           OR has_column_privilege('anon', 'public.order_items', v_column.column_name, 'INSERT')
           OR has_column_privilege('anon', 'public.order_items', v_column.column_name, 'UPDATE')
           OR has_column_privilege('authenticated', 'public.order_items', v_column.column_name, 'INSERT')
           OR has_column_privilege('authenticated', 'public.order_items', v_column.column_name, 'UPDATE') THEN
            RAISE EXCEPTION 'Quedan permisos efectivos no autorizados sobre order_items.%', v_column.column_name;
        END IF;
    END LOOP;
END;
$migration$;

-- search_path seguro para las funciones SECURITY DEFINER ya creadas por 002-007.
ALTER FUNCTION public.handle_updated_at()
    SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION public.handle_new_user()
    SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_role_escalation()
    SET search_path = pg_catalog, public, auth, pg_temp;
ALTER FUNCTION public.is_admin()
    SET search_path = pg_catalog;
ALTER FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    SET search_path = pg_catalog, public, auth, pg_temp;
ALTER FUNCTION public.update_business_status(UUID, TEXT, TEXT)
    SET search_path = pg_catalog, public, auth, pg_temp;
ALTER FUNCTION public.get_admin_dashboard_stats()
    SET search_path = pg_catalog, public, auth, pg_temp;
ALTER FUNCTION public.promote_user_to_admin(TEXT)
    SET search_path = pg_catalog, public, auth, pg_temp;
ALTER FUNCTION public.current_user_is_business_member(UUID)
    SET search_path = pg_catalog;

-- Sustituye el UPDATE directo del cliente por una operación validada en servidor.
CREATE OR REPLACE FUNCTION public.update_order_status(
    p_order_id UUID,
    p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
DECLARE
    v_business_id UUID;
    v_current_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    SELECT o.business_id, o.status
    INTO v_business_id, v_current_status
    FROM public.orders AS o
    WHERE o.id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El pedido no existe.';
    END IF;

    IF NOT public.is_admin()
       AND NOT EXISTS (
            SELECT 1
            FROM public.businesses AS b
            WHERE b.id = v_business_id
              AND b.owner_id = auth.uid()
       ) THEN
        RAISE EXCEPTION 'Acceso denegado: solo el propietario del emprendimiento o un administrador puede actualizar el pedido.';
    END IF;

    IF p_new_status = v_current_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'order_id', p_order_id,
            'status', v_current_status
        );
    END IF;

    IF NOT (
        (v_current_status = 'Pendiente'
            AND p_new_status IN ('En preparación', 'Cancelado'))
        OR (v_current_status = 'En preparación'
            AND p_new_status IN ('En camino', 'Cancelado'))
        OR (v_current_status = 'En camino'
            AND p_new_status IN ('Entregado', 'Cancelado'))
    ) THEN
        RAISE EXCEPTION 'Transición de estado no permitida: % -> %.', v_current_status, p_new_status;
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', p_new_status
    );
END;
$function$;

ALTER FUNCTION public.update_order_status(UUID, TEXT)
    SET search_path = pg_catalog, public, auth, pg_temp;

-- La API directa solo expone columnas del catálogo. Los propietarios necesitan
-- sus campos internos y admin necesita moderación/datos del dueño; este RPC
-- devuelve únicamente negocios propios o, para admin, el conjunto completo.
CREATE OR REPLACE FUNCTION public.get_businesses_for_management()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_admin BOOLEAN;
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    v_is_admin := public.is_admin();

    SELECT COALESCE(
        jsonb_agg(
            to_jsonb(b) || jsonb_build_object(
                'category', (
                    SELECT jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon)
                    FROM public.business_categories AS c
                    WHERE c.id = b.category_id
                ),
                'owner', CASE WHEN v_is_admin THEN (
                    SELECT jsonb_build_object(
                        'id', p.id,
                        'email', p.email,
                        'full_name', p.full_name,
                        'phone', p.phone
                    )
                    FROM public.profiles AS p
                    WHERE p.id = b.owner_id
                ) ELSE NULL::JSONB END
            )
            ORDER BY b.created_at DESC
        ),
        '[]'::JSONB
    )
    INTO v_result
    FROM public.businesses AS b
    WHERE v_is_admin OR b.owner_id = v_user_id;

    RETURN v_result;
END;
$function$;

-- Las funciones SECURITY DEFINER solo son ejecutables por los roles que las usan.
REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_role_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_business_status(UUID, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_user_to_admin(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_is_business_member(UUID)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_order_status(UUID, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_businesses_for_management()
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_business_member(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_business_status(UUID, TEXT, TEXT)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_businesses_for_management() TO authenticated;

-- Comprueba grants efectivos en lugar de confiar solo en ACLs declaradas.
DO $function_privileges$
BEGIN
    IF has_function_privilege('anon',
            'public.create_order_atomic(uuid,text,text,text,text,jsonb,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated',
            'public.create_order_atomic(uuid,text,text,text,text,jsonb,text)', 'EXECUTE')
       OR has_function_privilege('anon',
            'public.get_businesses_for_management()', 'EXECUTE')
       OR NOT has_function_privilege('authenticated',
            'public.get_businesses_for_management()', 'EXECUTE')
       OR has_function_privilege('anon',
            'public.update_order_status(uuid,text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated',
            'public.update_order_status(uuid,text)', 'EXECUTE')
       OR has_function_privilege('anon',
            'public.update_business_status(uuid,text,text)', 'EXECUTE')
       OR has_function_privilege('anon',
            'public.promote_user_to_admin(text)', 'EXECUTE')
       OR has_function_privilege('authenticated',
            'public.promote_user_to_admin(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Permisos EXECUTE efectivos inesperados en funciones SECURITY DEFINER';
    END IF;
END;
$function_privileges$;

DO $new_function_owner$
DECLARE
    v_owner_name TEXT;
    v_can_bypass_rls BOOLEAN;
BEGIN
    SELECT r.rolname, (r.rolsuper OR r.rolbypassrls)
    INTO v_owner_name, v_can_bypass_rls
    FROM pg_proc AS p
    JOIN pg_roles AS r ON r.oid = p.proowner
    WHERE p.oid = 'public.update_order_status(uuid,text)'::regprocedure;

    IF NOT COALESCE(v_can_bypass_rls, false)
       OR v_owner_name IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Propietario no confiable para SECURITY DEFINER update_order_status: %', v_owner_name;
    END IF;

    SELECT r.rolname, (r.rolsuper OR r.rolbypassrls)
    INTO v_owner_name, v_can_bypass_rls
    FROM pg_proc AS p
    JOIN pg_roles AS r ON r.oid = p.proowner
    WHERE p.oid = 'public.get_businesses_for_management()'::regprocedure;

    IF NOT COALESCE(v_can_bypass_rls, false)
       OR v_owner_name IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Propietario no confiable para SECURITY DEFINER get_businesses_for_management: %', v_owner_name;
    END IF;
END;
$new_function_owner$;
