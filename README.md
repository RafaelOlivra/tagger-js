# Tagger.js

A lightweight user attribution library for persistent marketing data within the same domain and subdomains._

## Key Features:

-   🆔 **Auto-generated User IDs** – SHA-1 hashed fingerprints (IP + UA + timestamp)
-   🔗 **UTM Parameter Preservation** – Maintains marketing tags across page visits
-   🍪 **Dual Storage System** – Syncs data between cookies (subdomain-accessible) and localStorage
-   ⏱️ **First-visit Tracking** – Timestamps user acquisition moment
-   🤖 **Bot Filtering** – Automatically ignores known crawlers

## Domain Scope:

- ✔ Works across subdomains (example.com → shop.example.com)
- ❌ Doesn't work cross-domain (example.com → anotherexample.com)

## Ideal for:

-   Single-domain marketing sites
-   E-commerce flows across subdomains
-   Referral programs within the same root domain
-   Persistent UTM parameter handling

## License

MIT © Rafael Oliveira. See [LICENSE](LICENSE) for full text.
