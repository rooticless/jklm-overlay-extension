try {
    importScripts('supabase.js');
    console.log('Supabase loaded successfully');
} catch (error) {
    console.error('Failed to load supabase.js in background worker', error);
}

try {
    importScripts('user.js');
    console.log('User.js loaded successfully');
} catch (error) {
    console.error('Failed to load user.js in background worker', error);
}

try {
    importScripts('profile.js');
    console.log('Profile.js loaded successfully');
} catch (error) {
    console.error('Failed to load profile.js in background worker', error);
}

console.log('Background service worker initialized');

function isJklmTabUrl(url) {
    if (!url) {
        return false;
    }

    return url.startsWith('https://jklm.fun/') || url.startsWith('https://www.jklm.fun/');
}

function refreshPresenceFromTabs() {
    chrome.tabs.query({ url: ['https://jklm.fun/*', 'https://www.jklm.fun/*'] }, (tabs) => {
        const visitTabs = Array.isArray(tabs) ? tabs.filter((tab) => tab?.url && isJklmTabUrl(tab.url)) : [];
        let status = 'Offline';

        if (visitTabs.length) {
            const roomTab = visitTabs.find((tab) => {
                try {
                    const pathname = new URL(tab.url).pathname;
                    return /^\/[A-Za-z0-9]{4}$/.test(pathname);
                } catch (e) {
                    return false;
                }
            });
            if (roomTab) {
                try {
                    const pathname = new URL(roomTab.url).pathname;
                    const match = pathname.match(/^\/([A-Za-z0-9]{4})$/);
                    if (match) {
                        status = `In room ${match[1]}`;
                    } else {
                        status = 'Online';
                    }
                } catch (e) {
                    status = 'Online';
                }
            } else {
                status = 'Online';
            }
        }

        chrome.storage.local.get(['profile'], (data) => {
            const currentStatus = data?.profile?.status;
            if (currentStatus === status) {
                return;
            }

            if (typeof setUserPresenceStatus === 'function') {
                setUserPresenceStatus(status);
            }
        });
    });
}

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
    if (typeof createUser === 'function') {
        createUser();
    }
    refreshPresenceFromTabs();
});

chrome.runtime.onStartup.addListener(() => {
    createUser();
    refreshPresenceFromTabs();
});

chrome.runtime.onSuspend.addListener(() => {
    refreshPresenceFromTabs();
});

chrome.tabs.onCreated.addListener(() => {
    refreshPresenceFromTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status) {
        refreshPresenceFromTabs();
    }
});

chrome.tabs.onRemoved.addListener(() => {
    refreshPresenceFromTabs();
});

chrome.tabs.onActivated.addListener(() => {
    refreshPresenceFromTabs();
});

chrome.windows.onRemoved.addListener(() => {
    refreshPresenceFromTabs();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'ENSURE_USER') {
        createUser()
            .then(() => {
                refreshPresenceFromTabs();
                sendResponse({ ok: true });
            })
            .catch((error) => {
                console.error('User creation failed', error);
                sendResponse({ ok: false });
            });
        return true;
    }

    if (message?.type === 'GET_PROFILE') {
        createUser()
            .then(() => getMyProfile())
            .then((profile) => sendResponse({ profile }))
            .catch((error) => {
                console.error('Profile fetch failed', error);
                sendResponse({ profile: null });
            });
        return true;
    }

    if (message?.type === 'GET_PROFILE_SUMMARY') {
        createUser()
            .then(() => getProfileSummary())
            .then((profiles) => sendResponse({ profiles }))
            .catch((error) => {
                console.error('Profile summary failed', error);
                sendResponse({ profiles: [] });
            });
        return true;
    }

    if (message?.type === 'SEARCH_USERS') {
        searchUsersByUsername(message.query, message.currentUserId)
            .then((users) => sendResponse({ users }))
            .catch((error) => {
                console.error('User search failed', error);
                sendResponse({ users: [] });
            });
        return true;
    }

    if (message?.type === 'GET_FRIEND_DATA') {
        createUser()
            .then(() => new Promise((resolve) => {
                chrome.storage.local.get(["userId"], (data) => resolve(data.userId));
            }))
            .then((userId) => getCurrentFriendData(userId))
            .then((friendData) => sendResponse(friendData))
            .catch((error) => {
                console.error('Friend data failed', error);
                sendResponse({ friends: [], incomingRequests: [] });
            });
        return true;
    }

    if (message?.type === 'ADD_FRIEND') {
        createUser()
            .then(() => new Promise((resolve) => {
                chrome.storage.local.get(["userId"], (data) => resolve(data.userId));
            }))
            .then((userId) => addFriendRequest(userId, message.friendId))
            .then((result) => sendResponse(result))
            .catch((error) => {
                console.error('Add friend failed', error);
                sendResponse({ success: false, alreadyExists: false, status: null });
            });
        return true;
    }

    if (message?.type === 'ACCEPT_FRIEND_REQUEST') {
        createUser()
            .then(() => new Promise((resolve) => {
                chrome.storage.local.get(["userId"], (data) => resolve(data.userId));
            }))
            .then((userId) => acceptFriendRequest(userId, message.requesterId))
            .then((success) => sendResponse({ success }))
            .catch((error) => {
                console.error('Accept friend failed', error);
                sendResponse({ success: false });
            });
        return true;
    }

    if (message?.type === 'DECLINE_FRIEND_REQUEST') {
        createUser()
            .then(() => new Promise((resolve) => {
                chrome.storage.local.get(["userId"], (data) => resolve(data.userId));
            }))
            .then((userId) => declineFriendRequest(userId, message.requesterId))
            .then((success) => sendResponse({ success }))
            .catch((error) => {
                console.error('Decline friend failed', error);
                sendResponse({ success: false });
            });
        return true;
    }

    if (message?.type === 'REMOVE_FRIEND') {
        createUser()
            .then(() => new Promise((resolve) => {
                chrome.storage.local.get(["userId"], (data) => resolve(data.userId));
            }))
            .then((userId) => removeFriend(userId, message.friendId))
            .then((success) => sendResponse({ success }))
            .catch((error) => {
                console.error('Remove friend failed', error);
                sendResponse({ success: false });
            });
        return true;
    }

    if (message?.type === 'SAVE_PROFILE') {
        createUser()
            .then(() => updateProfile(
                message.username,
                message.bio,
                message.avatar,
                message.status
            ))
            .then((result) => sendResponse(result))
            .catch((error) => {
                console.error('Profile save failed', error);
                sendResponse({ success: false, reason: 'save_failed' });
            });
        return true;
    }

    if (message?.type === 'GET_PRIVATE_CHAT_MESSAGES') {
        createUser()
            .then(() => new Promise((resolve) => {
                chrome.storage.local.get(['userId'], (data) => resolve(data.userId));
            }))
            .then((userId) => getPrivateChatMessages(userId, message.friendId))
            .then((messages) => sendResponse({ messages }))
            .catch((error) => {
                console.error('Private chat load failed', error);
                sendResponse({ messages: [] });
            });
        return true;
    }

    if (message?.type === 'SEND_PRIVATE_CHAT_MESSAGE') {
        createUser()
            .then(() => new Promise((resolve) => {
                chrome.storage.local.get(['userId'], (data) => resolve(data.userId));
            }))
            .then((userId) => sendPrivateChatMessage(userId, message.recipientId, message.content))
            .then((success) => sendResponse({ success }))
            .catch((error) => {
                console.error('Private chat send failed', error);
                sendResponse({ success: false });
            });
        return true;
    }

    return false;
});