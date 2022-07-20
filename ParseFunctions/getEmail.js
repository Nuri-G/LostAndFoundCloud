const constants = require('./helpers/constants');

const LostItem = Parse.Object.extend("LostItem");
const FoundItem = Parse.Object.extend("FoundItem");
const Match = Parse.Object.extend("Match");

async function getEmail(request) {
    let match = new Match();
    match.id = request.params.matchId;
    await match.fetch({ useMasterKey : true });

    if(!match.get(constants.KEY_VERIFIED)) {
        return "";
    }

    let lostItem = new LostItem();
    lostItem.id = match.get(constants.KEY_LOST_ITEM).id;
    let lostItemPromise = lostItem.fetch({ useMasterKey: true });
    let foundItem = new FoundItem();
    foundItem.id = match.get(constants.KEY_FOUND_ITEM).id;
    let foundItemPromise = foundItem.fetch({ useMasterKey: true });
    await lostItemPromise;
    await foundItemPromise;
    let res;
    if(request.user.id === lostItem.get(constants.KEY_LOST_BY).id) {
        res = await new Parse.Query("User").equalTo("objectId", foundItem.get(constants.KEY_FOUND_BY).id).find({ useMasterKey: true });
    } else if(request.user.id === foundItem.get(constants.KEY_FOUND_BY).id) {
        res = await new Parse.Query("User").equalTo("objectId", lostItem.get(constants.KEY_LOST_BY).id).find({ useMasterKey: true });
    }
    if(res){
        const user = res[0];
        console.log("Email is: " + user.get("email"));
        return user.get("email");
    }
    return "";
}

Parse.Cloud.define("getEmail", async (request) => {
    try {
        return await getEmail(request);
    } catch (error) {
        console.log("Error verifying quiz: " + error.message);
        console.log(error.stack)
    }
});