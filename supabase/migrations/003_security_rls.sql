-- ============================================================================
-- MIGRACIÓN 003: SEGURIDAD Y POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Función de verificación de administrador (SECURITY DEFINER para consultar profiles)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN false;
    END IF;

    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();

    RETURN v_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ----------------------------------------------------------------------------
-- HABILITACIÓN DE RLS EN TODAS LAS TABLAS
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;


-- ----------------------------------------------------------------------------
-- POLÍTICAS: profiles
-- ----------------------------------------------------------------------------
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
FOR SELECT USING (
    id = auth.uid() OR public.is_admin()
);

CREATE POLICY "profiles_update_own" ON public.profiles
FOR UPDATE USING (
    id = auth.uid() OR public.is_admin()
) WITH CHECK (
    id = auth.uid() OR public.is_admin()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: business_categories
-- ----------------------------------------------------------------------------
CREATE POLICY "categories_select_public" ON public.business_categories
FOR SELECT USING (true);

CREATE POLICY "categories_all_admin" ON public.business_categories
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ----------------------------------------------------------------------------
-- POLÍTICAS: businesses
-- ----------------------------------------------------------------------------
-- Visitantes y clientes pueden ver solo negocios publicados
CREATE POLICY "businesses_select_published_or_owner_or_admin" ON public.businesses
FOR SELECT USING (
    status = 'published'
    OR owner_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.business_members bm
        WHERE bm.business_id = businesses.id AND bm.user_id = auth.uid()
    )
);

-- Los emprendedores autenticados pueden registrar emprendimientos (con estado pending)
CREATE POLICY "businesses_insert_authenticated" ON public.businesses
FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND owner_id = auth.uid()
    AND (status = 'pending' OR public.is_admin())
);

-- Dueños pueden actualizar información de sus negocios, pero no el status (salvo admin)
CREATE POLICY "businesses_update_owner_or_admin" ON public.businesses
FOR UPDATE USING (
    owner_id = auth.uid() OR public.is_admin()
) WITH CHECK (
    (owner_id = auth.uid() AND (status = 'pending' OR status = (SELECT b.status FROM public.businesses b WHERE b.id = businesses.id)))
    OR public.is_admin()
);

-- Dueños o admin pueden eliminar
CREATE POLICY "businesses_delete_owner_or_admin" ON public.businesses
FOR DELETE USING (
    owner_id = auth.uid() OR public.is_admin()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: business_members
-- ----------------------------------------------------------------------------
CREATE POLICY "business_members_select" ON public.business_members
FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_members.business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
);

CREATE POLICY "business_members_modify" ON public.business_members
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_members.business_id AND b.owner_id = auth.uid())
    OR public.is_admin()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: products
-- ----------------------------------------------------------------------------
CREATE POLICY "products_select_published_or_owner" ON public.products
FOR SELECT USING (
    (
        is_active = true
        AND EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = products.business_id AND b.status = 'published'
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = products.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "products_insert_owner" ON public.products
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = products.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "products_update_owner" ON public.products
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = products.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "products_delete_owner" ON public.products
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = products.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: product_images
-- ----------------------------------------------------------------------------
CREATE POLICY "product_images_select_public" ON public.product_images
FOR SELECT USING (true);

CREATE POLICY "product_images_modify_owner" ON public.product_images
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.products p
        JOIN public.businesses b ON b.id = p.business_id
        WHERE p.id = product_images.product_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: promotions
-- ----------------------------------------------------------------------------
CREATE POLICY "promotions_select_public" ON public.promotions
FOR SELECT USING (
    (
        is_active = true
        AND EXISTS (
            SELECT 1 FROM public.businesses b
            WHERE b.id = promotions.business_id AND b.status = 'published'
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = promotions.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "promotions_modify_owner" ON public.promotions
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = promotions.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: favorites
-- ----------------------------------------------------------------------------
CREATE POLICY "favorites_user_isolation" ON public.favorites
FOR ALL USING (
    user_id = auth.uid()
) WITH CHECK (
    user_id = auth.uid()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: cart_items
-- ----------------------------------------------------------------------------
CREATE POLICY "cart_items_user_isolation" ON public.cart_items
FOR ALL USING (
    user_id = auth.uid()
) WITH CHECK (
    user_id = auth.uid()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: orders
-- ----------------------------------------------------------------------------
CREATE POLICY "orders_select_customer_or_business_owner_or_admin" ON public.orders
FOR SELECT USING (
    customer_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = orders.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);

CREATE POLICY "orders_insert_customer" ON public.orders
FOR INSERT WITH CHECK (
    customer_id = auth.uid()
);

-- Solo el emprendedor dueño del negocio o el admin pueden actualizar el estado del pedido
CREATE POLICY "orders_update_status_business_owner_or_admin" ON public.orders
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = orders.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
) WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.id = orders.business_id AND b.owner_id = auth.uid()
    )
    OR public.is_admin()
);


-- ----------------------------------------------------------------------------
-- POLÍTICAS: order_items
-- ----------------------------------------------------------------------------
CREATE POLICY "order_items_select" ON public.order_items
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        LEFT JOIN public.businesses b ON b.id = o.business_id
        WHERE o.id = order_items.order_id
          AND (o.customer_id = auth.uid() OR b.owner_id = auth.uid() OR public.is_admin())
    )
);

CREATE POLICY "order_items_insert_customer" ON public.order_items
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()
    )
    OR public.is_admin()
);

