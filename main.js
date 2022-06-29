const levenshtein = require('fast-levenshtein');

const KEY_ITEM_NAME = "itemName";
const KEY_ITEM_LOCATION = "itemLocation";
const KEY_POSSIBLE_MATCHES = "possibleMatches";
const KEY_TIME_FOUND = "timeFound";
const KEY_TIME_LOST = "timeLost";
const KEY_LOST_ITEM = "lostItem";
const KEY_FOUND_ITEM = "foundItem";

const LostItem = Parse.Object.extend("LostItem");
const FoundItem = Parse.Object.extend("FoundItem");
const Match = Parse.Object.extend("Match");

//Returns value from 0 to 1 depending on how close to 0 the distance is.
function locationSimilarity(item, otherItem) {
    const MAX_DISTANCE = 50.0;
    let distanceMiles = item.get(KEY_ITEM_LOCATION).milesTo(otherItem.get(KEY_ITEM_LOCATION));

    if(distanceMiles > MAX_DISTANCE) {
        return 0;
    } else {
        return (MAX_DISTANCE - distanceMiles) / MAX_DISTANCE;
    }
}

function nameSimilarity(item, otherItem) {
    let itemName = item.get(KEY_ITEM_NAME).toLowerCase();
    let otherName = otherItem.get(KEY_ITEM_NAME).toLowerCase();

    let longerLength = Math.max(itemName.length, otherName.length);
    let similarity = levenshtein.get(itemName, otherName);

    return (longerLength - similarity) / longerLength;
}

function timeSimilarity(item, otherItem) {
    let lostItem;
    let foundItem;
    if(item.className == 'LostItem') {
        lostItem = item
        foundItem = otherItem;
    } else {
        lostItem = otherItem;
        foundItem = item;
    }

    let lostDate = lostItem.get(KEY_TIME_LOST);
    let foundDate = foundItem.get(KEY_TIME_FOUND);

    const oneDay = 24 * 60 * 60 * 1000;

    const daysBetween = Math.round(Math.abs((lostDate - foundDate) / oneDay));

    const MAX_DAYS_AFTER = 14;
    const MAX_DAYS_BEFORE = 1;

    if(daysBetween > -MAX_DAYS_BEFORE && daysBetween < MAX_DAYS_AFTER) {
        return (MAX_DAYS_AFTER - daysBetween) / MAX_DAYS_AFTER;
    }
    return 0;
}

function checkItemMatch(item, otherItem) {
    const NAME_SIMILARITY_WEIGHT = 0.4;
    const LOCATION_SIMILARITY_WEIGHT = 0.3;
    const TIME_SIMILARITY_WEIGHT = 0.3;

    let nameSim = nameSimilarity(item, otherItem);
    let locationSim = locationSimilarity(item, otherItem);
    let timeSim = timeSimilarity(item, otherItem);

    return NAME_SIMILARITY_WEIGHT * nameSim + LOCATION_SIMILARITY_WEIGHT * locationSim + TIME_SIMILARITY_WEIGHT * timeSim;
}

async function deleteMatch(match) {
    let lostItem = new LostItem();
    lostItem.id = match.get(KEY_LOST_ITEM).id;
    let lostItemPromise = lostItem.fetch({ useMasterKey : true });
    let foundItem = new FoundItem();
    foundItem.id = match.get(KEY_FOUND_ITEM).id;
    let foundItemPromise = foundItem.fetch({ useMasterKey : true });
    await lostItemPromise;
    let lostPossibleMatches = lostItem.get(KEY_POSSIBLE_MATCHES);
    await foundItemPromise;
    let foundPossibleMatches = foundItem.get(KEY_POSSIBLE_MATCHES);
    lostPossibleMatches = lostPossibleMatches.filter(val => val !== match.id);
    foundPossibleMatches = foundPossibleMatches.filter(val => val !== match.id);
    lostItem.set(KEY_POSSIBLE_MATCHES, lostPossibleMatches);
    foundItem.set(KEY_POSSIBLE_MATCHES, foundPossibleMatches);
    match.destroy();
    lostItem.save(null, { useMasterKey : true });
    foundItem.save(null, { useMasterKey : true });
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

async function setMatches(item) {
    // Matches will be set here.
}

Parse.Cloud.define("updateMatches", async (request) => {
    let item;

    if(request.params.hasOwnProperty('lostItemId')) {
        item = new LostItem(); 
        let itemId = request.params.lostItemId;
        item.id = itemId;
    } else if(request.params.hasOwnProperty('foundItemId')) {
        item = new FoundItem();
        let itemId = request.params.lostItemId;
        item.id = itemId;
    }
    
    try {
        await item.fetch({ useMasterKey : true });
        await setMatches(item);
    } catch(error) {
        console.log("Error setting matches: " + error.message);
        console.log("Trace: " + error.stack);
    }
});
