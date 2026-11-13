-- ============================================================================
-- MIGRACIÓN 006: DATOS SEMILLA (CATEGORÍAS Y FUNCIONES DE ADMINISTRACIÓN INICIAL)
-- ============================================================================

-- 1. Insertar categorías base
INSERT INTO public.business_categories (name, slug, icon, description, display_order)
VALUES
    ('Platos', 'platos', '🍽️', 'Comida casera, almuerzos y especialidades criollas', 1),
    ('Bebidas', 'bebidas', '🥤', 'Jugos naturales, refrescos, café e infusiones', 2),
    ('Productos', 'productos', '🛍️', 'Accesorios, artesanías, ropa y artículos para el hogar', 3),
    ('Postres', 'postres', '🧁', 'Tortas, pasteles, alfajores y dulces artesanales', 4)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order;


-- ----------------------------------------------------------------------------
-- FUNCIÓN DE ASIGNACIÓN CONTROLADA DEL PRIMER ADMINISTRADOR
-- Permite promover un correo registrado al rol de 'admin' de manera segura
-- Ejecutar en el SQL Editor de Supabase: SELECT public.promote_user_to_admin('tu-correo@ejemplo.com');
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_user_to_admin(p_email TEXT)
RETURNS TEXT AS $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE lower(email) = lower(trim(p_email));

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró ningún usuario con el correo: %', p_email;
    END IF;

    -- Actualizamos el rol de forma controlada
    UPDATE public.profiles
    SET role = 'admin',
        updated_at = timezone('utc'::text, now())
    WHERE id = v_user_id;

    RETURN 'Usuario ' || p_email || ' promovido exitosamente a ADMINISTRADOR.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

