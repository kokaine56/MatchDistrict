// src/utils/usernameValidator.js
// Re-exports shared username validator for frontend views and components.
export {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  RESERVED_USERNAMES,
  validateUsername,
  sanitizeToUsernameBase,
} from '../../server/usernameValidator.js';
