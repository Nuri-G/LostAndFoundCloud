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
