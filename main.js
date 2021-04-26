let App = App || {}

function getSheetID(url) {
    return url.split("/")[5];
}

function init() {
    const masterId = getSheetID("https://docs.google.com/spreadsheets/d/1XxvTvvRsIjkf4dfAZBAIEMm7sTYeiwngHHnl_3eNwk8/edit#gid=0");
}

window.onload = init;