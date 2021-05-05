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

// basic performance class. instantiate it right before performing an action, and call <obj>.log()
// whenever you want to measure how long the task took.
// the 'name' parameter provides an optional name by which to identify the task for which
// performance was just logged.
// Useful for testing the time taken by a series of tasks at once.
class Performance {
    constructor(name) {
        this.startTime = performance.now();
        this.name = name;
    }

    getElapsed() {
        return performance.now() - this.startTime;
    }

    log() {
        let name = this.name;
        let task = ((str) => {
            return str ? `Task '${str}'` : `Task`
        })(name);
        console.log(`${task} took ${this.getElapsed()}ms to complete`);
    };
}

const PAPA_OPTIONS = {
    header: true,
    delimiter: ',',
    newline: '\n',
    quoteChar: '"',
    skipEmptyLines: false,
}

let Modal = undefined
let loadingModal = undefined // variable declaration for the loading modal

function getSheetID(url) {
    return url.split("/")[5];
}

function getFileFromURL(url, sheetName, onSuccess, onErr) {
    let id = getSheetID(url);
    let params = new URLSearchParams(); // magical API to generate the query string for us

    params.set("id", id);
    params.set("sheetName", sheetName);

    let loadTime = new Performance(`load ${sheetName}`);
    const URL_BASE = `https://googlesheets-proxy.herokuapp.com`;
    let getUrl = `${URL_BASE}/dl?${params.toString()}`; // loading through the proxy for CORS reasons
    fetch(getUrl, {
        method: "GET",
    }).then(response => {
        return response.json();
    }).then(data => {
        onSuccess(data)
        loadTime.log();
    }).catch((error) => {
        console.error('Error:', error);
        if (onErr) onErr(err);
    });
}

function loadStateIndex(stateName) {
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
                ).filter(Boolean).filter(word => word.trim().length > 0) // Check if the resource is empty or undefined
                App.data.stateIndices[stateName] = stateResourceList;
                cacheTimeStampedData(`${stateName}-index`, stateResourceList, 150e3);
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
        if (onLoadSuccess) onLoadSuccess(value);
        return;
    }

    if (!App.statesLoaded) {
        return;
    }

    if (!(stateName in App.data.stateIndices)) {
        throw new Error(`State ${stateName} does not exist`);
    }

    if (!(App.data.stateIndices[stateName].includes(resName.trim()))) {
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
            let isInvalid = (item) => !(Boolean(item) && Boolean(item.trim())) || item.trim().toLocaleLowerCase() === "retry";
            value.sort(function(a, b) {
                if (isInvalid(a.Verified) && !isInvalid(b.Verified)) {
                    return 1;
                }
                if (!isInvalid(a.Verified) && isInvalid(b.Verified)) {
                    return -1;
                }
                return 0;
            });
            if (onLoadSuccess) {
                onLoadSuccess(value);
            }
        }
    }

    function onGetResourceSuccess(data) {
        if (data.status === "OK") {
            value = Papa.parse(data.text, PAPA_OPTIONS).data;
            App.data.stateResources[stateName][resName] = value;
        } else {
            throw new Error(`Loading sheet for ${stateName} failed with error details:\n${JSON.stringify(data, null, 4)}`);
        }
    }

    getFileFromURL(App.data.stateLinks[stateName], resName, onGetResourceSuccess);
    setTimeout(resourceLoadPoller, App.pollerDelay);
}

