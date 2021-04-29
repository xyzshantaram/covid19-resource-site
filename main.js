const DATA_EXPIRY_TIMEOUT = 18e5; // magic number for 30 minutes

const App = {
    statesLoaded: false,
    loadedStateIndicesCount: 0,
    data: {
        stateLinks: {},
        stateIndices: {},
        stateResources: {}
    }
}

function getSheetID(url) {
    return url.split("/")[5];
}

function getFileFromURL(url, sheetName, onSuccess, onErr) {
    let id = getSheetID(url);
    let params = new URLSearchParams(); // magical API to generate the query string for us

    params.set("id", id);
    params.set("sheetName", sheetName);
    const URL_BASE = `https://googlesheets-proxy.herokuapp.com`;
    let getUrl = `${URL_BASE}/dl?${params.toString()}`; // loading through the proxy for CORS reasons
    fetch(getUrl, {
        method: "GET",
    }).then(response => {
        return response.json();
    }).then(data => {
        onSuccess(data)
    }).catch((error) => {
        console.error('Error:', error);
        if (onErr) onErr(err);
    });
}

function getStateIndex(stateName) {
    if (!App.statesLoaded || !App.data.stateLinks) {
        return;
    }
    let stateResourceList = [];
    let cached = retrieveCachedIfExists(`${stateName}-index`);

    if (cached) {
        App.loadedStateIndicesCount += 1;
        App.data.stateIndices[`${stateName}`] = cached;
    } else {
        console.log(`Attempting to fetch data for state ${stateName}`);

        function onGetIndexSuccess(data) {
            if (data.status === "OK") {
                let rehydratedData = parseTsv(data.text.replaceAll("\\t", "\t").replaceAll("\\r\\n", "\n"));
                for (let item of rehydratedData) {
                    if (item) stateResourceList.push(item["Category"]);
                }
                App.data.stateIndices[stateName] = stateResourceList;
                cacheTimeStampedData(`${stateName}-index`, stateResourceList);
                App.loadedStateIndicesCount += 1;
            } else {
                throw new Error(`Loading sheet for ${stateName} failed with error details:\n${JSON.stringify(data, null, 4)}`);
            }
        }
        getFileFromURL(App.data.stateLinks[stateName], "Index", onGetIndexSuccess);
    }
}

function loadStateResource(stateName, resName) {

    let ret = null;
    if (!App.statesLoaded || (App.loadedStateIndicesCount != Object.keys(App.data.stateLinks).length)) {
        if (App.loadedStateIndicesCount > 0) {
            console.error("some states aren't loaded");
        } else {
            return;
        }
    }

    if (!(stateName in App.data.stateIndices)) {
        throw new Error(`State ${stateName} does not exist`);
    }

    if (!(App.data.stateIndices[stateName].includes(resName))) {
        throw new Error(`Resource ${resName} not present for state ${stateName}`);
    }

    function onGetResourceSuccess(data) {
        setTimeout(resourceLoadPoller, 100);
        if (data.status === "OK") {
            let cleaned = data.text.replaceAll("\\t", "\t").replaceAll("\\r\\n", "\n");
            // console.log(data.text);
            ret = parseTsv(cleaned);
        } else {
            throw new Error(`Loading sheet for ${stateName} failed with error details:\n${JSON.stringify(data, null, 4)}`);
        }
    }

    getFileFromURL(App.data.stateLinks[stateName], resName, onGetResourceSuccess);

    function resourceLoadPoller() {
        if (!ret) {
            setTimeout(resourceLoadPoller, 100);
        } else
            console.log(ret);
    }

    return ret;
}

function loadStates(next) {
    if (!App.statesLoaded) {
        return null;
    }

    let states = Object.keys(App.data.stateLinks);
    for (let x of states) {
        try {
            getStateIndex(x);
        } catch (e) {
            throw new Error(`Loading data for state ${x} failed. More info: \n${e}`);
        }
    }

    function indicesLoadPoller(calls) {
        let count = calls + 1;
        let getLoadedIndicesCount = () => Object.keys(App.data.stateIndices).length;
        if (getLoadedIndicesCount() === states.length || count > 100) {
            next();
        } else {
            setTimeout(indicesLoadPoller, 100, count);
        }
    }

    setTimeout(indicesLoadPoller, 100, 0);
}

