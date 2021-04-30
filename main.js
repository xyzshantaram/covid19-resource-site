const App = {
    statesLoaded: false,
    loadedStateIndicesCount: 0,
    data: {
        stateLinks: {},
        stateIndices: {},
        stateResources: {}
    },
    pollerDelay: 200
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
    let waits = 0;

    if (App.data.stateResources[stateName][resName]) {
        value = App.data.stateResources[stateName][resName];
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
            if (waits > 100) {
                throw new Error(`Loading sheet for ${stateName} failed: Timed out.`);
            }
            setTimeout(resourceLoadPoller, App.pollerDelay);
            waits += 1;
        } else {
            if (onLoadSuccess) {
                let isInvalid = (item) => !(Boolean(item) && Boolean(item.trim())) || item.trim().toLocaleLowerCase() === "retry";
                value.sort(function (a, b) {
                    if (isInvalid(a.Verified) && !isInvalid(b.Verified)) {
                        return 1;
                    }
                    if (!isInvalid(a.Verified) && isInvalid(b.Verified)) {
                        return -1;
                    }
                    return 0;
                });
                onLoadSuccess(value);
            }
        }
    }

    function onGetResourceSuccess(data) {
        if (data.status === "OK") {
            value = Papa.parse(data.text, PAPA_OPTIONS).data;
        } else {
            throw new Error(`Loading sheet for ${stateName} failed with error details:\n${JSON.stringify(data, null, 4)}`);
        }
    }

    getFileFromURL(App.data.stateLinks[stateName], resName, onGetResourceSuccess);
    setTimeout(resourceLoadPoller, App.pollerDelay);
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
            setTimeout(indicesLoadPoller, App.pollerDelay, count);
        }
    }

    setTimeout(indicesLoadPoller, App.pollerDelay, 0);
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
            showLoadingDialog();

            function onResLoadSuccess(data) {
                renderStateResourceData(data, selectedState, resource);
                hideDialog();
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
    if (obj.Verified && obj.Verified.toLocaleLowerCase() === "no") return;
    let container = document.getElementById("information");

    let normaliser = {
        entity: {
            elem: '',
            list: ['name', 'contact person name', 'company', 'entity', 'company name', 'contact name'],
            icon: '<i class="fas fa-user-friends"></i>',
            class: `fs-5 text-wrap d-inline`
        },
        phone: {
            elem: '',
            list: ['number', 'contact number', 'phone'],
            icon: '<i class="fas fa-phone"></i>',
        },
        place: {
            elem: '',
            list: ['area', 'city', 'zone'],
            icon: '<i class="fas fa-map-marker-alt"></i>',
        },
        comment: {
            elem: '',
            list: ['status', 'comment', 'remarks'],
            icon: '<i class="fas fa-comment"></i>',
        },
    }

    let final = [];
    let normalised = {};

    for (let key in obj) {
        if (key === "Verified") continue;
        if (!Boolean(key) || !Boolean(obj[key])) continue;
        if (!Boolean(key.trim()) || !Boolean(obj[key].trim())) continue;

        for (let category in normaliser) {
            if (normaliser[category].list.includes(key.toLowerCase())) {
                normaliser[category].value = obj[key];
                normalised[key] = category;
            }
        }

        function createRow(k, v, icon, textClass) {
            function getClass() {
                if (textClass) return textClass;
                return "fs-6 text-wrap d-inline";
            }
            return {
                k: k,
                v: v,
                icon: Boolean(icon),
                str: `<div style='width: 100%; text-align: left;' class='m-1'>
                <div class="${getClass()}" style='font-weight: 500'> ${icon ? icon : k} </div>
            <div class="${getClass()}" style='font-weight: 400'> ${v} </div> </div>`
            }
        }

        if (!Object.keys(normalised).includes(key)) {
            final.push(createRow(key, obj[key]));
        } else {
            final.push(createRow(normalised[key],
                obj[key], normaliser[normalised[key]].icon,
                normaliser[normalised[key]].class));
        }
    }
    if (final.length == 0) {
        return;
    }
    final.sort((b, a) => {
        if (a.icon && !b.icon) return 1;
        if (b.icon && !a.icon) return -1;
        return 0;
    })
    final = final.map((itm) => itm.str);
    let status = obj.Verified === "yes" ? "success" : "warning";

    let statusElements = {
        header: "",
        footer: ""
    }
    if (status == 'success') {
        statusElements.footer =
            `<div class="card-footer text-center rounded-bottom bg-${status} text-light">
            Verified
        </div>`;
    } else {
        statusElements.header =
            `<div class="card-header text-center rounded-top bg-${status} text-white">
            This lead is unverified. Information potentially incorrect; use at your own risk!
        </div>`;
    }

    let cardGen =
        `
        <div class="col-lg-6 col-12 p-lg-2 px-0 py-1">
            <div class="card h-100 ml-2 mt-4 alert-${status}">
                ${statusElements.header}
                <div class="card-body pb-2">
                    <div class="d-flex flex-column">
                        ${final.join("\n")}
                    </div>
                </div>
                ${statusElements.footer}
            </div>
        </div>
        `;
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
    let container = document.getElementById("information");
    let title = document.querySelector("label[for='information']");
    setElementStyleProp(title, "display", "block");
    title.innerHTML = `Resource list: ${resName} in ${stateName}`;
    container.innerHTML = "";

    list.forEach(item => {
        renderCard(item)
    })
    cardCount = list.length
}

