function tsvParser(tsv) {
    let tsv_data = []
    let lines = str.split("\n")
    let field_names = lines[0].split("\t");

    lines.slice(1).forEach(line => {
        let fields = line.split("\t");
        let entry = {};
        for (let i = 0; i < field_names.length; i++) {
            entry[field_names[i]] = fields[i];
        }

        tsv_data.push(entry)
    });

    return tsv_data;
}
