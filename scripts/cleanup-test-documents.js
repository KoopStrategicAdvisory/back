const mongoose = require('mongoose');
const ClientDocument = require('../src/models/ClientDocument');

// Configuración de la base de datos
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/koop';

async function cleanupTestDocuments() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    // Buscar documentos de prueba
    console.log('🔍 Buscando documentos de prueba...');
    
    // Eliminar documentos que contengan "test" en el nombre o que sean claramente de prueba
    const testDocuments = await ClientDocument.find({
      $or: [
        { fileName: { $regex: /test/i } },
        { originalName: { $regex: /test/i } },
        { fileName: { $regex: /prueba/i } },
        { originalName: { $regex: /prueba/i } },
        { fileName: { $regex: /demo/i } },
        { originalName: { $regex: /demo/i } },
        { fileName: { $regex: /ejemplo/i } },
        { originalName: { $regex: /ejemplo/i } },
        { fileName: { $regex: /sample/i } },
        { originalName: { $regex: /sample/i } }
      ]
    });

    console.log(`📊 Encontrados ${testDocuments.length} documentos de prueba`);

    if (testDocuments.length > 0) {
      console.log('📋 Documentos de prueba encontrados:');
      testDocuments.forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.fileName} (${doc.originalName}) - Cliente: ${doc.documentNumber}`);
      });

      // Eliminar los documentos de prueba
      const deleteResult = await ClientDocument.deleteMany({
        $or: [
          { fileName: { $regex: /test/i } },
          { originalName: { $regex: /test/i } },
          { fileName: { $regex: /prueba/i } },
          { originalName: { $regex: /prueba/i } },
          { fileName: { $regex: /demo/i } },
          { originalName: { $regex: /demo/i } },
          { fileName: { $regex: /ejemplo/i } },
          { originalName: { $regex: /ejemplo/i } },
          { fileName: { $regex: /sample/i } },
          { originalName: { $regex: /sample/i } }
        ]
      });

      console.log(`🗑️ Eliminados ${deleteResult.deletedCount} documentos de prueba`);
    } else {
      console.log('✅ No se encontraron documentos de prueba');
    }

    // También limpiar documentos huérfanos (sin cliente asociado)
    console.log('🔍 Buscando documentos huérfanos...');
    const orphanDocuments = await ClientDocument.find({
      $or: [
        { client: { $exists: false } },
        { client: null },
        { documentNumber: { $exists: false } },
        { documentNumber: null },
        { documentNumber: '' }
      ]
    });

    console.log(`📊 Encontrados ${orphanDocuments.length} documentos huérfanos`);

    if (orphanDocuments.length > 0) {
      console.log('📋 Documentos huérfanos encontrados:');
      orphanDocuments.forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.fileName} - Cliente: ${doc.documentNumber || 'N/A'}`);
      });

      const deleteOrphansResult = await ClientDocument.deleteMany({
        $or: [
          { client: { $exists: false } },
          { client: null },
          { documentNumber: { $exists: false } },
          { documentNumber: null },
          { documentNumber: '' }
        ]
      });

      console.log(`🗑️ Eliminados ${deleteOrphansResult.deletedCount} documentos huérfanos`);
    } else {
      console.log('✅ No se encontraron documentos huérfanos');
    }

    // Mostrar estadísticas finales
    const totalDocuments = await ClientDocument.countDocuments();
    console.log(`📊 Total de documentos restantes: ${totalDocuments}`);

    console.log('✅ Limpieza completada exitosamente');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar la limpieza
if (require.main === module) {
  cleanupTestDocuments();
}

module.exports = cleanupTestDocuments;
