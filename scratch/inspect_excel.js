const XLSX = require('xlsx');
const path = require('path');

try {
    const workbook = XLSX.readFile(path.join(__dirname, '..', 'cartones.xlsx'));
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log("Columnas detectadas:", Object.keys(data[0] || {}));
    console.log("Primeras 3 filas:");
    console.log(JSON.stringify(data.slice(0, 3), null, 2));
} catch (err) {
    console.error("Error leyendo Excel:", err.message);
}
