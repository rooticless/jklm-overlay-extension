function getChromeStorage(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
}


async function fetchProfileById(userId) {
    if (!userId) {
        return null;
    }

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        console.log("Profile fetch error:", error);
        return null;
    }

    return profile;
}


async function setUserPresenceStatus(status) {
    const data = await getChromeStorage(["userId", "profile"]);
    const userId = data.userId;

    if (!userId) {
        return false;
    }

    const { error } = await supabaseClient
        .from("profiles")
        .update({
            status: status
        })
        .eq("id", userId);


    if (error) {
        console.log("Presence update error:", error);
        return false;
    }


    chrome.storage.local.set({
        profile: {
            ...(data.profile || {}),
            id: userId,
            status: status
        }
    });


    return true;
}


async function getMyProfile() {

    const data = await getChromeStorage(["userId", "profile"]);

    if (data.profile) {
        return {
            ...data.profile,
            id: data.profile.id || data.userId
        };
    }


    if (!data.userId) {
        return null;
    }


    return await fetchProfileById(data.userId);
}



async function getProfileSummary() {

    const data = await getChromeStorage([
        "userId",
        "profile"
    ]);


    const userId = data.userId;

    const profiles = [];


    if (data.profile) {
        profiles.push({
            ...data.profile,
            id: data.profile.id || userId
        });
    }


    if (!userId) {
        return profiles;
    }



    const { data: friendships, error } = await supabaseClient
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);



    if (error) {
        console.log("Friend summary error:", error);
        return profiles;
    }



    for (const row of friendships || []) {

        if (row.status !== "accepted") {
            continue;
        }


        const friendId =
            row.user_id === userId
                ? row.friend_id
                : row.user_id;



        const friendProfile =
            await fetchProfileById(friendId);


        if (friendProfile) {
            profiles.push(friendProfile);
        }
    }



    chrome.storage.local.set({
        profileSummary: profiles
    });


    return profiles;
}





async function getCurrentFriendData(currentUserId) {

    const { data, error } = await supabaseClient
        .from("friendships")
        .select("*")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);



    if (error) {
        console.log(error);
        return {
            friends: [],
            incomingRequests: []
        };
    }



    const friends = [];
    const incomingRequests = [];



    for (const row of data || []) {


        if (row.status === "accepted") {

            const friendId =
                row.user_id === currentUserId
                    ? row.friend_id
                    : row.user_id;


            const profile =
                await fetchProfileById(friendId);


            if (profile) {
                friends.push(profile);
            }
        }



        if (
            row.status === "pending" &&
            row.friend_id === currentUserId
        ) {

            const profile =
                await fetchProfileById(row.user_id);


            if (profile) {

                incomingRequests.push({
                    friendshipRow: row,
                    profile: profile
                });

            }
        }
    }



    const result = {
        friends,
        incomingRequests
    };


    chrome.storage.local.set({
        friendData: result
    });


    return result;
}





async function searchUsersByUsername(query, currentUserId) {

    if (!query) {
        return [];
    }


    const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .ilike("username", `%${query}%`);



    if (error) {
        console.log(error);
        return [];
    }



    return data.filter(
        user => user.id !== currentUserId
    );
}





async function addFriendRequest(currentUserId, friendId) {


    const { data: existing } = await supabaseClient
        .from("friendships")
        .select("*")
        .or(
            `and(user_id.eq.${currentUserId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUserId})`
        )
        .maybeSingle();



    if (existing) {

        return {
            success: true,
            alreadyExists: true,
            status: existing.status
        };

    }



    const { error } =
        await supabaseClient
            .from("friendships")
            .insert({

                user_id: currentUserId,
                friend_id: friendId,
                status: "pending"

            });



    if (error) {

        console.log(error);

        return {
            success: false
        };

    }


    return {
        success: true,
        alreadyExists: false,
        status: "pending"
    };
}





async function acceptFriendRequest(currentUserId, requesterId) {

    const { error } = await supabaseClient
        .from("friendships")
        .update({
            status: "accepted"
        })
        .eq("user_id", requesterId)
        .eq("friend_id", currentUserId);


    return !error;
}





