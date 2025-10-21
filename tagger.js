/**
 * Tagger - Simple user tagging
 * @version 1.3.1
 * @namespace tagger
 */

/**
 * The Tagger module for user tagging functionality.
 */
const tagger = {
    /**
     * Lock to prevent concurrent remote sync operations.
     * @type {boolean}
     */
    SYNC_LOCK: false,

    /**
     * The main callback function for Tagger events.
     * @type {Function|null}
     */
    mainCallback: null,

    /**
     * Initializes the Tagger module.
     * Binds events and triggers the reload function.
     * @returns {Promise<void>}
     */
    _init: async function () {
        // Bail out if user is a bot
        if (this.utilIsBot()) {
            console.log("[Tagger] Bypassed.");
            return;
        }

        // Check if remoteSync is enabled
        let userExists = await this.userExists();
        const remoteSyncEnabled = window?.taggerConfig?.remoteSync && window?.taggerConfig?.remoteEndpoint;
        if (remoteSyncEnabled) {
            try {
                if (userExists) {
                    console.log("[Tagger] Syncing existing user data...");
                } else {
                    console.log("[Tagger] No existing user. Syncing user...");
                }

                await this._syncRemoteData();
            } catch (error) {
                console.error("[Tagger] Remote sync error during init: ", error);
                console.log("[Tagger] Proceeding with local data only.");
            }
        }

        // Retrieve or Create the user ID and store it in the global scope
        const userID = await this._retrieveUserID();
        window.taggerUserID = userID;

        console.log("[Tagger] UserID:", userID);

        // Prepare user params
        window.taggerUserParams = this.getUserParams();

        // Wait for document ready
        document.addEventListener("DOMContentLoaded", async () => {
            setTimeout(async () => {
                this.triggerEvent(window, "tagger:init", [userID]);
                await this.reload();
            }, 100);
        });

        // Set auto sync interval if enabled
        const autoSyncInterval = window?.taggerConfig?.autoSyncInterval ?? 0;
        if (autoSyncInterval > 0) {
            console.log(`[Tagger] Auto sync enabled every ${autoSyncInterval} ms.`);
            setInterval(async () => {
                await this._syncRemoteData();
            }, autoSyncInterval);
        }

        console.log("[Tagger] Ready!");
        window.taggerReady = true;
    },

    //-----------------------------
    // Callback functions
    //-----------------------------

    /**
     * Binds events for the Tagger module.
     */
    _bindEvents: function () {
        const that = this;

        /**  .tg-form-submit */
        // Fires on the submit of any form with the class .tg-form-submit
        const formSubmit = document.querySelectorAll(".tg-form-submit");
        formSubmit.forEach((form) => {
            form.addEventListener("submit", function (event) {
                that.fireCallback("tagger-submit", event);
            });
        });

        /**  .tg-child-conv-click */
        // Fires on a click of any 'a' elements that are direct children of .tg-child-conv-click
        const swapLinks = document.querySelectorAll(".tg-swap-child-href>a");
        swapLinks.forEach((link) => {
            link.classList.add("tg-conv-click");
        });

        /**  .tg-conv-click */
        // Fires on a click of any element with the class .tg-conv-click
        document.body.addEventListener("click", function (event) {
            if (event.target.closest(".tg-conv-click")) {
                // Do parameter swapping on click and fire the callback
                that.doParamsSwap();
                that.fireCallback("tagger-click", event);
            }
        });
        // Detect middle click as well
        document.body.addEventListener("mousedown", function (event) {
            if (event.button === 1 && event.target.closest(".tg-conv-click")) {
                // Middle click
                that.doParamsSwap();
                that.fireCallback("tagger-click", event);
            }
        });

        /**  updated */
        // Reload tagger whenever an "updated" event happens on window
        // We should trigger only once as this event will be registered again on reload
        window.addEventListener(
            "updated",
            function handler() {
                window.removeEventListener("updated", handler);
                setTimeout(async () => {
                    await that.reload();
                }, 100);
            },
            { once: true },
        );
    },

    /**
     * Registers a callback function for the Tagger module.
     * Fires after doParamsSwap is called.
     *
     * @param {Function} callback - The callback function to register.
     * @returns {boolean} - Returns true if the callback is successfully registered, false otherwise.
     */
    registerCallback: function (callback) {
        if (typeof callback === "function") {
            this.mainCallback = callback;
            return true;
        }
        console.error("[Tagger] Invalid callback", callback);
        return false;
    },

    /**
     * Fires the registered callback function with the specified event and data.
     * @param {string} eventName - The event name.
     * @param {any} data - The data to pass to the callback function.
     */
    fireCallback: function (eventName, data) {
        if (typeof this.mainCallback === "function") {
            this.mainCallback(eventName, data);
        } else {
            console.error("[Tagger] No callback function registered!");
        }
    },

    //-----------------------------
    // User ID functions
    //-----------------------------

    /**
     * Checks if a user ID exists in the Tagger storage.
     * @returns {boolean} - Returns true if a user ID exists, false otherwise.
     */
    userExists: async function () {
        return (await this._retrieveUserID(false)) !== null;
    },

    /**
     * Retrieves the user ID from the local storage.
     * If the user ID does not exist, creates a new one and stores it in the local storage.
     * Triggers the "tagger:userIDCreated" event when a new user ID is created.
     * @returns {string} - The user ID.
     */
    getUserID() {
        return window.taggerUserID;
    },

    /**
     * Retrieves the user ID from the local storage.
     * If the user ID does not exist, creates a new one and stores it in the local storage.
     * Triggers the "tagger:userIDCreated" event when a new user ID is created.
     * @param {boolean} [autoCreate=true] - Whether to create a new user ID if it does not exist.
     * @returns {Promise<string>} - The user ID.
     */
    _retrieveUserID: async function (autoCreate = true) {
        // Get the user ID from the local storage
        let userID = this.getData("userID");
        if (!userID && autoCreate) {
            const prefix = window?.taggerConfig?.prefix ?? "tg-";
            const currentTime = new Date().getTime();
            userID = await this.createNewUserID(prefix);

            this.storeData("userID", userID);
            this.storeData("userCreateTime", currentTime);
            this.storeData("updatedTime", currentTime);

            // Set timestamp in global scope
            this.setUserParam("timestamp", currentTime, false);

            console.log("[Tagger] UserID Created");
            this.triggerEvent(window, "tagger:userIDCreated", [userID]);

            // SYNC with remote after creating new user
            this._syncRemoteData();
        }
        return userID;
    },

    /**
     * Creates a new user ID based on the IP, user agent, and current time.
     * @param {string} [prefix] - The prefix to prepend to the user ID.
     * @returns {Promise<string>} - The new user ID.
     */
    createNewUserID: async function (prefix) {
        // Create a new user ID based on it's IP, user agent, and current time
        let ip = await this.utilGetUserIp();
        let userAgent = navigator.userAgent;
        let currentTime = new Date().getTime();

        let userID = ip + userAgent + currentTime;
        userID = await this.utilSHA1(userID);
        return (prefix ?? "") + userID;
    },

    //-----------------------------
    // User parameters functions
    //-----------------------------

    /**
     * Returns the stored user parameters from the tagger storage or URL.
     * @returns {object} - The user parameters.
     */
    getUserParams: function () {
        // Get the external parameters
        let params = new URLSearchParams(window.location.search);
        let userParams = window?.taggerConfig?.userParams ?? ["utm_source", "utm_medium", "utm_campaign", "utm_term", "gclid", "gbraid", "fbclid", "ref"];

        // Fallback for older versions
        if (!userParams && window?.taggerConfig?.userURLParams) {
            userParams = window.taggerConfig.userURLParams;
        }

        // Try to retrieve the params from the Storage first
        let storedParams = this.getData("userParams");

        // Fallback for older versions
        if (!storedParams) {
            storedParams = this.getData("userURLParams");
        }

        // Initialize if not found
        if (!storedParams || typeof storedParams !== "object") {
            storedParams = {};
        }

        let updated = false;

        // Retrieve the external parameters from the URL and merge only missing ones
        userParams.forEach((param) => {
            if (params.has(param) && !(param in storedParams)) {
                storedParams[param] = params.get(param);
                updated = true;
            }
        });

        // Store timestamp
        if (!storedParams["timestamp"]) {
            storedParams["timestamp"] = new Date().getTime();
            updated = true;
        }

        // Params can also be stored individually in a cookie
        // Using the __tg-param-{{NAME}} format. So we need to read all
        // matching cookies and merge them into the storedParams object
        const cookies = document.cookie.split("; ");
        cookies.forEach((cookie) => {
            let [key, value] = cookie.split("=");

            // Check if the cookie is a tagger param
            if (!key.startsWith("__tg-param-")) return;

            const cleanKey = key.trim().replace(/^__tg-param-/, "");

            // If we already have the key in the storedParams, skip it
            if (!cleanKey || cleanKey in storedParams) return;

            // Decode from base64
            try {
                value = atob(decodeURIComponent(value).trim());
                storedParams[cleanKey] = value;
                updated = true;
            } catch (e) {
                console.error("[Tagger] Error decoding cookie value: ", e);
            }
        });

        // If we've added or updated anything, save it
        if (updated) {
            this.storeData("userParams", storedParams);
            this.storeData("updatedTime", new Date().getTime());
        }

        return storedParams;
    },

    /**
     * Returns a specific user parameter from the tagger storage or URL.
     * @param {string} param - The parameter to retrieve.
     * @returns {string} - The user parameter.
     */
    getUserParam: function (param) {
        return this.getUserParams()[param];
    },

    /**
     * Sets a specific user parameter in the tagger storage.
     * @param {string} param - The parameter to set.
     * @param {string} value - The value to set.
     * @param {boolean} [sync=true] - Whether to sync the data with the remote endpoint.
     * @returns {object} - The updated user parameters.
     */
    setUserParam: function (param, value, sync = true) {
        let userParams = this.getUserParams();
        userParams[param] = value;

        this.storeData("userParams", userParams);
        this.storeData("updatedTime", new Date().getTime());

        // Sync with remote if needed
        if (sync) {
            this._syncRemoteData();
        }

        window.taggerUserParams = userParams;
    },

    //-----------------------------
    // Storage functions
    //-----------------------------

    /**
     * Stores data in the Tagger storage.
     * @param {string} key - The key to store the data under.
     * @param {any} value - The data to store.
     * @returns {any} - The stored data.
     */
    storeData: function (key, value) {
        // We can't store data while a sync operation is in progress
        if (this.isLocked()) {
            console.warn("[Tagger] Can't store data while a sync operation is in progress.");
            return null;
        }

        key = "__tg-" + key;
        try {
            const json = JSON.stringify(value);
            const base64 = btoa(encodeURIComponent(json)); // Safer for UTF-8

            this.utilSetCookie(key, base64, 365);
            localStorage.setItem(key, base64);

            return value;
        } catch (e) {
            console.error("[Tagger] Error storing data: ", e);
        }
    },

    /**
     * Retrieves data from the Tagger storage.
     * @param {string} key - The key to retrieve the data from.
     * @returns {any} - The retrieved data.
     */
    getData: function (key) {
        key = "__tg-" + key;
        try {
            let value = this.utilGetCookie(key);
            if (!value) {
                value = localStorage.getItem(key);
                if (value) {
                    this.utilSetCookie(key, value, 365);
                }
            }

            if (value) {
                try {
                    const json = decodeURIComponent(atob(value));
                    const parsed = JSON.parse(json);

                    if (parsed && (typeof parsed === "object" || typeof parsed === "string" || typeof parsed === "number")) {
                        return parsed;
                    }
                } catch (e) {
                    console.warn("[Tagger] Error decoding or parsing data for key:", key, e);
                }
            }

            return null; // Explicitly return null if parsing fails
        } catch (e) {
            console.error("[Tagger] Error retrieving data for key:", key, e);
            return null;
        }
    },

    //-----------------------------
    // Remote Sync functions
    //-----------------------------
    /**
     * Synchronizes Tagger data (userParams, userID, userCreateTime) with a remote endpoint.
     * @param {boolean} [forceUpdate=false] - Forces a POST request to update the remote server.
     * @returns {Promise<void>}
     * * Security Note: The remote server endpoint is responsible for validating the request's
     * IP source, User Agent, and Referer to prevent abuse or unauthorized data storage.
     */
    _syncRemoteData: async function (forceUpdate = false) {
        if (!window?.taggerConfig?.remoteSync || !window.taggerConfig.remoteEndpoint) {
            return;
        }

        if (this.isLocked()) {
            console.warn("[Tagger] Sync operation already in progress.");
            return;
        } else {
            this.lock();
        }

        const endpoint = window.taggerConfig.remoteEndpoint;
        const localData = this._getSyncableData();
        const hasLocalData = Object.keys(localData).length >= 2; // Check for more than just IP and updatedTime/timestamp

        // console.log("[Tagger] Local data available for sync:", localData);

        try {
            // Determine sync action
            let action = hasLocalData && !forceUpdate ? "GET_CHECK" : "GET_FULL";
            if (hasLocalData && (forceUpdate || this.isLocalDataNewer(localData))) {
                action = "POST";
            } else if (hasLocalData && !this.isLocalDataNewer(localData)) {
                action = "GET_CHECK";
            }

            // console.log(`[Tagger] Remote sync action: ${action}`);

            // Execute sync action
            let responseData = null;
            let finalEndpoint = endpoint;

            if (action === "POST") {
                // POST: Send local data to remote server
                const payload = this._prepareRemotePayload(localData);
                const response = await fetch(finalEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                if (response.ok) {
                    responseData = await response.json();
                    if (responseData.updated) {
                        this.unlock(); // Unlock before applying data

                        // Successfully updated remote, no local change expected unless server returns new data
                        this.storeData("remoteUpdatedTime", responseData.updatedTime || 0);
                        console.log("[Tagger] Synced remote data.");
                    } else {
                        // Server data was not updated, check if it returned new data
                        if (responseData.data) {
                            this.unlock(); // Unlock before applying data

                            // Apply returned data if it's newer
                            const decodedData = this._decodeRemoteData(responseData.data);
                            if (decodedData && this.isRemoteDataNewer(decodedData)) {
                                this._applyRemoteData(decodedData);
                                console.log("[Tagger] Synced remote data.");
                            } else {
                                // Update local remoteUpdatedTime to avoid re-sending
                                this.storeData("remoteUpdatedTime", responseData.updatedTime || 0);
                            }
                        } else {
                            console.warn("[Tagger] No remote data available.");
                        }
                    }
                } else {
                    console.error("[Tagger] Remote sync POST failed:", response.statusText);
                }

                this.unlock();
                return;
            } else {
                // GET_FULL / GET_CHECK: Retrieve data or check for updates
                if (action === "GET_CHECK") {
                    // Check only, include local timestamp
                    const localUpdatedTime = localData.updatedTime || localData.userParams?.timestamp || 0;
                    if (localUpdatedTime) {
                        finalEndpoint = endpoint.includes("?") ? `${endpoint}&updatedTime=${localUpdatedTime}` : `${endpoint}?updatedTime=${localUpdatedTime}`;
                    }
                }

                const response = await fetch(finalEndpoint, { method: "GET" });

                if (response.ok) {
                    responseData = await response.json();

                    if (responseData.data) {
                        // Response contains base64 encoded data
                        const decodedData = this._decodeRemoteData(responseData.data);
                        console.log("[Tagger] Synced remote data.");
                        if (decodedData && this.isRemoteDataNewer(decodedData)) {
                            this.unlock(); // Unlock before applying data
                            this._applyRemoteData(decodedData);
                        } else {
                            console.log("[Tagger] Remote data is not newer or is invalid.");
                        }
                    } else if (responseData.updated === false) {
                        // If action was GET_CHECK and local data is newer, re-sync
                        if (action === "GET_CHECK") {
                            const localUpdatedTime = localData.updatedTime || localData.userParams?.timestamp || 0;
                            const remoteUpdatedTime = responseData.updatedTime || 0;
                            if (localUpdatedTime > remoteUpdatedTime) {
                                this.unlock(); // Unlock before re-calling
                                await this._syncRemoteData(true);
                            }
                        }
                    }
                } else {
                    console.error("[Tagger] Remote sync GET failed:", response.statusText);
                }
            }
        } catch (error) {
            console.error("[Tagger] Remote sync communication error: ", error);
        }

        // console.log("[Tagger] Sync process completed.");
        this.unlock();
    },

    /**
     * Prepares the data to be sent to the remote endpoint.
     * @param {object} localData - The local Tagger data.
     * @returns {object} - The payload for the remote server.
     */
    _prepareRemotePayload: function (localData) {
        const data = {
            ...localData,
            userAgent: navigator.userAgent,
            referer: document.referrer,
        };
        const json = JSON.stringify(data);
        const base64 = btoa(encodeURIComponent(json));
        return { data: base64 };
    },

    /**
     * Retrieves Tagger data relevant for synchronization.
     * @returns {object} - The syncable data object.
     */
    _getSyncableData: function () {
        const data = {};
        const userID = this.getData("userID");
        const userParams = this.getData("userParams");
        const userCreateTime = this.getData("userCreateTime");
        const updatedTime = this.getData("updatedTime");

        if (userID) data.userID = userID;
        if (userParams) data.userParams = userParams;
        if (userCreateTime) data.userCreateTime = userCreateTime;
        if (updatedTime) data.updatedTime = updatedTime;

        // console.log("[Tagger] Syncable data:", data);

        return data;
    },

    /**
     * Checks if the local data's updatedTime is newer than a potential remote update.
     * @param {object} localData - The local Tagger data.
     * @returns {boolean}
     */
    isLocalDataNewer: function (localData) {
        const localTime = localData.updatedTime || localData.userParams?.timestamp || 0;
        const remoteUpdateTime = this.getData("remoteUpdatedTime") || 0;
        // console.log("[Tagger] Comparing local time with remote time:", localTime, remoteUpdateTime);
        return localTime > remoteUpdateTime;
    },

    /**
     * Checks if the remote data's updatedTime is newer than the local data.
     * @param {object} remoteData - The decoded remote data.
     * @returns {boolean}
     */
    isRemoteDataNewer: function (remoteData) {
        const localTime = this.getData("updatedTime") || this.getData("userParams")?.timestamp || 0;
        const remoteTime = remoteData.updatedTime || remoteData.userParams?.timestamp || 0;
        // Only consider it newer if it's strictly greater (and not equal, to avoid ping-pong)
        return remoteTime > localTime;
    },

    /**
     * Decodes and parses remote data from a base64 string.
     * @param {string} base64Data - The base64 encoded data.
     * @returns {object|null} - The decoded data or null on failure.
     */
    _decodeRemoteData: function (base64Data) {
        try {
            const json = decodeURIComponent(atob(base64Data));
            return JSON.parse(json);
        } catch (e) {
            console.error("[Tagger] Error decoding or parsing remote data: ", e);
            return null;
        }
    },

    /**
     * Applies the received remote data to local Tagger storage.
     * @param {object} data - The decoded data from the remote server.
     */
    _applyRemoteData: function (data, by) {
        if (this.isLocked()) {
            console.warn("[Tagger] Sync operation already in progress.");
            return;
        }

        if (data.userID) {
            this.storeData("userID", data.userID);
            window.taggerUserID = data.userID; // Update global scope
        }
        if (data.userParams) {
            // Merge with existing params to preserve any non-synced data if needed, but for simplicity, overwrite
            this.storeData("userParams", data.userParams);
            window.taggerUserParams = data.userParams; // Update global scope
        }
        if (data.userCreateTime) this.storeData("userCreateTime", data.userCreateTime);
        if (data.updatedTime) this.storeData("updatedTime", data.updatedTime); // Store the remote updated time
        if (data.updatedTime) this.storeData("remoteUpdatedTime", data.updatedTime); // Store the remote updated time

        // console.log("[Tagger] Remote data applied.");
        this.triggerEvent(window, "tagger:remoteSyncApplied");
    },
    /**
     * Checks if the Tagger storage is currently locked for sync operations.
     * @returns {boolean} - Returns true if the storage is locked, false otherwise.
     */
    isLocked: function () {
        return this.SYNC_LOCK;
    },
    /**
     * Locks the Tagger storage to prevent concurrent sync operations.
     */
    lock: function () {
        this.SYNC_LOCK = true;
    },
    /**
     * Unlocks the Tagger storage to allow sync operations.
     */
    unlock: function () {
        this.SYNC_LOCK = false;
    },

    //-----------------------------
    // Utility functions
    //-----------------------------
    /**
     * Returns the instance of the Tagger module.
     * @returns {tagger} - The Tagger instance.
     */
    getInstance: function () {
        return this;
    },

    /**
     * Performs URL parameter swapping for elements with the class ".tg-swap-href".
     * Swaps the href of the element with the current URL and appends the userID.
     */
    doParamsSwap: function () {
        const that = this;

        // .tg-swap-child-href
        const childLinks = document.querySelectorAll(".tg-swap-child-href>a");
        childLinks.forEach((link) => {
            link.classList.add("tg-swap-href");
        });

        // .tg-swap-href
        // Swap the href of the element with the current URL and append the userID
        const swapLinks = document.querySelectorAll(".tg-swap-href");

        for (const el of swapLinks) {
            if (el.classList.contains("tg-swap-href-done")) {
                continue;
            }

            let href = el.getAttribute("href");
            let newHref = that.utilMoveURLParamsToNewURL(href);

            // Sanitize the URL
            newHref = that.utilSanitizeURL(newHref);

            el.setAttribute("href", newHref);
            el.classList.add("tg-swap-href-done");
        }
    },
    /**
     * Reloads the Tagger module.
     * Binds events and performs parameter swapping.
     * Triggers the "tagger:reload" event.
     * @returns {Promise<void>}
     */
    reload: async function () {
        this._bindEvents();

        console.log("[Tagger] Reloaded");
        this.triggerEvent(window, "tagger:reload");
        window.taggerReady = true;
    },
    /**
     * Add the current URL parameters to the specified URL and appends the userID.
     * @param {string} url - The URL to move the parameters from.
     * @param {boolean} [appendUserID=true] - Whether to append the userID to the new URL.
     * @returns {string} - The new URL with the parameters moved and the user ID appended.
     */
    utilMoveURLParamsToNewURL: function (url, appendUserID = true) {
        if (!url || url === "#") return url;

        try {
            let params = new URLSearchParams(window.location.search);
            let newURL = new URL(url, window.location.href);

            params.forEach((value, key) => {
                if (key === "user_id") return;
                newURL.searchParams.append(key, value);
            });

            if (appendUserID) {
                let userID = this.getUserID();
                newURL.searchParams.append("user_id", userID);
            }
            return newURL.href;
        } catch (error) {
            console.error("[Tagger] Error moving URL params to new URL: ", error);
            return url;
        }
    },

    /**
     * Retrieves a URL parameter by name.
     * @param {string} param - The name of the parameter to retrieve.
     * @returns {string|null} - The value of the parameter or null if not found.
     */
    utilGetParamFromURL: function (param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    },

    /**
     * Retrieves the user's IP address.
     * @returns {Promise<string>} - The user's IP address.
     */
    utilGetUserIp: async function () {
        try {
            // Try with IPify first
            const ipifyResponse = await fetch("https://api.ipify.org?format=json");
            if (ipifyResponse.ok) {
                const data = await ipifyResponse.json();
                if (this.utilValidateIp(data.ip)) {
                    return data.ip;
                }
            }
        } catch (error) {
            try {
                // Fallback to IPinfo if IPify fails
                const ipinfoResponse = await fetch("https://ipinfo.io/json");
                if (ipinfoResponse.ok) {
                    const data = await ipinfoResponse.json();
                    if (this.utilValidateIp(data.ip)) {
                        return data.ip;
                    }
                }
            } catch (error) {
                console.error("[Tagger] Error retrieving user ip: ", error);
                return "unknown";
            }
        }
    },

    /**
     * Validates an IP address.
     * @param {string} ip - The IP address to validate.
     * @returns {boolean} - Returns true if the IP address is valid, false otherwise.
     */
    utilValidateIp: function (ip) {
        // Validate the IPv4 and IPv6 address
        const ipRegex =
            /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|^([0-9a-fA-F]{1,4}:){1,7}:|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|^[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;
        return ipRegex.test(ip);
    },

    /**
     * Detect if the current user agent is a bot
     * @returns {boolean} - Returns true if the user agent is a bot, false otherwise.
     */
    utilIsBot: function () {
        const userAgent = navigator.userAgent.toLowerCase();
        const botKeywords = ["bot", "crawl", "spider", "lighthouse"];
        return botKeywords.some((keyword) => userAgent.includes(keyword));
    },

    /**
     * Computes the SHA-1 hash of a message.
     * @param {string} message - The message to hash.
     * @returns {Promise<string>} - The SHA-1 hash of the message.
     */
    utilSHA1: async function (message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => ("00" + b.toString(16)).slice(-2)).join("");
        return hashHex;
    },

    /**
     * Sanitizes a URL
     * @param {string} url - The URL to sanitize.
     * @returns {string} - The sanitized URL.
     */
    utilSanitizeURL: function (url) {
        if (!url) return "";

        // Decode potential encoded malicious inputs (e.g., to catch 'jav\tascript:...')
        const decodedUrl = decodeURIComponent(url).trim();

        // Define allowed protocols in lowercase
        const allowedProtocols = ["http:", "https:", "ftp:", "mailto:", "tel:", "#", "/"];

        // Check for relative path or allowed protocol
        if (decodedUrl.startsWith("/") || allowedProtocols.some((p) => decodedUrl.toLowerCase().startsWith(p))) {
            // If it starts with an allowed protocol or is a relative path, it's safe.
            // We'll return the original (non-decoded) URL to preserve its intended encoding.
            return url;
        }

        // If not safe, return '#' or throw an error. Returning '#' prevents the link from working.
        console.warn("[Tagger] Blocked unsafe URL protocol:", url);
        return "#";
    },

    /**
     * Gets the current domain without the subdomain.
     * @returns {string} - The domain without the subdomain.
     */
    utilGetCurrentDomain: function () {
        // Get the full hostname
        let hostname = window.location.hostname;

        // Remove www subdomain if exists
        hostname = hostname.replace(/^www\./, "");

        // Remove subdomains
        const parts = hostname.split(".");
        if (parts.length > 2) {
            hostname = parts.slice(-2).join(".");
        }

        return hostname;
    },

    /**
     * Sets a cookie with the specified name, value, and expiration date.
     * @param {string} name - The name of the cookie.
     * @param {string} value - The value of the cookie.
     * @param {number} days - The number of days until the cookie expires.
     */
    utilSetCookie: function (name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; domain=" + this.utilGetCurrentDomain() + "; path=/";
    },

    /**
     * Retrieves a cookie with the specified name.
     * @param {string} name - The name of the cookie.
     * @returns {string} - The value of the cookie.
     */
    utilGetCookie: function (name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(";");
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === " ") c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    },

    /**
     * Triggers a custom event on an element.
     * @param {Element} element - The element to trigger the event on.
     * @param {string} eventName - The name of the event to trigger.
     * @param {Array} [detail=[]] - Additional data to pass with the event.
     */
    triggerEvent: function (element, eventName, detail = []) {
        const event = new CustomEvent(eventName, { detail });
        element.dispatchEvent(event);
    },
};