function initialiseStates() {
    let states = Object.keys(App.data.stateLinks);
    for (let x of states) {
        App.data.stateResources[x] = {};
    }
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
            showLoadingDialog();

            function onResLoadSuccess(data) {
                renderStateResourceData(data, selectedState, resource);
                loadingModal.hide();
            }

            loadStateResource(selectedState, resource, onResLoadSuccess);
        }

        resource = resource.trim();
        let essentialResource = ['Oxygen', 'Plasma', 'Beds', 'Ambulance'];
        if (essentialResource.includes(resource)) {
            essential.appendChild(button);
        } else {
            other.appendChild(button);
        }
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
            <div class="card h-100 ml-2 mt-4 alert-${status}">
                ${statusElements.header}
                <div class="card-body pb-2">
                    <div class="d-flex flex-column">
                        ${final.join("\n")}
                    </div>
                </div>
                ${statusElements.footer}
            </div>
        `;
    let fragment = document.createElement('div');
    fragment.className = "col-lg-6 col-12 p-lg-2 px-0 py-1";
    fragment.innerHTML = cardGen;
    container.append(fragment); // this is a lot faster than innerHTML even though innerHTML is
    // traditionally super fast because setting innerHTML forces the browser to re-render older
    // cards that haven't changed, simply because the string itself changed
}

function populateStateDropdown() {
    // Inserts State Options into the states dropdown at the start of the page
    let statesDropdown = document.getElementById("states-dropdown");
    statesDropdown.innerHTML = "<option>---</option>"; // Initialize dropdown with a placeholder value
    Object.keys(App.data.stateLinks).forEach(element => {
        // Creates an option tag for each state in the stateIndices array
        let state = element.split('-')[0];
        let option = document.createElement("option");
        option.innerText = state;
        statesDropdown.appendChild(option);
    })
}

function onStateDropdownChange() {
    // Renders relevant buttons and cards when a state is selected from the states dropdown
    let dropdownValue = document.getElementById("states-dropdown").value;
    let waits = 0;

    if (dropdownValue !== "---") {
        showLoadingDialog();
        loadStateIndex(dropdownValue);

        function indexLoadPoller() {
            if (!App.data.stateIndices[dropdownValue]) {
                if (waits > 100) {
                    throw new Error("Error loading state index: timed out");
                } else {
                    setTimeout(indexLoadPoller, App.pollerDelay);
                }
                waits += 1;
                return;
            } else {
                let container = document.getElementById("information");
                let title = document.querySelector("label[for='information']");
                setElementStyleProp(title, "display", "none");
                container.innerHTML = "";
                setElementStyleProp(document.querySelector("#resource-group"), "display", "block");
                renderButtons(App.data.stateIndices[dropdownValue]);
                loadingModal.hide();
            }
        }
        setTimeout(indexLoadPoller, App.pollerDelay);
    } else {
        setElementStyleProp(document.querySelector("#resource-group"), "display", "none");
    }
}

function renderStateResourceData(list, stateName, resName) {
    // renders cards
    let perf = new Performance(`render ${resName} data for ${stateName}`);
    let container = document.getElementById("information");
    let title = document.querySelector("label[for='information']");
    setElementStyleProp(title, "display", "block");
    title.innerHTML = `Resource list: ${resName} in ${stateName}`;
    container.innerHTML = "";

    list.forEach(item => {
        renderCard(item)
    })
    perf.log();
}

function showLoadingDialog() {
    // Shows the loading modal
    loadingModal.show();
}

function showErrorDialog(msg) {
    setModalContent(msg, `<i class="fas fa-exclamation-triangle fs-4 mt-1 mb-1"></i>`, "Error", false);
    Modal.show();
}

function setModalContent(content, eltString, header, isDismissable, staticBackdrop) {
    /*
    Sets the content of the reusable modal
    content:        content of the modal's body
    eltString:      (don't know what this does yet... Whoever knows add it in)
    header:         content of the modal's header
    isDismissable:  renders a close button if the modal is closable
    staticBackdrop: makes the modal's backdrop static if true
    */

    // Checking if the arguments are undefined and setting the contents to empty strings, if so
    header = header ? header : ""
    content = content ? content : ""
    eltString = eltString ? eltString : ""

    // Setting the modal's contents here
    document.getElementById("reusable-modal-header").innerHTML = header
    document.getElementById("reusable-modal-content").innerHTML = `${eltString} ${content}`
    if (isDismissable) {
        document.getElementById("reusable-modal-footer").innerHTML = `<button class="btn btn-secondary" data-bs-dismiss="modal" aria-label="close">Close</button>`;
    }

    // Overwriting the old modal object with a new one
    Modal = new bootstrap.Modal(document.getElementById("reusable-modal"), {
        static: staticBackdrop ? "static" : ""
    })
}

function init() {
    document.querySelector("#refresh-button").onclick = function() {
        localStorage.clear();
        window.location.reload();
    }

    let resTitle = document.querySelector("label[for='information']");
    setElementStyleProp(resTitle, "display", "none");

    // Instantiate a reusable modal
    Modal = new bootstrap.Modal(document.getElementById("reusable-modal"), {});

    // Instantiate a loading modal
    loadingModal = new bootstrap.Modal(document.getElementById("loading-modal"), {
        backdrop: "static" // Note: setting data-bs-backdrop on the modal div doesn't work
    });

    showLoadingDialog();

    document.querySelector("#states-dropdown").onchange = onStateDropdownChange;

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
            initialiseStates();
            loadingModal.hide();
            new bootstrap.Modal(document.getElementById("help-modal"), {}).show(); // Show the help modal
            populateStateDropdown();
        } else {
            setTimeout(stateLoadPoller, App.pollerDelay);
        }
    }

    setTimeout(stateLoadPoller, App.pollerDelay);
}

window.onload = init;