import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const viewDatabase = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI not found in .env file');
      process.exit(1);
    }

    console.log('🔄 Connecting to MongoDB...\n');
    await mongoose.connect(mongoUri);

    const db = mongoose.connection.db;
    const dbName = db.databaseName;
    
    console.log(`✅ Connected to Database: ${dbName}\n`);
    console.log('='.repeat(50));

    const collections = await db.listCollections().toArray();
    
    // Expected collections based on models
    const expectedCollections = ['users', 'events', 'registrations', 'reminders', 'conversations', 'feedbacks', 'savedevents'];
    
    if (collections.length === 0) {
      console.log('\n📊 No collections found. Database is empty.');
      console.log('   Collections will be created when you use the chatbot.\n');
    } else {
      console.log(`\n📊 Collections Found (${collections.length}):\n`);
      
      // Show all collections
      for (const collection of collections) {
        const count = await db.collection(collection.name).countDocuments();
        const isExpected = expectedCollections.includes(collection.name.toLowerCase());
        const status = isExpected ? '✅' : '⚠️';
        console.log(`   ${status} ${collection.name}: ${count} documents`);
        
        if (count > 0 && count <= 3) {
          const docs = await db.collection(collection.name).find({}).limit(3).toArray();
          console.log(`      Sample documents:`);
          docs.forEach((doc, idx) => {
            const preview = JSON.stringify(doc, null, 2).substring(0, 150);
            console.log(`        [${idx + 1}] ${preview}...`);
          });
        }
        console.log('');
      }
      
      // Show missing expected collections
      const foundCollectionNames = collections.map(c => c.name.toLowerCase());
      const missingCollections = expectedCollections.filter(name => !foundCollectionNames.includes(name));
      if (missingCollections.length > 0) {
        console.log(`\n⚠️  Expected collections not found (will be created on first use):`);
        missingCollections.forEach(name => {
          console.log(`   - ${name}`);
        });
        console.log('');
      }
    }

    console.log('='.repeat(50));
    await mongoose.connection.close();
    console.log('\n✅ Connection closed.');
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

viewDatabase();
