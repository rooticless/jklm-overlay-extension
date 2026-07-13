function getCookieValue(name) {
    return new Promise((resolve) => {
        chrome.cookies.get({
            url: 'https://jklm.fun/',
            name: name
        }, (cookie) => {
            resolve(cookie?.value || null);
        });
    });
}

function setCookieValue(name, value, maxAgeSeconds = 60 * 60 * 24 * 365) {
    return new Promise((resolve) => {
        chrome.cookies.set({
            url: 'https://jklm.fun/',
            name,
            value,
            path: '/',
            expirationDate: Math.floor(Date.now() / 1000) + maxAgeSeconds,
            secure: true,
            sameSite: 'no_restriction'
        }, () => {
            resolve();
        });
    });
}

let cachedSupabaseSession = null;
let pendingSupabaseSessionPromise = null;
let lastSignInAttemptAt = 0;
const SIGN_IN_BACKOFF_MS = 60 * 1000;

function getChromeStorage(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (data) => {
            resolve(data || {});
        });
    });
}

function getStoredSupabaseSession() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['supabaseSession'], (data) => {
            resolve(data?.supabaseSession || null);
        });
    });
}

function storeSupabaseSession(session) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ supabaseSession: session }, () => {
            resolve();
        });
    });
}

function removeStoredSupabaseSession() {
    return new Promise((resolve) => {
        chrome.storage.local.remove(['supabaseSession'], () => {
            resolve();
        });
    });
}

async function restoreSupabaseSession(storedSession) {
    if (!storedSession || !storedSession.access_token || !storedSession.refresh_token) {
        return null;
    }

    try {
        const { data, error } = await supabaseClient.auth.setSession({
            access_token: storedSession.access_token,
            refresh_token: storedSession.refresh_token
        });
        if (error) {
            console.error('Supabase restore session failed:', error);
            const message = String(error.message || error.details || '');
            if (message.includes('Invalid Refresh Token') || message.includes('refresh token') || message.includes('already used')) {
                await removeStoredSupabaseSession();
            }
            return null;
        }

        if (!data?.session) {
            await removeStoredSupabaseSession();
            return null;
        }

        await storeSupabaseSession(data.session);
        return data.session;
    } catch (err) {
        console.error('Supabase session restore exception:', err);
        const message = String(err?.message || '');
        if (message.includes('Invalid Refresh Token') || message.includes('refresh token') || message.includes('already used')) {
            await removeStoredSupabaseSession();
        }
        return null;
    }
}

async function ensureSupabaseSession(options = {}) {
    const allowAnonymousSignIn = options.allowAnonymousSignIn !== false;

    if (cachedSupabaseSession) {
        return cachedSupabaseSession;
    }
    if (pendingSupabaseSessionPromise) {
        return pendingSupabaseSessionPromise;
    }

    pendingSupabaseSessionPromise = (async () => {
        try {
            const { data: currentSessionData } = await supabaseClient.auth.getSession();
            const currentSession = currentSessionData?.session || null;
            if (currentSession) {
                cachedSupabaseSession = currentSession;
                return cachedSupabaseSession;
            }

            const storedSession = await getStoredSupabaseSession();
            if (storedSession) {
                const restored = await restoreSupabaseSession(storedSession);
                if (restored) {
                    cachedSupabaseSession = restored;
                    return cachedSupabaseSession;
                }
            }

            if (!allowAnonymousSignIn) {
                console.log('Anonymous sign-in disabled; not creating a new Supabase session.');
                return null;
            }

            const now = Date.now();
            if (now - lastSignInAttemptAt < SIGN_IN_BACKOFF_MS) {
                console.log('Skipping signInAnonymously due to recent attempt');
                return null;
            }
            lastSignInAttemptAt = now;

            const { data, error } = await supabaseClient.auth.signInAnonymously();
            if (error) {
                console.error('Supabase anonymous sign-in failed:', error);
                return null;
            }

            const session = data?.session ?? (data?.access_token ? data : (data?.user ? data : null));
            if (!session) {
                console.error('Supabase anonymous sign-in returned no session object.');
                return null;
            }

            if (session?.access_token && session?.refresh_token) {
                await storeSupabaseSession(session);
            }

            cachedSupabaseSession = session;
            console.log('Supabase anonymous session established:', session?.user?.id);
            return session;
        } catch (err) {
            console.error('Supabase session initialization failed:', err);
            return null;
        } finally {
            pendingSupabaseSessionPromise = null;
        }
    })();

    return pendingSupabaseSessionPromise;
}

async function restoreProfileFromSupabase(userId) {
    if (!userId) {
        return null;
    }

    try {
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.error('Restore profile from Supabase failed:', error);
            return null;
        }

        return profile;
    } catch (err) {
        console.error('Restore profile from Supabase exception:', err);
        return null;
    }
}

function setChromeStorage(data) {
    return new Promise((resolve) => {
        chrome.storage.local.set(data, () => {
            resolve();
        });
    });
}

async function createUser() {
    try {
        const localData = await getChromeStorage(["userId", "profile"]);
        const storedUserId = localData.userId || null;
        let profile = localData.profile || null;

        if (storedUserId) {
            let session = await ensureSupabaseSession({ allowAnonymousSignIn: false });
            if (!session) {
                console.log('No existing Supabase session; attempting anonymous sign-in for stored userId.');
                session = await ensureSupabaseSession({ allowAnonymousSignIn: true });
            }

            const sessionUserId = session?.user?.id || null;
            if (sessionUserId && sessionUserId !== storedUserId) {
                console.log('Stored userId differs from authenticated session userId; switching to session userId.');
                storedUserId = sessionUserId;
            }

            if (!profile) {
                profile = await restoreProfileFromSupabase(storedUserId);
            }

            if (!profile) {
                profile = {
                    id: storedUserId,
                    username: 'New User',
                    bio: '',
                    avatar: '',
                    status: 'Offline'
                };
            }

            await setChromeStorage({ userId: storedUserId, profile });
            await setCookieValue('jklmUserId', storedUserId);
            return storedUserId;
        }

        const cookieUserId = await getCookieValue('jklmUserId');
        if (cookieUserId) {
            console.log('Recovered user from cookie:', cookieUserId);

            let restoredProfile = await restoreProfileFromSupabase(cookieUserId);
            if (!restoredProfile) {
                restoredProfile = {
                    id: cookieUserId,
                    username: 'New User',
                    bio: '',
                    avatar: '',
                    status: 'Offline'
                };
            }

            await setChromeStorage({ userId: cookieUserId, profile: restoredProfile });
            await setCookieValue('jklmUserId', cookieUserId);
            return cookieUserId;
        }

        const session = await ensureSupabaseSession({ allowAnonymousSignIn: true });
        const sessionUserId = session?.user?.id || null;
        if (!sessionUserId) {
            console.error('No Supabase session available to create a new user.');
            return null;
        }

        const userId = sessionUserId;
        profile = {
            id: userId,
            username: 'New User',
            bio: '',
            avatar: '',
            status: 'Offline'
        };

        await setChromeStorage({ userId, profile });
        await setCookieValue('jklmUserId', userId);

        try {
            const { data: inserted, error } = await supabaseClient
                .from('profiles')
                .insert(profile)
                .select();

            if (error) {
                console.error('SUPABASE INSERT ERROR:', error);
            } else {
                console.log('SUPABASE PROFILE CREATED:', inserted);
            }
        } catch (err) {
            console.error('CREATE USER FAILED:', err);
        }

        return userId;
    } catch (err) {
        console.error('createUser failed:', err);
        return null;
    }
}
