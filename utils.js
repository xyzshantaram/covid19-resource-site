const App = {
    statesLoaded: false,
    data: {
        resourceData: {}
    },
    master: "https://docs.google.com/spreadsheets/d/16ebrAnBatGm69NTh0o1L8Nlnu4PoqIUfHZ0PtagXFLE/edit#gid=1644224808"
}

const PAPA_OPTIONS = {
    header: true,
    delimiter: ',',
    newline: '\n',
    quoteChar: '"',
    skipEmptyLines: false,
}

const normaliser = {
    entity: {
        elem: '',
        re: /.*name/i,
        icon: '<i class="fas fa-user-friends"></i>',
        class: `fs-5 text-wrap d-inline`
    },
    phone: {
        elem: '',
        re: /.*number.*/i,
        icon: '<i class="fas fa-phone"></i>',
    },
    place: {
        elem: '',
        re: /.*city/i,
        icon: '<i class="fas fa-map-marker-alt"></i>',
    },
    comment: {
        elem: '',
        re: /.*((comment)|(remarks)|(status))/,
        icon: '<i class="fas fa-comment"></i>',
    },
    address: {
        elem: '',
        re: /.*address/i,
        icon: '<i class="fa fa-address-book" aria-hidden="true"></i>'
    }
}


let Modal = null;
let loadingModal = null; // variable declaration for the loading modal

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

function getSheetID(url) {
    return url.split("/")[5];
}

Array.prototype.remove = function() {
    var what, a = arguments,
        L = a.length,
        ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

function capitaliseFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showErrorDialog(msg) {
    loadingModal.hide();
    setModalContent(msg, `<i class="fas fa-exclamation-triangle fs-4 mt-1 mb-1"></i>`, "Error", false);
    Modal.show();
}

function setModalContent(content, eltString, header, isDismissable, staticBackdrop) {
    /*
    Sets the content of the reusable modal
    content:        content of the modal's body
    eltString:      an element that'll be drawn in the div, like an icon or image
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

function showInfoDialog(message) {
    Modal.hide();
    setModalContent(message, `<i class="fas fa-exclamation-circle fs-4 mt-1 mb-1"></i>`, "Information", true, false);
    Modal.show();
}

let isUnverified = (_item) => {
    let item = _item.Verified;
    return !(Boolean(item) && Boolean(item.trim())) || item.trim().toLocaleLowerCase() === "retry";
}

let states = [
    "Pan India",
    "Andaman and Nicobar Islands",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Lakshadweep",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal"
]