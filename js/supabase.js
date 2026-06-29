/**
 * supabase.js
 * ===========
 * Initializes and exports the Supabase client.
 * Import { supabase } from './supabase.js' in any module.
 */

'use strict';

import { createClient }   from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

if (!SUPABASE_URL || SUPABASE_URL === 'https://YOUR_PROJECT_ID.supabase.co') {
    console.error('[Supabase] ⚠️  Please set SUPABASE_URL and SUPABASE_ANON in js/config.js');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
        persistSession : false,
        autoRefreshToken: false,
    },
});
