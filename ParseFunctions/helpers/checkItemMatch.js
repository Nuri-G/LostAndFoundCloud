module.exports = checkItemMatch;

const levenshtein = require('fast-levenshtein');
const axios = require('axios');
const constants = require('./constants');

//Returns value = require( 0 to 1 depending on how close to 0 the distance is.
function calculateLocationSimilarity(item, otherItem) {
    const MAX_DISTANCE = 20.0;

    let distanceMi = item.get(constants.KEY_ITEM_LOCATION).milesTo(otherItem.get(constants.KEY_ITEM_LOCATION));

    if(distanceMi > MAX_DISTANCE) {
        return 0;
    } else {
        return (MAX_DISTANCE - distanceMi) / MAX_DISTANCE;
    }
}

async function getSynonyms(word) {
    const options = {
        method: 'GET',
        url: 'https://wordsapiv1.p.rapidapi.com/words/' + encodeURI(word) + '/synonyms',
        headers: {
            'X-RapidAPI-Key': process.env.THESAURUS_KEY,
            'X-RapidAPI-Host': process.env.THESAURUS_HOST
        }
    };
    try {
        let data = (await axios.request(options)).data;
        if(data.success !== false) {
            let synonyms = data.synonyms;
            synonyms.push(word);
            console.log("Synonyms are: " + JSON.stringify(synonyms));
            return synonyms;
        }
    } catch {
        console.log("Failed to fetch synonyms.");
    }
    
    return [word];
}

function calculateNameSimilarity(synonyms, otherItem) {
    let otherName = otherItem.get(constants.KEY_ITEM_NAME).toLowerCase();
    let maxSimilarity = 0;

    for(let itemName of synonyms) {
        let longerLength = Math.max(itemName.length, otherName.length);
        let similarity = levenshtein.get(itemName, otherName);
        let similarityProportion = (longerLength - similarity) / longerLength;

        if(similarityProportion > maxSimilarity) {
            maxSimilarity = similarityProportion;
        }
    }

    return maxSimilarity;
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

    let lostDate = lostItem.get(constants.KEY_TIME_LOST);
    let foundDate = foundItem.get(constants.KEY_TIME_FOUND);

    const oneDay = 24 * 60 * 60 * 1000;

    const daysBetween = Math.round(Math.abs((lostDate - foundDate) / oneDay));

    const MAX_DAYS_AFTER = 14;
    const MAX_DAYS_BEFORE = 1;

    if(daysBetween > -MAX_DAYS_BEFORE && daysBetween < MAX_DAYS_AFTER) {
        return (MAX_DAYS_AFTER - daysBetween) / MAX_DAYS_AFTER;
    }
    return 0;
}

async function checkItemMatch(item, otherItem) {
    const NAME_SIMILARITY_WEIGHT = 0.4;
    const LOCATION_SIMILARITY_WEIGHT = 0.3;
    const TIME_SIMILARITY_WEIGHT = 0.3;

    let synonyms = getSynonyms(item.get(constants.KEY_ITEM_NAME));

    let locationSimilarity = calculateLocationSimilarity(item, otherItem);
    let timeSimilarity = calculateTimeSimilarity(item, otherItem);
    let nameSimilarity = calculateNameSimilarity(await synonyms, otherItem);

    return NAME_SIMILARITY_WEIGHT * nameSimilarity + LOCATION_SIMILARITY_WEIGHT * locationSimilarity + TIME_SIMILARITY_WEIGHT * timeSimilarity;
}