let App = {
    statesLoaded: false,
    data: {

    }
}

function getSheetID(url) {
    return url.split("/")[5];
}

function getFileFromURL(url, sheetName, format, onSuccess, onErr) {
    let id = getSheetID(url);
    let dlFormat = encodeURI(format || "tsv");
    let encodedSheetName = encodeURI(sheetName);
    let params = new URLSearchParams();

    params.set("id", id);
    params.set("format", dlFormat);
    params.set("sheetName", encodedSheetName);

    let getUrl = `https://googlesheets-proxy.herokuapp.com/dl?${params.toString()}`;
    console.log(getUrl);
    fetch(getUrl, {
            method: "GET",
        })
        .then(response => {
            return response.json()
        })
        .then(data => onSuccess(data))
        .catch((error) => {
            console.error('Error:', error);
            if (onErr) onErr(err);
        });
}

function getStateIndex(stateName) {
    if (!App.statesLoaded) {
        return null;
    }
}

function init() {
    const master = "https://docs.google.com/spreadsheets/d/1XxvTvvRsIjkf4dfAZBAIEMm7sTYeiwngHHnl_3eNwk8/edit#gid=0";

    function onGetMasterSuccess(data) {
        if (data.status === "OK") {
            let rehydratedData = data.text.replaceAll("\\t", "\t").replaceAll("\\r\\n", "\n"); // text gets "dehydrated" ie the \t and \n get converted to literals so we're re-converting that stuff
            let stateDict = {} // mapping of states to links. the return value of your dropdown can be used to index this
            let states = tsvParser(rehydratedData);
            for (let state of states) {
                stateDict[state.Place] = state.Link;
            }

            App.data.stateLinks = stateDict;
            App.statesLoaded = true;

            let statesWrapper = { // a quick-and-dirty wrapper to store state data along with the timestamp it was loaded at
                time: new Date(),
                data: JSON.stringify(stateDict)
            }
            localStorage.setItem(`state-links`, JSON.stringify(statesWrapper));
        } else {
            return;
        }
    }

    let cachedStateLinks = localStorage.getItem('state-links'); // check localStorage for previously cached links.
    let jsonStateLinks = cachedStateLinks ? JSON.parse(cachedStateLinks) : null; // if they exist, parse them into JS objects

    if (!jsonStateLinks || new Date() - jsonStateLinks.time > 18e5) { // 18e5 = 30 minutes
        getFileFromURL(master, "State wise links", "tsv", onGetMasterSuccess);
    } else {
        App.statesLoaded = true;
        App.data.stateLinks = JSON.parse(jsonStateLinks.data); // load the cached versions of the links
    }
}

window.onload = init;