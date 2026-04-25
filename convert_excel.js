const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const excelPath = path.join(__dirname, 'cartones.xlsx');
const outputPath = path.join(__dirname, 'ejemplos.json');

function cleanMeasurement(value) {
    if (typeof value === 'string') {
        return parseFloat(value.replace(' cm', '').trim());
    }
    return value;
}

try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    const cleanData = rawData.map(item => ({
        ejemplo: item['ejemplo'],
        descripcion: item['descripción caja'],
        carton: item['carton'],
        ancho: cleanMeasurement(item['Ancho Interno de Caja']),
        largo: cleanMeasurement(item['Largo Interno de Caja']),
        alto: cleanMeasurement(item['Alto Interno de Caja']),
        colores: parseInt(item['numero colores']),
        troquel: (item['Troquel'] || '').toUpperCase() === 'SI'
    }));

    fs.writeFileSync(outputPath, JSON.stringify(cleanData, null, 2));
    console.log(`✅ Se han convertido ${cleanData.length} ejemplos a ejemplos.json`);
} catch (error) {
    console.error('❌ Error convirtiendo el archivo:', error.message);
    process.exit(1);
}
