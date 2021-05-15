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

    if (App.data.resourceData[resName]) {
        callback(App.data.resourceData[resName]);
        return;
    } else {
        getFileFromURL(App.master, resName, onResLoadSuccess, onErr);

        function onResLoadSuccess(data) {
            let _data = data.text;
            let parsed = Papa.parse(_data, PAPA_OPTIONS).data;
            if (parsed) {
                let final = sortResources(parsed);
                App.data.resourceData[resName] = final;
                // cacheTimeStampedData(resName, final, 9e5); // 15 minutes
                loadingModal.hide();
                callback(App.data.resourceData[resName]);
            } else {
                onErr("Invalid data received!");
            }
        }
    }
}

function renderButtons(resources) {
    let div = document.getElementById("resource-buttons");
    div.innerHTML = '';

    resources.sort((x, y) => y.length - x.length).forEach(resource => {
        let button = createElementWithClass(
            "button",
            "btn resource-btn btn-primary",
            resource
        );

        button.onclick = function() {
            App.data.selectedResources = App.data.selectedResources || [];
            this.selected = !this.selected;
            if (this.selected) {
                App.data.selectedResources.push(resource);
                this.classList.add('bg-success', 'text-light');
            } else {
                App.data.selectedResources.remove(resource);
                this.classList.remove('bg-success', 'text-light');
            }
            this.blur();
            onUserInput();
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
    let final = [];
    let normalised = {};

    for (let key in obj) {
        if ((/.*(verified)|(timestamp).*/i).test(key)) continue;
        if (!Boolean(key) || !Boolean(obj[key])) continue;
        if (!Boolean(key.trim()) || !Boolean(obj[key].trim())) continue;

        if ((/.*type of service.*/i).test(key)) {
            final.unshift({
                icon: true,
                str: `<div><div class='badge bg-primary w-auto'>${obj[key]}</div></div>`
            });
        };

        for (let category in normaliser) {
            if (normaliser[category].re.test(key)) {
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
                <div class="${getClass()}" style='font-weight: 600'> ${icon ? icon : k} </div>
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
        statusElements.footer =
            `<div class="card-header text-center rounded-bottom bg-${status}">
            This lead is unverified. Information potentially incorrect; use at your own risk!
        </div>`;
    }

    let cardGen =
        `
            <div class="card h-100 ml-2 mt-4 alert-${status} shadow">
                ${statusElements.header}
                <div class="card-body bg-gradient">
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
        App.data.state = dropdownValue;
    } else {
        App.data.state = null;
    }
    onUserInput();
}

function renderStateResourceData(list, stateName, resName) {
    // renders cards
    loadingModal.show();
    let perf = new Performance(`render ${resName} data for ${stateName}`);
    let container = document.getElementById("information");
    let title = document.querySelector("label[for='information']");
    title.innerHTML = `${resName} in ${stateName}`;
    setElementStyleProp(title, "display", "block");
    container.innerHTML = "";

    list.forEach(item => {
        renderCard(item)
    })
    perf.log();
    loadingModal.hide();
}

function onUserInput() {
    let submit = document.getElementById('submit-button');
    submit.disabled = !((App.data.selectedResources && App.data.selectedResources !== []) && App.data.state);
    return submit.disabled;
}

function submitButtonHandler() {
    let finalResources = []
    let resources = App.data.selectedResources;
    let length = resources.length;
    let loadedCount = 0;
    let attempts = 0;
    let nextCalled = false;

    function next() {
        loadingModal.hide();
        let res = finalResources.flat(1).filter((o) => (o["Service Provider State"] == App.data.state));
        let resName = resources.join(", ");
        renderStateResourceData(res, App.data.state, resName);
    }
    let callback = function(d) {
        finalResources.push(d);
        loadedCount += 1;
        if (loadedCount === length && !nextCalled) {
            nextCalled = true;
            next();
        }
    }
    for (let x of resources) {
        attempts += 1;
        loadResourceData(x, callback);
    }
}

function init() {
    // Instantiate a reusable modal
    Modal = new bootstrap.Modal(document.getElementById("reusable-modal"), {});

    // Instantiate a loading modal
    loadingModal = new bootstrap.Modal(document.getElementById("loading-modal"), {
        backdrop: "static" // Note: setting data-bs-backdrop on the modal div doesn't work
    });

    loadingModal.show();
    let submit = document.getElementById('submit-button');
    submit.disabled = true;
    submit.onclick = submitButtonHandler;

    let resTitle = document.querySelector("label[for='information']");
    setElementStyleProp(resTitle, "display", "none");

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

    function onGetMasterSuccess(data) {
        if (data.status === "OK") {
            let resourceList = [] // list of resources
            let resData = Papa.parse(data.text, PAPA_OPTIONS).data;
            for (let item of resData) {
                resourceList.push(item.Category);
            }
            App.masterLoaded = true;
            populateStateDropdown();
            renderButtons(resourceList);
            loadingModal.hide();
        } else {
            showErrorDialog(`Loading master sheet failed failed with error ${data.status}`);
            throw new Error(`Loading master sheet failed failed with error ${data.status}`);
        }
    }
    getFileFromURL(App.master, "Index", onGetMasterSuccess); // get file, since we don't have a cached version of the file.
}

window.onload = init;