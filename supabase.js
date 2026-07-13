try {
    importScripts("supabase.min.js");
} catch (err) {
    console.error('Failed to import supabase.min.js:', err);
    throw err;
}

const SUPABASE_URL = "https://psbmoukksklhhswemjvd.supabase.co";
const SUPABASE_KEY = "sb_publishable_LiLDZemM5wrxhdMpzlMuEw_w059An_l";

try {
    if (typeof supabase === 'undefined') {
        throw new Error('supabase object not defined after import');
    }
    self.supabaseClient = supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );
    console.log('Supabase client initialized successfully');
} catch (err) {
    console.error('Failed to initialize supabaseClient:', err);
    throw err;
}