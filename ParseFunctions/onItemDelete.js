const constants = require('./helpers/constants');
const deleteMatch = require('./helpers/deleteMatch');

Parse.Cloud.beforeDelete("LostItem", (request) => {
    const query = new Parse.Query("Match");
    query.equalTo(constants.KEY_LOST_ITEM, request.object);
    query.find()
        .then(async (matches) => {
            matches.forEach(match => {
                deleteMatch(match);
            });
        })
        .catch((error) => {
            console.error("Error finding related matches " + error.code + ": " + error.message);
    });
});

Parse.Cloud.beforeDelete("FoundItem", (request) => {
    const query = new Parse.Query("Match");
    query.equalTo(constants.KEY_FOUND_ITEM, request.object);
    query.find()
        .then(async (matches) => {
            matches.forEach(match => {
                deleteMatch(match);
            });
        })
        .catch((error) => {
            console.error("Error finding related matches " + error.code + ": " + error.message);
    });
});