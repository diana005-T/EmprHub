-- ============================================================================
-- MIGRACIÓN 007: ENDURECIMIENTO DE RLS Y PERMISOS DE ESCRITURA
-- Conserva el checkout transaccional y elimina referencias RLS recursivas.
-- ============================================================================

-- La función solo consulta la pertenencia del usuario autenticado; no acepta
-- un user_id arbitrario y evita evaluar las políticas de business_members.
CREATE OR REPLACE FUNCTION public.current_user_is_business_member(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
    SELECT CASE
        WHEN auth.uid() IS NULL THEN false
        ELSE EXISTS (
            SELECT 1
            FROM public.business_members AS bm
            WHERE bm.business_id = p_business_id
              AND bm.user_id = auth.uid()
        )
    END;
$function$;

REVOKE ALL ON FUNCTION public.current_user_is_business_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_is_business_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_business_member(UUID) TO anon, authenticated;
ALTER FUNCTION public.is_admin() SET search_path = pg_catalog;

-- Sustituye la consulta sujeta a RLS de business_members por la función segura.
DROP POLICY IF EXISTS "businesses_select_published_or_owner_or_admin" ON public.businesses;
CREATE POLICY "businesses_select_published_or_owner_or_admin" ON public.businesses
FOR SELECT USING (
    status = 'published'
    OR owner_id = auth.uid()
    OR public.is_admin()
    OR public.current_user_is_business_member(id)
);

-- La comprobación previa del status consultaba businesses desde su propia
-- política y podía generar recursión. Los permisos por columna impiden que el
-- cliente cambie status, propietario, plan u otros campos protegidos.
DROP POLICY IF EXISTS "businesses_update_owner_or_admin" ON public.businesses;
CREATE POLICY "businesses_update_owner_or_admin" ON public.businesses
FOR UPDATE USING (
    owner_id = auth.uid() OR public.is_admin()
) WITH CHECK (
    owner_id = auth.uid() OR public.is_admin()
);

REVOKE INSERT, UPDATE ON TABLE public.businesses FROM anon, authenticated, PUBLIC;
GRANT INSERT (owner_id, category_id, name, description, operating_hours, payment_methods)
    ON TABLE public.businesses TO authenticated;
GRANT UPDATE (name, description, category_id, operating_hours, payment_methods, logo_url)
    ON TABLE public.businesses TO authenticated;

-- Checkout debe crear cabeceras y detalles exclusivamente mediante la RPC
-- que valida usuario, negocio, productos, precios y stock de forma atómica.
DROP POLICY IF EXISTS "orders_insert_customer" ON public.orders;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.orders FROM anon, authenticated, PUBLIC;
GRANT UPDATE (status) ON TABLE public.orders TO authenticated;

DROP POLICY IF EXISTS "order_items_insert_customer" ON public.order_items;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_items FROM anon, authenticated, PUBLIC;

-- Restringe la ejecución de la RPC de checkout al rol autenticado. La función
-- SECURITY DEFINER conserva las escrituras necesarias dentro de su transacción.
REVOKE ALL ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    TO authenticated;
ALTER FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT)
    SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.update_business_status(UUID, TEXT, TEXT)
    SET search_path = pg_catalog;
