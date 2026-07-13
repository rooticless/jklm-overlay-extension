// Authentication has been replaced with a local generated user ID flow.
// This file intentionally provides no email/password login logic.

async function getCurrentUserId() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['userId'], (result) => resolve(result.userId || null));
    });
}
