# Tagger.js

A lightweight user attribution library for persistent marketing data within the same domain and subdomains.

## Key Features:

-   🆔 **Auto-generated User IDs** – SHA-1 hashed fingerprints (IP + UA + timestamp)
-   🔗 **UTM Parameter Preservation** – Maintains marketing tags across page visits
-   🍪 **Dual Storage System** – Syncs data between cookies (subdomain-accessible) and localStorage
-   ⏱️ **First-visit Tracking** – Timestamps user acquisition moment
-   🤖 **Bot Filtering** – Automatically ignores known crawlers
-   🌐 **Cross-domain Sync** – Synchronizes user data across different domains when configured.

## Domain Scope:

- ✔ Works across subdomains (example.com → shop.example.com)
- ✔ Supports cross-domain sync when explicitly configured (example.com → anotherexample.com)
- ❌ Doesn't work for unrelated domains without configuration

## Ideal for:

-   Single-domain marketing sites
-   E-commerce flows across subdomains
-   Referral programs within the same root domain
-   Persistent UTM parameter handling
-   Multi-domain setups with shared user attribution

## Usage Examples

### Basic Setup

Add the script to your HTML:

```html
<script src="tagger.min.js"></script>
```

Tagger initializes automatically when the page loads.

### Accessing User Data

```javascript
// Get the user ID
const userID = tagger.getUserID();
console.log("User ID:", userID);

// Get all user parameters
const userParams = tagger.getUserParams();
console.log("UTM Source:", userParams.utm_source);

// Get a specific parameter
const source = tagger.getUserParam("utm_source");
```

### Setting User Parameters

```javascript
// Set a user parameter
tagger.setUserParam("utm_source", "newsletter");

// Parameters are automatically synced with remote if enabled
```

### Registering Callbacks

Listen for Tagger events:

```javascript
tagger.registerCallback(function (eventName, data) {
    console.log("Tagger Event:", eventName, data);
});

// Event types:
// - tagger:userIDCreated - When a new user ID is created
// - tagger:remoteSyncApplied - When remote sync data is applied
// - tagger:reload - When Tagger reloads
```

### Remote Sync Configuration

Configure Tagger in your HTML before the script loads:

```html
<script>
    window.taggerConfig = {
        // Enable remote synchronization
        remoteSync: true,
        
        // Your remote endpoint (MUST be HTTPS)
        remoteEndpoint: "https://example.com/api/tagger-sync",
        
        // Auto-sync interval in milliseconds (0 = disabled)
        autoSyncInterval: 300000, // 5 minutes
        
        // User parameters to track
        userParams: [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "gclid",
            "gbraid",
            "fbclid",
        ],
        
        // Optional: User ID prefix
        prefix: "user-",
        
        // Optional: Force IPv4 detection
        forceIPv4: false,
        
        // Optional: IP cache duration in milliseconds (default: 24 hours)
        ipCacheDuration: 86400000,
    };
</script>
<script src="tagger.min.js"></script>
```

### Manual Sync Trigger

Trigger a sync with the remote server manually:

```javascript
await tagger.sync();
```

### URL Parameter Swapping

Automatically append user ID and parameters to links:

```html
<!-- Single link with user ID appended -->
<a href="https://example.com/checkout" class="tg-swap-href">Checkout</a>

<!-- Links in a container with swapped parameters -->
<div class="tg-swap-child-href">
    <a href="https://shop.example.com">Shop</a>
</div>
```

**Example outcome** (if user came from `utm_source=google&utm_medium=cpc`):

```
https://example.com/checkout?utm_source=google&utm_medium=cpc
https://shop.example.com?utm_source=google&utm_medium=cpc
```

### Form Submission Tracking

Automatically track form submissions:

```html
<form class="tg-form-submit">
    <input type="email" name="email" required />
    <button type="submit">Subscribe</button>
</form>
```

## License

MIT © Rafael Oliveira. See [LICENSE](LICENSE) for full text.
