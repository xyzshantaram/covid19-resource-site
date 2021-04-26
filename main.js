const DATA_EXPIRY_TIMEOUT = 18e5; // magic number for 30 minutes

const App = {
    statesLoaded: false,
    data: {
        stateLinks: {},
        stateIndices: {

        }
    }
}

function getSheetID(url) {
    return url.split("/")[5];
}

function getFileFromURL(url, sheetName, format, onSuccess, onErr) {
    let id = getSheetID(url);
    let dlFormat = encodeURI(format || "tsv");
    let encodedSheetName = encodeURI(sheetName);
    let params = new URLSearchParams(); // magical API to generate the query string for us

    params.set("id", id);
    params.set("format", dlFormat);
    params.set("sheetName", encodedSheetName);

    let getUrl = `https://googlesheets-proxy.herokuapp.com/dl?${params.toString()}`; // loading through the proxy for CORS reasons

    console.log(getUrl);
    fetch(getUrl, {
            method: "GET",
        })
        .then(response => {
            return response.json()
        })
        .then(data => {
            onSuccess(data)
        })
        .catch((error) => {
            console.error('Error:', error);
            if (onErr) onErr(err);
        });
}

function getStateIndex(stateName) {
    if (!App.statesLoaded) {
        return null;
    }

    function onIndexGetSuccess(data) {
        if (data.status === "OK") {
            let rehydratedData = data.text.replaceAll("\\t", "\t").replaceAll("\\r\\n", "\n");
        } else {
            throw new Error(`Loading sheet for ${stateName} failed with error ${data.status}`);
        }
    }
}

function cacheTimeStampedData(name, obj) {
    let objTimeWrapper = {
        time: new Date(),
        data: JSON.stringify(obj)
    }
    localStorage.setItem(name, JSON.stringify(objTimeWrapper));
}

function retrieveCachedIfExists(name) {
    let cached = localStorage.getItem(name); // check localStorage for previously cached object wrappers of this name.
    let parsedWrapper = cached ? JSON.parse(cached) : null; // if it exists, parse the wrapper.

    if (parsedWrapper && new Date() - parsedWrapper.time > DATA_EXPIRY_TIMEOUT) { // if the data is too old, clear it and return null
        localStorage.removeItem(name);
        parsedWrapper = null;
    }

    return parsedWrapper ? JSON.parse(parsedWrapper.data) : null; // return original object or null
}

function init() {
    if (!String.prototype.replaceAll) { // polyfill replaceAll
        String.prototype.replaceAll = function(arg1, arg2) {
            let toRet = this;
            while (toRet.includes(arg1)) {
                toRet = toRet.replace(arg1, arg2);
            }
            return toRet;
        }
    }

    const master = "https://docs.google.com/spreadsheets/d/1XxvTvvRsIjkf4dfAZBAIEMm7sTYeiwngHHnl_3eNwk8/edit#gid=0";

    let cached = retrieveCachedIfExists('state-links');
    if (cached) {
        App.statesLoaded = true;
        App.data.stateLinks = cached;
    } else {
        function onGetMasterSuccess(data) {
            if (data.status === "OK") {
                let rehydratedData = data.text.replaceAll("\\t", "\t").replaceAll("\\r\\n", "\n");
                let stateDict = {} // mapping of states to links. the return value of your dropdown can be used to index this
                let states = tsvParser(rehydratedData);
                for (let state of states) {
                    stateDict[state.Place] = state.Link;
                }

                App.data.stateLinks = stateDict;
                App.statesLoaded = true;
                cacheTimeStampedData("state-links", stateDict)
            } else {
                throw new Error(`Loading master sheet failed failed with error ${data.status}`);
            }
        }
        getFileFromURL(master, "State wise links", "tsv", onGetMasterSuccess); // get file, since we don't have a cached version of the file.
    }

    function stateLoadPoller() {
        if (App.statesLoaded) {
            console.log("States loaded."); // continue execution from here.
            return;
        } else {
            setTimeout(stateLoadPoller, 100);
        }
    }

    setTimeout(stateLoadPoller, 100);
}

window.onload = init;