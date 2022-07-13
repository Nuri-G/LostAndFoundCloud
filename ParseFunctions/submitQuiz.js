const axios = require('axios');
const constants = require('./helpers/constants');

const FoundItem = Parse.Object.extend("FoundItem");
const Match = Parse.Object.extend("Match");

async function findSafeLocation(geoPoint) {
    let latitude = geoPoint.latitude;
    let longitude = geoPoint.longitude;
    let radiusMeters = 15000
    let url = 'https://api.geoapify.com/v2/places?categories=service.police&filter=circle%3A' + longitude + '%2C' + latitude + '%2C' + radiusMeters + '&bias=proximity%3A' + longitude + '%2C' + latitude + '&limit=5' + '&apiKey=' + process.env.GEOAPIFY_KEY;
    let options = {
        method: 'GET',
        url: url,
        headers: { }
    };

    return (await axios.request(options)).data.features
        .map(feature => {
            return {
                locationName: feature.properties.name,
                address: feature.properties.formatted,
                distance: feature.properties.distance
            }
        });
}

async function submitQuiz(request) {
    let match = new Match();
    match.id = request.params.matchId;
    await match.fetch({ useMasterKey : true });

    console.log("MATCH IS " + JSON.stringify(match));

    let foundItem = new FoundItem();
    foundItem.id = match.get(constants.KEY_FOUND_ITEM).id;
    await foundItem.fetch({ useMasterKey : true });

    let location = foundItem.get(constants.KEY_ITEM_LOCATION);
    let safeMeetingPromise = findSafeLocation(location);

    let answers = foundItem.get(constants.KEY_ITEM_DETAILS);

    console.log("ANSWERS: " + JSON.stringify(answers));

    let totalScore = 0;
    let itemCount = 0;

    for (const [key, value] of Object.entries(answers)) {
        itemCount++;
        if(value === request.params[key]) {
            totalScore++;
        }
    }

    let scoreProportion = totalScore / itemCount;

    if(scoreProportion > 0.7) {
        console.log("Quiz verified for match " + match.id)
        match.set(constants.KEY_VERIFIED, true);
        match.set(constants.KEY_MEETING_PLACES, await safeMeetingPromise)
        match.save(null, { useMasterKey : true });
        return true;
    } else {
        console.log("FAILED");
        let quizFails = foundItem.get(constants.KEY_QUIZ_FAILS);
        quizFails.push(request.user.id);
        foundItem.set(constants.KEY_QUIZ_FAILS, quizFails);
        foundItem.save(null, { useMasterKey : true });
        deleteMatch(match);
        return false;
    }
}

Parse.Cloud.define("submitQuiz", async (request) => {
    try {
        return await submitQuiz(request);
    } catch(error) {
        console.log("Error verifying quiz: " + error.message);
        console.log(error.stack)
    }
});