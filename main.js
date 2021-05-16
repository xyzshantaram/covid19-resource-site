function getFileFromURL(url, sheetName, onSuccess, onErr) {
    loadingModal.show();
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
    res.sort(function(a, b) {
        if (isUnverified(a) && !isUnverified(b)) {
            return 1;
        }
        if (!isUnverified(a) && isUnverified(b)) {
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
                callback(App.data.resourceData[resName]);
                loadingModal.hide();
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

// Converts an object to a markdown-formatted string representation.

function stringifyObject(obj) {
    let type = '';
    let city = '';
    let _details = [];
    for (let key in obj) {
        if (!Boolean(key) || !Boolean(obj[key])) continue;
        if (!Boolean(key.trim()) || !Boolean(obj[key].trim())) continue;
        if ((/.*(verified)|(timestamp)|(service provider state).*/i).test(key)) continue;

        if ((/.*type of service.*/i).test(key)) {
            type = obj[key];
        } else if ((/.*city/i).test(key)) {
            city = obj[key];
        } else {
            _details.push(`*${key}*: ${obj[key]}`);
        }
    }

    let re = new RegExp(`\\*${type} `, 'gi');
    let verified = isUnverified(obj) ? "" : " [VERIFIED]";
    let details = _details.join('\n').replace(re, "*");
    let final = `*${type.toLocaleUpperCase()}* in *${city}${verified}*\n\n${details}`

    final += `\n\nGet more resources at ${document.location.href}${getCurrentQueryString()}`
    return final;
}

function sendAlert(text) {
    let existing = document.getElementById('copy-alert')
    if (existing) {
        existing.id = '';
        document.body.removeChild(existing);
    }
    let alert = document.createElement('div');
    alert.id = 'copy-alert'
    alert.className = 'alert bg-warning rounded';
    alert.textContent = text;
    document.body.appendChild(alert);
    alert.style.animation = 'fadein 2s';
}

function copyToClipboard(str) {
    navigator.clipboard.writeText(str).then(function() {
        sendAlert("Copied!");
    }, function() {});
}

function renderCard(obj) {
    let status = isUnverified(obj) ? "warning" : "success";
    let vString = isUnverified(obj) ? `<i class="fas fa-exclamation-circle"></i> Unverified` : `<i class="fas fa-check"></i> Verified`;
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
                str: `<div class='mb-4'>
                    <div class='badge bg-primary w-auto'>${obj[key]}</div>
                    <div class='badge bg-${status} w-auto'> ${vString}</div>
                </div>`
            });
        };

        for (let category in normaliser) {
            if (normaliser[category].re.test(key)) {
                normaliser[category].value = obj[key];
                normalised[key] = category;
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
    let stringifiedObj = stringifyObject(obj);
    final.push(createRow(
        "Share",
        `<a class='d-inline' target='blank' href='https://api.whatsapp.com/send?text=${encodeURIComponent(stringifiedObj)}'>
            <i class="fa fa-whatsapp fs-1 mx-1" aria-hidden="true"></i>
        </a>
        <a class='d-inline' onclick='copyToClipboard(\`${stringifiedObj}\`)'>
            <i class="fa fa-clone fs-1 mx-1" aria-hidden="true"></i>
        </a>`,
        null,
        `align-middle d-inline`
    ).str);
    let cardGen =
        `<div class="card h-100 ml-2 mt-4 shadow">
                <div class="card-body bg-gradient">
                    <div class="d-flex flex-column">
                        ${final.join("\n")}
                    </div>
                </div>
            </div>
        `;
    let fragment = document.createElement('div');
    fragment.className = "col-lg-6 col-12 px-0 py-1";
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
    let navLink = document.getElementById('nav-link');
    App.currentUrl = `http://${document.location.hostname}/${getCurrentQueryString()}`;
    navLink.innerHTML = `<a href='${App.currentUrl}'>Link to this section</a>
    <a href='#' onclick="copyToClipboard('${App.currentUrl}')">(Copy to clipboard)</a>`;
    setElementStyleProp(title, "display", "block");
    container.innerHTML = "";
    if (list.length == 0) {
        let apology = document.createElement('div');
        apology.className = `align-items-center justify-content-center`;
        apology.innerHTML = `<i class="fa fa-frown-o" aria-hidden="true"></i> No resources could be found matching the selected parameters. Please try again later, we're constantly working to add and verify new leads.`;
        container.appendChild(apology);
        loadingModal.hide();
        return;
    }

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
    loadingModal.show();
    let finalResources = []
    let resources = App.data.selectedResources;
    let length = resources.length;
    let loadedCount = 0;
    let attempts = 0;
    let nextCalled = false;

    function next() {
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

function getCurrentQueryString() {
    let params = new URLSearchParams();
    if (!App.data.state || !App.data.selectedResources) {
        return '';
    } else {
        params.set('resources', App.data.selectedResources.join("|"));
        params.set('state', App.data.state);
    }
    return `?${params.toString()}`;
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
            console.log(data.text);
            let resData = Papa.parse(data.text, PAPA_OPTIONS).data;
            for (let item of resData) {
                resourceList.push(item.Category);
            }
            App.masterLoaded = true;
            populateStateDropdown();
            renderButtons(resourceList);

            if (document.location.search) {
                loadingModal.show();
                let params = new URLSearchParams(document.location.search);
                let resources = params.get('resources');
                let state = params.get('state');

                if (resources && state) {
                    resources = resources.split('|');
                    let valid = resources.filter(x => resourceList.indexOf(x) !== -1);
                    for (let x of document.querySelectorAll('.resource-btn')) {
                        if (valid.includes(x.innerHTML.trim())) {
                            x.click();
                        }
                    }
                }
                document.getElementById('states-dropdown').selectedIndex = states.indexOf(state) + 1;
                onStateDropdownChange();
                let submit = document.getElementById('submit-button');
                submit.disabled = false;
                submitButtonHandler();
            }
            if (!document.location.search) loadingModal.hide();
        } else {
            showErrorDialog(`Loading master sheet failed failed with error ${data.status}`);
            throw new Error(`Loading master sheet failed failed with error ${data.status}`);
        }
    }
    getFileFromURL(App.master, "Index", onGetMasterSuccess); // get file, since we don't have a cached version of the file.
}

window.onload = init;