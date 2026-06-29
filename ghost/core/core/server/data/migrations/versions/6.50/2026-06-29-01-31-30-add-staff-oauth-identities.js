const {addTable} = require('../../utils');

module.exports = addTable('oauth_identities', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    provider: {type: 'string', maxlength: 191, nullable: false},
    subject: {type: 'string', maxlength: 191, nullable: false},
    user_id: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    email: {type: 'string', maxlength: 191, nullable: false, validations: {isEmail: true}},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true},
    '@@UNIQUE_CONSTRAINTS@@': [
        ['provider', 'subject'],
        ['provider', 'user_id']
    ]
});
