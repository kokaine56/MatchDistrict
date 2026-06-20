### Security Learning: PBKDF2 to Bcrypt Migration

- **Vulnerability**: Weak PBKDF2 parameters (1000 iterations) were used for password hashing, allowing relatively easy brute-force attacks.
- **Fix**: Upgraded to `bcrypt` with a cost factor of 10. `bcrypt.hashSync` and `bcrypt.compareSync` were used for backward compatibility with the existing synchronous logic.
- **Backward Compatibility**: To prevent breaking existing accounts, the verification function was updated to handle both new `bcrypt` hashes (`$2a$`, `$2b$`, `$2y$`) and legacy `pbkdf2$` hashes, alongside raw plaintext as the ultimate fallback.
- **Prevention Strategy**: Always use modern, strongly-parameterized key derivation functions like bcrypt or Argon2 for password hashing.
