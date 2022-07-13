module.exports = deleteMatch;

const constants = require('./constants');

const LostItem = Parse.Object.extend("LostItem");
const FoundItem = Parse.Object.extend("FoundItem");

// Deletes the match object and removes the match object id = require( the
// possible matches in the connected lost and found objects.
async function deleteMatch(match) {
    let lostItem = new LostItem();
    lostItem.id = match.get(constants.KEY_LOST_ITEM).id;
    let lostItemPromise = lostItem.fetch({ useMasterKey : true });

    let foundItem = new FoundItem();
    foundItem.id = match.get(constants.KEY_FOUND_ITEM).id;
    let foundItemPromise = foundItem.fetch({ useMasterKey : true });

    try {
        await lostItemPromise;
        let lostPossibleMatches = lostItem.get(constants.KEY_POSSIBLE_MATCHES);
        lostPossibleMatches = lostPossibleMatches.filter(val => val !== match.id);
        lostItem.set(constants.KEY_POSSIBLE_MATCHES, lostPossibleMatches);
        lostItem.save(null, { useMasterKey : true });
    } catch(error) {
        console.log(error.message);
    }

    try {
        await foundItemPromise;
        let foundPossibleMatches = foundItem.get(constants.KEY_POSSIBLE_MATCHES);
        foundPossibleMatches = foundPossibleMatches.filter(val => val !== match.id);
        foundItem.set(constants.KEY_POSSIBLE_MATCHES, foundPossibleMatches);
        foundItem.save(null, { useMasterKey : true });
    } catch(error) {
        console.log(error.message);
    }

    match.destroy();
}