/**
 * Automatically initializes the Tagger module when the DOM is ready.
 * Ensures that the initialization happens only once.
 */
const _taggerAutoInit = () => {
    // Avoid multiple inits
    if (window.taggerLoaded || window.__taggerInitInProgress) {
        console.log("[Tagger] Already initialized or in progress.");
        return;
    }

    window.__taggerInitInProgress = true;

    const initialize = () => {
        try {
            if (window.taggerLoaded) return;
            if (typeof tagger === "undefined") {
                console.warn("[Tagger] tagger object is not defined.");
                return;
            }

            window.tagger = tagger;
            window.tagger._init();
            window.taggerLoaded = true;
            console.log("[Tagger] Initialized.");
        } catch (e) {
            console.error("[Tagger] Initialization failed:", e);
        } finally {
            window.__taggerInitInProgress = false;
        }
    };

    // If DOM is already ready, no need to poll
    if (document.readyState === "complete" || document.readyState === "interactive") {
        initialize();
        return;
    }

    // Poll until DOM is ready
    const initInterval = setInterval(() => {
        if (document.readyState === "complete" || document.readyState === "interactive") {
            clearInterval(initInterval);
            initialize();
        }
    }, 100);
};

// Init tagger
_taggerAutoInit();

export { _taggerAutoInit, tagger };
