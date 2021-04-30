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

        button.onclick = function () {
            let selectedState = document.getElementById("states-dropdown").value;
            if (selectedState === "---") return;
            Modal.show();

            function onResLoadSuccess(data) {
                renderStateResourceData(data, selectedState, resource);
                Modal.hide();
            }

            loadStateResource(selectedState, resource, onResLoadSuccess);
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
        (d === 'none') ? setElementStyleProp(elem, "display", "block") : setElementStyleProp(elem, "display", "none");
    }
}

let cardCount = 0;

function renderCard(obj) {
    console.log(obj);
    let container = document.getElementById("information");

    let company = '', companyEle = '', companyList = ['Company', 'Entity', 'Company Name', 'Contact Name'];
    let p_name = '', nameEle = '', nameList = ['Name', 'Contact Person Name'];
    let number = '', numberEle = '', numberList = ['Number', 'Contact Number', 'Phone', ''];
    let area = '', areaEle = '', areaList = ['Area', 'City', 'Zone'];
    let comment = '', commentEle = '', commentList = ['Status', 'Comment', 'Remarks', 'Comment.'];

    for (let key in obj) {
        if (key === "Verified") continue;
        if (!Boolean(key) || !Boolean(obj[key])) continue;
        console.log(key + "=" + obj[key]);

        if (companyList.includes(key))
            company = company + obj[key] + ' ';
        else if (nameList.includes(key))
            p_name = p_name + obj[key] + ' ';
        else if (numberList.includes(key))
            number = number + obj[key] + ', ';
        else if (areaList.includes(key))
            area = area + obj[key];
        else if (commentList.includes(key))
            comment = comment + obj[key] + '. ';

        if (company != '')
            companyEle = `<h5 class="fs-5 text-wrap">${company}</h5>`;

        if (p_name != '') {
            nameEle =
                `<h6 class="fs-6 text-wrap d-flex align-items-center">
                    <i class="fas fa-user svg"></i>
                    ${p_name}
            </h6>`;
            // console.log(p_name, nameEle)
        }

        if (number != '') {
            numberEle =
                `<h6 class="fs-6 text-wrap d-flex align-items-center">
                    <i class="fas fa-phone-alt svg"></i>
                    ${number}
            </h6>`;
        }

        if (area != '') {
            // alert(area);
            areaEle =
                `<h6 class="fs-6 text-wrap d-flex align-items-center">
                <i class="fas fa-map-marker-alt svg"></i>
                ${area}
             </h6>`;
        }

        if (comment != '') {
            commentEle =
                `<h6 class="fs-6 text-wrap d-flex align-items-center">
                <i class="fas fa-comment svg"></i>
                ${comment}
             </h6>`;
        }
    }

    let status = obj.Verified === "yes" ? "success" : "warning";
    let statusEleHead = '';
    let statusEleFoot = '';
    if (status == 'success') {
        statusEleFoot =
            `<div class="card-footer text-center">
            Verified
        </div>`;
        statusEleHead = '';
    } else {
        statusEleHead =
            `<div class="card-header text-center">
            This lead is unverified. Information potentially incorrect; use at your own risk!
        </div>`;
        statusEleFoot = '';
    }
    console.log(company + p_name + number + area + comment);
    console.log(companyEle);
    console.log(numberEle);
    console.log(nameEle);
    console.log(areaEle);


    let cardGen =
        `
        <div class="col-lg-6 col-12 p-lg-2 px-0 py-1">
            <div class="card mt-4 alert-${status}">
                ${statusEleHead}
                <div class="card-body pb-2">
                    <div class="d-flex flex-sm-row flex-column justify-content-between">
                        <div>`
        + companyEle + nameEle + numberEle + areaEle + commentEle +
        `</div>
                    </div>
                </div>
                ${statusEleFoot}
            </div>
        </div>
        `;

    // console.log(cardGen);
    if (obj.Verified != 'no')
        container.innerHTML += cardGen;
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

function onStateDropdownChange() {
    // Renders relevant buttons and cards when a state is selected from the states dropdown
    let container = document.getElementById("information");
    let title = document.querySelector("label[for='information']");
    setElementStyleProp(title, "display", "none");
    container.innerHTML = "";
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
    let isInvalid = (item) => !Boolean(item) || item.toLocaleLowerCase() === "retry";
    list.sort(function (a, b) {
        if (!isInvalid(a.Verified) && isInvalid(b.Verified)) {
            return -1;
        }
        if (isInvalid(a.Verified) && !isInvalid(b.Verified)) {
            return -1;
        }
        if (!isInvalid(a.Verified) && isInvalid(b.Verified)) {
            return 1;
        }
        return 0;
    });
    let container = document.getElementById("information");
    let title = document.querySelector("label[for='information']");
    setElementStyleProp(title, "display", "block");
    title.innerHTML = `Resource list: ${resName} in ${stateName}`;
    container.innerHTML = "";
    console.log(list);

    list.forEach(item => { renderCard(item) })
    cardCount = list.length
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
    let resTitle = document.querySelector("label[for='information']");
    setElementStyleProp(resTitle, "display", "none");
    // Create a loading modal
    Modal = new bootstrap.Modal(document.getElementById("reusable-modal"), {
        backdrop: "static",
        focus: true,
        keyboard: true
    });
    setModalContent("Loading...")
    // Toggle the modal
    Modal.toggle();

    document.querySelector("#states-dropdown").onchange = onStateDropdownChange;

    if (!String.prototype.replaceAll) { // polyfill replaceAll
        String.prototype.replaceAll = function (arg1, arg2) {
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
