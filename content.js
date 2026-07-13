// JKLM Overlay content script.
// This script injects a small footer note on the JKLM home page only.

console.log('[JKLM Overlay] Content script loading...');

(function () {
    'use strict';

    console.log('[JKLM Overlay] IIFE started');

    const FOOTER_ID = 'jklm-overlay-home-footer';
    const FOOTER_TEXT = 'Made with love by Root';
    const DISCORD_URL = 'https://discord.gg/D95sGYRPrU';
    const DISCORD_ICON_URL = 'https://jklm.fun/images/auth/discord.png';
    const PROFILE_DISPLAY_ID = 'jklm-overlay-home-profile-display';
    let footerEl = null;
    let discordEl = null;
    let observer = null;
    let scheduledCheck = null;
    let profileDisplayEl = null;
    let currentProfiles = [];
    let presenceTimer = null;
    let privateChatShellEl = null;
    let privateChatButtonEl = null;
    let privateChatPanelEl = null;
    let privateChatTitleEl = null;
    let privateChatBodyEl = null;
    let privateChatMessagesEl = null;
    let privateChatInputEl = null;
    let privateChatStatusEl = null;
    let privateChatHostEl = null;
    let privateChatOpen = false;
    let privateChatRefreshTimer = null;
    let privateChatActiveFriend = null;
    let privateChatMenuButtons = null;
    let privateChatMessageNotificationTimer = null;
    let privateChatLastSeenTimestamps = {};
    let privateChatPendingCounts = {};
    let privateChatTotalPendingCount = 0;
    let privateChatToastEl = null;
    let privateChatNotificationTimeout = null;
    let privateChatMenuBadgeEl = null;

    function isTargetSite() {
        return location.hostname === 'jklm.fun' || location.hostname === 'www.jklm.fun';
    }

    function isHomePage() {
        return isTargetSite() && (location.pathname === '/' || location.pathname === '' || location.pathname === '/index.html');
    }

    function isGameSessionPage() {
        if (!isTargetSite() || isHomePage()) {
            return false;
        }

        const tabContainer = findTabContainer();
        const gameShell = document.querySelector('div.tabs, .game, .room, .game-container, .gamePage, .match, .play-area, .in-game');
        const hasGamePath = /(\/room|\/play|\/game|\/match|\/battle|\/join)/i.test(location.pathname);

        return Boolean(tabContainer || gameShell || hasGamePath);
    }

    function findLinksContainer() {
        const links = document.querySelectorAll('div.links');
        for (const linkGroup of links) {
            if (linkGroup && linkGroup.closest('body')) {
                return linkGroup;
            }
        }
    }

    function findTabContainer() {
        // Look for the tabs container on game session pages
        // Tries multiple selectors commonly used for tab containers
        return document.querySelector('div.tabs')
            || document.querySelector('.game-tabs')
            || document.querySelector('[data-tabs]')
            || document.querySelector('div[role="tablist"]');
    }

    function ensureProfileDisplay() {
        // Show current user profile on home page banner - simple left-side display
        if (!isHomePage()) {
            removeProfileDisplay();
            return;
        }

        const banner = document.querySelector('div.banner');
        if (!banner) {
            return;
        }

        // Check if already exists
        if (profileDisplayEl && profileDisplayEl.parentNode) {
            return;
        }

        // Load current profile
        chrome.storage.local.get(['profile'], (data) => {
            const profile = data.profile;
            if (!profile || !profile.username) {
                return;
            }

            // Create simple profile display: image circle + name below
            const displayEl = document.createElement('div');
            displayEl.id = PROFILE_DISPLAY_ID;
            displayEl.className = 'root-profile-display';
            displayEl.style.position = 'absolute';
            displayEl.style.left = '10px';
            displayEl.style.top = '20px';
            displayEl.style.display = 'flex';
            displayEl.style.flexDirection = 'column';
            displayEl.style.alignItems = 'center';
            displayEl.style.gap = '12px';
            displayEl.style.zIndex = '1000';

            // Avatar - circular image (medium: 65px)
            const avatarImg = document.createElement('img');
            avatarImg.className = 'root-profile-avatar';
            avatarImg.src = profile.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="65" height="65"><circle cx="32.5" cy="32.5" r="32.5" fill="#d9fbe5"/></svg>');
            avatarImg.style.width = '65px';
            avatarImg.style.height = '65px';
            avatarImg.style.borderRadius = '50%';
            avatarImg.style.display = 'block';
            avatarImg.style.border = '2px solid #333';
            avatarImg.style.cursor = 'pointer';

            avatarImg.addEventListener('click', () => {
                openEditProfilePanel(profile);
            });

            // Username (larger: 14px)
            const username = document.createElement('div');
            username.className = 'root-profile-name';
            username.style.color = '#ccc';
            username.style.fontSize = '14px';
            username.style.fontWeight = 'bold';
            username.style.fontFamily = '"Varela Round", sans-serif';
            username.style.textAlign = 'center';
            username.style.maxWidth = '75px';
            username.style.wordWrap = 'break-word';
            username.textContent = profile.username || 'Unknown';

            displayEl.appendChild(avatarImg);
            displayEl.appendChild(username);

            // Ensure banner has position relative
            if (banner.style.position === 'static' || !banner.style.position) {
                banner.style.position = 'relative';
            }

            banner.appendChild(displayEl);
            profileDisplayEl = displayEl;

            console.log('[JKLM Overlay] Profile display created:', profile.username);
        });
    }

    function ensureProfileButton() {
        try {
            if (!isHomePage()) {
                console.log('[JKLM Overlay] ensureProfileButton: not home page');
                return;
            }

            // Try multiple selectors to find the auth container
            let targetContainer = document.querySelector('div.auth.page');
            if (!targetContainer) {
                targetContainer = document.querySelector('div.activeService.box');
            }
            if (!targetContainer) {
                // Fallback: look for any div with auth or service class
                targetContainer = document.querySelector('div[class*="auth"]') || document.querySelector('div[class*="service"]');
            }

            if (!targetContainer) {
                console.log('[JKLM Overlay] ensureProfileButton: target container not found, attempting body placement');
                // Last resort: append to body
                targetContainer = document.body;
            } else {
                console.log('[JKLM Overlay] ensureProfileButton: found container with classes:', targetContainer.className);
            }

            if (targetContainer.querySelector('#loginButton')) {
                console.log('[JKLM Overlay] ensureProfileButton: login button already exists');
                return;
            }

            const loginButton = document.createElement('button');
            loginButton.id = 'loginButton';
            loginButton.className = 'loginButton';
            loginButton.type = 'button';
            loginButton.textContent = 'Login';
            loginButton.style.display = 'block';
            loginButton.style.margin = '10px';
            loginButton.addEventListener('click', () => {
                // Inline profile loading to avoid scope issues
                chrome.storage.local.get(['profile'], (data) => {
                    const storedProfile = data.profile || null;
                    if (storedProfile && (storedProfile.username || storedProfile.bio || storedProfile.avatar || storedProfile.status)) {
                        openEditProfilePanel(storedProfile);
                        return;
                    }
                    chrome.runtime.sendMessage({ type: 'ENSURE_USER' }, () => {
                        chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (response) => {
                            const profile = response?.profile || null;
                            openEditProfilePanel(profile);
                        });
                    });
                });
            });

            const logoutWrapper = document.createElement('div');
            logoutWrapper.className = 'logout';
            logoutWrapper.style.padding = '10px';
            logoutWrapper.appendChild(loginButton);

            const disconnectButton = targetContainer.querySelector('button.styled[data-text="disconnect"]');
            if (disconnectButton && disconnectButton.parentNode) {
                disconnectButton.parentNode.insertBefore(logoutWrapper, disconnectButton.nextSibling);
            } else {
                targetContainer.appendChild(logoutWrapper);
            }

            console.log('[JKLM Overlay] ensureProfileButton: button created successfully, placed in:', targetContainer.tagName);
        } catch (err) {
            console.error('[JKLM Overlay] Error in ensureProfileButton():', err);
        }
    }

    function loadCurrentProfile(callback) {
        // Top-level version for compatibility
        chrome.storage.local.get(['profile'], (data) => {
            const storedProfile = data.profile || null;
            if (storedProfile && (storedProfile.username || storedProfile.bio || storedProfile.avatar || storedProfile.status)) {
                if (callback) callback(storedProfile);
                return;
            }
            chrome.runtime.sendMessage({ type: 'ENSURE_USER' }, () => {
                chrome.runtime.sendMessage({ type: 'GET_PROFILE' }, (response) => {
                    const profile = response?.profile || null;
                    if (callback) callback(profile);
                });
            });
        });
    }

    function openEditProfilePanel(profile) {
        removeProfilePanel();
        profile = profile || {};

        const panel = document.createElement('div');
        panel.className = 'root-profile-panel-overlay';

        const card = document.createElement('div');
        card.className = 'root-profile-panel-card';

        const header = document.createElement('div');
        header.className = 'root-profile-panel-row';

        const title = document.createElement('div');
        title.className = 'root-profile-panel-title';
        title.textContent = 'Profile';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'root-profile-panel-close';
        closeButton.textContent = 'Close';
        closeButton.addEventListener('click', removeProfilePanel);

        header.appendChild(title);
        header.appendChild(closeButton);

        const tabRow = document.createElement('div');
        tabRow.className = 'root-profile-panel-row';

        const bodyContainer = document.createElement('div');
        bodyContainer.className = 'root-profile-panel-card-inner';

        const createTabButton = (label) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'root-profile-panel-tab-button';
            btn.textContent = label;
            return btn;
        };

        const profileTabButton = createTabButton('Profile');
        const friendsTabButton = createTabButton('Friends');
        const showTabButton = createTabButton('Show');

        tabRow.appendChild(profileTabButton);
        tabRow.appendChild(friendsTabButton);
        tabRow.appendChild(showTabButton);

        const setActiveTab = (active, button) => {
            [profileTabButton, friendsTabButton, showTabButton].forEach((btn) => {
                btn.classList.toggle('active', btn === button);
            });
            bodyContainer.innerHTML = '';
            if (active === 'Profile') {
                renderProfileTab();
            } else if (active === 'Friends') {
                renderFriendsTab();
            } else {
                renderShowTab();
            }
        };

        const createField = (labelText, inputEl) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'root-profile-panel-section';

            const label = document.createElement('div');
            label.className = 'root-profile-panel-label';
            label.textContent = labelText;

            wrapper.appendChild(label);
            wrapper.appendChild(inputEl);
            return wrapper;
        };

        const renderProfileTab = () => {
            const image = document.createElement('img');
            image.className = 'root-profile-panel-image';
            image.src = profile.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="60" fill="#111"/></svg>');
            image.alt = profile.username || 'Profile';

            const usernameInput = document.createElement('input');
            usernameInput.className = 'root-profile-panel-input';
            usernameInput.type = 'text';
            usernameInput.value = profile.username || '';
            usernameInput.placeholder = 'Username';

            const bioInput = document.createElement('textarea');
            bioInput.className = 'root-profile-panel-input';
            bioInput.rows = 4;
            bioInput.value = profile.bio || '';
            bioInput.placeholder = 'Description';
            bioInput.style.resize = 'vertical';

            const avatarInput = document.createElement('input');
            avatarInput.className = 'root-profile-panel-input';
            avatarInput.type = 'text';
            avatarInput.value = profile.avatar || '';
            avatarInput.placeholder = 'Avatar URL';

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'root-profile-panel-close';
            saveButton.textContent = 'Save';
            saveButton.style.marginTop = '8px';

            const statusText = document.createElement('div');
            statusText.className = 'root-profile-panel-empty';

            saveButton.addEventListener('click', () => {
                const nextProfileData = {
                    username: usernameInput.value.trim() || 'New User',
                    bio: bioInput.value.trim() || '',
                    avatar: avatarInput.value.trim() || '',
                    status: profile.status || 'Offline'
                };
                statusText.textContent = 'Saving...';
                chrome.runtime.sendMessage({
                    type: 'SAVE_PROFILE',
                    username: nextProfileData.username,
                    bio: nextProfileData.bio,
                    avatar: nextProfileData.avatar,
                    status: nextProfileData.status
                }, (response) => {
                    if (response?.success) {
                        statusText.textContent = 'Saved successfully.';
                        chrome.storage.local.get(['profile'], (stored) => {
                            const savedProfile = {
                                ...(stored.profile || {}),
                                ...nextProfileData,
                                id: stored.profile?.id || stored.userId || null
                            };
                            chrome.storage.local.set({ profile: savedProfile });
                            if (profileDisplayEl) {
                                const avatarImg = profileDisplayEl.querySelector('img.root-profile-avatar') || profileDisplayEl.querySelector('img');
                                const usernameText = profileDisplayEl.querySelector('.root-profile-name') || profileDisplayEl.querySelector('div');
                                if (avatarImg) avatarImg.src = savedProfile.avatar || avatarImg.src;
                                if (usernameText) usernameText.textContent = savedProfile.username || usernameText.textContent;
                            }
                        });
                        setTimeout(removeProfilePanel, 800);
                    } else if (response?.reason === 'username_taken') {
                        statusText.textContent = 'Benutzername bereits vergeben.';
                    } else {
                        statusText.textContent = 'Save failed, try again.';
                    }
                });
            });

            const profileMeta = document.createElement('div');
            profileMeta.className = 'root-profile-panel-row';
            profileMeta.style.gap = '12px';
            profileMeta.appendChild(image);

            const metaText = document.createElement('div');
            metaText.className = 'root-profile-panel-user-text';
            const nameTitle = document.createElement('div');
            nameTitle.className = 'root-profile-panel-username';
            nameTitle.textContent = profile.username || 'New User';
            const nameStatus = document.createElement('div');
            nameStatus.className = 'root-profile-panel-user-status';
            nameStatus.textContent = profile.status ? `Status: ${profile.status}` : 'No status set';
            metaText.appendChild(nameTitle);
            metaText.appendChild(nameStatus);
            profileMeta.appendChild(metaText);

            bodyContainer.appendChild(profileMeta);
            bodyContainer.appendChild(createField('Username', usernameInput));
            bodyContainer.appendChild(createField('Description', bioInput));
            bodyContainer.appendChild(createField('Avatar URL', avatarInput));
            bodyContainer.appendChild(saveButton);
            bodyContainer.appendChild(statusText);
        };

        const renderFriendsTab = () => {
            const searchRow = document.createElement('div');
            searchRow.className = 'root-profile-panel-row';

            const searchInput = document.createElement('input');
            searchInput.className = 'root-profile-panel-input';
            searchInput.type = 'text';
            searchInput.placeholder = 'Search users';
            searchInput.style.flex = '1';

            const searchButton = document.createElement('button');
            searchButton.type = 'button';
            searchButton.className = 'root-profile-panel-close';
            searchButton.textContent = 'Search';
            searchButton.style.width = '110px';

            searchRow.appendChild(searchInput);
            searchRow.appendChild(searchButton);

            const searchResults = document.createElement('div');
            searchResults.className = 'root-profile-panel-list';

            const incomingTitle = document.createElement('div');
            incomingTitle.className = 'root-profile-panel-section-title';
            incomingTitle.textContent = 'Incoming requests';

            const incomingList = document.createElement('div');
            incomingList.className = 'root-profile-panel-list';

            const friendsTitle = document.createElement('div');
            friendsTitle.className = 'root-profile-panel-section-title';
            friendsTitle.textContent = 'Your friends';

            const friendsList = document.createElement('div');
            friendsList.className = 'root-profile-panel-list';

            const renderSearchResults = (users) => {
                searchResults.innerHTML = '';
                if (!users.length) {
                    const empty = document.createElement('div');
                    empty.className = 'root-profile-panel-empty';
                    empty.textContent = 'No users found';
                    searchResults.appendChild(empty);
                    return;
                }
                users.forEach((user) => {
                    const row = document.createElement('div');
                    row.className = 'root-profile-panel-row';

                    const userInfo = document.createElement('div');
                    userInfo.className = 'root-profile-panel-user';

                    const avatar = document.createElement('img');
                    avatar.className = 'root-profile-panel-thumb';
                    avatar.alt = user.username || 'User';
                    avatar.src = user.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#111"/></svg>');

                    const name = document.createElement('div');
                    name.className = 'root-profile-panel-user-text';
                    name.textContent = user.username || 'User';

                    const addButton = document.createElement('button');
                    addButton.type = 'button';
                    addButton.className = 'root-profile-panel-close';
                    addButton.textContent = 'Add';
                    addButton.addEventListener('click', () => {
                        chrome.runtime.sendMessage({ type: 'ADD_FRIEND', friendId: user.id }, (response) => {
                            if (response?.success) {
                                addButton.textContent = response.alreadyExists ? 'Pending' : 'Sent';
                                addButton.disabled = true;
                            }
                            refreshFriendPanel();
                        });
                    });

                    userInfo.appendChild(avatar);
                    userInfo.appendChild(name);
                    row.appendChild(userInfo);
                    row.appendChild(addButton);
                    searchResults.appendChild(row);
                });
            };

            const renderFriendLists = (friends, requests) => {
                incomingList.innerHTML = '';
                friendsList.innerHTML = '';

                if (!requests.length) {
                    const empty = document.createElement('div');
                    empty.className = 'root-profile-panel-empty';
                    empty.textContent = 'No incoming requests';
                    incomingList.appendChild(empty);
                } else {
                    requests.forEach((request) => {
                        const row = document.createElement('div');
                        row.className = 'root-profile-panel-row';

                        const userInfo = document.createElement('div');
                        userInfo.className = 'root-profile-panel-user';

                        const avatar = document.createElement('img');
                        avatar.className = 'root-profile-panel-thumb';
                        avatar.alt = request.profile?.username || 'User';
                        avatar.src = request.profile?.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#111"/></svg>');

                        const name = document.createElement('div');
                        name.className = 'root-profile-panel-user-text';
                        name.textContent = request.profile?.username || 'User';

                        const acceptButton = document.createElement('button');
                        acceptButton.type = 'button';
                        acceptButton.className = 'root-profile-panel-close';
                        acceptButton.textContent = 'Accept';
                        acceptButton.addEventListener('click', () => {
                            chrome.runtime.sendMessage({ type: 'ACCEPT_FRIEND_REQUEST', requesterId: request.profile?.id }, () => {
                                refreshFriendPanel();
                            });
                        });

                        const declineButton = document.createElement('button');
                        declineButton.type = 'button';
                        declineButton.className = 'root-profile-panel-close';
                        declineButton.textContent = 'Decline';
                        declineButton.addEventListener('click', () => {
                            chrome.runtime.sendMessage({ type: 'DECLINE_FRIEND_REQUEST', requesterId: request.profile?.id }, () => {
                                refreshFriendPanel();
                            });
                        });

                        userInfo.appendChild(avatar);
                        userInfo.appendChild(name);
                        row.appendChild(userInfo);
                        row.appendChild(acceptButton);
                        row.appendChild(declineButton);
                        incomingList.appendChild(row);
                    });
                }

                if (!friends.length) {
                    const empty = document.createElement('div');
                    empty.className = 'root-profile-panel-empty';
                    empty.textContent = 'No friends yet';
                    friendsList.appendChild(empty);
                } else {
                    friends.forEach((friend) => {
                        const row = document.createElement('div');
                        row.className = 'root-profile-panel-row';

                        const userInfo = document.createElement('div');
                        userInfo.className = 'root-profile-panel-user';

                        const avatar = document.createElement('img');
                        avatar.className = 'root-profile-panel-thumb';
                        avatar.alt = friend.username || 'Friend';
                        avatar.src = friend.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#111"/></svg>');

                        const name = document.createElement('div');
                        name.className = 'root-profile-panel-user-text';
                        name.textContent = friend.username || 'Friend';

                        const removeButton = document.createElement('button');
                        removeButton.type = 'button';
                        removeButton.className = 'root-profile-panel-close';
                        removeButton.textContent = 'Remove';
                        removeButton.addEventListener('click', () => {
                            chrome.runtime.sendMessage({ type: 'REMOVE_FRIEND', friendId: friend.id }, () => {
                                refreshFriendPanel();
                            });
                        });

                        userInfo.appendChild(avatar);
                        userInfo.appendChild(name);
                        row.appendChild(userInfo);
                        row.appendChild(removeButton);
                        friendsList.appendChild(row);
                    });
                }
            };

            const refreshFriendPanel = () => {
                chrome.runtime.sendMessage({ type: 'GET_FRIEND_DATA' }, (response) => {
                    renderFriendLists(response?.friends || [], response?.incomingRequests || []);
                });
            };

            searchButton.addEventListener('click', () => {
                const query = searchInput.value.trim();
                if (!query) {
                    return;
                }
                chrome.runtime.sendMessage({ type: 'SEARCH_USERS', query }, (response) => {
                    renderSearchResults(response?.users || []);
                });
            });

            bodyContainer.appendChild(searchRow);
            bodyContainer.appendChild(searchResults);
            bodyContainer.appendChild(incomingTitle);
            bodyContainer.appendChild(incomingList);
            bodyContainer.appendChild(friendsTitle);
            bodyContainer.appendChild(friendsList);

            refreshFriendPanel();
        };

        const renderShowTab = () => {
            const image = document.createElement('img');
            image.className = 'root-profile-panel-image';
            image.src = profile.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="60" fill="#111"/></svg>');
            image.alt = profile.username || 'Profile Preview';

            const username = document.createElement('div');
            username.className = 'root-profile-panel-username';
            username.textContent = profile.username || 'New User';

            const status = document.createElement('div');
            status.className = 'root-profile-panel-user-status';
            status.textContent = profile.status ? `Status: ${profile.status}` : 'Offline';

            const bio = document.createElement('div');
            bio.className = 'root-profile-panel-value';
            bio.textContent = profile.bio || 'No description provided.';

            bodyContainer.appendChild(image);
            bodyContainer.appendChild(username);
            bodyContainer.appendChild(status);
            bodyContainer.appendChild(bio);
        };

        profileTabButton.addEventListener('click', () => setActiveTab('Profile', profileTabButton));
        friendsTabButton.addEventListener('click', () => setActiveTab('Friends', friendsTabButton));
        showTabButton.addEventListener('click', () => setActiveTab('Show', showTabButton));

        card.appendChild(header);
        card.appendChild(tabRow);
        card.appendChild(bodyContainer);
        panel.appendChild(card);
        document.body.appendChild(panel);

        setActiveTab('Profile', profileTabButton);
    }

    function styleTabButton(btn) {
        btn.style.minWidth = '100px';
        btn.style.padding = '10px 14px';
        btn.style.border = 'none';
        btn.style.borderRadius = '10px';
        btn.style.background = '#404040';
        btn.style.color = '#ffffff';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = '600';
        btn.addEventListener('mouseenter', () => btn.style.background = '#505050');
        btn.addEventListener('mouseleave', () => btn.style.background = '#404040');
    }

    function formatChatTimestamp(value) {
        if (!value) {
            return '';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    function sanitizeChatSenderName(name) {
        if (!name) {
            return 'User';
        }

        const sanitized = String(name)
            .replace(/[^\u0000-\u007f]/g, '')
            .replace(/[^\n\w\s:.-]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return sanitized || 'User';
    }

    function renderPrivateChatMessages(messages) {
        if (!privateChatMessagesEl) {
            return;
        }

        privateChatMessagesEl.innerHTML = '';

        if (!messages.length) {
            const empty = document.createElement('div');
            empty.className = 'root-private-chat-empty';
            empty.textContent = 'No messages yet';
            privateChatMessagesEl.appendChild(empty);
            return;
        }

        messages.forEach((message) => {
            const item = document.createElement('div');
            item.className = 'root-private-chat-message' + (message.isSelf ? ' self' : '');

            const header = document.createElement('div');
            header.className = 'root-private-chat-message-header';

            const time = document.createElement('span');
            time.className = 'time';
            time.textContent = formatChatTimestamp(message.timestamp);

            const avatar = document.createElement('img');
            avatar.className = 'root-private-chat-avatar service';
            avatar.alt = message.senderName || 'User';
            avatar.src = message.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="12" fill="#d9fbe5"/></svg>');

            const sender = document.createElement('strong');
            sender.className = 'root-private-chat-sender';
            sender.textContent = message.isSelf ? 'You' : sanitizeChatSenderName(message.senderName || 'User');

            header.appendChild(time);
            header.appendChild(avatar);
            header.appendChild(sender);

            const body = document.createElement('div');
            body.className = 'root-private-chat-message-body';
            const text = document.createElement('span');
            text.className = 'text';
            text.textContent = message.content || '';
            body.appendChild(text);

            item.appendChild(header);
            item.appendChild(body);
            privateChatMessagesEl.appendChild(item);
        });

        privateChatMessagesEl.scrollTop = privateChatMessagesEl.scrollHeight;
    }

    function updatePrivateChatTitle(text) {
        if (privateChatTitleEl) {
            privateChatTitleEl.textContent = text || 'Private';
        }
    }

    function updatePrivateChatMenuBadge() {
        if (!privateChatMenuBadgeEl) {
            return;
        }
        if (!privateChatTotalPendingCount) {
            privateChatMenuBadgeEl.textContent = '';
            privateChatMenuBadgeEl.style.display = 'none';
            return;
        }
        privateChatMenuBadgeEl.textContent = String(privateChatTotalPendingCount);
        privateChatMenuBadgeEl.style.display = 'inline-flex';
    }

    function clearPrivateChatBadgeForFriend(friendId) {
        const count = privateChatPendingCounts[friendId] || 0;
        if (!count) {
            return;
        }
        privateChatTotalPendingCount = Math.max(0, privateChatTotalPendingCount - count);
        delete privateChatPendingCounts[friendId];
        updatePrivateChatMenuBadge();
    }

    function setPrivateChatLastSeenForFriend(friendId, timestamp) {
        if (!friendId || !timestamp) {
            return;
        }
        privateChatLastSeenTimestamps[friendId] = timestamp;
    }

    function showPrivateChatToast(message) {
        if (!message) {
            return;
        }
        if (!privateChatToastEl) {
            privateChatToastEl = document.createElement('div');
            privateChatToastEl.className = 'root-private-chat-toast';
            document.body.appendChild(privateChatToastEl);
        }
        privateChatToastEl.textContent = message;
        privateChatToastEl.classList.add('visible');
        if (privateChatNotificationTimeout) {
            window.clearTimeout(privateChatNotificationTimeout);
            privateChatNotificationTimeout = null;
        }
        privateChatNotificationTimeout = window.setTimeout(() => {
            if (privateChatToastEl) {
                privateChatToastEl.classList.remove('visible');
            }
            privateChatNotificationTimeout = null;
        }, 5000);
    }

    function playPrivateChatNotificationSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                return;
            }
            const context = new AudioContext();
            if (context.state === 'suspended') {
                context.resume().catch(() => { });
            }
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 440;
            gain.gain.value = 0.12;
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.12);
            oscillator.onended = () => {
                if (context.close) {
                    context.close();
                }
            };
        } catch (e) {
            // ignore audio errors
        }
    }

    function requestPrivateChatMessages(friendId) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_PRIVATE_CHAT_MESSAGES', friendId }, (response) => {
                const messages = Array.isArray(response?.messages) ? response.messages : [];
                resolve(messages);
            });
        });
    }

    function checkPrivateChatNotifications() {
        if (!privateChatPanelEl) {
            return;
        }
        loadCurrentProfile((profile) => {
            const currentUserId = profile?.id;
            if (!currentUserId) {
                return;
            }
            chrome.runtime.sendMessage({ type: 'GET_FRIEND_DATA' }, async (response) => {
                const friends = response?.friends || [];
                if (!friends.length) {
                    return;
                }
                const checks = friends.map((friend) => requestPrivateChatMessages(friend.id).then((messages) => ({ friend, messages })));
                const results = await Promise.all(checks);
                let badgeChanged = false;
                for (const { friend, messages } of results) {
                    const incomingMessages = messages.filter((m) => !m.isSelf);
                    if (!incomingMessages.length) {
                        continue;
                    }
                    const lastIncoming = incomingMessages[incomingMessages.length - 1];
                    const latestTs = new Date(lastIncoming.timestamp || lastIncoming.created_at).getTime() || 0;
                    const friendId = friend.id;
                    const lastSeenTs = privateChatLastSeenTimestamps[friendId];
                    const isChattingWithFriend = privateChatOpen && privateChatActiveFriend?.id === friendId;
                    if (isChattingWithFriend) {
                        setPrivateChatLastSeenForFriend(friendId, latestTs);
                        clearPrivateChatBadgeForFriend(friendId);
                        continue;
                    }
                    if (!lastSeenTs) {
                        setPrivateChatLastSeenForFriend(friendId, latestTs);
                        continue;
                    }
                    if (latestTs <= lastSeenTs) {
                        continue;
                    }
                    const newMessages = incomingMessages.filter((m) => {
                        const ts = new Date(m.timestamp || m.created_at).getTime() || 0;
                        return ts > lastSeenTs;
                    });
                    if (!newMessages.length) {
                        setPrivateChatLastSeenForFriend(friendId, latestTs);
                        continue;
                    }
                    setPrivateChatLastSeenForFriend(friendId, latestTs);
                    const count = newMessages.length;
                    privateChatPendingCounts[friendId] = (privateChatPendingCounts[friendId] || 0) + count;
                    privateChatTotalPendingCount += count;
                    badgeChanged = true;
                    const lastMessageText = newMessages[newMessages.length - 1].content || '';
                    showPrivateChatToast(`You got a new message: ${lastMessageText}`);
                    playPrivateChatNotificationSound();
                }
                if (badgeChanged) {
                    updatePrivateChatMenuBadge();
                }
            });
        });
    }

    function startPrivateChatNotificationMonitor() {
        if (privateChatMessageNotificationTimer) {
            return;
        }
        checkPrivateChatNotifications();
        privateChatMessageNotificationTimer = window.setInterval(checkPrivateChatNotifications, 5000);
    }

    function createPrivateChatBackButton() {
        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'root-private-chat-back';
        backButton.textContent = '← Back';
        backButton.addEventListener('click', renderPrivateChatMenu);
        return backButton;
    }

    function setPrivateChatBody(builder) {
        if (!privateChatBodyEl) {
            return;
        }
        privateChatBodyEl.innerHTML = '';
        if (typeof builder === 'function') {
            builder(privateChatBodyEl);
        }
    }

    function renderPrivateChatMenu() {
        updatePrivateChatTitle('Friends');
        privateChatActiveFriend = null;
        if (privateChatRefreshTimer) {
            window.clearInterval(privateChatRefreshTimer);
            privateChatRefreshTimer = null;
        }
        openPrivateFriendManager();
    }

    function openPrivateFriendManager() {
        loadCurrentProfile((profile) => {
            const currentUserId = profile?.id;
            if (!currentUserId) {
                updatePrivateChatTitle('Friends');
                setPrivateChatBody((body) => {
                    const empty = document.createElement('div');
                    empty.className = 'root-private-chat-empty';
                    empty.textContent = 'You must be logged in to manage friends.';
                    body.appendChild(empty);
                });
                return;
            }

            updatePrivateChatTitle('Friends');
            setPrivateChatBody((body) => {
                const searchRow = document.createElement('div');
                searchRow.className = 'root-private-chat-input-row';

                const searchInput = document.createElement('input');
                searchInput.className = 'root-private-chat-input';
                searchInput.type = 'text';
                searchInput.placeholder = 'Search friends...';
                searchInput.style.flex = '1';

                const searchButton = document.createElement('button');
                searchButton.type = 'button';
                searchButton.className = 'root-private-chat-send';
                searchButton.textContent = 'Search';

                searchRow.appendChild(searchInput);
                searchRow.appendChild(searchButton);

                const searchResults = document.createElement('div');
                searchResults.className = 'root-private-chat-list';

                const incomingTitle = document.createElement('div');
                incomingTitle.className = 'root-private-chat-section-title';
                incomingTitle.textContent = 'Friend requests';

                const incomingList = document.createElement('div');
                incomingList.className = 'root-private-chat-list';

                const friendsTitle = document.createElement('div');
                friendsTitle.className = 'root-private-chat-section-title';
                friendsTitle.textContent = 'Friends';

                const friendsList = document.createElement('div');
                friendsList.className = 'root-private-chat-list';

                const formatTimeAgo = (timestamp) => {
                    if (!timestamp) {
                        return 'Offline';
                    }
                    const diffMs = Date.now() - new Date(timestamp).getTime();
                    if (diffMs < 0) {
                        return 'Offline';
                    }
                    const seconds = Math.floor(diffMs / 1000);
                    const minutes = Math.floor(seconds / 60);
                    const hours = Math.floor(minutes / 60);
                    const parts = [];
                    if (hours) parts.push(`${hours}h`);
                    if (minutes % 60) parts.push(`${minutes % 60}m`);
                    if (seconds % 60) parts.push(`${seconds % 60}s`);
                    return parts.length ? `${parts.join(' ')} ago` : 'just now';
                };

                const renderStatusText = (profile) => {
                    const statusLine = document.createElement('div');
                    statusLine.className = 'root-private-chat-status-line';
                    statusLine.style.display = 'flex';
                    statusLine.style.alignItems = 'center';
                    statusLine.style.gap = '8px';
                    statusLine.style.fontSize = '12px';
                    statusLine.style.color = '#cbd5e1';

                    const indicator = document.createElement('span');
                    indicator.style.width = '10px';
                    indicator.style.height = '10px';
                    indicator.style.borderRadius = '50%';
                    indicator.style.display = 'inline-block';

                    const text = document.createElement('span');
                    if (profile.status && profile.status.startsWith('In room ')) {
                        indicator.style.background = '#22c55e';
                        text.textContent = profile.status;
                    } else if (profile.status === 'Online') {
                        indicator.style.background = '#22c55e';
                        text.textContent = 'Online';
                    } else {
                        indicator.style.background = '#ef4444';
                        text.textContent = profile.last_online ? `${formatTimeAgo(profile.last_online)}` : 'Offline';
                    }

                    statusLine.appendChild(indicator);
                    statusLine.appendChild(text);
                    return statusLine;
                };

                function renderSearchResults(users) {
                    searchResults.innerHTML = '';
                    if (!users.length) {
                        const empty = document.createElement('div');
                        empty.className = 'root-private-chat-empty';
                        empty.textContent = 'No users found';
                        searchResults.appendChild(empty);
                        return;
                    }

                    users.forEach((user) => {
                        const row = document.createElement('div');
                        row.className = 'root-private-chat-row';

                        const userInfo = document.createElement('div');
                        userInfo.className = 'root-private-chat-user';

                        const avatar = document.createElement('img');
                        avatar.className = 'root-private-chat-thumb';
                        avatar.alt = user.username || 'User';
                        avatar.src = user.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#d9fbe5"/></svg>');

                        const nameBlock = document.createElement('div');
                        nameBlock.className = 'root-private-chat-user-info';
                        const name = document.createElement('div');
                        name.textContent = user.username || 'User';
                        name.style.fontWeight = '700';

                        const statusText = document.createElement('div');
                        statusText.className = 'root-private-chat-empty';
                        statusText.textContent = user.status === 'Online' ? 'Online' : 'Offline';
                        statusText.style.fontSize = '12px';
                        statusText.style.color = '#94a3b8';

                        nameBlock.appendChild(name);
                        nameBlock.appendChild(statusText);

                        userInfo.appendChild(avatar);
                        userInfo.appendChild(nameBlock);

                        const addButton = document.createElement('button');
                        addButton.type = 'button';
                        addButton.className = 'root-private-chat-send';
                        addButton.textContent = 'Add';
                        addButton.addEventListener('click', () => {
                            chrome.runtime.sendMessage({ type: 'ADD_FRIEND', friendId: user.id }, (response) => {
                                if (response?.success) {
                                    addButton.textContent = response.alreadyExists ? 'Pending' : 'Sent';
                                    addButton.disabled = true;
                                }
                                refreshFriendManager();
                            });
                        });

                        row.appendChild(userInfo);
                        row.appendChild(addButton);
                        searchResults.appendChild(row);
                    });
                }

                function renderFriendLists(friends, requests) {
                    incomingList.innerHTML = '';
                    friendsList.innerHTML = '';

                    if (!requests.length) {
                        const empty = document.createElement('div');
                        empty.className = 'root-private-chat-empty';
                        empty.textContent = 'No incoming requests';
                        incomingList.appendChild(empty);
                    } else {
                        requests.forEach((request) => {
                            const row = document.createElement('div');
                            row.className = 'root-private-chat-row';

                            const userInfo = document.createElement('div');
                            userInfo.className = 'root-private-chat-user';

                            const avatar = document.createElement('img');
                            avatar.className = 'root-private-chat-thumb';
                            avatar.alt = request.profile?.username || 'User';
                            avatar.src = request.profile?.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#d9fbe5"/></svg>');

                            const nameBlock = document.createElement('div');
                            nameBlock.className = 'root-private-chat-user-info';
                            const name = document.createElement('div');
                            name.textContent = request.profile?.username || 'User';
                            name.style.fontWeight = '700';

                            const statusText = document.createElement('div');
                            statusText.className = 'root-private-chat-empty';
                            statusText.textContent = 'Friend request';
                            statusText.style.color = '#94a3b8';
                            statusText.style.fontSize = '12px';

                            nameBlock.appendChild(name);
                            nameBlock.appendChild(statusText);

                            userInfo.appendChild(avatar);
                            userInfo.appendChild(nameBlock);

                            const acceptButton = document.createElement('button');
                            acceptButton.type = 'button';
                            acceptButton.className = 'root-private-chat-send';
                            acceptButton.textContent = 'Accept';
                            acceptButton.addEventListener('click', () => {
                                chrome.runtime.sendMessage({ type: 'ACCEPT_FRIEND_REQUEST', requesterId: request.profile?.id }, () => {
                                    refreshFriendManager();
                                });
                            });

                            const declineButton = document.createElement('button');
                            declineButton.type = 'button';
                            declineButton.className = 'root-private-chat-send';
                            declineButton.textContent = 'Decline';
                            declineButton.addEventListener('click', () => {
                                chrome.runtime.sendMessage({ type: 'DECLINE_FRIEND_REQUEST', requesterId: request.profile?.id }, () => {
                                    refreshFriendManager();
                                });
                            });

                            row.appendChild(userInfo);
                            row.appendChild(acceptButton);
                            row.appendChild(declineButton);
                            incomingList.appendChild(row);
                        });
                    }

                    if (!friends.length) {
                        const empty = document.createElement('div');
                        empty.className = 'root-private-chat-empty';
                        empty.textContent = 'No friends yet';
                        friendsList.appendChild(empty);
                    } else {
                        friends.forEach((friend) => {
                            const row = document.createElement('div');
                            row.className = 'root-private-chat-row';

                            const userInfo = document.createElement('div');
                            userInfo.className = 'root-private-chat-user';

                            const avatar = document.createElement('img');
                            avatar.className = 'root-private-chat-thumb';
                            avatar.alt = friend.username || 'Friend';
                            avatar.src = friend.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#d9fbe5"/></svg>');

                            const nameBlock = document.createElement('div');
                            nameBlock.className = 'root-private-chat-user-info';
                            const name = document.createElement('div');
                            name.textContent = friend.username || 'Friend';
                            name.style.fontWeight = '700';

                            const statusLine = renderStatusText(friend);

                            nameBlock.appendChild(name);
                            nameBlock.appendChild(statusLine);

                            const removeButton = document.createElement('button');
                            removeButton.type = 'button';
                            removeButton.className = 'root-private-chat-send';
                            removeButton.textContent = 'Remove';
                            removeButton.addEventListener('click', () => {
                                chrome.runtime.sendMessage({ type: 'REMOVE_FRIEND', friendId: friend.id }, () => {
                                    refreshFriendManager();
                                });
                            });

                            userInfo.appendChild(avatar);
                            userInfo.appendChild(nameBlock);
                            row.appendChild(userInfo);
                            row.appendChild(removeButton);
                            friendsList.appendChild(row);
                        });
                    }
                }

                searchButton.addEventListener('click', () => {
                    const query = searchInput.value.trim();
                    if (!query) {
                        return;
                    }

                    chrome.runtime.sendMessage({ type: 'SEARCH_USERS', query, currentUserId }, (response) => {
                        renderSearchResults(response?.users || []);
                    });
                });

                body.appendChild(searchRow);
                body.appendChild(searchResults);
                body.appendChild(incomingTitle);
                body.appendChild(incomingList);
                body.appendChild(friendsTitle);
                body.appendChild(friendsList);
                body.appendChild(createPrivateChatBackButton());

                refreshFriendManager();
            });
        });
    }

    function openPrivateProfileEditor() {
        loadCurrentProfile((profile) => {
            const nextProfile = profile || {};
            updatePrivateChatTitle('Profile');
            setPrivateChatBody((body) => {
                const usernameLabel = document.createElement('div');
                usernameLabel.className = 'root-private-chat-section-title';
                usernameLabel.textContent = 'Username';

                const usernameInput = document.createElement('input');
                usernameInput.className = 'root-private-chat-input';
                usernameInput.type = 'text';
                usernameInput.value = nextProfile.username || '';

                const statusLabel = document.createElement('div');
                statusLabel.className = 'root-private-chat-section-title';
                statusLabel.textContent = 'Status';

                const statusSelect = document.createElement('select');
                statusSelect.className = 'root-private-chat-input';
                ['Online', 'Offline', 'Busy', 'Away', 'Idle'].forEach((value) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    if ((nextProfile.status || 'Offline') === value) {
                        option.selected = true;
                    }
                    statusSelect.appendChild(option);
                });

                const bioLabel = document.createElement('div');
                bioLabel.className = 'root-private-chat-section-title';
                bioLabel.textContent = 'Description';

                const bioInput = document.createElement('textarea');
                bioInput.className = 'root-private-chat-input';
                bioInput.rows = 4;
                bioInput.value = nextProfile.bio || '';

                const avatarLabel = document.createElement('div');
                avatarLabel.className = 'root-private-chat-section-title';
                avatarLabel.textContent = 'Avatar URL';

                const avatarInput = document.createElement('input');
                avatarInput.className = 'root-private-chat-input';
                avatarInput.type = 'text';
                avatarInput.value = nextProfile.avatar || '';

                const saveButton = document.createElement('button');
                saveButton.type = 'button';
                saveButton.className = 'root-private-chat-send';
                saveButton.textContent = 'Save';
                saveButton.addEventListener('click', () => {
                    const nextProfileData = {
                        username: usernameInput.value || 'New User',
                        bio: bioInput.value || '',
                        avatar: avatarInput.value || ''
                    };

                    chrome.runtime.sendMessage({
                        type: 'SAVE_PROFILE',
                        username: nextProfileData.username,
                        bio: nextProfileData.bio,
                        avatar: nextProfileData.avatar
                    }, (response) => {
                        if (response?.success) {
                            alert('Profile saved');
                            renderPrivateChatMenu();
                        } else {
                            alert('Profile saved locally');
                        }
                    });
                });

                body.appendChild(usernameLabel);
                body.appendChild(usernameInput);
                body.appendChild(statusLabel);
                body.appendChild(statusSelect);
                body.appendChild(bioLabel);
                body.appendChild(bioInput);
                body.appendChild(avatarLabel);
                body.appendChild(avatarInput);
                body.appendChild(saveButton);
                body.appendChild(createPrivateChatBackButton());
            });
        });
    }

    function openPrivateFriendChatSelector() {
        loadCurrentProfile((profile) => {
            const currentUserId = profile?.id;
            if (!currentUserId) {
                renderPrivateChatMenu();
                return;
            }

            updatePrivateChatTitle('Choose a friend');
            setPrivateChatBody((body) => {
                const friendList = document.createElement('div');
                friendList.className = 'root-private-chat-list';

                const help = document.createElement('div');
                help.className = 'root-private-chat-empty';
                help.textContent = 'Select a friend to start a private chat.';
                body.appendChild(help);
                body.appendChild(friendList);
                body.appendChild(createPrivateChatBackButton());

                chrome.runtime.sendMessage({ type: 'GET_FRIEND_DATA' }, (response) => {
                    const friends = response?.friends || [];
                    friendList.innerHTML = '';
                    if (!friends.length) {
                        const empty = document.createElement('div');
                        empty.className = 'root-private-chat-empty';
                        empty.textContent = 'No friends available';
                        friendList.appendChild(empty);
                        return;
                    }

                    friends.forEach((friend) => {
                        const row = document.createElement('div');
                        row.className = 'root-private-chat-row';

                        const userInfo = document.createElement('div');
                        userInfo.className = 'root-private-chat-user';

                        const avatar = document.createElement('img');
                        avatar.className = 'root-private-chat-thumb';
                        avatar.alt = friend.username || 'Friend';
                        avatar.src = friend.avatar || 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#d9fbe5"/></svg>');

                        const name = document.createElement('div');
                        name.textContent = friend.username || 'Friend';

                        userInfo.appendChild(avatar);
                        userInfo.appendChild(name);

                        row.appendChild(userInfo);
                        row.addEventListener('click', () => openPrivateChatWithFriend(friend));
                        friendList.appendChild(row);
                    });
                });
            });
        });
    }

    function openPrivateChatWithFriend(friend) {
        clearPrivateChatBadgeForFriend(friend.id);
        privateChatActiveFriend = friend;
        updatePrivateChatTitle(`Private Chat with ${friend.username || 'Friend'}`);
        setPrivateChatBody((body) => {
            const messagesList = document.createElement('div');
            messagesList.className = 'root-private-chat-list';

            const inputRow = document.createElement('div');
            inputRow.className = 'root-private-chat-input-row';

            const input = document.createElement('textarea');
            input.className = 'root-private-chat-textarea';
            input.placeholder = 'Type here to chat';
            input.setAttribute('data-placeholder-text', 'typeHereToChat');
            input.maxLength = 300;
            input.rows = 3;
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendPrivateChatMessage();
                }
            });

            const sendButton = document.createElement('button');
            sendButton.type = 'button';
            sendButton.className = 'root-private-chat-send';
            sendButton.textContent = 'Send';
            sendButton.addEventListener('click', sendPrivateChatMessage);

            const status = document.createElement('div');
            status.className = 'root-private-chat-status';
            status.textContent = 'Ready';

            inputRow.appendChild(input);
            inputRow.appendChild(sendButton);

            body.appendChild(messagesList);
            body.appendChild(inputRow);
            body.appendChild(status);

            privateChatMessagesEl = messagesList;
            privateChatInputEl = input;
            privateChatStatusEl = status;
        });

        loadPrivateChatMessages();
        if (!privateChatRefreshTimer) {
            privateChatRefreshTimer = window.setInterval(() => {
                if (privateChatOpen && privateChatActiveFriend) {
                    loadPrivateChatMessages();
                }
            }, 5000);
        }
    }

    function loadPrivateChatMessages() {
        if (!privateChatActiveFriend) {
            renderPrivateChatMenu();
            return;
        }

        chrome.runtime.sendMessage({
            type: 'GET_PRIVATE_CHAT_MESSAGES',
            friendId: privateChatActiveFriend.id
        }, (response) => {
            const messages = Array.isArray(response?.messages) ? response.messages : [];
            renderPrivateChatMessages(messages);
            if (privateChatActiveFriend) {
                const incomingMessages = messages.filter((m) => !m.isSelf);
                if (incomingMessages.length) {
                    const lastIncoming = incomingMessages[incomingMessages.length - 1];
                    const lastSeenTs = new Date(lastIncoming.timestamp || lastIncoming.created_at).getTime() || 0;
                    setPrivateChatLastSeenForFriend(privateChatActiveFriend.id, lastSeenTs);
                }
                clearPrivateChatBadgeForFriend(privateChatActiveFriend.id);
            }
        });
    }

    function sendPrivateChatMessage() {
        if (!privateChatInputEl || !privateChatActiveFriend) {
            return;
        }

        const value = privateChatInputEl.value.trim();
        if (!value) {
            return;
        }

        privateChatStatusEl.textContent = 'Sending…';
        chrome.runtime.sendMessage({
            type: 'SEND_PRIVATE_CHAT_MESSAGE',
            recipientId: privateChatActiveFriend.id,
            content: value
        }, (response) => {
            if (response?.success) {
                privateChatInputEl.value = '';
                privateChatStatusEl.textContent = 'Sent';
                loadPrivateChatMessages();
            } else {
                privateChatStatusEl.textContent = 'Could not send';
            }
        });
    }

    function ensurePrivateChatPanelHost() {
        if (privateChatHostEl && privateChatHostEl.isConnected) {
            return privateChatHostEl;
        }

        const host = document.createElement('div');
        host.id = 'jklm-overlay-private-chat-host';
        host.className = 'root-private-chat-host';
        document.body.appendChild(host);
        privateChatHostEl = host;
        return host;
    }

    function positionPrivateChatPanel() {
        if (!privateChatPanelEl) {
            return;
        }

        // Position the panel on the right side like the site chat pane.
        // Compute top from the tabs container bottom if available so it aligns below the tab row.
        const tabsContainer = findTabContainer();
        let top = 64; // fallback
        if (tabsContainer) {
            try {
                const r = tabsContainer.getBoundingClientRect();
                top = Math.round(r.bottom);
            } catch (e) {
                // ignore
            }
        }

        privateChatPanelEl.style.right = '0px';
        privateChatPanelEl.style.left = 'auto';
        privateChatPanelEl.style.top = `${top}px`;
    }

    function closePrivateChatPanel(restoreHidden = true) {
        if (!privateChatPanelEl) return;
        if (!privateChatPanelEl.classList.contains('hidden')) {
            privateChatPanelEl.classList.add('hidden');
        }
        if (!privateChatPanelEl.hasAttribute('hidden')) {
            privateChatPanelEl.setAttribute('hidden', '');
        }
        if (privateChatRefreshTimer) {
            window.clearInterval(privateChatRefreshTimer);
            privateChatRefreshTimer = null;
        }
        privateChatOpen = false;
        if (privateChatButtonEl && privateChatButtonEl.classList.contains('active')) {
            privateChatButtonEl.classList.remove('active');
        }
    }

    function closeOtherActivePanels() {
        try {
            const tabsContainer = findTabContainer();
            if (tabsContainer) {
                const buttons = tabsContainer.querySelectorAll('a.active');
                buttons.forEach((btn) => {
                    if (!btn) return;
                    if (btn.classList.contains('privateChat') || btn.classList.contains('privatecHAT')) return;
                    btn.classList.remove('active');
                });
            }
        } catch (e) {
            // no-op on errors
        }
    }

    function togglePrivateChat() {
        if (!privateChatPanelEl) {
            return;
        }
        // Legacy toggle kept for compatibility; delegate to open/close helpers
        if (privateChatOpen) {
            closePrivateChatPanel();
        } else {
            openPrivateChatPanel();
        }
    }

    function openPrivateChatPanel() {
        if (!privateChatPanelEl) return;
        privateChatPanelEl.classList.remove('hidden');
        privateChatPanelEl.removeAttribute('hidden');
        positionPrivateChatPanel();
        privateChatOpen = true;
        privateChatActiveFriend = null;
        if (privateChatButtonEl && !privateChatButtonEl.classList.contains('active')) {
            privateChatButtonEl.classList.add('active');
        }
        if (privateChatRefreshTimer) {
            window.clearInterval(privateChatRefreshTimer);
            privateChatRefreshTimer = null;
        }
        renderPrivateChatMenu();
    }

    function ensurePrivateChatButton() {
        try {
            console.log('[JKLM Overlay] ensurePrivateChatButton() called');

            const tabsContainer = findTabContainer();
            if (!tabsContainer) {
                console.log('[JKLM Overlay] ensurePrivateChatButton: tabs container not found');
                return;
            }

            // Ensure only one shell exists; remove any stray shells not inside the tabs container
            try {
                const allShells = Array.from(document.querySelectorAll('.root-private-chat-shell'));
                for (const s of allShells) {
                    if (!tabsContainer.contains(s)) {
                        try { s.remove(); } catch (e) { }
                    }
                }
            } catch (e) { }

            // If we've already created the shell and panel, ensure references and position, then return
            if (privateChatShellEl && privateChatShellEl.isConnected) {
                positionPrivateChatPanel();
                return;
            }

            const referenceButton = tabsContainer.querySelector('a.chat, a.room, a.changeGame, a.leaveRoom, a.settings');
            const referenceStyle = referenceButton ? window.getComputedStyle(referenceButton) : null;

            const privateChatShell = document.createElement('div');
            privateChatShell.className = 'root-private-chat-shell';

            const privateChatButton = document.createElement('a');
            privateChatButton.href = '#';
            privateChatButton.className = 'privateChat';
            privateChatButton.title = 'Private Chat';
            privateChatButton.setAttribute('role', 'button');
            privateChatButton.setAttribute('data-title-text', 'privateChat');
            privateChatButton.textContent = '🔐';

            // Mirror visual style of reference tab button so it looks native
            try {
                if (referenceStyle) {
                    privateChatButton.style.display = referenceStyle.display || 'block';
                    privateChatButton.style.padding = referenceStyle.padding || '6.66667px';
                    privateChatButton.style.color = referenceStyle.color || 'rgb(170, 170, 170)';
                    privateChatButton.style.borderRadius = referenceStyle.borderRadius || '0px';
                    privateChatButton.style.fontSize = referenceStyle.fontSize || '13.3333px';
                    privateChatButton.style.lineHeight = referenceStyle.lineHeight || '17.3333px';
                    privateChatButton.style.textDecoration = referenceStyle.textDecoration || 'none';
                    privateChatButton.style.cursor = referenceStyle.cursor || 'pointer';
                    privateChatButton.style.width = '57.68px';
                    privateChatButton.style.height = '42.46px';
                    privateChatButton.style.boxSizing = 'border-box';
                    privateChatButton.style.textAlign = 'center';
                }
            } catch (e) { }

            const handlePrivateChatButtonClick = (event) => {
                try {
                    event.preventDefault();
                    event.stopPropagation();
                    if (event.stopImmediatePropagation) {
                        event.stopImmediatePropagation();
                    }
                } catch (e) { }

                try {
                    openPrivateChatPanel();
                } catch (e) { }
            };

            privateChatButton.addEventListener('click', handlePrivateChatButtonClick, { capture: true });

            // mimic hover/active state for better native feel
            privateChatButton.addEventListener('mouseenter', () => privateChatButton.classList.add('hover'));
            privateChatButton.addEventListener('mouseleave', () => privateChatButton.classList.remove('hover'));

            privateChatShell.appendChild(privateChatButton);

            // create panel host and panel
            const privateChatPanelHost = ensurePrivateChatPanelHost();
            const privateChatPanel = document.createElement('div');
            privateChatPanel.className = 'log darkScrollbar root-private-chat-panel hidden';
            privateChatPanel.setAttribute('data-root-private-chat-panel', 'true');

            const header = document.createElement('div');
            header.className = 'root-private-chat-header';

            const title = document.createElement('div');
            title.className = 'root-private-chat-title';
            title.textContent = 'Private';

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'root-private-chat-close';
            closeButton.textContent = '×';
            closeButton.addEventListener('click', () => closePrivateChatPanel());

            header.appendChild(title);
            header.appendChild(closeButton);

            const body = document.createElement('div');
            body.className = 'root-private-chat-body';

            privateChatPanel.appendChild(header);
            privateChatPanel.appendChild(body);

            privateChatPanelHost.appendChild(privateChatPanel);

            // set references
            privateChatShellEl = privateChatShell;
            privateChatButtonEl = privateChatButton;
            privateChatPanelEl = privateChatPanel;
            privateChatTitleEl = title;
            privateChatBodyEl = body;
            privateChatMessagesEl = null;
            privateChatInputEl = null;
            privateChatStatusEl = null;
            positionPrivateChatPanel();

            // Insert the shell into the site's tab/bar container as a native-looking child.
            // Appending at the end avoids shifting existing site tab indexes and preserves native mapping.
            try {
                tabsContainer.appendChild(privateChatShell);
                privateChatShell.style.position = 'relative';
                privateChatShell.style.display = 'inline-block';
                privateChatShell.style.verticalAlign = 'top';
            } catch (e) {
                // fallback: append to host if insertion fails
                try {
                    const host = ensurePrivateChatPanelHost();
                    host.appendChild(privateChatShell);
                } catch (e2) { }
            }

            // Attach listener on the tabs container so clicks on site tab buttons close our panel
            try {
                if (tabsContainer && !tabsContainer.dataset.jklmOverlayListener) {
                    tabsContainer.addEventListener('click', (ev) => {
                        if (!privateChatOpen) return;
                        const target = ev.target;
                        if (target.closest && target.closest('.root-private-chat-shell')) {
                            return;
                        }
                        const clickedTab = target.closest && target.closest('a.chat, a.room, a.changeGame, a.leaveRoom, a.settings');
                        if (!clickedTab) {
                            return;
                        }
                        closePrivateChatPanel(true);
                        if (privateChatButtonEl) {
                            privateChatButtonEl.classList.remove('active');
                        }
                        setTimeout(scheduleCheck, 20);
                    }, true);
                    tabsContainer.dataset.jklmOverlayListener = '1';
                    startPrivateChatNotificationMonitor();
                }
            } catch (e) { }

            console.log('[JKLM Overlay] ensurePrivateChatButton() completed');
        } catch (err) {
            console.error('[JKLM Overlay] Error in ensurePrivateChatButton():', err);
        }
    }

    function ensureFooter() {
        try {
            if (!isHomePage()) {
                removeFooter();
                removeProfilePopup();
                return;
            }

            const linksContainer = findLinksContainer();
            if (!linksContainer) {
                console.log('[JKLM Overlay] Links container not found');
                removeFooter();
                return;
            }

            if (footerEl && footerEl.parentNode) {
                console.log('[JKLM Overlay] Footer already exists');
                return;
            }

            const faqLink = linksContainer.querySelector('a[href="https://jklm.fun/faq"], a[href="/faq"]');
            if (!faqLink) {
                console.log('[JKLM Overlay] FAQ link not found');
                return;
            }

            footerEl = document.createElement('div');
            footerEl.id = FOOTER_ID;
            footerEl.className = 'root-credit';
            footerEl.style.marginTop = '8px';
            footerEl.style.fontSize = '13px';
            footerEl.style.lineHeight = '1.5';
            footerEl.textContent = FOOTER_TEXT;

            discordEl = document.createElement('div');
            discordEl.className = 'root-discord';
            discordEl.style.marginTop = '4px';
            discordEl.style.display = 'flex';
            discordEl.style.alignItems = 'center';
            discordEl.style.gap = '6px';

            const discordLink = document.createElement('a');
            discordLink.href = DISCORD_URL;
            discordLink.target = '_blank';
            discordLink.rel = 'noopener noreferrer';
            discordLink.className = 'root-discord-link';
            discordLink.style.color = 'inherit';
            discordLink.style.textDecoration = 'none';

            const discordIcon = document.createElement('img');
            discordIcon.src = DISCORD_ICON_URL;
            discordIcon.alt = 'Discord';
            discordIcon.width = 16;
            discordIcon.height = 16;
            discordIcon.style.display = 'block';
            discordIcon.style.verticalAlign = 'middle';

            const discordText = document.createElement('a');
            discordText.href = 'https://discord.gg/D95sGYRPrU';
            discordText.target = '_blank';
            discordText.rel = 'noopener noreferrer';
            discordText.textContent = 'Discord';

            discordEl.appendChild(discordIcon);
            discordEl.appendChild(discordText);

            faqLink.insertAdjacentElement('afterend', footerEl);
            footerEl.insertAdjacentElement('afterend', discordEl);

            console.log('[JKLM Overlay] Footer created successfully');
        } catch (err) {
            console.error('[JKLM Overlay] Error in ensureFooter():', err);
        }
    }

    function removeFooter() {
        if (footerEl && footerEl.parentNode) {
            footerEl.remove();
        }
        if (discordEl && discordEl.parentNode) {
            discordEl.remove();
        }
        footerEl = null;
        discordEl = null;
    }

    function removeProfileDisplay() {
        if (profileDisplayEl && profileDisplayEl.parentNode) {
            profileDisplayEl.remove();
        }
        profileDisplayEl = null;
    }

    function removeProfileButton() {
        const profileButton = document.getElementById('loginButton');
        if (profileButton && profileButton.parentNode) {
            profileButton.remove();
        }
    }

    function removeProfilePopup() {
        removeProfilePanel();
    }

    function removeProfilePanel() {
        const panel = document.querySelector('.root-profile-panel-overlay');
        if (panel && panel.parentNode) {
            panel.remove();
        }
    }

    function runCheck() {
        console.log('[JKLM Overlay] runCheck() called');
        console.log('[JKLM Overlay] isTargetSite():', isTargetSite());
        console.log('[JKLM Overlay] isHomePage():', isHomePage());
        console.log('[JKLM Overlay] isGameSessionPage():', isGameSessionPage());

        if (!isTargetSite()) {
            console.log('[JKLM Overlay] Not target site, removing elements');
            removeFooter();
            removeProfileDisplay();
            removeProfilePopup();
            removeProfileButton();
            return;
        }

        if (isGameSessionPage()) {
            console.log('[JKLM Overlay] Game session page, showing only chat');
            removeFooter();
            removeProfileDisplay();
            removeProfilePopup();
            removeProfileButton();
            ensurePrivateChatButton();
            return;
        }

        console.log('[JKLM Overlay] Ensuring chat button');
        ensurePrivateChatButton();

        if (isHomePage()) {
            console.log('[JKLM Overlay] Home page, ensuring footer, profile display, and profile button');
            ensureProfileDisplay();
            ensureFooter();
            ensureProfileButton();
        } else {
            console.log('[JKLM Overlay] Not home page, removing footer and profile button');
            removeProfileDisplay();
            removeFooter();
            removeProfileButton();
        }
    }

    function scheduleCheck() {
        if (scheduledCheck) {
            clearTimeout(scheduledCheck);
        }
        scheduledCheck = window.setTimeout(runCheck, 120);
    }

    function observeDomChanges() {
        if (observer) {
            return;
        }

        observer = new MutationObserver(() => {
            scheduleCheck();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function watchSitePanelVisibility() {
        if (window.__jklmOverlayPanelObserver) return;

        const panelObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                if (m.type === 'attributes') {
                    const target = m.target;
                    if (!(target instanceof Element)) continue;
                    // interested in panels
                    if (!target.matches || !(target.matches('div.pane') || target.matches('div.chat.pane') || target.matches('div.chat') || target.matches('.setting'))) continue;
                    try {
                        const style = window.getComputedStyle(target);
                        const isVisible = style && style.display !== 'none' && style.visibility !== 'hidden' && Number((style.opacity || '1')) > 0;
                        if (isVisible) {
                            // if a site panel became visible, close our private panel
                            if (privateChatOpen) {
                                // site opened a panel; close our panel but don't restore hidden panes
                                closePrivateChatPanel(false);
                            }
                            return;
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
                    for (const node of Array.from(m.addedNodes)) {
                        if (!(node instanceof Element)) continue;
                        if (!node.matches) continue;
                        if (node.matches('div.pane') || node.matches('div.chat.pane') || node.matches('div.chat') || node.matches('.setting')) {
                            try {
                                const style = window.getComputedStyle(node);
                                if (style && style.display !== 'none' && style.visibility !== 'hidden') {
                                    if (privateChatOpen) closePrivateChatPanel(false);
                                    return;
                                }
                            } catch (e) { }
                        }
                    }
                }
            }
        });

        panelObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['hidden', 'class', 'style'], subtree: true, childList: true });
        window.__jklmOverlayPanelObserver = panelObserver;
    }

    function observeUrlChanges() {
        const originalPushState = history.pushState;
        history.pushState = function patchedPushState() {
            const result = originalPushState.apply(this, arguments);
            scheduleCheck();
            return result;
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = function patchedReplaceState() {
            const result = originalReplaceState.apply(this, arguments);
            scheduleCheck();
            return result;
        };

        window.addEventListener('popstate', () => scheduleCheck());
        window.addEventListener('visibilitychange', () => scheduleCheck());
    }

    function init() {
        if (!document.body) {
            window.addEventListener('DOMContentLoaded', init, { once: true });
            return;
        }

        observeDomChanges();
        observeUrlChanges();
        watchSitePanelVisibility();
        runCheck();
    }

    init();

    console.log('[JKLM Overlay] Content script loaded successfully');
})();
