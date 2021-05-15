function cacheTimeStampedData(name, obj, timeout) {
    let objTimeWrapper = {
        time: new Date(),
        data: JSON.stringify(obj)
    }
    if (timeout) objTimeWrapper.timeout = timeout;
    localforage.setItem(name, JSON.stringify(objTimeWrapper));
}

function retrieveCachedIfExists(name) {
    let cached = localforage.getItem(name).then(function(_cached) {
        try {
            parsedWrapper = _cached ? JSON.parse(_cached) : null; // if it exists, parse the wrapper.
        } catch (e) {
            console.log(cached);
            console.error("Wrapper parsing error: ", e);
        }

        const DATA_EXPIRY_TIMEOUT = (parsedWrapper && parsedWrapper.timeout) ? parsedWrapper.timeout : 18e5;
        if (parsedWrapper && new Date() - new Date(parsedWrapper.time) > DATA_EXPIRY_TIMEOUT) { // if the data is too old, clear it and return null
            console.log('data too old, removing')
            localStorage.removeItem(name);
            parsedWrapper = null;
        }
        return parsedWrapper && parsedWrapper.data ? JSON.parse(parsedWrapper.data) : null;
    }).catch(function(e) {
        throw e
    }); // check localStorage for previously cached object wrappers of this name.
}

function capitaliseFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
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