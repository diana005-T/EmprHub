-- ============================================================================
-- MIGRACIÓN 002: TRIGGERS, INTEGRIDAD Y VALIDACIÓN DE PLANES
-- ============================================================================

-- Función utilitaria para actualizar columna updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers de updated_at para tablas correspondientes
CREATE OR REPLACE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_promotions_updated_at
BEFORE UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_cart_updated_at
BEFORE UPDATE ON public.cart_items
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- TRIGGER: Manejo automático de registro de usuario (auth.users -> profiles)
-- Garantiza que NADIE pueda inyectar 'admin' al registrarse.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
    v_full_name TEXT;
    v_phone TEXT;
BEGIN
    -- Extraer el rol solicitado desde user_metadata (solo customer o entrepreneur)
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');
    
    -- REGLA DE SEGURIDAD: Jamás permitir que un usuario se autoasigne rol 'admin'
    IF v_role NOT IN ('customer', 'entrepreneur') THEN
        v_role := 'customer';
    END IF;

    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    v_phone := NEW.raw_user_meta_data->>'phone';

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        NEW.email,
        v_full_name,
        v_phone,
        v_role
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = timezone('utc'::text, now());

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger sobre auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ----------------------------------------------------------------------------
-- SEGURIDAD: Prevenir escalada de privilegios en public.profiles
-- Solo un administrador puede cambiar el 'role' de un usuario.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_role_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_current_user_role TEXT;
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Obtener el rol del usuario que ejecuta la consulta en la sesión
        SELECT role INTO v_current_user_role
        FROM public.profiles
        WHERE id = auth.uid();

        -- Si quien intenta cambiar el rol no es un admin, rechazar
        IF v_current_user_role IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Operación denegada: Solo los administradores pueden cambiar roles de usuario.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_role_escalation();


-- ----------------------------------------------------------------------------
-- REGLA PLAN GRATUITO: Máximo 1 emprendimiento por emprendedor (en plan free)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_business_free_plan()
RETURNS TRIGGER AS $$
DECLARE
    v_count INT;
BEGIN
    -- Solo aplica al crear o cambiar de owner
    IF TG_OP = 'INSERT' THEN
        SELECT COUNT(*) INTO v_count
        FROM public.businesses
        WHERE owner_id = NEW.owner_id;

        IF v_count >= 1 THEN
            RAISE EXCEPTION 'Límite alcanzado: En el plan gratuito solo puedes registrar 1 emprendimiento.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_business_free_plan ON public.businesses;
CREATE TRIGGER trg_validate_business_free_plan
BEFORE INSERT ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.validate_business_free_plan();


-- ----------------------------------------------------------------------------
-- REGLA PLAN GRATUITO: Máximo 20 productos por emprendimiento (en plan free)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_products_free_plan()
RETURNS TRIGGER AS $$
DECLARE
    v_business_plan TEXT;
    v_count INT;
BEGIN
    SELECT plan INTO v_business_plan
    FROM public.businesses
    WHERE id = NEW.business_id;

    IF v_business_plan = 'free' THEN
        SELECT COUNT(*) INTO v_count
        FROM public.products
        WHERE business_id = NEW.business_id;

        IF v_count >= 20 THEN
            RAISE EXCEPTION 'Límite alcanzado: El plan gratuito permite un máximo de 20 productos por emprendimiento.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_products_free_plan ON public.products;
CREATE TRIGGER trg_validate_products_free_plan
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.validate_products_free_plan();


-- ----------------------------------------------------------------------------
-- REGLA PLAN GRATUITO: Máximo 3 imágenes por producto
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_product_images_free_plan()
RETURNS TRIGGER AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.product_images
    WHERE product_id = NEW.product_id;

    IF v_count >= 3 THEN
        RAISE EXCEPTION 'Límite alcanzado: El plan gratuito permite un máximo de 3 imágenes por producto.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_product_images_free_plan ON public.product_images;
CREATE TRIGGER trg_validate_product_images_free_plan
BEFORE INSERT ON public.product_images
FOR EACH ROW EXECUTE FUNCTION public.validate_product_images_free_plan();


-- ----------------------------------------------------------------------------
-- REGLA PLAN GRATUITO: Máximo 2 promociones activas por emprendimiento
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_promotions_free_plan()
RETURNS TRIGGER AS $$
DECLARE
    v_count INT;
BEGIN
    IF NEW.is_active = true THEN
        SELECT COUNT(*) INTO v_count
        FROM public.promotions
        WHERE business_id = NEW.business_id
          AND is_active = true
          AND (id IS DISTINCT FROM NEW.id);

        IF v_count >= 2 THEN
            RAISE EXCEPTION 'Límite alcanzado: El plan gratuito permite un máximo de 2 promociones activas simultáneamente.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_promotions_free_plan ON public.promotions;
CREATE TRIGGER trg_validate_promotions_free_plan
BEFORE INSERT OR UPDATE ON public.promotions
FOR EACH ROW EXECUTE FUNCTION public.validate_promotions_free_plan();

