const mongoose = require('mongoose');
const path = require('path');
const ClientDocument = require('../src/models/ClientDocument');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Usar la misma conexión que el servidor real
const baseUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const databaseName = process.env.DATABASE_NAME || 'koop';
const MONGODB_URI = baseUri.includes('?') ? baseUri.replace('/?', `/${databaseName}?`) : `${baseUri}/${databaseName}`;

async function checkRealDatabase() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    console.log('📍 URI:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Verificar qué colecciones existen
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📋 Colecciones disponibles:');
    collections.forEach(col => {
      console.log(`- ${col.name}`);
    });

    // Contar documentos en ClientDocument
    const count = await ClientDocument.countDocuments();
    console.log(`\n📊 Documentos en ClientDocument: ${count}`);

    if (count > 0) {
      console.log('\n📋 Primeros 5 documentos:');
      const docs = await ClientDocument.find({}).limit(5).lean();
      docs.forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.fileName} - Cliente: ${doc.documentNumber} - S3: ${doc.s3Key}`);
      });
    }

    // Verificar si hay variables de entorno
    console.log('\n🔧 Variables de entorno:');
    console.log('MONGODB_URI:', process.env.MONGODB_URI || 'No definida');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar
if (require.main === module) {
  checkRealDatabase();
}

module.exports = checkRealDatabase;
