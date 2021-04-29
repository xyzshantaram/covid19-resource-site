function cacheTimeStampedData(name, obj, timeout) {
    let objTimeWrapper = {
        time: new Date(),
        data: JSON.stringify(obj)
    }
    if (timeout) objTimeWrapper.timeout = timeout;
    localStorage.setItem(name, JSON.stringify(objTimeWrapper));
}

function retrieveCachedIfExists(name) {
    let cached = localStorage.getItem(name); // check localStorage for previously cached object wrappers of this name.
    let parsedWrapper;
    try {
        parsedWrapper = cached ? JSON.parse(cached) : null; // if it exists, parse the wrapper.
    } catch (e) {
        console.error("Wrapper parsing error: ", e);
    }

    const DATA_EXPIRY_TIMEOUT = (parsedWrapper && parsedWrapper.timeout) ? parsedWrapper.timeout : 18e5;
    if (parsedWrapper && new Date() - new Date(parsedWrapper.time) > DATA_EXPIRY_TIMEOUT) { // if the data is too old, clear it and return null
        console.log('data too old, removing')
        localStorage.removeItem(name);
        parsedWrapper = null;
    }
    return parsedWrapper && parsedWrapper.data ? JSON.parse(parsedWrapper.data) : null;
}

function capitaliseFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}