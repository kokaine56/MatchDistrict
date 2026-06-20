# Security Fixes Journal

## Insecure Randomness for Passwords

*   **Vulnerability:** The application was using `Math.random().toString(36).slice(-8)` to generate a fallback password for users. `Math.random()` is not a cryptographically secure pseudo-random number generator (CSPRNG), making the generated passwords potentially predictable and susceptible to cracking if an attacker could deduce the internal state of the RNG.
*   **Fix:** Replaced the use of `Math.random()` with `crypto.randomBytes(16).toString('hex')`. This utilizes the built-in Node.js `crypto` module to generate 16 bytes of cryptographically secure random data, providing 128 bits of entropy, which is then formatted as a hex string. This ensures the generated password is unpredictable and robust against brute-force or prediction attacks.
*   **Prevention Strategy:** Ensure that all generation of sensitive values, such as passwords, API keys, tokens, or session IDs, exclusively uses cryptographically secure sources of randomness (e.g., `crypto.randomBytes` or `crypto.randomUUID` in Node.js, `window.crypto` in the browser) rather than general-purpose random functions like `Math.random()`.