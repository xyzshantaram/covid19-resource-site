const App = {
    statesLoaded: false,
    loadedStateIndicesCount: 0,
    data: {
        stateLinks: {},
        stateIndices: {},
        stateResources: {}
    }
}

const PAPA_OPTIONS = {
    header: true,
    delimiter: ',',
    newline: '\n',
    quoteChar: '"',
    skipEmptyLines: false,
}

let Modal = undefined

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
                let rehydratedData = Papa.parse(data.text, PAPA_OPTIONS).data;
                stateResourceList = rehydratedData.map(
                    categoryItems => categoryItems["Category"] // Move the array up from the nested category field
                ).filter(Boolean).filter(word => word.trim().length > 0) // Check if the resource is not empty space
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

function loadStateResource(stateName, resName, onLoadSuccess) {
    let value = null;

    if (App.data.stateResources[stateName][resName]) {
        return;
    }

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

    function resourceLoadPoller() {
        if (!value) {
            setTimeout(resourceLoadPoller, 100);
        } else {
            if (onLoadSuccess) onLoadSuccess(value);
        }
    }

    function onGetResourceSuccess(data) {
        if (data.status === "OK") {
            value = Papa.parse(data.text, PAPA_OPTIONS).data;
        } else {
            throw new Error(`Loading sheet for ${stateName} failed with error details:\n${JSON.stringify(data, null, 4)}`);
        }

        setTimeout(resourceLoadPoller, 100);
    }

    getFileFromURL(App.data.stateLinks[stateName], resName, onGetResourceSuccess);
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

        App.data.stateResources[x] = {};
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
    let essential = document.getElementById("essential-resources");
    let other = document.getElementById("other-resources");
    essential.textContent = "";
    other.textContent = "";

    resources.sort((x, y) => y.length - x.length).forEach(resource => {
        let button = createElementWithClass(
            "button",
            "btn btn-primary resource-btn",
            resource
        );

        button.onclick = function() {
            let selectedState = document.getElementById("states-dropdown").value;
            if (selectedState === "---") return;
            Modal.show();
            loadStateResource(selectedState, resource, onResLoadSuccess);

            function onResLoadSuccess(data) {
                renderStateResourceData(data, selectedState, resource);
                Modal.hide();
            }
        }

        resource = resource.trim();
        let essentialResource = ['Oxygen', 'Plasma', 'Beds', 'Ambulance'];
        if (essentialResource.includes(resource)) {
            button.classList.add('essentialButton');
            essential.appendChild(button);
        } else
            other.appendChild(button);
    });
}

function setElementStyleProp(elem, property, value) {
    if (elem) {
        elem.style[property] = value;
    }
}

function toggleElementDisplay(selector) {
    let elem = document.querySelector(selector);
    if (elem) {
        let d = elem.style.display;
        (d === 'none') ? setElementStyleProp(elem, "display", "block"): setElementStyleProp(elem, "display", "none");
    }
}

function renderCard(obj) {
    if (obj.Verified === "no") {
        return;
    }
    let container = document.getElementById("information");
    let elements = ``;

    for (let key in obj) {
        if (key === "Verified") continue;
        if (!Boolean(key) || !Boolean(obj[key])) continue;
        let elt = `
        <div>
            <div class='d-inline fs-5' style='font-weight: 500'>${capitaliseFirstLetter(key)}: </div>
            <div class='d-inline fs-5' style='font-weight: 400'>${obj[key]}</div>
        </div>`;
        elements += elt;
    }

    let status = obj.Verified === "yes" ? "success" : "warning";
    let badgeNotice = obj.Verified === "yes" ? "Verified" : "Unverified";
    let warning = obj.Verified === "yes" ? "" :
        `<span class='alert alert-warning' style='font-size: 10px'>
            This lead is unverified. Information is potentially incorrect. Use at your own risk.
        </span>`;
    let badge = `<span class="badge bg-${status} mt-2"
        style="padding: 1em 1em; height: fit-content; font-weight: 500; width: auto;">
        ${badgeNotice}
    </span>`;
    elements += badge + warning;

    let card_markup = `
        <div class="card-body pb-2">
            <div class="d-flex flex-column align-items-left">
                ${elements}
            </div>
        </div>`;
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

function renderStateResourceButtons() {
    // Renders relevant buttons and cards when a state is selected from the states dropdown
    let dropdownValue = document.getElementById("states-dropdown").value;
    if (dropdownValue != "---") {
        setElementStyleProp(document.querySelector("#resource-group"), "display", "block");
        renderButtons(App.data.stateIndices[dropdownValue]);
    } else {
        setElementStyleProp(document.querySelector("#resource-group"), "display", "none");
    }
}

function renderStateResourceData(list, stateName, resName) {
    // renders cards
    let isInvalid = (item) => !Boolean(item) || item === "retry"
    list.sort(function(a, b) {
        if (!isInvalid(a.Verified) && isInvalid(b.Verified)) {
            console.log(270)
            return -1;
        }
        if (isInvalid(a.Verified) && !isInvalid(b.Verified)) {
            console.log(274)
            return 1;
        }
        return 0;
    });
    let container = document.getElementById("information");
    let header = document.querySelector("label[for='information']");
    header.innerHTML = `Resource list: ${resName} in ${stateName}`;
    container.innerHTML = "";
    for (let x of list) {
        renderCard(x);
    }
}


function setModalContent(content) {
    // Sets the content of the reusable modal
    document.getElementById("reusable-modal-content").textContent = content;
}

function SetModalSpinnerDisplay(state) {
    let propString = "none";
    if (state) propString = "block";
    let spinner = document.querySelector('#loading-spinner');
    setElementStyleProp(spinner, display, propString);
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
    Modal.hide(); // Loading is done, disable modal
    populateStateDropdown();
}

function init() {
    // Create a loading modal
    Modal = new bootstrap.Modal(document.getElementById("reusable-modal"), {
        backdrop: "static",
        focus: true,
        keyboard: true
    });
    setModalContent("Loading...")
    // Toggle the modal
    Modal.toggle();

    document.querySelector("#states-dropdown").onchange = renderStateResourceButtons;

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
                let stateDict = {} // mapping of states to links. the return value of your dropdown can be used to index this
                let states = Papa.parse(data.text, PAPA_OPTIONS).data;
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