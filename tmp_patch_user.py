from pathlib import Path

path = Path(r'c:\Users\Natal\Downloads\JKLM Overlay\jklm-overlay-extension\user.js')
text = path.read_text(encoding='utf-8')
start = text.index('async function createUser() {')
# Find matching closing brace for the function
brace = 0
end = None
for i, ch in enumerate(text[start:], start):
    if ch == '{':
        brace += 1
    elif ch == '}':
        brace -= 1
        if brace == 0:
            end = i + 1
            break
if end is None:
    raise RuntimeError('Could not find end of createUser function')
old = text[start:end]
new = '''async function createUser() {
    const localData = await getChromeStorage(["userId", "profile"]);
    const storedUserId = localData.userId || null;
    let profile = localData.profile || null;

    if (storedUserId) {
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

        await new Promise((resolve) => {
            chrome.storage.local.set({ userId: storedUserId, profile }, () => resolve());
        });

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

        await new Promise((resolve) => {
            chrome.storage.local.set({ userId: cookieUserId, profile: restoredProfile }, () => resolve());
        });

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

    await new Promise((resolve) => {
        chrome.storage.local.set({ userId, profile }, () => resolve());
    });

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
}
'''
text = text[:start] + new + text[end:]
path.write_text(text, encoding='utf-8')
print('patched')
