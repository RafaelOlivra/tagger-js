/**
 * Tagger - Simple user tagging
 * @version 1.2.8
 * @namespace tagger
 */

/**
 * The Tagger module for user tagging functionality.
 */
const tagger = {
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

        // Retrieve the user ID and store it in the global scope
        const userID = await this._retrieveUserID();
        window.taggerUserID = userID;

        console.log("[Tagger] UserID:", userID);

        // Prepare user params
        window.taggerUserParams = this.getUserParams();

        console.log("[Tagger] Ready!");

        // Wait for document ready
        document.addEventListener("DOMContentLoaded", async () => {
            setTimeout(async () => {
                this.triggerEvent(window, "tagger:init", [userID]);
                await this.reload();
            }, 100);
        });
    },

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
            { once: true }
        );
    },

    /**
     * Retrieves the user ID from the local storage.
     * If the user ID does not exist, creates a new one and stores it in the local storage.
     * Triggers the "tagger:userIDCreated" event when a new user ID is created.
     * @returns {Promise<string>} - The user ID.
     */
    _retrieveUserID: async function () {
        // Get the user ID from the local storage
        let userID = this.getData("userID");
        if (!userID) {
            const prefix = window?.taggerConfig?.prefix ?? "tg-";
            userID = await this.createNewUserID(prefix);

            this.storeData("userID", userID);
            this.storeData("userCreateTime", new Date().getTime());

            console.log("[Tagger] UserID Created");
            this.triggerEvent(window, "tagger:userIDCreated", [userID]);
        }
        return userID;
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
    },

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

    /**
     * Returns the stored user parameters from the tagger storage or URL.
     * @returns {object} - The user parameters.
     */
    getUserParams: function () {
        // Get the external parameters
        let params = new URLSearchParams(window.location.search);
        let userParams = window?.taggerConfig?.userParams ?? [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "gclid",
            "gbraid",
            "fbclid",
            "ref",
        ];

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
     * @returns {object} - The updated user parameters.
     */
    setUserParam: function (param, value) {
        let userParams = this.getUserParams();
        userParams[param] = value;
        this.storeData("userParams", userParams);
        window.taggerUserParams = userParams;
    },

    /**
     * Stores data in the Tagger storage.
     * @param {string} key - The key to store the data under.
     * @param {any} value - The data to store.
     * @returns {any} - The stored data.
     */
    storeData: function (key, value) {
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

                    if (
                        parsed &&
                        (typeof parsed === "object" ||
                            typeof parsed === "string")
                    ) {
                        return parsed;
                    }
                } catch (e) {
                    console.warn(
                        "[Tagger] Error decoding or parsing data for key:",
                        key,
                        e
                    );
                }
            }

            return null; // Explicitly return null if parsing fails
        } catch (e) {
            console.error("[Tagger] Error retrieving data for key:", key, e);
            return null;
        }
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
            console.error(
                "[Tagger] Error moving URL params to new URL: ",
                error
            );
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
            const ipifyResponse = await fetch(
                "https://api.ipify.org?format=json"
            );
            if (ipifyResponse.ok) {
                const data = await ipifyResponse.json();
                if (this.utilValidateIp(data.ip)) {
                    return data.ip;
                }
            }

            // Fallback to IPinfo if IPify fails
            const ipinfoResponse = await fetch("https://ipinfo.io/json");
            if (ipinfoResponse.ok) {
                const data = await ipinfoResponse.json();
                if (this.utilValidateIp(data.ip)) {
                    return data.ip;
                }
            }

            return "unknown";
        } catch (error) {
            console.error("[Tagger] Error retrieving user ip: ", error);
            return "unknown";
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
        const hashHex = hashArray
            .map((b) => ("00" + b.toString(16)).slice(-2))
            .join("");
        return hashHex;
    },

    /**
     * Sanitizes a URL
     * @param {string} url - The URL to sanitize.
     * @returns {string} - The sanitized URL.
     */
    utilSanitizeURL: function (url) {
        if (!url) return url;

        // Remove any script tags
        url = url.replace(
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            ""
        );
        // Remove any potentially dangerous characters or sequences
        url = url.replace(/[\\"'<>(){}]/g, "");
        url = url.trim();

        return url;
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
        document.cookie =
            name +
            "=" +
            (value || "") +
            expires +
            "; domain=" +
            this.utilGetCurrentDomain() +
            "; path=/";
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
            if (c.indexOf(nameEQ) === 0)
                return c.substring(nameEQ.length, c.length);
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
    if (
        document.readyState === "complete" ||
        document.readyState === "interactive"
    ) {
        initialize();
        return;
    }

    // Poll until DOM is ready
    const initInterval = setInterval(() => {
        if (
            document.readyState === "complete" ||
            document.readyState === "interactive"
        ) {
            clearInterval(initInterval);
            initialize();
        }
    }, 100);
};

// Init tagger
_taggerAutoInit();

export { _taggerAutoInit, tagger };