function createElementWithClass(type, class_name, text, style) {
    let element = document.createElement(type);
    element.className = class_name;
    if (style) element.style = style;
    if (text) element.textContent = text;
    return element;
}

function renderButtons(resources) {
    let div = document.getElementById("resources");
    div.classList.add("d-flex", "flex-wrap");
    div.textContent = "";

    resources.forEach(resource => {
        let button = createElementWithClass(
            "button",
            "btn btn-outline-info m-1",
            resource
        );
        div.appendChild(button);
    });
}

function renderCard(obj) {
    let container = document.getElementById("information");
    let card_markup = `
<div class="card-body pb-2">
    <div class="d-flex flex-sm-row flex-column justify-content-between">
        <div>
            <h5 class="fs-5 text-wrap">${obj.name}</h5>
            <h6 class="fs-6 text-wrap d-flex align-items-center">
                <i class="fas fa-user" style="margin-right: 5px;"></i>${obj.individual}
            </h6>
            <h6 class="fs-6 text-wrap text-success d-flex align-items-center">
                <i class="fas fa-phone" style="margin-right: 5px;"></i>${obj.phone}
            </h6>

            <h6 class="fs-6 text-wrap text-success d-flex align-items-center">
                <i class="far fa-compass" style="margin-right: 5px;"></i>${obj.location}
            </h6>
        </div>
        <span class="badge bg-success"
            style="padding: 1em 1em; height: fit-content; font-weight: 500; width: fit-content;">Verified</span>
    </div>
</div>
    `;

    let card = createElementWithClass("div", "card mt-4");
    card.innerHTML = card_markup;

    container.appendChild(card);

}

function populateStateDropdown() {
    // Inserts State Options into the states dropdown at the start of the page

    let statesDropdown = document.getElementById("states-dropdown");
    statesDropdown.innerHTML = "<option>---</option>"; // Initialize dropdown with a placeholder value

    Object.keys(App.data.stateIndices).forEach(element => {
        // Creates an option tag for each state in the stateIndices array
        let state = element.split('-')[0];
        let option = document.createElement("option");
        option.innerText = state;
        statesDropdown.appendChild(option);
    })
}

function renderStateResources() {

    // Renders relevant buttons and cards when a state is selected from the states dropdown

    let dropdownValue = document.getElementById("states-dropdown").value;
    if (dropdownValue != "---") {
        renderButtons(App.data.stateIndices[dropdownValue]);
    }
}

function normaliseResourceData() {

}

function beginUI() {
    // Entry point for rendering

    if (!App.statesLoaded || (App.loadedStateIndicesCount != Object.keys(App.data.stateLinks).length)) {
        // Error Handling

        if (App.loadedStateIndicesCount > 0) {
            console.log("some states couldn't be loaded");
            // TODO: replace with dialogue box
        } else {
            return;
        }
    }

    // Rendering code on success

    populateStateDropdown();
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

    const master = "https://docs.google.com/spreadsheets/d/1XxvTvvRsIjkf4dfAZBAIEMm7sTYeiwngHHnl_3eNwk8/edit";

    let cached = retrieveCachedIfExists('state-links');
    if (cached) {
        App.statesLoaded = true;
        App.data.stateLinks = cached;
    } else {
        function onGetMasterSuccess(data) {
            if (data.status === "OK") {
                let rehydratedData = data.text.replaceAll("\\t", "\t").replaceAll("\\r\\n", "\n");
                let stateDict = {} // mapping of states to links. the return value of your dropdown can be used to index this
                let states = parseTsv(rehydratedData);
                for (let state of states) {
                    stateDict[state.Place] = state.Link;
                }

                App.data.stateLinks = stateDict;
                App.statesLoaded = true;
                cacheTimeStampedData("state-links", stateDict);
            } else {
                throw new Error(`Loading master sheet failed failed with error ${data.status}`);
            }
        }
        getFileFromURL(master, "State wise links", onGetMasterSuccess); // get file, since we don't have a cached version of the file.
    }

    function stateLoadPoller() {
        if (App.statesLoaded) {
            console.log("States loaded."); // continue execution from here.
            loadStates(beginUI);
        } else {
            setTimeout(stateLoadPoller, 100);
        }
    }

    setTimeout(stateLoadPoller, 100);
}

window.onload = init;