async function declineFriendRequest(currentUserId, requesterId) {

    const { error } = await supabaseClient
        .from("friendships")
        .delete()
        .eq("user_id", requesterId)
        .eq("friend_id", currentUserId);


    return !error;
}





async function removeFriend(currentUserId, friendId) {

    const { error } = await supabaseClient
        .from("friendships")
        .delete()
        .or(
            `and(user_id.eq.${currentUserId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${currentUserId})`
        );


    return !error;
}





async function isUsernameTaken(username, currentUserId) {
    const normalizedUsername = String(username || '').trim();
    if (!normalizedUsername) {
        return false;
    }

    let query = supabaseClient
        .from("profiles")
        .select("id", { count: "exact" })
        .eq("username", normalizedUsername);

    if (currentUserId) {
        query = query.neq("id", currentUserId);
    }

    const { data, error } = await query;

    if (error) {
        console.log("Username uniqueness check failed:", error);
        return false;
    }

    return Array.isArray(data) && data.length > 0;
}


async function updateProfile(username, bio, avatar, status) {

    const data =
        await getChromeStorage(["userId", "profile"]);

    let userId = data.userId || null;
    const authUserId = await getSessionUserId();

    if (!userId && authUserId) {
        userId = authUserId;
    }

    if (authUserId && userId !== authUserId) {
        console.log('Stored userId does not match authenticated Supabase user; switching to auth user id.');
        userId = authUserId;
        await chrome.storage.local.set({ userId });
    }

    const normalizedUsername = String(username || 'New User').trim() || 'New User';
    const isTaken = await isUsernameTaken(normalizedUsername, userId);

    if (isTaken) {
        return {
            success: false,
            reason: 'username_taken'
        };
    }

    const profile = {
        id: userId,
        username: normalizedUsername,
        bio,
        avatar,
        status: (typeof status === 'string' && status.trim())
            ? status
            : (data.profile?.status || 'Offline')
    };

    chrome.storage.local.set({
        profile
    });

    if (!userId) {
        return {
            success: true,
            localOnly: true
        };
    }

    const { error } = await supabaseClient
        .from("profiles")
        .upsert(profile, {
            onConflict: "id"
        });

    if (error) {
        console.log(error);
        return {
            success: false,
            reason: 'save_failed'
        };
    }

    return {
        success: true
    };
}


async function getSessionUserId() {
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.log('Supabase auth session error:', error);
            return null;
        }
        return data?.session?.user?.id || null;
    } catch (err) {
        console.log('Supabase auth session fetch failed:', err);
        return null;
    }
}

async function getPrivateChatMessages(userId, friendId) {
    if (!userId || !friendId) {
        return [];
    }

    const authUserId = await getSessionUserId();
    if (!authUserId) {
        console.log('No authenticated Supabase session found for private chat load. Row-level security may block access.');
    }

    const { data, error } = await supabaseClient
        .from("private_messages")
        .select("*")
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: true });

    if (error) {
        console.log("Private chat load error:", error);
        if (error.code === '42501') {
            console.log('Private chat load blocked by RLS policy. Ensure the current Supabase user session matches the sender or recipient, or update table policies.');
        }
        return [];
    }

    return (data || []).map((message) => ({
        id: message.id,
        content: message.content,
        senderName: message.sender_name || 'User',
        timestamp: message.created_at,
        isSelf: message.sender_id === userId
    }));
}


async function sendPrivateChatMessage(userId, recipientId, content) {
    if (!userId || !recipientId || !content) {
        return false;
    }

    const { data: senderProfile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .maybeSingle();

    if (profileError) {
        console.log("Private chat sender name load error:", profileError);
    }

    const senderName = senderProfile?.username || 'You';

    const { error } = await supabaseClient
        .from("private_messages")
        .insert({
            sender_id: userId,
            recipient_id: recipientId,
            content,
            sender_name: senderName
        });

    if (error) {
        console.log("Private chat send error:", error);
        return false;
    }

    return true;
}