const {createSetNullableMigration} = require('../../utils');

// Staff OAuth (SSO) stores its PKCE state in an express-session BEFORE the user
// authenticates — during `GET /ghost/api/admin/session/oauth/start`. That session
// row therefore has no user_id yet. With `sessions.user_id` NOT NULL the insert
// fails, the OAuth state is never persisted, and the callback aborts with
// "Access denied" (getStoredState throws because session.staff_oauth is missing).
// Allow NULL user_id so the pre-auth state session can be saved; it gets a real
// user_id once the user is assigned to the session after a successful callback.
// disableForeignKeyChecks mirrors the other set-nullable migrations so the down
// migration is revertible on MySQL configs without STRICT_TRANS_TABLES.
module.exports = createSetNullableMigration('sessions', 'user_id', {disableForeignKeyChecks: true});
