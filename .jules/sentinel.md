# Security Vulnerability Learnings

## Hardcoded Default Admin Credentials
**Date:** June 20, 2026

### The Vulnerability
The server initialization logic in `server.js` contained hardcoded fallback credentials (`matchdistrict.in@gmail.com` and `101010`) for the super admin account. If the environment variables (`ADMIN_EMAIL` and `ADMIN_PASSWORD`) were ever missing during server startup, an attacker could easily guess or know these fallback credentials and gain full administrative access to the platform.

### The Fix
Removed the fallback OR expressions (`|| '...'`) from the credential assignments. Added an explicit `if (!adminEmail || !adminPassword)` check. If missing, the server logs a warning and cleanly skips the admin user seeding logic, enforcing that administrative privileges can only be established through deliberate configuration via environment variables.

### Prevention Strategy
1. **Never Hardcode Credentials:** Fallback values for sensitive data (passwords, keys, admin emails) should never be committed to source code.
2. **Fail Closed or Skip Safely:** If required sensitive configuration is missing, the application should either refuse to start or securely skip the feature, rather than defaulting to an insecure state.
3. **Environment Segregation:** Treat the `.env` file as the sole source of truth for secrets.