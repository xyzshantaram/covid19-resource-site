const App = {
    statesLoaded: false,
    data: {
        resourceData: {}
    },
    pollerDelay: 200,
    master: "https://docs.google.com/spreadsheets/d/16ebrAnBatGm69NTh0o1L8Nlnu4PoqIUfHZ0PtagXFLE/edit#gid=1644224808"
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
        if (onErr) onErr(error);
    });
}

function sortResources(res) {
    let isInvalid = (item) => !(Boolean(item) && Boolean(item.trim())) || item.trim().toLocaleLowerCase() === "retry";
    res.sort(function(a, b) {
        if (isInvalid(a.Verified) && !isInvalid(b.Verified)) {
            return 1;
        }
        if (!isInvalid(a.Verified) && isInvalid(b.Verified)) {
            return -1;
        }
        return 0;
    });

    return res;
}

function createElementWithClass(type, class_name, text, style) {
    let element = document.createElement(type);
    element.className = class_name;
    if (style) element.style = style;
    if (text) element.textContent = text;
    return element;
}

function loadResourceData(resName, callback) {
    loadingModal.show();

    function onErr(e) {
        loadingModal.hide();
        showErrorDialog(e);
        throw new Error(e);
    }

    let cached = retrieveCachedIfExists(resName);
    if (cached) {
        App.data.resourceData[resName] = cached;
    } else {
        getFileFromURL(App.master, resName, onResLoadSuccess, onErr);
    }

    function onResLoadSuccess(data) {
        let _data = data.text;
        let parsed = Papa.parse(_data, PAPA_OPTIONS).data;
        if (parsed) {
            let final = sortResources(parsed);
            App.data.resourceData[resName] = final;
            cacheTimeStampedData(resName, final, 9e5); // 15 minutes
        } else {
            onErr("Invalid data received!");
        }
    }

    let waits = 0;

    function dataLoadPoller() {
        if (!App.data.resourceData[resName]) {
            if (waits > 100) {
                onErr('Error loading data: timed out');
            } else {
                setTimeout(dataLoadPoller, App.pollerDelay);
            }
            waits += 1;
            return;
        } else {
            callback(App.data.resourceData[resName]);
        }
    }

    setTimeout(dataLoadPoller, App.pollerDelay);
}

function renderButtons(resources) {
    console.log(resources);
    let div = document.getElementById("resource-buttons");
    div.innerHTML = '';

    resources.sort((x, y) => y.length - x.length).forEach(resource => {
        let button = createElementWithClass(
            "button",
            "btn btn-primary resource-btn",
            resource
        );

        button.onclick = function() {
            loadResourceData(resource, function(data) {
                renderStateResourceData(data, null, resource);
                loadingModal.hide();
            });
        }
        div.appendChild(button);
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
    statesDropdown.innerHTML = "<option>[Select a state]</option>"; // Initialize dropdown with a placeholder value
    (states).forEach(element => {
        // Creates an option tag for each state in the states array
        let option = document.createElement("option");
        option.innerText = element;
        statesDropdown.appendChild(option);
    })
}

function onStateDropdownChange() {
    // Renders relevant buttons and cards when a state is selected from the states dropdown
    let dropdownValue = document.getElementById("states-dropdown").value;
    let waits = 0;

    if (dropdownValue !== "[Select a state]") {
        showInfoDialog('todo: state filtering');
    } else {
        setElementStyleProp(document.querySelector("label[for='information']"), "display", "none");
    }
}

function renderStateResourceData(list, stateName, resName) {
    // renders cards
    let perf = new Performance(`render ${resName} data for ${stateName}`);
    let container = document.getElementById("information");
    let title = document.querySelector("label[for='information']");
    if (stateName && resName) {
        title.innerHTML = `Resource list: ${resName} in ${stateName}`;
        setElementStyleProp(title, "display", "block");
    } else if (resName) {
        title.innerHTML = `Resource list: ${resName}`;
        setElementStyleProp(title, "display", "block");
    } else {

    }
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

    let cached = retrieveCachedIfExists('master-index');
    if (cached) {
        App.masterLoaded = true;
        App.data.resourceList = cached;
    } else {
        function onGetMasterSuccess(data) {
            if (data.status === "OK") {
                let resourceList = [] // list of resources
                let resData = Papa.parse(data.text, PAPA_OPTIONS).data;
                for (let item of resData) {
                    resourceList.push(item.Category);
                }
                App.data.resourceList = resourceList;
                App.masterLoaded = true;
                cacheTimeStampedData("master-index", resourceList);
            } else {
                showErrorDialog(`Loading master sheet failed failed with error ${data.status}`);
                throw new Error(`Loading master sheet failed failed with error ${data.status}`);
            }
        }
        getFileFromURL(App.master, "Index", onGetMasterSuccess); // get file, since we don't have a cached version of the file.
    }
    let waits = 0;

    function masterLoadPoller() {
        waits++;
        if (waits > 100) {
            showErrorDialog('Loading failed for master resource list: timed out.');
            throw new Error('Timed out loading master sheet');
        }
        if (App.masterLoaded) {
            populateStateDropdown();
            renderButtons(App.data.resourceList);
            loadingModal.hide();
            // new bootstrap.Modal(document.getElementById("help-modal"), {}).show(); // Show the help modal
        } else {
            setTimeout(masterLoadPoller, App.pollerDelay);
        }
    }

    setTimeout(masterLoadPoller, App.pollerDelay);
}

window.onload = init;