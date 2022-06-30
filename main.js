const levenshtein = require('fast-levenshtein');

const KEY_ITEM_NAME = "itemName";
const KEY_ITEM_LOCATION = "itemLocation";
const KEY_POSSIBLE_MATCHES = "possibleMatches";
const KEY_TIME_FOUND = "timeFound";
const KEY_TIME_LOST = "timeLost";
const KEY_LOST_ITEM = "lostItem";
const KEY_FOUND_ITEM = "foundItem";
const KEY_DISTANCE_MILES = "distanceMiles";

const LostItem = Parse.Object.extend("LostItem");
const FoundItem = Parse.Object.extend("FoundItem");
const Match = Parse.Object.extend("Match");

function calculateDistanceMiles(item, otherItem) {
    return item.get(KEY_ITEM_LOCATION).milesTo(otherItem.get(KEY_ITEM_LOCATION));
}

//Returns value from 0 to 1 depending on how close to 0 the distance is.
function calculateLocationSimilarity(item, otherItem) {
    const MAX_DISTANCE = 50.0;

    let distanceMi = calculateDistanceMiles(item, otherItem);

    if(distanceMi > MAX_DISTANCE) {
        return 0;
    } else {
        return (MAX_DISTANCE - distanceMi) / MAX_DISTANCE;
    }
}

function calculateNameSimilarity(item, otherItem) {
    let itemName = item.get(KEY_ITEM_NAME).toLowerCase();
    let otherName = otherItem.get(KEY_ITEM_NAME).toLowerCase();

    let longerLength = Math.max(itemName.length, otherName.length);
    let similarity = levenshtein.get(itemName, otherName);

    return (longerLength - similarity) / longerLength;
}

function calculateTimeSimilarity(item, otherItem) {
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

    let nameSimilarity = calculateNameSimilarity(item, otherItem);
    let locationSimilarity = calculateLocationSimilarity(item, otherItem);
    let timeSimilarity = calculateTimeSimilarity(item, otherItem);

    return NAME_SIMILARITY_WEIGHT * nameSimilarity + LOCATION_SIMILARITY_WEIGHT * locationSimilarity + TIME_SIMILARITY_WEIGHT * timeSimilarity;
}

async function findMatch(item, otherItem) {
    let lostItem;
    let foundItem;

    if(item.className == 'LostItem') {
        lostItem = item
        foundItem = otherItem;
    } else {
        lostItem = otherItem;
        foundItem = item;
    }

    let matches = lostItem.get(KEY_POSSIBLE_MATCHES);
    for(let matchId of matches) {
        let match = new Match();
        match.id = matchId;
        await match.fetch();

        if(match.get(KEY_LOST_ITEM).id === lostItem.id && match.get(KEY_FOUND_ITEM).id === foundItem.id) {
            console.log("Exsisting match found.");
            return match;
        }
    }
    return new Match();
}

// Deletes the match object and removes the match object id from the
// possible matches in the connected lost and found objects.
async function deleteMatch(match) {
    let lostItem = new LostItem();
    lostItem.id = match.get(KEY_LOST_ITEM).id;
    let lostItemPromise = lostItem.fetch({ useMasterKey : true });

    let foundItem = new FoundItem();
    foundItem.id = match.get(KEY_FOUND_ITEM).id;
    let foundItemPromise = foundItem.fetch({ useMasterKey : true });

    await lostItemPromise;
    let lostPossibleMatches = lostItem.get(KEY_POSSIBLE_MATCHES);
    lostPossibleMatches = lostPossibleMatches.filter(val => val !== match.id);

    await foundItemPromise;
    let foundPossibleMatches = foundItem.get(KEY_POSSIBLE_MATCHES);
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
    console.log("Setting matches for " + JSON.stringify(item));
    let query;
    if(item instanceof LostItem) {
        query = new Parse.Query("FoundItem");
    } else if(item instanceof FoundItem) {
        query = new Parse.Query("LostItem");
    }
    
    let resultsPromise = query.find({ useMasterKey : true });

    let initialPossibleMatches = item.get(KEY_POSSIBLE_MATCHES);
    let possibleMatches = [];
    let results = await resultsPromise;

    for(let i = 0; i < results.length; i++) {
        const otherItem = results[i];

        let matchPromise = findMatch(item, otherItem);
        let similarity = checkItemMatch(item, otherItem);
        let match = await matchPromise;
        if(similarity > 0.7) {
            if(item instanceof LostItem) {
                match.set('lostItem', item);
                match.set('foundItem', otherItem);
            } else if(item instanceof FoundItem) {
                match.set('lostItem', otherItem);
                match.set('foundItem', item);
            }
            
            match.set('matchScore', similarity);
            let matchPromise = match.save(null, { useMasterKey : true });
            
            let otherPossibleMatches = otherItem.get(KEY_POSSIBLE_MATCHES);

            await matchPromise;
            possibleMatches.push(match.id);

            if(!otherPossibleMatches.includes(match.id)) {
                otherPossibleMatches.push(match.id);
            }

            otherItem.set(KEY_POSSIBLE_MATCHES, otherPossibleMatches);
            otherItem.save(null, { useMasterKey : true });
        }
    }

    initialPossibleMatches.forEach(matchId => {
        if(!possibleMatches.includes(matchId)) {
            deleteMatchFromId(matchId);
        }
    });
    item.set(KEY_POSSIBLE_MATCHES, possibleMatches);
    item.save(null, { useMasterKey : true });
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
