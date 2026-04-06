const mongoose = require('mongoose');
const path = require('path');
const ClientDocument = require('../src/models/ClientDocument');
const { listObjects, deleteObject } = require('../src/services/s3');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Configuración de la base de datos
const baseUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const databaseName = process.env.DATABASE_NAME || 'koop';
const MONGODB_URI = baseUri.includes('?') ? baseUri.replace('/?', `/${databaseName}?`) : `${baseUri}/${databaseName}`;

async function syncDocuments() {
  try {
    console.log('🔗 Conectando a MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Conectado a MongoDB');

    console.log('🔍 Obteniendo todos los documentos de la base de datos...');
    const allDocuments = await ClientDocument.find({}).lean();
    console.log(`📊 Total de documentos en BD: ${allDocuments.length}`);

    let syncedCount = 0;
    let orphanedCount = 0;
    const orphanedDocs = [];

    for (const doc of allDocuments) {
      try {
        // Verificar si el archivo existe en S3
        const s3Objects = await listObjects({ 
          prefix: doc.s3Key,
          maxKeys: 1 
        });

        if (!s3Objects || s3Objects.length === 0) {
          // El archivo no existe en S3, marcar como huérfano
          orphanedCount++;
          orphanedDocs.push(doc);
          console.log(`❌ Documento huérfano encontrado: ${doc.fileName} (${doc.s3Key})`);
        } else {
          syncedCount++;
        }
      } catch (error) {
        console.error(`⚠️ Error verificando documento ${doc.fileName}:`, error.message);
        orphanedCount++;
        orphanedDocs.push(doc);
      }
    }

    console.log(`\n📊 Resumen de sincronización:`);
    console.log(`✅ Documentos sincronizados: ${syncedCount}`);
    console.log(`❌ Documentos huérfanos: ${orphanedCount}`);

    if (orphanedDocs.length > 0) {
      console.log(`\n🗑️ Eliminando ${orphanedDocs.length} documentos huérfanos de la base de datos...`);
      
      const orphanedIds = orphanedDocs.map(doc => doc._id);
      const deleteResult = await ClientDocument.deleteMany({
        _id: { $in: orphanedIds }
      });

      console.log(`✅ Eliminados ${deleteResult.deletedCount} documentos huérfanos`);
    }

    // Mostrar estadísticas finales
    const finalCount = await ClientDocument.countDocuments();
    console.log(`\n📊 Total de documentos restantes: ${finalCount}`);

    console.log('✅ Sincronización completada exitosamente');

  } catch (error) {
    console.error('❌ Error durante la sincronización:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado de MongoDB');
  }
}

// Ejecutar la sincronización
if (require.main === module) {
  syncDocuments();
}

module.exports = syncDocuments;
