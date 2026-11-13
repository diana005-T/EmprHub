/**
 * ============================================================================
 * EmpreHub - Configuración de Supabase
 * ============================================================================
 * 
 * INSTRUCCIONES PARA EL USUARIO:
 * 1. Abre el panel de tu proyecto Supabase (https://supabase.com/dashboard).
 * 2. Dirígete a "Project Settings" (icono de tuerca) -> "API".
 * 3. Copia el "Project URL" y pégalo en SUPABASE_URL reemplazando el marcador.
 * 4. Copia el "Project API anon public key" y pégalo en SUPABASE_ANON_KEY.
 * 
 * ⚠️ SEGURIDAD CRÍTICA:
 * - NUNCA coloques aquí la clave 'service_role' ni secretos que empiecen con 'sb_secret_'.
 * - Solo se debe usar la clave 'anon public' (publishable key).
 * - Esta configuración es 100% compatible con GitHub Pages y servidores estáticos.
 * ============================================================================
 */

(function () {
  'use strict';

  // Marcadores de posición por defecto
  const DEFAULT_CONFIG = {
    // REEMPLAZA ESTE VALOR CON TU URL DE SUPABASE (ej. https://xyzcompany.supabase.co)
    SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',

    // REEMPLAZA ESTE VALOR CON TU PUBLISHABLE / ANON KEY (ej. eyJhbGciOi...)
    SUPABASE_PUBLISHABLE_KEY: 'TU_SUPABASE_ANON_KEY'
  };

  // Permite sobreescritura opcional desde localStorage para pruebas locales sin editar el archivo
  const localUrl = localStorage.getItem('eh_custom_supabase_url');
  const localKey = localStorage.getItem('eh_custom_supabase_key');

  const activeConfig = {
    SUPABASE_URL: (localUrl && localUrl.trim() !== '') ? localUrl.trim() : DEFAULT_CONFIG.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: (localKey && localKey.trim() !== '') ? localKey.trim() : DEFAULT_CONFIG.SUPABASE_PUBLISHABLE_KEY,
    
    // Función auxiliar para saber si el usuario ya configuró sus credenciales reales
    isConfigured: function () {
      const url = this.SUPABASE_URL;
      const key = this.SUPABASE_PUBLISHABLE_KEY;
      return (
        Boolean(url) &&
        Boolean(key) &&
        !url.includes('TU-PROYECTO') &&
        !key.includes('TU_SUPABASE_ANON_KEY') &&
        url.startsWith('https://')
      );
    }
  };

  // Exponer globalmente en window.EMPREHUB_CONFIG
  window.EMPREHUB_CONFIG = activeConfig;
})();

