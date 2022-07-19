const constants = require('./helpers/constants');
const checkItemMatch = require('./helpers/checkItemMatch');
const deleteMatch = require('./helpers/deleteMatch');

const LostItem = Parse.Object.extend("LostItem");
const FoundItem = Parse.Object.extend("FoundItem");
const Match = Parse.Object.extend("Match");

async function findMatch(lostItem, foundItem) {
    let matches = lostItem.get(constants.KEY_POSSIBLE_MATCHES);
    for(let matchId of matches) {
        let match = new Match();
        match.id = matchId;
        await match.fetch();

        if(match.get(constants.KEY_LOST_ITEM).id === lostItem.id && match.get(constants.KEY_FOUND_ITEM).id === foundItem.id) {
            console.log("Exsisting match found.");
            return match;
        }
    }
    return new Match();
}

async function deleteMatchFromId(matchId) {
    console.log("Deleting match from id: " + matchId);
    let match = new Match();
    match.id = matchId;
    try {
        await match.fetch();
        deleteMatch(match);
    } catch(error) {
        console.log("Error deleting match: " + error.message);
    }
}

async function checkMatch(item, otherItem, userIdsToNotify) {
    let otherItemId = "";

    let lostItem;
    let foundItem;
    if(item.className == 'LostItem') {
        lostItem = item;
        foundItem = otherItem;
        otherItemId = foundItem.get(constants.KEY_FOUND_BY).id;
    } else {
        lostItem = otherItem;
        foundItem = item;
        otherItemId = lostItem.get(constants.KEY_LOST_BY).id;
    }

    if(foundItem.get(constants.KEY_QUIZ_FAILS).includes(lostItem.get(constants.KEY_LOST_BY).id)) {
        console.log("User " + lostItem.get(constants.KEY_LOST_BY).id + " already failed quiz, skipping match.");
        return;
    }

    let matchPromise = findMatch(lostItem, foundItem);
    let similarity = await checkItemMatch(item, otherItem);
    let match = await matchPromise;

    if(similarity > 0.7) {
        userIdsToNotify.push(otherItemId)
        match.set('lostItem', lostItem);
        match.set('foundItem', foundItem);
        
        match.set('matchScore', similarity);
        let distanceMiles = lostItem.get(constants.KEY_ITEM_LOCATION).milesTo(foundItem.get(constants.KEY_ITEM_LOCATION));
        match.set(constants.KEY_DISTANCE_MILES, distanceMiles);

        let matchPromise = match.save(null, { useMasterKey : true });

        let otherPossibleMatches = otherItem.get(constants.KEY_POSSIBLE_MATCHES);

        await matchPromise;

        if(!otherPossibleMatches.includes(match.id)) {
            otherPossibleMatches.push(match.id);
        }

        otherItem.set(constants.KEY_POSSIBLE_MATCHES, otherPossibleMatches);
        otherItem.save(null, { useMasterKey : true });
        return match.id;
    }
}

async function setMatches(item) {
    console.log("Setting matches for " + JSON.stringify(item));
    let userIdsToNotify = [];
    let query;
    if(item instanceof LostItem) {
        query = new Parse.Query("FoundItem");
        query.notEqualTo(constants.KEY_FOUND_BY, item.get(constants.KEY_LOST_BY));
    } else if(item instanceof FoundItem) {
        query = new Parse.Query("LostItem");
        query.notEqualTo(constants.KEY_LOST_BY, item.get(constants.KEY_FOUND_BY));
    }
    
    let results = query.find({ useMasterKey : true });

    let initialPossibleMatches = item.get(constants.KEY_POSSIBLE_MATCHES);
    let possibleMatches = [];
    results = await results;

    for(let i = 0; i < results.length; i++) {
        possibleMatches.push(checkMatch(item, results[i], userIdsToNotify));
    }

    possibleMatches = (await Promise.all(possibleMatches)).filter(matchId => matchId != null);

    initialPossibleMatches.forEach(matchId => {
        if(!possibleMatches.includes(matchId)) {
            deleteMatchFromId(matchId);
        }
    });
    item.set(constants.KEY_POSSIBLE_MATCHES, possibleMatches);
    item.save(null, { useMasterKey : true });

    let notificationQuery = new Parse.Query(Parse.Installation);
    notificationQuery.containedIn('userId', userIdsToNotify);

    Parse.Push.send({
        where: notificationQuery,
        data: {
            title: "Matches Updated.",
            alert: ""
        }
    }, { useMasterKey: true });
}

Parse.Cloud.define("updateMatches", async (request) => {
    let item;

    if(request.params.hasOwnProperty('lostItemId')) {
        item = new LostItem(); 
        item.id = request.params.lostItemId;
    } else if(request.params.hasOwnProperty('foundItemId')) {
        item = new FoundItem();
        item.id = request.params.foundItemId;
    }
    
    try {
        await item.fetch({ useMasterKey : true });
        await setMatches(item);
    } catch(error) {
        console.log("Error setting matches: " + error.message);
        console.log("Trace: " + error.stack);
    }
});