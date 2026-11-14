-- ============================================================================
-- MIGRACIÓN 005: CONFIGURACIÓN DE SUPABASE STORAGE Y POLÍTICAS
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'emprehub-media',
    'emprehub-media',
    true,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- Use a narrowly scoped definer helper so Storage policies do not query
-- business tables under their own RLS policies.
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

DROP POLICY IF EXISTS "Public access to emprehub-media" ON storage.objects;
CREATE POLICY "Public access to emprehub-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'emprehub-media');

DROP POLICY IF EXISTS "Authenticated users can upload to emprehub-media" ON storage.objects;
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

DROP POLICY IF EXISTS "Users can update their own media or admin" ON storage.objects;
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

DROP POLICY IF EXISTS "Users can delete their own media or admin" ON storage.objects;
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
