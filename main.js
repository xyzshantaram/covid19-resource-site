let App = {}

function getSheetID(url) {
    return url.split("/")[5];
}

function getFileFromURL(url, sheetName, format, onSuccess, onErr) {
    let id = getSheetID(url);
    let dlFormat = encodeURI(format || "tsv");
    let encodedSheetName = encodeURI(sheetName);
    let getUrl = `https://docs.google.com/spreadsheets/d/${id}/export?gid=0&format=${dlFormat}&sheet=${encodedSheetName}`;
    console.log(getUrl);
    fetch(getUrl, {
            method: "GET",
        })
        .then(response => {
            return response.text()
        })
        .then(onSuccess(data))
        .catch((error) => {
            console.error('Error:', error);
            onErr(err);
        });
}

function init() {
    const master = "https://docs.google.com/spreadsheets/d/1XxvTvvRsIjkf4dfAZBAIEMm7sTYeiwngHHnl_3eNwk8/edit#gid=0";

    function onMasterGetSuccess() {
        // todo - hook into tsv parser
    }
    getFileFromURL(master, "State wise links", "tsv", console.log);
}

window.onload = init;