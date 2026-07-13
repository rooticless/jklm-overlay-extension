async function loadProfile() {
    chrome.storage.local.get(["profile"], (data) => {
        const profile = data.profile || null;

        if (profile && (profile.username || profile.bio || profile.avatar || profile.status)) {
            document.getElementById("username").value = profile.username || "";
            document.getElementById("bio").value = profile.bio || "";
            document.getElementById("avatar").value = profile.avatar || "";
            return;
        }

        chrome.runtime.sendMessage(
            {
                type: "GET_PROFILE"
            },
            (response) => {
                const remoteProfile = response?.profile;
                if (!remoteProfile) return;

                document.getElementById("username").value = remoteProfile.username || "";
                document.getElementById("bio").value = remoteProfile.bio || "";
                document.getElementById("avatar").value = remoteProfile.avatar || "";
            }
        );
    });
}

const saveButton = document.getElementById("save");
if (saveButton) {
    saveButton.onclick = () => {
        const username = document.getElementById("username").value;
        const bio = document.getElementById("bio").value;
        const avatar = document.getElementById("avatar").value;

        chrome.runtime.sendMessage(
            {
                type: "SAVE_PROFILE",
                username: username,
                bio: bio,
                avatar: avatar
            },
            (response) => {
                if (response?.success) {
                    chrome.storage.local.set({
                        profile: {
                            username,
                            bio,
                            avatar
                        }
                    });
                    alert("Profile saved!");
                } else if (response?.reason === 'username_taken') {
                    alert("Dieser Benutzername ist bereits vergeben. Bitte wähle einen anderen Namen.");
                } else {
                    chrome.storage.local.set({
                        profile: {
                            username,
                            bio,
                            avatar
                        }
                    });
                    alert("Saved locally. Reload to sync.");
                }
            }
        );
    };
}

loadProfile();