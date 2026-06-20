# Security Journal

## Insecure Randomness for OTP
**Issue**: Using `Math.random()` for generating One-Time Passwords (OTPs).
**Risk**: `Math.random()` is not cryptographically secure and produces predictable numbers, making it possible for attackers to predict future OTPs.
**Prevention**: Always use cryptographically secure random number generators like `crypto.randomInt()` in Node.js for generating secure tokens, passwords, or OTPs.
