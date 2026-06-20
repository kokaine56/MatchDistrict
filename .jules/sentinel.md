# Security Sentinel Journal

## Vulnerability: Hardcoded JWT Secret
*   **What:** The `server.js` file used a hardcoded string as a fallback for the `JWT_SECRET` environment variable (`process.env.JWT_SECRET || 'matchdistrict_super_secure_jwt_secret_key_2026'`).
*   **Risk:** If the environment variable was missing or misconfigured in production, the application would silently start using the well-known, hardcoded secret. This allows attackers to forge JSON Web Tokens (JWTs) and gain unauthorized access or elevate privileges.
*   **Solution:** Removed the hardcoded fallback. Implemented a strict check that logs a critical error and terminates the process (`process.exit(1)`) if `JWT_SECRET` is not provided in the environment. This enforces a "fail-safe" security posture.
*   **Prevention Strategy:** Always enforce mandatory environment variables for cryptographic secrets and authentication keys. Never use hardcoded fallback values for sensitive data in production environments.