function showLoadingDialog() {
    let spinner = `<img src="assets/Spinner-1s-200px.svg" width="20%" id='loading-spinner'>`;
    setModalContent("Loading...", spinner, null, false);
    Modal.show();
}


function showInfoDialog(msg) {
    setModalContent(msg, `<i class="fas fa-exclamation-circle fs-4 mt-1 mb-1"></i>`, "Information", true);
    Modal.show();
}

function showErrorDialog(msg) {
    setModalContent(msg, `<i class="fas fa-exclamation-triangle fs-4 mt-1 mb-1"></i>`, "Error", false);
    Modal.show();
}

function hideDialog() {
    setModalContent("", "");
    Modal.hide();
}

function setModalContent(content, eltString, header, isDismissable, staticBackdrop) {
    // Sets the content of the reusable modal
    document.getElementById("modal-content-wrapper").innerHTML = `
    ${(function () {
            if (header) {
                return `
            <div class='modal-header' id='modal-header'>
                ${header}
            </div>`
            }
            return "";
        })()}
    <div class="container-fluid d-flex align-items-center flex-column">
        <div id="reusable-modal-content" class="modal-body">
        ${eltString}
        ${content}
        </div>
    </div>
    ${(function () {
            if (isDismissable) {
                return `
            <div class='modal-footer' id='modal-footer'>
                <button type="button" class="btn btn-secondary" onclick="hideDialog()">Close</button>
            </div>`
            }
            return "";
        })()}`;

    if (staticBackdrop)
        document.getElementById("reusable-modal").setAttribute("data-bs-backdrop", "static");
    else
        document.getElementById("reusable-modal").setAttribute("data-bs-backdrop", "");
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
            // TODO: replace with dialogue box
        } else {
            return;
        }
    }

    // Rendering code on success
    hideDialog();
    infoButtonHandler();
    populateStateDropdown();
}

function infoButtonHandler() {
    showInfoDialog(`
        <div>Welcome to covid.resources.india's official website.</div>
        <div>
        How to use:
        <ol>
        <li>Select a state using the dropdown box.</li>
        <li>Click one of the resource buttons to view leads for that resource in that state.</li>
        <li>Verified resources have a green badge at the bottom, and have been verified by our volunteers.</li>
        <li>Unverified resources have not been verified yet, but still have a chance of working.</li>
        </ol>
        </div>
        <div>Check out our:
            <ul>
            <li><a href='https://instagram.com/covid.resources.india'>Instagram page</a></li>
            <li><a href='https://linktr.ee/Eccentric.Blue'>LinkTree</a></li>
            <li><a href='#'>Twitter page</a></li></li>
            </ul>
        </div>
        <div>
            <a href='https://github.com/shantaram3013/covid19-resource-site/issues'>Report bugs</a>
            to <a href='https://github.com/shantaram3013/covid19-resource-site'>GitHub.</a>
        </div>
        <div> This site and the data it displays is collected and maintained by volunteers.
            <a href='https://www.instagram.com/covid.resources.india/'>
            Click here for information on volunteering.
            </a>
        </div>
        <div>
        Made with <i class="fas fa-heart"></i> by <a href='https://github.com/dakshsethi'>Daksh Sethi</a>,
        <a href='https://github.com/kinshukdua'>Kinshuk Dua</a>,
        <a href='https://github.com/Krishna-Sivakumar'>Krishna Sivakumar</a>,
        and <a href='https://github.com/shantaram3013'>Siddharth Singh</a>
        </div>
    `)
}

function init() {
    let resTitle = document.querySelector("label[for='information']");
    document.querySelector('#info-button').addEventListener('click', infoButtonHandler);
    setElementStyleProp(resTitle, "display", "none");
    // Create a loading modal
    Modal = new bootstrap.Modal(document.getElementById("reusable-modal"), {
        backdrop: "static",
        focus: true,
        keyboard: true
    });
    showLoadingDialog();

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
            loadStates(beginUI);
        } else {
            setTimeout(stateLoadPoller, App.pollerDelay);
        }
    }

    setTimeout(stateLoadPoller, App.pollerDelay);
}

window.onload = init;
