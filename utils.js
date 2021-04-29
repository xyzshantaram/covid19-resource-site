function parseTsv(str) {
    let tsv_data = []
    let lines = str.split("\n")
    let field_names = lines[0].split("\t");

    lines.slice(1).forEach(line => {
        let fields = line.split("\t");
        let entry = {}; // Entry that needs to be added into tsv_data
        for (let i = 0; i < field_names.length; i++) {
            // mapping each field name to its respective field, if field name is invalid then skip that iteration
            if (!field_names[i]) continue;
            entry[field_names[i]] = fields[i];
        }

        tsv_data.push(entry)
    });

    return tsv_data;
}

function cacheTimeStampedData(name, obj) {
    let objTimeWrapper = {
        time: new Date(),
        data: JSON.stringify(obj)
    }
    localStorage.setItem(name, JSON.stringify(objTimeWrapper));
}

function retrieveCachedIfExists(name) {
    console.log(name);
    let cached = localStorage.getItem(name); // check localStorage for previously cached object wrappers of this name.
    let parsedWrapper;
    try {
        parsedWrapper = cached ? JSON.parse(cached) : null; // if it exists, parse the wrapper.
    } catch (e) {
        console.error("Wrapper parsing error: ", e);
    }

    if (parsedWrapper && new Date() - parsedWrapper.time > DATA_EXPIRY_TIMEOUT) { // if the data is too old, clear it and return null
        localStorage.removeItem(name);
        parsedWrapper = null;
    }
    return parsedWrapper && parsedWrapper.data ? JSON.parse(parsedWrapper.data) : null;
}