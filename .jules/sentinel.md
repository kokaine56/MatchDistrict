## 2023-10-27 - Hardcoded Secrets in Config
**Vulnerability:** Found hardcoded fallback secrets for `JWT_SECRET` and `ADMIN_PASSWORD` in `server.js`. If environment variables are missing, the server used widely known static values ('matchdistrict_super_secure_jwt_secret_key_2026' and '101010').
**Learning:** Default static fallbacks for cryptographic keys or passwords create a predictable attack vector. If a production environment accidentally omits these variables, anyone could forge JWT tokens or log in as the superadmin.
**Prevention:** Instead of hardcoded strings, use dynamically generated cryptographic random strings (e.g., `crypto.randomBytes(32).toString('hex')`) when fallback is absolutely necessary, and clearly log a warning that a random secret was generated.
