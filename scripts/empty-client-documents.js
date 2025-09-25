const mongoose = require('mongoose');
const ClientDocument = require('../src/models/ClientDocument');

// Configuración de la base de datos
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/koop';

async function emptyClientDocuments() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Contar documentos antes de eliminar
    const countBefore = await ClientDocument.countDocuments();
    console.log(`📊 Documentos encontrados: ${countBefore}`);

    if (countBefore === 0) {
      console.log('✅ La colección ya está vacía');
      return;
    }

    // Mostrar algunos ejemplos de documentos que se van a eliminar
    console.log('📋 Ejemplos de documentos que se eliminarán:');
    const sampleDocs = await ClientDocument.find({}).limit(5).lean();
    sampleDocs.forEach((doc, index) => {
      console.log(`${index + 1}. ${doc.fileName} - Cliente: ${doc.documentNumber} - S3: ${doc.s3Key}`);
    });

    if (sampleDocs.length < countBefore) {
      console.log(`... y ${countBefore - sampleDocs.length} documentos más`);
    }

    // Eliminar TODOS los documentos de la colección
    console.log(`\n🗑️ Eliminando TODOS los documentos de la colección ClientDocument...`);
    const deleteResult = await ClientDocument.deleteMany({});

    console.log(`✅ Eliminados ${deleteResult.deletedCount} documentos`);

    // Verificar que la colección esté vacía
    const countAfter = await ClientDocument.countDocuments();
    console.log(`📊 Documentos restantes: ${countAfter}`);

    if (countAfter === 0) {
      console.log('✅ Colección ClientDocument vaciada completamente');
    } else {
      console.log('⚠️ Aún quedan documentos en la colección');
    }

  } catch (error) {
    console.error('❌ Error vaciando la colección:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar la limpieza
if (require.main === module) {
  emptyClientDocuments();
}

module.exports = emptyClientDocuments;
