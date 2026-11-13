-- ============================================================================
-- MIGRACIÓN 005: CONFIGURACIÓN DE SUPABASE STORAGE Y POLÍTICAS
-- ============================================================================

-- 1. Crear el bucket 'emprehub-media' si no existe
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'emprehub-media',
    'emprehub-media',
    true,
    2097152, -- 2MB en bytes
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];


-- ----------------------------------------------------------------------------
-- POLÍTICAS DE ACCESO PARA storage.objects
-- ----------------------------------------------------------------------------

-- A) Lectura pública de cualquier imagen del bucket
DROP POLICY IF EXISTS "Public access to emprehub-media" ON storage.objects;
CREATE POLICY "Public access to emprehub-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'emprehub-media');

-- B) Carga permitida para usuarios autenticados (emprendedores/admin)
DROP POLICY IF EXISTS "Authenticated users can upload to emprehub-media" ON storage.objects;
CREATE POLICY "Authenticated users can upload to emprehub-media"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'emprehub-media'
    AND auth.role() = 'authenticated'
);

-- C) Actualización solo para el propietario del archivo o administrador
DROP POLICY IF EXISTS "Users can update their own media or admin" ON storage.objects;
CREATE POLICY "Users can update their own media or admin"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'emprehub-media'
    AND (auth.uid() = owner OR public.is_admin())
);

-- D) Eliminación solo para el propietario del archivo o administrador
DROP POLICY IF EXISTS "Users can delete their own media or admin" ON storage.objects;
CREATE POLICY "Users can delete their own media or admin"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'emprehub-media'
    AND (auth.uid() = owner OR public.is_admin())
);

